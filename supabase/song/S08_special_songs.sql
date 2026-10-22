-- PYTH BOMB · GUESS THE SONG — step S08: 20 SPECIAL songs that play first
-- Run in Supabase SQL Editor AFTER S07. Safe to run more than once.
-- The special songs are dealt FIRST, once each, before any other song. After that the normal rotation goes on.
-- (So in a game of 10 songs, the first 2 games are made only of special songs.)
-- Songs that were not in the game yet are added. To go back to normal later:
--     update public.song_bank set special = false;
-- To give the special songs their "first" priority again (e.g. right before the event):
--     update public.song_bank set times_dealt = 0 where special;

alter table public.song_bank add column if not exists special boolean not null default false;

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
    -- special songs that were never dealt count as "-1", so they come before every other song (once each)
    select min(case when special and times_dealt = 0 then -1 else times_dealt end) into v_min from song_bank where active;
    select * into v_s from song_bank
    where active and (case when special and times_dealt = 0 then -1 else times_dealt end) = v_min
    order by random() limit 1
    for update skip locked;
    if v_s.id is null then
      select * into v_s from song_bank where active order by (case when special and times_dealt = 0 then -1 else times_dealt end), random() limit 1;
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

-- songs not in the game yet
insert into public.song_bank (deezer_id, artist, title, artist_answers, title_answers, year)
select 908604612, 'The Weeknd', 'Blinding Lights', array['Weeknd']::text[], array[]::text[], null
where not exists (select 1 from public.song_bank where (deezer_id = 908604612 or (public.normalize_answer(artist) = public.normalize_answer('The Weeknd') and public.normalize_answer(title) = public.normalize_answer('Blinding Lights'))));
insert into public.song_bank (deezer_id, artist, title, artist_answers, title_answers, year)
select 139470659, 'Ed Sheeran', 'Shape of You', array[]::text[], array[]::text[], null
where not exists (select 1 from public.song_bank where (deezer_id = 139470659 or (public.normalize_answer(artist) = public.normalize_answer('Ed Sheeran') and public.normalize_answer(title) = public.normalize_answer('Shape of You'))));
insert into public.song_bank (deezer_id, artist, title, artist_answers, title_answers, year)
select 540175, 'Britney Spears', '...Baby One More Time', array[]::text[], array['Hit Me Baby One More Time']::text[], null
where not exists (select 1 from public.song_bank where (deezer_id = 540175 or (public.normalize_answer(artist) = public.normalize_answer('Britney Spears') and public.normalize_answer(title) = public.normalize_answer('...Baby One More Time'))));
insert into public.song_bank (deezer_id, artist, title, artist_answers, title_answers, year)
select 4091937401, 'Queen', 'Bohemian Rhapsody', array[]::text[], array[]::text[], null
where not exists (select 1 from public.song_bank where (deezer_id = 4091937401 or (public.normalize_answer(artist) = public.normalize_answer('Queen') and public.normalize_answer(title) = public.normalize_answer('Bohemian Rhapsody'))));
insert into public.song_bank (deezer_id, artist, title, artist_answers, title_answers, year)
select 7193834, 'John Lennon', 'Imagine', array[]::text[], array[]::text[], null
where not exists (select 1 from public.song_bank where (deezer_id = 7193834 or (public.normalize_answer(artist) = public.normalize_answer('John Lennon') and public.normalize_answer(title) = public.normalize_answer('Imagine'))));
insert into public.song_bank (deezer_id, artist, title, artist_answers, title_answers, year)
select 84572613, 'Oasis', 'Wonderwall', array[]::text[], array[]::text[], null
where not exists (select 1 from public.song_bank where (deezer_id = 84572613 or (public.normalize_answer(artist) = public.normalize_answer('Oasis') and public.normalize_answer(title) = public.normalize_answer('Wonderwall'))));
insert into public.song_bank (deezer_id, artist, title, artist_answers, title_answers, year)
select 111628786, 'Led Zeppelin', 'Stairway to Heaven', array[]::text[], array[]::text[], null
where not exists (select 1 from public.song_bank where (deezer_id = 111628786 or (public.normalize_answer(artist) = public.normalize_answer('Led Zeppelin') and public.normalize_answer(title) = public.normalize_answer('Stairway to Heaven'))));
insert into public.song_bank (deezer_id, artist, title, artist_answers, title_answers, year)
select 116348612, 'The Beatles', 'Yesterday', array['Beatles']::text[], array[]::text[], null
where not exists (select 1 from public.song_bank where (deezer_id = 116348612 or (public.normalize_answer(artist) = public.normalize_answer('The Beatles') and public.normalize_answer(title) = public.normalize_answer('Yesterday'))));
insert into public.song_bank (deezer_id, artist, title, artist_answers, title_answers, year)
select 13791930, 'Nirvana', 'Smells Like Teen Spirit', array[]::text[], array[]::text[], null
where not exists (select 1 from public.song_bank where (deezer_id = 13791930 or (public.normalize_answer(artist) = public.normalize_answer('Nirvana') and public.normalize_answer(title) = public.normalize_answer('Smells Like Teen Spirit'))));
insert into public.song_bank (deezer_id, artist, title, artist_answers, title_answers, year)
select 4603408, 'Michael Jackson', 'Billie Jean', array[]::text[], array[]::text[], null
where not exists (select 1 from public.song_bank where (deezer_id = 4603408 or (public.normalize_answer(artist) = public.normalize_answer('Michael Jackson') and public.normalize_answer(title) = public.normalize_answer('Billie Jean'))));
insert into public.song_bank (deezer_id, artist, title, artist_answers, title_answers, year)
select 5606967, 'Justin Bieber', 'Baby', array[]::text[], array[]::text[], null
where not exists (select 1 from public.song_bank where (deezer_id = 5606967 or (public.normalize_answer(artist) = public.normalize_answer('Justin Bieber') and public.normalize_answer(title) = public.normalize_answer('Baby'))));
insert into public.song_bank (deezer_id, artist, title, artist_answers, title_answers, year)
select 1174602992, 'Adele', 'Rolling in the Deep', array[]::text[], array[]::text[], null
where not exists (select 1 from public.song_bank where (deezer_id = 1174602992 or (public.normalize_answer(artist) = public.normalize_answer('Adele') and public.normalize_answer(title) = public.normalize_answer('Rolling in the Deep'))));
insert into public.song_bank (deezer_id, artist, title, artist_answers, title_answers, year)
select 2525864, 'The Police', 'Every Breath You Take', array['Police']::text[], array[]::text[], null
where not exists (select 1 from public.song_bank where (deezer_id = 2525864 or (public.normalize_answer(artist) = public.normalize_answer('The Police') and public.normalize_answer(title) = public.normalize_answer('Every Breath You Take'))));
insert into public.song_bank (deezer_id, artist, title, artist_answers, title_answers, year)
select 518458172, 'Guns N'' Roses', 'Sweet Child O'' Mine', array['Guns and Roses']::text[], array['Sweet Child of Mine']::text[], null
where not exists (select 1 from public.song_bank where (deezer_id = 518458172 or (public.normalize_answer(artist) = public.normalize_answer('Guns N'' Roses') and public.normalize_answer(title) = public.normalize_answer('Sweet Child O'' Mine'))));
insert into public.song_bank (deezer_id, artist, title, artist_answers, title_answers, year)
select 884025, 'ABBA', 'Dancing Queen', array[]::text[], array[]::text[], null
where not exists (select 1 from public.song_bank where (deezer_id = 884025 or (public.normalize_answer(artist) = public.normalize_answer('ABBA') and public.normalize_answer(title) = public.normalize_answer('Dancing Queen'))));
insert into public.song_bank (deezer_id, artist, title, artist_answers, title_answers, year)
select 13141170, 'Backstreet Boys', 'I Want It That Way', array[]::text[], array[]::text[], null
where not exists (select 1 from public.song_bank where (deezer_id = 13141170 or (public.normalize_answer(artist) = public.normalize_answer('Backstreet Boys') and public.normalize_answer(title) = public.normalize_answer('I Want It That Way'))));
insert into public.song_bank (deezer_id, artist, title, artist_answers, title_answers, year)
select 925106, 'Rihanna', 'Umbrella', array[]::text[], array[]::text[], null
where not exists (select 1 from public.song_bank where (deezer_id = 925106 or (public.normalize_answer(artist) = public.normalize_answer('Rihanna') and public.normalize_answer(title) = public.normalize_answer('Umbrella'))));
insert into public.song_bank (deezer_id, artist, title, artist_answers, title_answers, year)
select 623698142, 'Luis Fonsi', 'Despacito', array[]::text[], array[]::text[], null
where not exists (select 1 from public.song_bank where (deezer_id = 623698142 or (public.normalize_answer(artist) = public.normalize_answer('Luis Fonsi') and public.normalize_answer(title) = public.normalize_answer('Despacito'))));
insert into public.song_bank (deezer_id, artist, title, artist_answers, title_answers, year)
select 60726278, 'PSY', 'Gangnam Style', array['Psy']::text[], array[]::text[], null
where not exists (select 1 from public.song_bank where (deezer_id = 60726278 or (public.normalize_answer(artist) = public.normalize_answer('PSY') and public.normalize_answer(title) = public.normalize_answer('Gangnam Style'))));
insert into public.song_bank (deezer_id, artist, title, artist_answers, title_answers, year)
select 70266756, 'Avicii', 'Wake Me Up', array[]::text[], array[]::text[], null
where not exists (select 1 from public.song_bank where (deezer_id = 70266756 or (public.normalize_answer(artist) = public.normalize_answer('Avicii') and public.normalize_answer(title) = public.normalize_answer('Wake Me Up'))));

