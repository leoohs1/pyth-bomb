-- PYTH BOMB · GUESS THE SONG — step S01b: play Deezer's official 30-second previews
-- Run in Supabase SQL Editor AFTER S01. Safe to run more than once. No key needed.
--
-- Instead of storing music files, a song can now have a Deezer id. When a round starts, the
-- server asks Deezer for a FRESH preview link (each link works for ~15 minutes) and sends only
-- that link to the players (never the name of the song). The music plays from Deezer's servers:
-- our site does not store any music. Songs with a file in the "songs" folder still work too.
-- If Deezer does not give a preview for a song, the round picks another song automatically.

create extension if not exists http with schema extensions;

alter table public.song_bank add column if not exists deezer_id bigint;
alter table public.song_bank alter column file drop not null;
create unique index if not exists song_bank_deezer on public.song_bank (deezer_id) where deezer_id is not null;

create schema if not exists song_private;
revoke all on schema song_private from public, anon, authenticated;

-- asks Deezer for the preview link of one track (null if there is none or Deezer did not answer)
-- (GET https://api.deezer.com/track/<id> -> field "preview")
create or replace function song_private.deezer_preview(p_id bigint)
 returns text
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $function$
declare
  v_status int;
  v_content text;
  v_url text;
begin
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '4000');
  select status, content into v_status, v_content
  from extensions.http(('GET', 'https://api.deezer.com/track/' || p_id, null, null, null)::extensions.http_request);
  if v_status <> 200 or v_content !~ '^\s*\{' then return null; end if;
  v_url := v_content::jsonb->>'preview';
  if v_url is null or v_url !~ '^https://' then return null; end if;
  return v_url;
exception when others then
  return null;
end;
$function$;
revoke all on all functions in schema song_private from public, anon, authenticated;

-- next round: same as S01, plus the Deezer preview (tries up to 5 songs if a preview is missing)
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
  v_url text;
  v_try int := 0;
begin
  select * into v_room from rooms where id = p_room_id;
  if v_room.round_number >= coalesce(v_room.song_total, 10) then
    perform song_finish(p_room_id);
    return;
  end if;

  loop
    v_try := v_try + 1;
    v_s := null;
    select min(times_dealt) into v_min from song_bank where active;
    select * into v_s from song_bank
    where active and times_dealt = v_min
    order by random() limit 1
    for update skip locked;
    if v_s.id is null then
      select * into v_s from song_bank where active order by times_dealt, random() limit 1;
    end if;
    if v_s.id is null then raise exception 'No songs available'; end if;

    -- this song was "used" either way (so a song without preview does not come back right away)
    update song_bank set times_dealt = times_dealt + 1 where id = v_s.id;

    v_url := null;
    if v_s.deezer_id is not null then v_url := song_private.deezer_preview(v_s.deezer_id); end if;
    exit when v_url is not null or v_s.file is not null;
    if v_try >= 5 then raise exception 'Could not get the music for this round. Try again.'; end if;
  end loop;

  insert into song_secrets (room_id, song_id) values (p_room_id, v_s.id)
  on conflict (room_id) do update set song_id = excluded.song_id;

  update players set song_artist_round = null, song_title_round = null where room_id = p_room_id;
  update rooms
  set round_number = round_number + 1,
      song_phase = 'ready',
      song_reveal = null,
      song_round = jsonb_build_object('file', v_s.file, 'url', v_url, 'listen_at', now() + interval '3 seconds', 'listen_secs', 20),
      round_started_at = now() + interval '3 seconds',
      question_expires_at = now() + interval '3 seconds'
  where id = p_room_id;
end;
$function$;

revoke execute on function public.song_next_round(uuid) from public, anon, authenticated;

-- check: should be true / true / a link (Deezer answered for Queen - Bohemian Rhapsody)
select
  exists (select 1 from information_schema.columns where table_name = 'song_bank' and column_name = 'deezer_id') as songs_have_deezer_id,
  exists (select 1 from pg_extension where extname = 'http') as http_ready,
  left(song_private.deezer_preview(4091937401), 40) as deezer_test;
