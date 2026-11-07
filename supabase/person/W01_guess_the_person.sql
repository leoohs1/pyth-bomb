-- PYTH BOMB · GUESS THE PERSON — step W01: the base of the mode
-- Run in Supabase SQL Editor. Safe to run more than once. Does NOT change the other games.
--
-- How a match works:
--   * 10 rounds. Each round shows a photo of a person, starting very pixelated and getting sharper
--     as the seconds pass. Everybody sees the same photo at the same moment, for 20 seconds.
--   * Players type the person's name (as many tries as they want). Only the name counts; spelling
--     must be right (capital letters, accents and punctuation do not matter). The other names a
--     person answers to (nickname, first name...) are saved with the person.
--   * The sooner you get it, the more points: 1000 if instant, going down to 300 at the last second.
--     The FIRST player to get it also wins +250.
--   * After 10 rounds: podium by points. The same person never shows twice in one match
--     (unless there are fewer people than rounds).
--
-- The photos live in the Supabase Storage folder "people" (NOT in GitHub), with random file
-- names. The list of people (name, answers, file) is the table person_bank, filled by the file
-- that scripts/person-prep.mjs creates.
--
-- EMERGENCY (if someone asks to be removed):
--   turn the mode off:       update public.mode_switches set enabled = false where mode = 'person';
--   take the photos offline: update storage.buckets set public = false where id = 'people';
--   turn one person off:     update public.person_bank set active = false where name ilike '%name%';

create extension if not exists fuzzystrmatch with schema extensions;

-- ============================================================
-- rooms / players (same columns as Guess the Song and Guess the Price; "if not exists" keeps it safe)
-- ============================================================
alter table public.rooms add column if not exists mode text not null default 'classic';
alter table public.rooms add column if not exists person_total int;     -- rounds in this match
alter table public.rooms add column if not exists person_phase text;    -- 'ready' | 'guess' | 'reveal'
alter table public.rooms add column if not exists person_round jsonb;   -- photo file + when the guessing starts (never the name)
alter table public.rooms add column if not exists person_reveal jsonb;  -- the name + who found it, after the round
alter table public.players add column if not exists score int not null default 0;
alter table public.players add column if not exists place int;
alter table public.players add column if not exists person_got_round int; -- "found this round's person" mark (not the answer)

-- ============================================================
-- on/off switch per mode
-- ============================================================
create table if not exists public.mode_switches (
  mode text primary key,
  enabled boolean not null default true,
  note text
);
alter table public.mode_switches enable row level security;
insert into public.mode_switches (mode, enabled) values ('person', true) on conflict (mode) do nothing;

-- ============================================================
-- people, secrets, progress (hidden from the browser: RLS on, no policies)
-- ============================================================
create table if not exists public.person_bank (
  id uuid primary key default gen_random_uuid(),
  file text not null unique,                 -- random file name inside the folder "people"
  name text not null,                        -- shown on the answer screen
  answers text[] not null default '{}',      -- other accepted answers (nickname, first name...)
  category text,                             -- e.g. 'community'
  active boolean not null default true,
  times_dealt int not null default 0,
  created_at timestamptz not null default now()
);
create unique index if not exists person_bank_name on public.person_bank (lower(name));
alter table public.person_bank enable row level security;

create table if not exists public.person_secrets (
  room_id uuid primary key references public.rooms(id) on delete cascade,
  person_id uuid,
  used uuid[] not null default '{}'          -- people already shown in this match
);
alter table public.person_secrets enable row level security;

create table if not exists public.person_progress (
  room_id uuid not null references public.rooms(id) on delete cascade,
  round int not null,
  player_id uuid not null references public.players(id) on delete cascade,
  got_at timestamptz,
  points int not null default 0,
  first boolean not null default false,
  tries int not null default 0,
  primary key (room_id, round, player_id)
);
alter table public.person_progress enable row level security;