-- mark the special ones (and make sure they are on and "never dealt")
update public.song_bank set special = true, active = true, times_dealt = 0 where (deezer_id = 908604612 or (public.normalize_answer(artist) = public.normalize_answer('The Weeknd') and public.normalize_answer(title) = public.normalize_answer('Blinding Lights'))); -- The Weeknd - Blinding Lights
update public.song_bank set special = true, active = true, times_dealt = 0 where (deezer_id = 139470659 or (public.normalize_answer(artist) = public.normalize_answer('Ed Sheeran') and public.normalize_answer(title) = public.normalize_answer('Shape of You'))); -- Ed Sheeran - Shape of You
update public.song_bank set special = true, active = true, times_dealt = 0 where (deezer_id = 540175 or (public.normalize_answer(artist) = public.normalize_answer('Britney Spears') and public.normalize_answer(title) = public.normalize_answer('...Baby One More Time'))); -- Britney Spears - ...Baby One More Time
update public.song_bank set special = true, active = true, times_dealt = 0 where (deezer_id = 4091937401 or (public.normalize_answer(artist) = public.normalize_answer('Queen') and public.normalize_answer(title) = public.normalize_answer('Bohemian Rhapsody'))); -- Queen - Bohemian Rhapsody
update public.song_bank set special = true, active = true, times_dealt = 0 where (deezer_id = 7193834 or (public.normalize_answer(artist) = public.normalize_answer('John Lennon') and public.normalize_answer(title) = public.normalize_answer('Imagine'))); -- John Lennon - Imagine
update public.song_bank set special = true, active = true, times_dealt = 0 where (deezer_id = 84572613 or (public.normalize_answer(artist) = public.normalize_answer('Oasis') and public.normalize_answer(title) = public.normalize_answer('Wonderwall'))); -- Oasis - Wonderwall
update public.song_bank set special = true, active = true, times_dealt = 0 where (deezer_id = 111628786 or (public.normalize_answer(artist) = public.normalize_answer('Led Zeppelin') and public.normalize_answer(title) = public.normalize_answer('Stairway to Heaven'))); -- Led Zeppelin - Stairway to Heaven
update public.song_bank set special = true, active = true, times_dealt = 0 where (deezer_id = 116348612 or (public.normalize_answer(artist) = public.normalize_answer('The Beatles') and public.normalize_answer(title) = public.normalize_answer('Yesterday'))); -- The Beatles - Yesterday
update public.song_bank set special = true, active = true, times_dealt = 0 where (deezer_id = 13791930 or (public.normalize_answer(artist) = public.normalize_answer('Nirvana') and public.normalize_answer(title) = public.normalize_answer('Smells Like Teen Spirit'))); -- Nirvana - Smells Like Teen Spirit
update public.song_bank set special = true, active = true, times_dealt = 0 where (deezer_id = 4603408 or (public.normalize_answer(artist) = public.normalize_answer('Michael Jackson') and public.normalize_answer(title) = public.normalize_answer('Billie Jean'))); -- Michael Jackson - Billie Jean
update public.song_bank set special = true, active = true, times_dealt = 0 where (deezer_id = 5606967 or (public.normalize_answer(artist) = public.normalize_answer('Justin Bieber') and public.normalize_answer(title) = public.normalize_answer('Baby'))); -- Justin Bieber - Baby
update public.song_bank set special = true, active = true, times_dealt = 0 where (deezer_id = 1174602992 or (public.normalize_answer(artist) = public.normalize_answer('Adele') and public.normalize_answer(title) = public.normalize_answer('Rolling in the Deep'))); -- Adele - Rolling in the Deep
update public.song_bank set special = true, active = true, times_dealt = 0 where (deezer_id = 2525864 or (public.normalize_answer(artist) = public.normalize_answer('The Police') and public.normalize_answer(title) = public.normalize_answer('Every Breath You Take'))); -- The Police - Every Breath You Take
update public.song_bank set special = true, active = true, times_dealt = 0 where (deezer_id = 518458172 or (public.normalize_answer(artist) = public.normalize_answer('Guns N'' Roses') and public.normalize_answer(title) = public.normalize_answer('Sweet Child O'' Mine'))); -- Guns N' Roses - Sweet Child O' Mine
update public.song_bank set special = true, active = true, times_dealt = 0 where (deezer_id = 884025 or (public.normalize_answer(artist) = public.normalize_answer('ABBA') and public.normalize_answer(title) = public.normalize_answer('Dancing Queen'))); -- ABBA - Dancing Queen
update public.song_bank set special = true, active = true, times_dealt = 0 where (deezer_id = 13141170 or (public.normalize_answer(artist) = public.normalize_answer('Backstreet Boys') and public.normalize_answer(title) = public.normalize_answer('I Want It That Way'))); -- Backstreet Boys - I Want It That Way
update public.song_bank set special = true, active = true, times_dealt = 0 where (deezer_id = 925106 or (public.normalize_answer(artist) = public.normalize_answer('Rihanna') and public.normalize_answer(title) = public.normalize_answer('Umbrella'))); -- Rihanna - Umbrella
update public.song_bank set special = true, active = true, times_dealt = 0 where (deezer_id = 623698142 or (public.normalize_answer(artist) = public.normalize_answer('Luis Fonsi') and public.normalize_answer(title) = public.normalize_answer('Despacito'))); -- Luis Fonsi - Despacito
update public.song_bank set special = true, active = true, times_dealt = 0 where (deezer_id = 60726278 or (public.normalize_answer(artist) = public.normalize_answer('PSY') and public.normalize_answer(title) = public.normalize_answer('Gangnam Style'))); -- PSY - Gangnam Style
update public.song_bank set special = true, active = true, times_dealt = 0 where (deezer_id = 70266756 or (public.normalize_answer(artist) = public.normalize_answer('Avicii') and public.normalize_answer(title) = public.normalize_answer('Wake Me Up'))); -- Avicii - Wake Me Up

-- check: 20 special songs, and the total in the game
select count(*) filter (where special) as special_songs, count(*) filter (where active) as songs_in_play from public.song_bank;
