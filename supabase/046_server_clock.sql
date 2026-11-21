-- PYTH BOMB · step 046: the game clock moves to the game server (Railway)
-- Run in Supabase SQL Editor. Safe to run more than once. Can be run with rooms open.
--
-- BEFORE: every phone in a match called the "tick" of its mode (tick, person_tick, song_tick, price_tick,
-- poker_tick) once per second. With 13 phones that is 13 calls per second for ONE room, most of them locking
-- the room row, and on the free Supabase plan the database ran out of connections (Person/Song froze,
-- the PVP server could not check logins: "Supabase 522").
-- NOW: the game server on Railway (always on) calls tick_all() twice per second. ONE call advances every
-- room that is playing, whatever the mode. The phones only tick every few seconds as a backup (and right
-- away if a round is late), so the load no longer grows with the number of players.
-- The rules of the games do not change: tick_all just calls the same tick of each mode.
-- To undo: drop function public.tick_all(); (the phones keep working with their backup tick).

-- one row that remembers when tick_all last ran, so it never runs more than ~3 times per second
-- (even if many callers or two servers call it at the same time)
create table if not exists public.server_clock (
  id int primary key default 1 check (id = 1),
  last_run timestamptz not null default 'epoch',
  runs bigint not null default 0,
  last_rooms int not null default 0
);
insert into public.server_clock (id) values (1) on conflict (id) do nothing;
alter table public.server_clock enable row level security; -- no policies: nobody reads it from the browser
revoke all on table public.server_clock from anon, authenticated;

create or replace function public.tick_all()
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  r record;
  v_room rooms;
  v_n int := 0;
  v_err int := 0;
begin
  -- 1) only one caller at a time, at most every 300 ms (the others leave right away)
  perform 1 from server_clock where id = 1 and last_run < clock_timestamp() - interval '300 milliseconds'
    for update skip locked;
  if not found then return jsonb_build_object('skipped', true, 'now', now()); end if;

  -- 2) every room that is playing and still has someone in it (heartbeat in the last 45 s)
  for r in
    select rm.id, rm.mode from rooms rm
    where rm.status = 'playing'
      and exists (select 1 from players p where p.room_id = rm.id and p.last_seen > now() - interval '45 seconds')
  loop
    begin
      if r.mode = 'person' then perform person_tick(r.id);
      elsif r.mode = 'song' then perform song_tick(r.id);
      elsif r.mode = 'price' then perform price_tick(r.id);
      elsif r.mode = 'poker' then perform poker_tick(r.id);
      elsif r.mode = 'classic' then
        -- Hot Potato / Classic / Recap: same rule as tick() (time is up -> fail_turn), but without the
        -- "signed in" check (the server is not a player) and without waiting for a busy room
        select * into v_room from rooms where id = r.id;
        if v_room.question_expires_at is not null and now() >= v_room.question_expires_at + interval '600 milliseconds' then
          select * into v_room from rooms where id = r.id for update skip locked;
          if v_room.id is not null and v_room.status = 'playing' and v_room.question_expires_at is not null
             and now() >= v_room.question_expires_at + interval '600 milliseconds' then
            perform fail_turn(r.id);
          end if;
        end if;
      end if;
      v_n := v_n + 1;
    exception when others then
      -- one broken room never stops the others
      v_err := v_err + 1;
      raise warning 'tick_all: room % (%) failed: %', r.id, r.mode, sqlerrm;
    end;
  end loop;

  update server_clock set last_run = clock_timestamp(), runs = runs + 1, last_rooms = v_n where id = 1;
  return jsonb_build_object('rooms', v_n, 'errors', v_err, 'now', now());
end;
$function$;

revoke execute on function public.tick_all() from public;
grant execute on function public.tick_all() to anon, authenticated, service_role;

-- check: should say true, true
select
  exists (select 1 from public.server_clock where id = 1) as clock_row_ready,
  has_function_privilege('anon', 'public.tick_all()', 'execute') as server_can_call;
