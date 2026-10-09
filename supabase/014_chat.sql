-- PYTH BOMB: room chat (step 14)
-- Run in Supabase SQL Editor AFTER 013_players_rules.sql. Safe to run more than once.
--
--   messages            : the chat messages of each room (max 140 characters each)
--   send_message()      : the ONLY way to write a message (browsers can not insert directly), so the
--                         server can check: you are in the room, 1-140 characters, not too fast
--                         (1 message every ~1.2 s per player), and no hate words (same block list as
--                         the nicknames: nickname_allowed from 013)
--   who can read        : only players that are in that room (row level security), live through realtime
--   cleanup             : each room keeps only its last 100 messages

create table if not exists public.messages (
  id         uuid primary key default gen_random_uuid(),
  room_id    uuid not null references public.rooms(id) on delete cascade,
  player_id  uuid references public.players(id) on delete set null,
  nickname   text not null,
  body       text not null check (char_length(body) between 1 and 140),
  created_at timestamptz not null default now()
);

create index if not exists messages_room_created on public.messages (room_id, created_at desc);

alter table public.messages enable row level security;

drop policy if exists "read messages of my room" on public.messages;
create policy "read messages of my room" on public.messages
  for select to authenticated
  using (exists (
    select 1 from public.players p
    where p.room_id = messages.room_id and p.user_id = auth.uid()
  ));
-- (no insert / update / delete policy on purpose: only send_message() writes)

-- live updates (realtime)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;

create or replace function public.send_message(p_room_id uuid, p_body text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_player players;
  v_body text;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;

  select * into v_player from players where room_id = p_room_id and user_id = auth.uid() limit 1;
  if v_player.id is null then raise exception 'You are not in this room'; end if;

  v_body := btrim(regexp_replace(coalesce(p_body, ''), '\s+', ' ', 'g'));
  if char_length(v_body) < 1 then return; end if;
  if char_length(v_body) > 140 then raise exception 'Message too long (max 140 characters)'; end if;
  if v_body ~ '[​-‏‪-‮⁠﻿]' or not public.nickname_allowed(v_body) then
    raise exception 'That message is not allowed';
  end if;

  if exists (
    select 1 from messages
    where room_id = p_room_id and player_id = v_player.id and created_at > now() - interval '1200 milliseconds'
  ) then
    raise exception 'Slow down!';
  end if;

  insert into messages (room_id, player_id, nickname, body)
  values (p_room_id, v_player.id, v_player.nickname, v_body);

  -- keeps only the last 100 messages of the room
  delete from messages
  where room_id = p_room_id
    and id not in (select id from messages where room_id = p_room_id order by created_at desc limit 100);
end;
$function$;

-- check: should show the table, the policy and the function
select
  (select count(*) from pg_tables where schemaname = 'public' and tablename = 'messages') as table_ok,
  (select count(*) from pg_policies where tablename = 'messages') as policy_ok,
  (select count(*) from pg_proc where proname = 'send_message') as function_ok;
