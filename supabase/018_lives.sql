-- PYTH BOMB: 2 lives, 13-second turns, 5 guesses (step 18)
-- Run in Supabase SQL Editor AFTER 017/016/015. Safe to run more than once.
--
-- NEW RULES
--   * every player starts with 2 lives (players.lives)
--   * the player holding the bomb has 13 seconds and up to 5 guesses on the same question
--   * a correct answer passes the bomb IMMEDIATELY (no life lost)
--   * 5 wrong guesses, OR 13 seconds without a correct answer -> lose 1 life, and the bomb passes
--   * 0 lives -> eliminated ("got rugged"); the last player alive wins
--   * the secret 55-65 s bomb timer is GONE (explosions only come from lives)
--
-- submit_answer returns: 'correct' | 'wrong' | 'hit' (lost a life, 5 wrong guesses)
--                        | 'timeout' (lost a life, time ran out) | 'exploded' (eliminated)

alter table public.players add column if not exists lives int not null default 2;
alter table public.rooms add column if not exists last_hit_id uuid;
alter table public.rooms add column if not exists last_hit_at timestamptz;

-- ============================================================
-- deal_question: 13 seconds
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
      question_expires_at = now() + interval '13 seconds'
  where id = p_room_id;
end;
$function$;

-- ============================================================
-- start_game: everybody back to 2 lives
-- ============================================================
create or replace function public.start_game(p_room_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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

  update players set alive = true, lives = 2 where room_id = p_room_id;
  update rooms
  set winner_id = null, last_victim_id = null, last_hit_id = null, last_hit_at = null, round_number = 0
  where id = p_room_id;
  update room_secrets set question_deck = '{}', deck_cursor = 0, current_question_id = null
  where room_id = p_room_id;

  perform new_round(p_room_id, null);
end;
$function$;

-- ============================================================
-- new_round: same as before, but without the secret bomb timer
-- ============================================================
create or replace function public.new_round(p_room_id uuid, p_avoid uuid DEFAULT NULL::uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
        holder_mistakes = 0,
        last_event_at = now()
    where id = p_room_id;
    return;
  end if;

  -- (sem bomba secreta: o horário fica um dia pra frente, nunca é usado)
  insert into room_secrets (room_id, bomb_explode_at)
  values (p_room_id, now() + interval '1 day')
  on conflict (room_id) do update set bomb_explode_at = excluded.bomb_explode_at;

  v_next := public.pick_next_holder(p_room_id, p_avoid);

  update rooms
  set status = 'playing',
      bomb_holder_id = v_next,
      round_number = round_number + 1,
      round_started_at = now(),
      holder_mistakes = 0
  where id = p_room_id;

  perform deal_question(p_room_id);
end;
$function$;

-- ============================================================
-- fail_turn (internal): the holder failed (5 wrong guesses or time ran out).
-- Loses 1 life; at 0 lives is eliminated. The bomb passes to the next player in the rotation.
-- Returns 'hit' (lost a life) or 'out' (eliminated).
-- ============================================================
create or replace function public.fail_turn(p_room_id uuid)
 returns text
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_holder uuid;
  v_lives int;
  v_next uuid;
begin
  select bomb_holder_id into v_holder from rooms where id = p_room_id;
  if v_holder is null then return 'hit'; end if;

  update players set lives = greatest(lives - 1, 0) where id = v_holder returning lives into v_lives;

  if coalesce(v_lives, 0) <= 0 then
    update players set alive = false, lives = 0 where id = v_holder;
    update rooms set last_victim_id = v_holder, last_event_at = now(), holder_mistakes = 0 where id = p_room_id;
    perform new_round(p_room_id, v_holder);   -- next holder (or game over if only one is left)
    return 'out';
  end if;

  update rooms set last_hit_id = v_holder, last_hit_at = now() where id = p_room_id;
  v_next := public.pick_next_holder(p_room_id, v_holder);
  if v_next is null then v_next := v_holder; end if;
  update rooms set bomb_holder_id = v_next, holder_mistakes = 0 where id = p_room_id;
  perform deal_question(p_room_id);
  return 'hit';
end;
$function$;

revoke execute on function public.fail_turn(uuid) from public, anon, authenticated;

-- ============================================================
-- tick: only watches the 13-second clock (0.6 s of grace for slow networks)
-- ============================================================
create or replace function public.tick(p_room_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_room rooms;
  v_res text;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;

  select * into v_room from rooms where id = p_room_id for update;
  if v_room.status <> 'playing' then return; end if;

  if v_room.question_expires_at is not null
     and now() >= v_room.question_expires_at + interval '600 milliseconds' then
    v_res := public.fail_turn(p_room_id);
  end if;
end;
$function$;

-- ============================================================
-- submit_answer: up to 5 guesses; correct passes the bomb right away
-- ============================================================
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
  v_mistakes int;
  v_res text;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;

  -- resolve an expired clock first (same logic as the clock)
  perform public.tick(p_room_id);

  select * into v_room from rooms where id = p_room_id for update;
  if v_room.status <> 'playing' then raise exception 'Game is not running'; end if;

  select id into v_me from players
  where room_id = p_room_id and user_id = auth.uid() and alive limit 1;

  if v_me is null or v_room.bomb_holder_id is distinct from v_me then
    raise exception 'You do not have the bomb';
  end if;

  -- the 13 seconds are over (and the clock has not caught it yet): the turn fails
  if v_room.question_expires_at is not null
     and now() >= v_room.question_expires_at + interval '600 milliseconds' then
    v_res := public.fail_turn(p_room_id);
    return case when v_res = 'out' then 'exploded' else 'timeout' end;
  end if;

  select current_question_id into v_qid from room_secrets where room_id = p_room_id;
  v_norm := normalize_answer(p_answer);

  select exists (
    select 1 from questions q, unnest(q.accepted_answers) a
    where q.id = v_qid and normalize_answer(a) = v_norm
  ) into v_ok;

  if v_norm = '' then
    return 'wrong';   -- empty answer: ignored, not counted
  end if;

  if not v_ok then
    v_mistakes := v_room.holder_mistakes + 1;

    if v_mistakes >= 5 then
      -- 5th wrong guess: lose a life and the bomb passes
      v_res := public.fail_turn(p_room_id);
      return case when v_res = 'out' then 'exploded' else 'hit' end;
    end if;

    update rooms set holder_mistakes = v_mistakes where id = p_room_id;
    return 'wrong';   -- same question, same clock
  end if;

  -- correct: the bomb passes IMMEDIATELY to the next player in the rotation, who gets a fresh question
  v_next := public.pick_next_holder(p_room_id, v_me);
  if v_next is null then raise exception 'Nobody to pass to'; end if;

  update rooms set bomb_holder_id = v_next, holder_mistakes = 0 where id = p_room_id;
  perform deal_question(p_room_id);
  return 'correct';
end;
$function$;

-- check: all should be true
select
  (select count(*) from information_schema.columns where table_name = 'players' and column_name = 'lives') = 1 as lives_column,
  (select count(*) from information_schema.columns where table_name = 'rooms' and column_name = 'last_hit_at') = 1 as hit_column,
  position('13 seconds' in pg_get_functiondef('public.deal_question(uuid)'::regprocedure)) > 0 as thirteen_seconds,
  position('fail_turn' in pg_get_functiondef('public.tick(uuid)'::regprocedure)) > 0 as tick_ok,
  position('fail_turn' in pg_get_functiondef('public.submit_answer(uuid,text)'::regprocedure)) > 0 as answer_ok;
