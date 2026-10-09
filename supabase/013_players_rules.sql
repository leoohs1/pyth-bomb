-- PYTH BOMB: player rules (step 13)
-- Run in Supabase SQL Editor AFTER 012. Safe to run more than once.
--
--  1) MAX 18 players per room (enforced by the server, not just the screen)
--  2) Nicknames: 2 to 20 characters, no duplicates in the same room (ignores upper/lower case),
--     and a block list for slurs / hate words (see nickname_allowed below)
--  3) HOST TRANSFER: every player's browser sends a "heartbeat" every ~15 s. If the host
--     disappears (no heartbeat for 60 s, or they press "Leave room"), the player who joined
--     first among those still present becomes the host, and so on.
--     In the lobby / game-over screen, players who vanished (60 s without heartbeat) are removed.
--  4) CHARACTER PICK: each player has a character (players.avatar_idx, 0-19). It is assigned
--     automatically (lowest free one), and the player can change it in the lobby with
--     pick_character(). Two players in the same room can never have the same character.

-- ============================================================
-- columns
-- ============================================================
alter table public.players add column if not exists last_seen  timestamptz not null default now();
alter table public.players add column if not exists avatar_idx int;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'players_avatar_range') then
    alter table public.players add constraint players_avatar_range check (avatar_idx is null or avatar_idx between 0 and 19);
  end if;
end $$;

create unique index if not exists players_room_avatar_unique
  on public.players (room_id, avatar_idx) where avatar_idx is not null;

-- ============================================================
-- nickname block list
-- Strong words are matched anywhere inside the nickname (after turning 0->o, 1->i, 3->e,
-- 4->a, 5->s, 7->t, @->a, $->s and removing everything that is not a letter).
-- Ambiguous words are matched only as a WHOLE word (so "grape" or "Nazir" are fine).
-- It is a simple filter: it stops the obvious cases, it can not catch everything.
-- ============================================================
create or replace function public.nickname_allowed(p_nick text)
 returns boolean
 language plpgsql
 stable
 set search_path to 'public', 'extensions'
as $function$
declare
  v_plain text;
  v_letters text;
  v_word text;
  v_strong constant text[] := array[
    'nigger','nigga','faggot','fagot','tranny','retard','hitler','siegheil','heilhitler',
    'whitepower','wetback','towelhead','sandnigger','jigaboo','porchmonkey','pedofil','pedophile',
    'paedophile','childmolest','estupr','crioulo','pretofedido','viado','kkk','nazi'
  ];
  v_whole constant text[] := array[
    'nazi','nazis','kike','chink','gook','spic','coon','paki','beaner','dyke','fag','rape','rapist','isis','pedo'
  ];
begin
  v_plain := lower(extensions.unaccent(coalesce(p_nick, '')));
  v_plain := translate(v_plain, '013457@$!', 'oieastasi');
  v_letters := regexp_replace(v_plain, '[^a-z]', '', 'g');

  -- 'nazi' and 'kkk' as substrings would catch real names (Nazir...), so they only count as whole words below
  foreach v_word in array v_strong loop
    if v_word in ('nazi', 'kkk') then continue; end if;
    if position(v_word in v_letters) > 0 then return false; end if;
  end loop;

  foreach v_word in array regexp_split_to_array(btrim(regexp_replace(v_plain, '[^a-z0-9]+', ' ', 'g')), ' ') loop
    if v_word = any (v_whole) or v_word = 'kkk' then return false; end if;
  end loop;

  -- numbers used as hate symbols
  if regexp_replace(coalesce(p_nick, ''), '[^0-9]', '', 'g') ~ '1488' then return false; end if;

  return true;
end;
$function$;

-- ============================================================
-- before a player joins: cap, nickname rules, automatic character
-- ============================================================
create or replace function public.players_before_insert()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $function$
declare
  v_free int;
begin
  -- one join at a time per room, so the count and the free character are exact
  perform pg_advisory_xact_lock(hashtext('players:' || NEW.room_id::text));

  NEW.nickname := btrim(NEW.nickname);

  if char_length(NEW.nickname) < 2 or char_length(NEW.nickname) > 20 then
    raise exception 'Nickname must be 2 to 20 characters';
  end if;
  if NEW.nickname ~ '[​-‏‪-‮⁠﻿]' then
    raise exception 'That nickname is not allowed. Please choose another.';
  end if;
  if not public.nickname_allowed(NEW.nickname) then
    raise exception 'That nickname is not allowed. Please choose another.';
  end if;
  if exists (
    select 1 from players p
    where p.room_id = NEW.room_id and p.user_id <> NEW.user_id
      and lower(btrim(p.nickname)) = lower(NEW.nickname)
  ) then
    raise exception 'That nickname is already taken in this room';
  end if;

  if (select count(*) from players where room_id = NEW.room_id and user_id <> NEW.user_id) >= 18 then
    raise exception 'This room is full (max 18 players)';
  end if;

  if NEW.avatar_idx is null then
    select i into v_free
    from generate_series(0, 19) as i
    where not exists (select 1 from players p where p.room_id = NEW.room_id and p.avatar_idx = i)
    order by i limit 1;
    NEW.avatar_idx := v_free;
  end if;

  NEW.last_seen := now();
  return NEW;
