-- !! OUTDATED PARTS: 002_questions.sql (run later) REPLACES new_round, start_game and tick,
-- !! and DELETES pass_bomb (now submit_answer). The live database follows 002.
-- !! Order to rebuild from scratch: this file, then 002_questions.sql, then 003_seed_questions.sql.
--
-- PYTH BOMB: server logic (Supabase / Postgres)
-- Backup of what is currently live in the Supabase project.
-- NOTE: table definitions (rooms, players, room_secrets) are NOT in this file yet.
-- Only functions + security rules. Last synced: 2026-09-25.

-- ============================================================
-- Room owner (host)
-- ============================================================
alter table public.rooms
  add column if not exists host_user_id uuid default auth.uid();

-- ============================================================
-- Row Level Security (RLS)
-- players/rooms: read + insert only. No update/delete from browser.
-- room_secrets: RLS on, NO policies => browser can never read it.
-- room_secrets must NOT be in the supabase_realtime publication.
-- ============================================================
alter table public.players      enable row level security;
alter table public.rooms        enable row level security;
alter table public.room_secrets enable row level security;

create policy "join as myself" on public.players
  for insert to authenticated with check (user_id = auth.uid());
create policy "read players" on public.players
  for select to authenticated using (true);

create policy "create room" on public.rooms
  for insert to authenticated with check (host_user_id = auth.uid());
create policy "read rooms" on public.rooms
  for select to authenticated using (true);

-- ============================================================
-- Functions
-- ============================================================

-- Starts a new round. Picks a random alive player for the bomb and
-- sets the SECRET explosion time (20-40s). Ends the game if <= 1 alive.
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
        last_event_at = now()
    where id = p_room_id;
    return;
  end if;

  -- evita dar a bomba de volta pra quem acabou de explodir, se houver opção
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

  -- o horário secreto: entre 20 e 40 segundos
  insert into room_secrets (room_id, bomb_explode_at)
  values (p_room_id, now() + make_interval(secs => 20 + random() * 20))
  on conflict (room_id) do update set bomb_explode_at = excluded.bomb_explode_at;
end;
$function$;

-- Only the bomb holder (alive) can pass. Caller identity comes from auth.uid().
CREATE OR REPLACE FUNCTION public.pass_bomb(p_room_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_room rooms;
  v_me uuid;
  v_next uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;

  select * into v_room from rooms where id = p_room_id for update;
  if v_room.status <> 'playing' then raise exception 'Game is not running'; end if;

  select id into v_me from players
  where room_id = p_room_id and user_id = auth.uid() and alive limit 1;

  if v_me is null or v_room.bomb_holder_id is distinct from v_me then
    raise exception 'You do not have the bomb';
  end if;

  select id into v_next from players
  where room_id = p_room_id and alive and id <> v_me
  order by random() limit 1;

  if v_next is null then raise exception 'Nobody to pass to'; end if;

  update rooms set bomb_holder_id = v_next where id = p_room_id;
end;
$function$;

-- Only the room host can start; not while a game is running.
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

  perform new_round(p_room_id, null);
end;
$function$;

-- Called by clients every second. Only does something once the secret
-- explosion time has passed: eliminates the holder and starts the next round.
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
  if v_deadline is null or now() < v_deadline then return; end if;

  v_victim := v_room.bomb_holder_id;

  update players set alive = false where id = v_victim;
  update rooms set last_victim_id = v_victim, last_event_at = now() where id = p_room_id;

  perform new_round(p_room_id, v_victim);
end;
$function$;
