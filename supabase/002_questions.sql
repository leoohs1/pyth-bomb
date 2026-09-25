-- PYTH BOMB: question system (step 2)
-- Run in Supabase SQL Editor. After it works, server_logic.sql gets updated to match.
--
-- Rules implemented:
--  * Two independent timers: hidden bomb timer (room_secrets.bomb_explode_at, never reset)
--    and a 12s question timer (rooms.question_expires_at).
--  * Wrong answer  -> same question, holder can retry until the 12s run out.
--  * Question timeout (12s) -> NEW question, same holder, fresh 12s. Bomb timer untouched.
--  (timers changed from 10s / 20-40s to 12s / 80-90s: see 004_timers.sql)
--  * Correct answer -> bomb passes immediately to another alive player, who gets a new question.
--  * Answers are compared exact-match after normalization (no substring matching).
--  * Correct answers / source never leave the server: `questions` has RLS on and NO policies.

-- ============================================================
-- 1) Extension used to strip accents
-- ============================================================
create extension if not exists unaccent with schema extensions;

-- ============================================================
-- 2) Questions table (server-only)
-- ============================================================
create table if not exists public.questions (
  id                uuid primary key default gen_random_uuid(),
  text              text not null,
  accepted_answers  text[] not null check (cardinality(accepted_answers) > 0),
  category          text not null check (category in ('pyth', 'community', 'general', 'sports', 'movies', 'fun')),
  difficulty        text not null default 'medium' check (difficulty in ('easy', 'medium', 'hard')),
  source_reference  text,                       -- internal only, never sent to players
  verified          boolean not null default false,
  active            boolean not null default true,
  created_at        timestamptz not null default now()
);

alter table public.questions enable row level security;
-- (intentionally NO policies: the browser can never read this table)

-- ============================================================
-- 3) New columns
-- ============================================================
-- Public (players may see the question text and when it expires):
alter table public.rooms
  add column if not exists current_question_text text,
  add column if not exists question_expires_at   timestamptz;

-- Secret (which question, the shuffled deck):
alter table public.room_secrets
  add column if not exists question_deck       uuid[] not null default '{}',
  add column if not exists deck_cursor         int    not null default 0,
  add column if not exists current_question_id uuid;

-- ============================================================
-- 4) Helper: normalize an answer
--    lowercase, no accents, apostrophes removed, "1,000" -> "1000",
--    other punctuation -> space, extra spaces collapsed.
-- ============================================================
create or replace function public.normalize_answer(p_text text)
 returns text
 language plpgsql
 set search_path to 'public', 'extensions'
as $function$
declare
  v text;
begin
  v := lower(extensions.unaccent(coalesce(p_text, '')));
  v := regexp_replace(v, '[''’]', '', 'g');
  v := regexp_replace(v, '(\d),(?=\d)', '\1', 'g');
  v := regexp_replace(v, '[^a-z0-9]+', ' ', 'g');
  v := btrim(v);
  -- ignore a leading article: "the Pride Lands" = "Pride Lands", "a cat" = "cat"
  v := regexp_replace(v, '^(the|a|an) (?=.)', '');
  return v;
end;
$function$;