-- the folder for the photos: public files with random names (players only get the name of the
-- current round's file, when the round starts)
insert into storage.buckets (id, name, public) values ('people', 'people', true) on conflict (id) do nothing;

-- ============================================================
-- answer check: 2 = right, 1 = close ("So close!"), 0 = no
-- punctuation, accents, capital letters and spaces do not matter; the name inside a longer text
-- counts ("it is planck" has "planck"); a few letters off is NOT accepted, only the hint
-- ============================================================
create or replace function public.person_match(p_guess text, p_answers text[])
 returns int
 language plpgsql
 stable
 set search_path to 'public', 'extensions'
as $function$
declare
  g text := public.normalize_answer(p_guess);
  a text;
  n text;
  hint int;
  best int := 0;
begin
  if g = '' then return 0; end if;
  foreach a in array p_answers loop
    n := public.normalize_answer(a);
    if n = '' then continue; end if;
    if g = n or replace(g, ' ', '') = replace(n, ' ', '') then return 2; end if;
    if length(n) >= 4 and (' ' || g || ' ') like ('% ' || n || ' %') then return 2; end if;
    hint := case when length(n) <= 4 then 2 when length(n) <= 8 then 3 when length(n) <= 14 then 4 else 5 end;
    if length(g) >= 3 and levenshtein(left(g, 250), left(n, 250)) <= hint then best := 1; end if;
  end loop;
  return best;
end;
$function$;

-- ============================================================
-- next round (internal): the person nobody saw for the longest time, never twice in one match
-- ============================================================
create or replace function public.person_next_round(p_room_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_room rooms;
  v_p person_bank;
  v_used uuid[];
  v_ready interval;
begin
  select * into v_room from rooms where id = p_room_id;
  if v_room.round_number >= coalesce(v_room.person_total, 10) then
    perform person_finish(p_room_id);
    return;
  end if;

  select coalesce(used, '{}') into v_used from person_secrets where room_id = p_room_id;
  v_used := coalesce(v_used, '{}');

  select * into v_p from person_bank
  where active and not (id = any(v_used))
  order by times_dealt, random() limit 1
  for update skip locked;
  if v_p.id is null then
    select * into v_p from person_bank where active order by times_dealt, random() limit 1;
  end if;
  if v_p.id is null then raise exception 'No people available'; end if;

  update person_bank set times_dealt = times_dealt + 1 where id = v_p.id;
  insert into person_secrets (room_id, person_id, used) values (p_room_id, v_p.id, array[v_p.id])
  on conflict (room_id) do update set person_id = excluded.person_id, used = person_secrets.used || v_p.id;

  -- 5 s "get ready" before the first person; 3 s between the others (time for every phone to load the photo)
  v_ready := case when v_room.round_number = 0 then interval '5 seconds' else interval '3 seconds' end;

  update players set person_got_round = null where room_id = p_room_id;
  update rooms
  set round_number = round_number + 1,
      person_phase = 'ready',
      person_reveal = null,
      person_round = jsonb_build_object('file', v_p.file, 'guess_at', now() + v_ready, 'guess_secs', 20),
      round_started_at = now() + v_ready,
      question_expires_at = now() + v_ready
  where id = p_room_id;
end;
$function$;

-- ============================================================
-- reveal (internal): the name goes public, with who found it and how fast
-- ============================================================
create or replace function public.person_show_answer(p_room_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_room rooms;
  v_p person_bank;
  v_start timestamptz;
  v_list jsonb;
begin
  select * into v_room from rooms where id = p_room_id;
  select b.* into v_p from person_secrets x join person_bank b on b.id = x.person_id where x.room_id = p_room_id;
  v_start := (v_room.person_round->>'guess_at')::timestamptz;

  select coalesce(jsonb_agg(jsonb_build_object(
           'player_id', p.id, 'nickname', p.nickname,
           'got', g.got_at is not null,
           'secs', round(extract(epoch from g.got_at - v_start)::numeric, 1),
           'points', coalesce(g.points, 0), 'first', coalesce(g.first, false))
         order by coalesce(g.points, 0) desc, p.joined_at), '[]'::jsonb)
    into v_list
  from players p
  left join person_progress g on g.room_id = p_room_id and g.round = v_room.round_number and g.player_id = p.id
  where p.room_id = p_room_id;

  update rooms
  set person_phase = 'reveal',
      person_reveal = jsonb_build_object('round', v_room.round_number, 'name', v_p.name,
                                         'category', v_p.category, 'players', v_list),
      question_expires_at = now() + interval '8 seconds'
  where id = p_room_id;
end;
$function$;

-- ============================================================
-- end of the match (internal): places by points
-- ============================================================
create or replace function public.person_finish(p_room_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  with r as (
    select id, row_number() over (order by score desc, joined_at) as rk
    from players where room_id = p_room_id
  )
  update players p set place = r.rk from r where p.id = r.id;

  update rooms
  set status = 'finished',
      winner_id = (select id from players where room_id = p_room_id and place = 1 limit 1),
      person_phase = null,
      question_expires_at = null
  where id = p_room_id;
end;
$function$;

-- ============================================================
-- start (host only; refused if the mode is switched off)
-- ============================================================
create or replace function public.person_start_game(p_room_id uuid, p_rounds int default 10)
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
  if v_room.mode is distinct from 'person' then raise exception 'This is not a Guess the Person room'; end if;
  if v_room.host_user_id is distinct from auth.uid() then raise exception 'Only the host can start the game'; end if;
  if v_room.status = 'playing' then raise exception 'Game already running'; end if;
  if not coalesce((select enabled from mode_switches where mode = 'person'), true) then
    raise exception 'Guess the Person is turned off for now';
  end if;
  if not exists (select 1 from person_bank where active) then raise exception 'No people available yet'; end if;

  update players set score = 0, place = null, alive = true, person_got_round = null
  where room_id = p_room_id;
  delete from person_progress where room_id = p_room_id;
  delete from person_secrets where room_id = p_room_id;
  update rooms
  set status = 'playing', winner_id = null, last_victim_id = null, round_number = 0,
      person_total = greatest(3, least(20, coalesce(p_rounds, 10))),
      person_phase = null, person_round = null, person_reveal = null,
      bomb_holder_id = null, current_question_text = null
  where id = p_room_id;

  perform person_next_round(p_room_id);
end;
$function$;

-- ============================================================
-- guess: returns what happened ({"result": "right" | "close" | "wrong" | "done" | "late" | "closed"})
-- ============================================================
create or replace function public.person_submit_guess(p_room_id uuid, p_text text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_room rooms;
  v_p person_bank;
  v_me uuid;
  v_g person_progress;
  v_start timestamptz;
  v_secs numeric;
  v_len numeric;
  v_m int;
  v_gain int := 0;
  v_first boolean := false;
  v_here int;
  v_done int;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if coalesce(btrim(p_text), '') = '' or length(p_text) > 120 then return jsonb_build_object('result', 'wrong'); end if;

  select * into v_room from rooms where id = p_room_id for update;
  if v_room.id is null or v_room.mode is distinct from 'person' or v_room.status <> 'playing' then
    return jsonb_build_object('result', 'closed');
  end if;
  v_start := (v_room.person_round->>'guess_at')::timestamptz;
  v_len := coalesce((v_room.person_round->>'guess_secs')::numeric, 20);
  if v_room.person_phase not in ('ready', 'guess') or now() < v_start then return jsonb_build_object('result', 'closed'); end if;
  if now() > v_start + v_len * interval '1 second' + interval '600 milliseconds' then return jsonb_build_object('result', 'late'); end if;

  select id into v_me from players where room_id = p_room_id and user_id = auth.uid();
  if v_me is null then raise exception 'You are not in this room'; end if;

  insert into person_progress (room_id, round, player_id) values (p_room_id, v_room.round_number, v_me)
  on conflict (room_id, round, player_id) do nothing;
  select * into v_g from person_progress
  where room_id = p_room_id and round = v_room.round_number and player_id = v_me for update;
  if v_g.got_at is not null then return jsonb_build_object('result', 'done'); end if;

  select b.* into v_p from person_secrets x join person_bank b on b.id = x.person_id where x.room_id = p_room_id;
  v_m := person_match(p_text, array_prepend(v_p.name, v_p.answers));

  update person_progress set tries = tries + 1
  where room_id = p_room_id and round = v_room.round_number and player_id = v_me;

  if v_m <> 2 then
    update players set last_seen = now() where id = v_me;
    return jsonb_build_object('result', case when v_m = 1 then 'close' else 'wrong' end);
  end if;

  v_secs := greatest(0, extract(epoch from now() - v_start));
  v_gain := 300 + round(700 * greatest(0, 1 - v_secs / v_len))::int;
  -- first one to get it in this round: +250
  if not exists (select 1 from person_progress where room_id = p_room_id and round = v_room.round_number and got_at is not null) then
    v_first := true;
    v_gain := v_gain + 250;
  end if;

  update person_progress set got_at = now(), points = v_gain, first = v_first
  where room_id = p_room_id and round = v_room.round_number and player_id = v_me;
  update players
  set score = score + v_gain, person_got_round = v_room.round_number, last_seen = now()
  where id = v_me;

  -- everybody here got it? reveal now
  select count(*) filter (where last_seen > now() - interval '45 seconds'),
         count(*) filter (where last_seen > now() - interval '45 seconds' and person_got_round = v_room.round_number)
    into v_here, v_done
  from players where room_id = p_room_id;
  if v_here > 0 and v_done >= v_here then perform person_show_answer(p_room_id); end if;

  return jsonb_build_object('result', 'right', 'points', v_gain, 'first', v_first, 'secs', round(v_secs, 1));
end;
$function$;

-- ============================================================
-- tick: every browser calls it once a second; moves the match forward and returns the server
-- clock (so everybody's photo starts to sharpen at the same moment)
-- ============================================================
create or replace function public.person_tick(p_room_id uuid)
 returns timestamptz
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_room rooms;
  v_start timestamptz;
  v_len numeric;
begin
  select * into v_room from rooms where id = p_room_id for update;
  if v_room.id is null or v_room.mode is distinct from 'person' or v_room.status <> 'playing' then return now(); end if;
  v_start := (v_room.person_round->>'guess_at')::timestamptz;
  v_len := coalesce((v_room.person_round->>'guess_secs')::numeric, 20);

  if v_room.person_phase = 'ready' and now() >= v_start then
    update rooms set person_phase = 'guess', question_expires_at = v_start + v_len * interval '1 second'
    where id = p_room_id;
  elsif v_room.person_phase = 'guess' and now() >= v_start + v_len * interval '1 second' + interval '600 milliseconds' then
    perform person_show_answer(p_room_id);
  elsif v_room.person_phase = 'reveal' and now() >= v_room.question_expires_at then
    perform person_next_round(p_room_id);
  end if;
  return now();
end;
$function$;

revoke execute on function public.person_next_round(uuid) from public, anon, authenticated;
revoke execute on function public.person_show_answer(uuid) from public, anon, authenticated;
revoke execute on function public.person_finish(uuid) from public, anon, authenticated;

-- check: all true
select
  exists (select 1 from information_schema.columns where table_name = 'rooms' and column_name = 'person_round') as rooms_ready,
  exists (select 1 from storage.buckets where id = 'people') as people_folder,
  (select enabled from public.mode_switches where mode = 'person') as mode_on;
