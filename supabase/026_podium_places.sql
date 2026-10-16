-- PYTH BOMB: podium with the top 3 on the game over screen (step 26)
-- Run in Supabase SQL Editor (best between games). Safe to run more than once.
--
-- Before: the game only knew who WON. Nobody knew who was 2nd or 3rd.
-- Now: when a player is eliminated, the game saves their final place (players.place).
-- Place = how many players were still alive at that moment. Example with 5 players:
-- the 1st to explode is 5th, the next is 4th, then 3rd, then 2nd; the last one alive wins.
-- A new game ("Play again") clears the places.
-- Only fail_turn (elimination) and start_game (reset) change; the rest is the same as 018.

alter table public.players add column if not exists place int;

-- ============================================================
-- start_game: everybody back to 2 lives, places cleared
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

  update players set alive = true, lives = 2, place = null where room_id = p_room_id;
  update rooms
  set winner_id = null, last_victim_id = null, last_hit_id = null, last_hit_at = null, round_number = 0
  where id = p_room_id;
  update room_secrets set question_deck = '{}', deck_cursor = 0, current_question_id = null
  where room_id = p_room_id;

  perform new_round(p_room_id, null);
end;
$function$;

-- ============================================================
-- fail_turn (internal): the holder failed (5 wrong guesses or time ran out).
-- Loses 1 life; at 0 lives is eliminated and gets their final place.
-- The bomb passes to the next player in the rotation.
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
  v_place int;
begin
  select bomb_holder_id into v_holder from rooms where id = p_room_id;
  if v_holder is null then return 'hit'; end if;

  update players set lives = greatest(lives - 1, 0) where id = v_holder returning lives into v_lives;

  if coalesce(v_lives, 0) <= 0 then
    -- final place = how many are still alive, counting the one who just exploded
    select count(*) into v_place from players where room_id = p_room_id and alive;
    update players set alive = false, lives = 0, place = v_place where id = v_holder;
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

-- check: should be true / true / true
select
  exists (select 1 from information_schema.columns where table_name = 'players' and column_name = 'place') as has_place,
  position('place = v_place' in pg_get_functiondef('public.fail_turn(uuid)'::regprocedure)) > 0 as new_fail_turn,
  position('place = null' in pg_get_functiondef('public.start_game(uuid)'::regprocedure)) > 0 as new_start_game;
