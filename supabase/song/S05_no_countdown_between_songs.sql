-- PYTH BOMB · GUESS THE SONG — step S05: no GET READY countdown between songs
-- Run in Supabase SQL Editor AFTER S04. Safe to run more than once.
-- The first song of a game keeps the 10-second countdown. From the second song on there is no
-- countdown: after the answer screen ("It was...", 8 s) the next song starts 2 seconds later
-- (time for every phone to load it). Still 30 seconds to listen and answer.

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
  v_ready interval;
begin
  select * into v_room from rooms where id = p_room_id;
  if v_room.round_number >= coalesce(v_room.song_total, 10) then
    perform song_finish(p_room_id);
    return;
  end if;
  -- GET READY: 10 s countdown before the first song (time to settle and turn the sound on). The other
  -- songs have no countdown: 2 s with the answer screen already showing (time to load the music)
  v_ready := case when v_room.round_number = 0 then interval '10 seconds' else interval '2 seconds' end;

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
      song_round = jsonb_build_object('file', v_s.file, 'url', v_url, 'listen_at', now() + v_ready, 'listen_secs', 30),
      round_started_at = now() + v_ready,
      question_expires_at = now() + v_ready
  where id = p_room_id;
end;
$function$;

revoke execute on function public.song_next_round(uuid) from public, anon, authenticated;

-- check: should be true / true
select position('''listen_secs'', 30' in pg_get_functiondef('public.song_next_round(uuid)'::regprocedure)) > 0 as thirty_seconds,
       position('2 seconds' in pg_get_functiondef('public.song_next_round(uuid)'::regprocedure)) > 0 as no_countdown_between_songs;