end;
$function$;

drop trigger if exists players_before_insert on public.players;
create trigger players_before_insert
  before insert on public.players
  for each row execute function public.players_before_insert();

-- ============================================================
-- host transfer (internal): if the host is not present, the earliest-joined
-- player who IS present becomes the host
-- ============================================================
create or replace function public.fix_host(p_room_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_host uuid;
  v_new uuid;
begin
  select host_user_id into v_host from rooms where id = p_room_id;

  if exists (
    select 1 from players
    where room_id = p_room_id and user_id = v_host and last_seen >= now() - interval '60 seconds'
  ) then
    return;
  end if;

  select user_id into v_new
  from players
  where room_id = p_room_id and last_seen >= now() - interval '60 seconds'
  order by joined_at, id
  limit 1;

  if v_new is not null and v_new is distinct from v_host then
    update rooms set host_user_id = v_new where id = p_room_id;
  end if;
end;
$function$;

revoke execute on function public.fix_host(uuid) from public, anon, authenticated;

-- ============================================================
-- heartbeat: "I'm still here" (browsers call this every ~15 s)
-- ============================================================
create or replace function public.heartbeat(p_room_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_room rooms;
begin
  if auth.uid() is null then return; end if;

  update players set last_seen = now() where room_id = p_room_id and user_id = auth.uid();
  if not found then return; end if;

  select * into v_room from rooms where id = p_room_id;
  if v_room.id is null then return; end if;

  -- lobby / game over: remove players who vanished (never during a match, never the ones the room points to)
  if v_room.status in ('lobby', 'finished') then
    delete from players
    where room_id = p_room_id
      and last_seen < now() - interval '60 seconds'
      and id is distinct from v_room.winner_id
      and id is distinct from v_room.last_victim_id
      and id is distinct from v_room.bomb_holder_id;
  end if;

  perform public.fix_host(p_room_id);
end;
$function$;

-- ============================================================
-- leave_room: "Leave room" button. Lobby / game over: my player is removed.
-- During a match: I stay (the bomb will take care of me) but count as gone for host purposes.
-- ============================================================
create or replace function public.leave_room(p_room_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_room rooms;
begin
  if auth.uid() is null then return; end if;
  select * into v_room from rooms where id = p_room_id;
  if v_room.id is null then return; end if;

  if v_room.status in ('lobby', 'finished') then
    delete from players
    where room_id = p_room_id and user_id = auth.uid()
      and id is distinct from v_room.winner_id
      and id is distinct from v_room.last_victim_id
      and id is distinct from v_room.bomb_holder_id;
  end if;
  -- (if the row could not be deleted, or during a match) mark as gone
  update players set last_seen = now() - interval '1 hour'
  where room_id = p_room_id and user_id = auth.uid();

  perform public.fix_host(p_room_id);
end;
$function$;

-- ============================================================
-- pick_character: choose my character (lobby / game over only)
-- ============================================================
create or replace function public.pick_character(p_room_id uuid, p_idx int)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_room rooms;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if p_idx is null or p_idx < 0 or p_idx > 19 then raise exception 'Invalid character'; end if;

  perform pg_advisory_xact_lock(hashtext('players:' || p_room_id::text));

  select * into v_room from rooms where id = p_room_id;
  if v_room.id is null then raise exception 'Room not found'; end if;
  if v_room.status = 'playing' then raise exception 'You can not change character during a match'; end if;

  if exists (
    select 1 from players
    where room_id = p_room_id and avatar_idx = p_idx and user_id <> auth.uid()
  ) then
    raise exception 'That character is already taken';
  end if;

  update players set avatar_idx = p_idx where room_id = p_room_id and user_id = auth.uid();
  if not found then raise exception 'You are not in this room'; end if;
end;
$function$;

-- check: should show the new rules are in place
select
  (select count(*) from pg_trigger where tgname = 'players_before_insert') as trigger_ok,
  public.nickname_allowed('Halls') as halls_ok,
  public.nickname_allowed('Grape') as grape_ok,
  public.nickname_allowed('n1gg3r') as slur_blocked;
