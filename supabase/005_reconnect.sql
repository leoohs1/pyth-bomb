-- PYTH BOMB: reconnection support (step 5)
-- Run in Supabase SQL Editor AFTER 004_timers.sql. Safe to run more than once.
--
-- A player who refreshes the page (or reopens the site later) now rejoins the room
-- they were in as the SAME player - same alive/dead status, same id - instead of
-- getting a brand new row. The client remembers the room code in localStorage and
-- looks the player up by (room_id, user_id) before inserting.
--
-- This migration:
--  1) Finds duplicate (room_id, user_id) player rows left over from earlier testing
--     (two browser tabs sharing the same anonymous login both joined the same room,
--     each getting their own row) and merges each group into one "keeper" row,
--     repointing any rooms.bomb_holder_id / winner_id / last_victim_id that pointed
--     at a row being removed.
--  2) Adds a unique constraint on (room_id, user_id) so this can't happen again: a
--     duplicate insert now fails loudly (error code 23505) instead of silently
--     creating a ghost player. The app already handles that error.

do $$
declare
  g record;
begin
  for g in
    select room_id, user_id, (array_agg(id order by joined_at, ctid))[1] as keep_id
    from players
    group by room_id, user_id
    having count(*) > 1
  loop
    update rooms set bomb_holder_id = g.keep_id
      where id = g.room_id and bomb_holder_id in
        (select id from players where room_id = g.room_id and user_id = g.user_id and id <> g.keep_id);
    update rooms set winner_id = g.keep_id
      where id = g.room_id and winner_id in
        (select id from players where room_id = g.room_id and user_id = g.user_id and id <> g.keep_id);
    update rooms set last_victim_id = g.keep_id
      where id = g.room_id and last_victim_id in
        (select id from players where room_id = g.room_id and user_id = g.user_id and id <> g.keep_id);

    delete from players where room_id = g.room_id and user_id = g.user_id and id <> g.keep_id;
  end loop;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'players_room_user_unique') then
    alter table public.players add constraint players_room_user_unique unique (room_id, user_id);
  end if;
end $$;
