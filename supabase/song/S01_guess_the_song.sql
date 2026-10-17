-- PYTH BOMB · GUESS THE SONG — step S01: the base of the mode
-- Run in Supabase SQL Editor AFTER the Guess the Price step P01. Safe to run more than once.
-- Does NOT change the Hot Potato game.
--
-- How a match works:
--   * 10 rounds. Each round: 3 s "get ready" (everybody's phone downloads the clip), then the
--     clip plays for everybody at the same moment, for 20 seconds.
--   * Players type the ARTIST or the SONG NAME (one box, as many tries as they want). Small
--     typos are accepted. Typing both at once also works ("queen bohemian rhapsody").
--   * Points for each part found: 1000 if instant, going down to 300 at the last second.
--     The FIRST player to find both gets +250.
--   * After 10 rounds: podium by points.
--
-- The music clips live in the Supabase Storage bucket "songs" (NOT in GitHub), with random file
-- names. The list of songs (artist, title, file) is the table song_bank, filled by the file that
-- scripts/song-prep.mjs creates.
--
-- EMERGENCY (if a complaint arrives):
--   turn the mode off:      update public.mode_switches set enabled = false where mode = 'song';
--   take the files offline: update storage.buckets set public = false where id = 'songs';
--   turn one song off:      update public.song_bank set active = false where title ilike '%name%';

create extension if not exists fuzzystrmatch with schema extensions;

-- ============================================================
-- rooms / players (same columns as Guess the Price; "if not exists" keeps it safe)
-- ============================================================
alter table public.rooms add column if not exists mode text not null default 'classic';
alter table public.rooms add column if not exists song_total int;     -- rounds in this match
alter table public.rooms add column if not exists song_phase text;    -- 'ready' | 'listen' | 'reveal'
alter table public.rooms add column if not exists song_round jsonb;   -- clip file + when it starts (never the answer)
alter table public.rooms add column if not exists song_reveal jsonb;  -- the answer + who found what, after the round
alter table public.players add column if not exists score int not null default 0;
alter table public.players add column if not exists place int;
alter table public.players add column if not exists song_artist_round int; -- "found the artist" mark (not the answer)
alter table public.players add column if not exists song_title_round int;  -- "found the song" mark

-- ============================================================
-- on/off switch per mode
-- ============================================================
create table if not exists public.mode_switches (
  mode text primary key,
  enabled boolean not null default true,
  note text
);
alter table public.mode_switches enable row level security;
insert into public.mode_switches (mode, enabled) values ('song', true) on conflict (mode) do nothing;

-- ============================================================
-- songs, secrets, progress (hidden from the browser: RLS on, no policies)
-- ============================================================
create table if not exists public.song_bank (
  id uuid primary key default gen_random_uuid(),
  file text not null unique,                 -- random file name inside the bucket "songs"
  artist text not null,
  title text not null,
  artist_answers text[] not null default '{}',
  title_answers text[] not null default '{}',
  year int,
  active boolean not null default true,
  times_dealt int not null default 0,
  created_at timestamptz not null default now()
);
create unique index if not exists song_bank_artist_title on public.song_bank (lower(artist), lower(title));
alter table public.song_bank enable row level security;

create table if not exists public.song_secrets (
  room_id uuid primary key references public.rooms(id) on delete cascade,
  song_id uuid
);
alter table public.song_secrets enable row level security;

create table if not exists public.song_progress (
  room_id uuid not null references public.rooms(id) on delete cascade,
  round int not null,
  player_id uuid not null references public.players(id) on delete cascade,
  artist_at timestamptz,
  title_at timestamptz,
  points int not null default 0,
  first boolean not null default false,
  tries int not null default 0,
  primary key (room_id, round, player_id)
);
alter table public.song_progress enable row level security;

-- the folder for the clips: public files with random names (players only get the name of the
-- current round's file, when the round starts)
insert into storage.buckets (id, name, public) values ('songs', 'songs', true) on conflict (id) do nothing;

-- ============================================================
-- answer check: 2 = right, 1 = close ("So close!"), 0 = no
-- accepts small typos, missing spaces ("acdc"), and the answer inside a longer text
-- ============================================================
create or replace function public.song_match(p_guess text, p_answers text[])
 returns int
 language plpgsql
 stable
 set search_path to 'public', 'extensions'
as $function$
declare
  g text := public.normalize_answer(p_guess);
  a text;
  n text;
  d int;
  tol int;
  best int := 0;
begin
  if g = '' then return 0; end if;
  foreach a in array p_answers loop
    n := public.normalize_answer(a);
    if n = '' then continue; end if;
    if g = n or replace(g, ' ', '') = replace(n, ' ', '') then return 2; end if;
    -- the answer inside a longer guess ("queen bohemian rhapsody" has "queen")
    if length(n) >= 4 and (' ' || g || ' ') like ('% ' || n || ' %') then return 2; end if;
    tol := case when length(n) <= 4 then 0 when length(n) <= 8 then 1 when length(n) <= 14 then 2 else 3 end;
    d := levenshtein(left(g, 250), left(n, 250));
    if d <= tol then return 2; end if;
    if length(g) >= 3 and d <= tol + 2 then best := 1; end if;
  end loop;
  return best;
end;
$function$;

-- ============================================================
-- next round (internal): picks the song nobody heard for the longest time
-- ============================================================
create or replace function public.song_next_round(p_room_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_room rooms;
  v_s song_bank;
  v_min int;
begin
  select * into v_room from rooms where id = p_room_id;
  if v_room.round_number >= coalesce(v_room.song_total, 10) then
    perform song_finish(p_room_id);
    return;
  end if;

  select min(times_dealt) into v_min from song_bank where active;
  select * into v_s from song_bank
  where active and times_dealt = v_min
  order by random() limit 1
  for update skip locked;
  if v_s.id is null then
    select * into v_s from song_bank where active order by times_dealt, random() limit 1;
  end if;
  if v_s.id is null then raise exception 'No songs available'; end if;

  update song_bank set times_dealt = times_dealt + 1 where id = v_s.id;
  insert into song_secrets (room_id, song_id) values (p_room_id, v_s.id)
  on conflict (room_id) do update set song_id = excluded.song_id;

  update players set song_artist_round = null, song_title_round = null where room_id = p_room_id;
  update rooms
  set round_number = round_number + 1,
      song_phase = 'ready',
      song_reveal = null,
      song_round = jsonb_build_object('file', v_s.file, 'listen_at', now() + interval '3 seconds', 'listen_secs', 20),
      round_started_at = now() + interval '3 seconds',
      question_expires_at = now() + interval '3 seconds'
  where id = p_room_id;
end;
$function$;

-- ============================================================
-- reveal (internal): the answer goes public, with who found what
-- ============================================================
create or replace function public.song_show_answer(p_room_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_room rooms;
  v_s song_bank;
  v_listen timestamptz;
  v_list jsonb;
begin
  select * into v_room from rooms where id = p_room_id;
  select b.* into v_s from song_secrets x join song_bank b on b.id = x.song_id where x.room_id = p_room_id;
  v_listen := (v_room.song_round->>'listen_at')::timestamptz;

  select coalesce(jsonb_agg(jsonb_build_object(
           'player_id', p.id, 'nickname', p.nickname,
           'artist', g.artist_at is not null, 'title', g.title_at is not null,
           'artist_secs', round(extract(epoch from g.artist_at - v_listen)::numeric, 1),
           'title_secs', round(extract(epoch from g.title_at - v_listen)::numeric, 1),
           'points', coalesce(g.points, 0), 'first', coalesce(g.first, false))
         order by coalesce(g.points, 0) desc, p.joined_at), '[]'::jsonb)
    into v_list
  from players p
  left join song_progress g on g.room_id = p_room_id and g.round = v_room.round_number and g.player_id = p.id
  where p.room_id = p_room_id;

  update rooms
  set song_phase = 'reveal',
      song_reveal = jsonb_build_object('round', v_room.round_number, 'artist', v_s.artist,
                                       'title', v_s.title, 'year', v_s.year, 'players', v_list),
      question_expires_at = now() + interval '8 seconds'
  where id = p_room_id;
end;
$function$;

-- ============================================================
-- end of the match (internal): places by points
-- ============================================================
create or replace function public.song_finish(p_room_id uuid)
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
      song_phase = null,
      question_expires_at = null
  where id = p_room_id;
end;
$function$;

-- ============================================================
-- start (host only; refused if the mode is switched off)
-- ============================================================
create or replace function public.song_start_game(p_room_id uuid, p_rounds int default 10)
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
  if v_room.mode is distinct from 'song' then raise exception 'This is not a Guess the Song room'; end if;
  if v_room.host_user_id is distinct from auth.uid() then raise exception 'Only the host can start the game'; end if;
  if v_room.status = 'playing' then raise exception 'Game already running'; end if;
  if not coalesce((select enabled from mode_switches where mode = 'song'), true) then
    raise exception 'Guess the Song is turned off for now';
  end if;
  if not exists (select 1 from song_bank where active) then raise exception 'No songs available yet'; end if;

  update players set score = 0, place = null, alive = true, song_artist_round = null, song_title_round = null
  where room_id = p_room_id;
  delete from song_progress where room_id = p_room_id;
  update rooms
  set status = 'playing', winner_id = null, last_victim_id = null, round_number = 0,
      song_total = greatest(3, least(20, coalesce(p_rounds, 10))),
      song_phase = null, song_round = null, song_reveal = null,
      bomb_holder_id = null, current_question_text = null
  where id = p_room_id;

  perform song_next_round(p_room_id);
end;
$function$;

-- ============================================================
-- guess: returns what happened ({"result": "artist" | "title" | "both" | "close" | "wrong" | ...})
-- ============================================================
create or replace function public.song_submit_guess(p_room_id uuid, p_text text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_room rooms;
  v_s song_bank;
  v_me uuid;
  v_g song_progress;
  v_listen timestamptz;
  v_secs numeric;
  v_len numeric;
  v_part int;
  v_a int := 0;
  v_t int := 0;
  v_new_a boolean := false;
  v_new_t boolean := false;
  v_gain int := 0;
  v_first boolean := false;
  v_here int;
  v_done int;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if coalesce(btrim(p_text), '') = '' or length(p_text) > 120 then return jsonb_build_object('result', 'wrong'); end if;

  select * into v_room from rooms where id = p_room_id for update;
  if v_room.id is null or v_room.mode is distinct from 'song' or v_room.status <> 'playing' then
    return jsonb_build_object('result', 'closed');
  end if;
  v_listen := (v_room.song_round->>'listen_at')::timestamptz;
  v_len := coalesce((v_room.song_round->>'listen_secs')::numeric, 20);
  if v_room.song_phase not in ('ready', 'listen') or now() < v_listen then return jsonb_build_object('result', 'closed'); end if;
  if now() > v_listen + v_len * interval '1 second' + interval '600 milliseconds' then return jsonb_build_object('result', 'late'); end if;

  select id into v_me from players where room_id = p_room_id and user_id = auth.uid();
  if v_me is null then raise exception 'You are not in this room'; end if;

  insert into song_progress (room_id, round, player_id) values (p_room_id, v_room.round_number, v_me)
  on conflict (room_id, round, player_id) do nothing;
  select * into v_g from song_progress
  where room_id = p_room_id and round = v_room.round_number and player_id = v_me for update;
  if v_g.artist_at is not null and v_g.title_at is not null then return jsonb_build_object('result', 'done'); end if;

  select b.* into v_s from song_secrets x join song_bank b on b.id = x.song_id where x.room_id = p_room_id;
  if v_g.artist_at is null then v_a := song_match(p_text, array_prepend(v_s.artist, v_s.artist_answers)); end if;
  if v_g.title_at is null then v_t := song_match(p_text, array_prepend(v_s.title, v_s.title_answers)); end if;
  v_new_a := v_a = 2;
  v_new_t := v_t = 2;

  v_secs := greatest(0, extract(epoch from now() - v_listen));
  v_part := 300 + round(700 * greatest(0, 1 - v_secs / v_len))::int;
  v_gain := (case when v_new_a then v_part else 0 end) + (case when v_new_t then v_part else 0 end);

  update song_progress
  set artist_at = case when v_new_a then now() else artist_at end,
      title_at = case when v_new_t then now() else title_at end,
      tries = tries + 1
  where room_id = p_room_id and round = v_room.round_number and player_id = v_me
  returning * into v_g;

  -- first to complete both parts in this round: +250
  if v_g.artist_at is not null and v_g.title_at is not null and (v_new_a or v_new_t)
     and not exists (select 1 from song_progress where room_id = p_room_id and round = v_room.round_number and first) then
    v_first := true;
    v_gain := v_gain + 250;
  end if;

  update song_progress set points = points + v_gain, first = first or v_first
  where room_id = p_room_id and round = v_room.round_number and player_id = v_me;
  update players
  set score = score + v_gain,
      song_artist_round = case when v_g.artist_at is not null then v_room.round_number else song_artist_round end,
      song_title_round = case when v_g.title_at is not null then v_room.round_number else song_title_round end,
      last_seen = now()
  where id = v_me;

  -- everybody here found both? reveal now
  select count(*) filter (where last_seen > now() - interval '45 seconds'),
         count(*) filter (where last_seen > now() - interval '45 seconds'
                            and song_artist_round = v_room.round_number and song_title_round = v_room.round_number)
    into v_here, v_done
  from players where room_id = p_room_id;
  if v_here > 0 and v_done >= v_here then perform song_show_answer(p_room_id); end if;

  return jsonb_build_object(
    'result', case when v_new_a and v_new_t then 'both' when v_new_a then 'artist' when v_new_t then 'title'
                   when v_a = 1 or v_t = 1 then 'close' else 'wrong' end,
    'points', v_gain, 'first', v_first,
    'got_artist', v_g.artist_at is not null, 'got_title', v_g.title_at is not null);
end;
$function$;

-- ============================================================
-- tick: every browser calls it once a second; moves the match forward and returns the server
-- clock (so everybody's clip starts at the same moment)
-- ============================================================
create or replace function public.song_tick(p_room_id uuid)
 returns timestamptz
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_room rooms;
  v_listen timestamptz;
  v_len numeric;
begin
  select * into v_room from rooms where id = p_room_id for update;
  if v_room.id is null or v_room.mode is distinct from 'song' or v_room.status <> 'playing' then return now(); end if;
  v_listen := (v_room.song_round->>'listen_at')::timestamptz;
  v_len := coalesce((v_room.song_round->>'listen_secs')::numeric, 20);

  if v_room.song_phase = 'ready' and now() >= v_listen then
    update rooms set song_phase = 'listen', question_expires_at = v_listen + v_len * interval '1 second'
    where id = p_room_id;
  elsif v_room.song_phase = 'listen' and now() >= v_listen + v_len * interval '1 second' + interval '600 milliseconds' then
    perform song_show_answer(p_room_id);
  elsif v_room.song_phase = 'reveal' and now() >= v_room.question_expires_at then
    perform song_next_round(p_room_id);
  end if;
  return now();
end;
$function$;

revoke execute on function public.song_next_round(uuid) from public, anon, authenticated;
revoke execute on function public.song_show_answer(uuid) from public, anon, authenticated;
revoke execute on function public.song_finish(uuid) from public, anon, authenticated;

-- check: all true
select
  exists (select 1 from information_schema.columns where table_name = 'rooms' and column_name = 'song_round') as rooms_ready,
  exists (select 1 from storage.buckets where id = 'songs') as songs_folder,
  (select enabled from public.mode_switches where mode = 'song') as mode_on;