-- ============================================================
-- 5) Helper: give the room its next question (12s), from a shuffled deck
-- ============================================================
create or replace function public.deal_question(p_room_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $function$
declare
  v_deck uuid[];
  v_cursor int;
  v_qid uuid;
  v_text text;
begin
  select question_deck, deck_cursor into v_deck, v_cursor
  from room_secrets where room_id = p_room_id for update;

  v_deck := coalesce(v_deck, '{}');
  v_cursor := coalesce(v_cursor, 0);

  -- deck empty or finished: reshuffle all verified + active questions
  if v_cursor >= coalesce(array_length(v_deck, 1), 0) then
    select coalesce(array_agg(id order by random()), '{}') into v_deck
    from questions where verified and active;
    v_cursor := 0;
  end if;

  if coalesce(array_length(v_deck, 1), 0) = 0 then
    raise exception 'No verified questions available';
  end if;

  v_qid := v_deck[v_cursor + 1];
  select text into v_text from questions where id = v_qid;

  update room_secrets
  set question_deck = v_deck, deck_cursor = v_cursor + 1, current_question_id = v_qid
  where room_id = p_room_id;

  update rooms
  set current_question_text = v_text,
      question_expires_at = now() + interval '12 seconds'
  where id = p_room_id;
end;
$function$;

-- ============================================================
-- 6) new_round: same as before + deals a question (and clears it when the game ends)
-- ============================================================
CREATE OR REPLACE FUNCTION public.new_round(p_room_id uuid, p_avoid uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_next uuid;
  v_alive int;
begin
  select count(*) into v_alive from players where room_id = p_room_id and alive;

  if v_alive <= 1 then
    update rooms
    set status = 'finished',
        bomb_holder_id = null,
        winner_id = (select id from players where room_id = p_room_id and alive limit 1),
        current_question_text = null,
        question_expires_at = null,
        last_event_at = now()
    where id = p_room_id;
    return;
  end if;

  select id into v_next from players
  where room_id = p_room_id and alive and (p_avoid is null or id <> p_avoid)
  order by random() limit 1;

  if v_next is null then
    select id into v_next from players where room_id = p_room_id and alive order by random() limit 1;
  end if;

  update rooms
  set status = 'playing',
      bomb_holder_id = v_next,
      round_number = round_number + 1,
      round_started_at = now()
  where id = p_room_id;

  -- o horário secreto: entre 80 e 90 segundos
  insert into room_secrets (room_id, bomb_explode_at)
  values (p_room_id, now() + make_interval(secs => 80 + random() * 10))
  on conflict (room_id) do update set bomb_explode_at = excluded.bomb_explode_at;

  perform deal_question(p_room_id);
end;
$function$;

-- ============================================================
-- 7) start_game: same as before + fresh shuffled deck for the new game
-- ============================================================
CREATE OR REPLACE FUNCTION public.start_game(p_room_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_room rooms;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;

  select * into v_room from rooms where id = p_room_id for update;
  if v_room.id is null then raise exception 'Room not found'; end if;
  if v_room.host_user_id is distinct from auth.uid() then
    raise exception 'Only the host can start the game';
  end if;
  if v_room.status = 'playing' then
    raise exception 'Game already running';
  end if;
  if not exists (select 1 from players where room_id = p_room_id) then
    raise exception 'No players in room';
  end if;

  update players set alive = true where room_id = p_room_id;
  update rooms set winner_id = null, last_victim_id = null, round_number = 0 where id = p_room_id;
  update room_secrets set question_deck = '{}', deck_cursor = 0, current_question_id = null
  where room_id = p_room_id;

  perform new_round(p_room_id, null);
end;
$function$;

-- ============================================================
-- 8) tick: bomb explosion (unchanged) + question timeout
-- ============================================================
CREATE OR REPLACE FUNCTION public.tick(p_room_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_room rooms;
  v_deadline timestamptz;
  v_victim uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;

  select * into v_room from rooms where id = p_room_id for update;
  if v_room.status <> 'playing' then return; end if;

  select bomb_explode_at into v_deadline from room_secrets where room_id = p_room_id;

  -- bomb has not exploded yet
  if v_deadline is null or now() < v_deadline then
    -- question timeout: new question, same holder. Bomb timer is NOT touched.
    if v_room.question_expires_at is not null and now() >= v_room.question_expires_at then
      perform deal_question(p_room_id);
    end if;
    return;
  end if;

  -- bomb exploded
  v_victim := v_room.bomb_holder_id;

  update players set alive = false where id = v_victim;
  update rooms set last_victim_id = v_victim, last_event_at = now() where id = p_room_id;

  perform new_round(p_room_id, v_victim);
end;
$function$;

-- ============================================================
-- 9) submit_answer: replaces pass_bomb. Returns 'correct' | 'wrong' | 'timeout'
-- ============================================================
drop function if exists public.pass_bomb(uuid);

create or replace function public.submit_answer(p_room_id uuid, p_answer text)
 returns text
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $function$
declare
  v_room rooms;
  v_me uuid;
  v_next uuid;
  v_qid uuid;
  v_norm text;
  v_ok boolean;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;

  -- if the bomb already exploded, resolve that first (same logic as the clock)
  perform public.tick(p_room_id);

  select * into v_room from rooms where id = p_room_id for update;
  if v_room.status <> 'playing' then raise exception 'Game is not running'; end if;

  select id into v_me from players
  where room_id = p_room_id and user_id = auth.uid() and alive limit 1;

  if v_me is null or v_room.bomb_holder_id is distinct from v_me then
    raise exception 'You do not have the bomb';
  end if;

  -- question time already over: new question
  if v_room.question_expires_at is not null and now() >= v_room.question_expires_at then
    perform deal_question(p_room_id);
    return 'timeout';
  end if;

  select current_question_id into v_qid from room_secrets where room_id = p_room_id;
  v_norm := normalize_answer(p_answer);

  select exists (
    select 1 from questions q, unnest(q.accepted_answers) a
    where q.id = v_qid and normalize_answer(a) = v_norm
  ) into v_ok;

  if v_norm = '' or not v_ok then
    return 'wrong';   -- same question, no timer changes
  end if;

  -- correct: pass the bomb immediately; the new holder gets a fresh question
  select id into v_next from players
  where room_id = p_room_id and alive and id <> v_me
  order by random() limit 1;

  if v_next is null then raise exception 'Nobody to pass to'; end if;

  update rooms set bomb_holder_id = v_next where id = p_room_id;
  perform deal_question(p_room_id);
  return 'correct';
end;
$function$;

-- ============================================================
-- 10) Lock down internal functions: browsers may NOT call these directly.
--     (new_round was callable by any signed-in user before: it could re-roll the bomb.)
-- ============================================================
revoke execute on function public.new_round(uuid, uuid)  from public, anon, authenticated;
revoke execute on function public.deal_question(uuid)    from public, anon, authenticated;
revoke execute on function public.normalize_answer(text) from public, anon, authenticated;
