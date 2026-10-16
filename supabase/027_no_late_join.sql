-- PYTH BOMB: no joining in the middle of a match (step 27)
-- Run in Supabase SQL Editor. Safe to run more than once.
--
-- Found in a test: someone joined a room long after the match had started.
-- Now: while the room is PLAYING, new players can not get in (they see "This game has already
-- started"). They can join on the lobby or on the game over screen, and play the next match.
-- Players who were already in the room still reconnect normally (reload, phone locked...).
-- Only players_before_insert changes: the same as 013, plus the check marked NEW (027).

create or replace function public.players_before_insert()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $function$
declare
  v_free int;
  v_status text;
begin
  -- one join at a time per room, so the count and the free character are exact
  perform pg_advisory_xact_lock(hashtext('players:' || NEW.room_id::text));

  -- NEW (027): nobody new gets in while a match is running (players already in the room
  -- reconnect with their old seat, so this does not touch them)
  select status into v_status from rooms where id = NEW.room_id;
  if v_status = 'playing' then
    raise exception 'This game has already started. Wait for it to end, then join.';
  end if;

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

-- check: should be true
select position('already started' in pg_get_functiondef('public.players_before_insert()'::regprocedure)) > 0 as blocks_late_join;
