-- PYTH BOMB · GUESS THE SONG — step S04: longer GET READY countdown + answers must be spelled right
-- Run in Supabase SQL Editor AFTER S03. Safe to run more than once.
-- 1) GET READY: 10 seconds before the first song of a game (time to settle and turn the sound on),
--    5 seconds before each of the other songs (was 3). Still 30 seconds to listen and answer (S03).
-- 2) Typos are NOT accepted anymore. Still fine: punctuation, accents, upper/lower case, spaces and a
--    leading "The" ("Guns N Roses" = "Guns N' Roses", "ACDC" = "AC/DC"), the other accepted names
--    (e.g. "Guns and Roses"), and artist + song typed together ("queen bohemian rhapsody").
--    A near miss only shows "So close! Check the spelling" and the player can try again.

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
  -- GET READY: 10 s before the first song (time to settle and turn the sound on), 5 s before the others
  v_ready := case when v_room.round_number = 0 then interval '10 seconds' else interval '5 seconds' end;

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

-- answers: exact after cleaning (no typos). 2 = right, 1 = almost (only a hint), 0 = wrong
create or replace function public.song_match(p_guess text, p_answers text[])
 returns int
 language plpgsql
 stable
 set search_path to 'public', 'extensions'
as $function$
declare
  g text := public.normalize_answer(p_guess);
  a text;
  n text;
  hint int;
  best int := 0;
begin
  if g = '' then return 0; end if;
  foreach a in array p_answers loop
    n := public.normalize_answer(a);
    if n = '' then continue; end if;
    -- same words, ignoring punctuation/accents/case/spaces ("guns n roses" = "Guns N' Roses", "acdc" = "AC/DC")
    if g = n or replace(g, ' ', '') = replace(n, ' ', '') then return 2; end if;
    -- the answer inside a longer guess ("queen bohemian rhapsody" has "queen")
    if length(n) >= 4 and (' ' || g || ' ') like ('% ' || n || ' %') then return 2; end if;
    -- a few letters off: NOT accepted, only the "So close! Check the spelling" hint
    hint := case when length(n) <= 4 then 2 when length(n) <= 8 then 3 when length(n) <= 14 then 4 else 5 end;
    if length(g) >= 3 and levenshtein(left(g, 250), left(n, 250)) <= hint then best := 1; end if;
  end loop;
  return best;
end;
$function$;

-- check: should be true / true / 2 / 1
select position('''listen_secs'', 30' in pg_get_functiondef('public.song_next_round(uuid)'::regprocedure)) > 0 as thirty_seconds,
       position('10 seconds' in pg_get_functiondef('public.song_next_round(uuid)'::regprocedure)) > 0 as get_ready_countdown,
       public.song_match('Guns N Roses', array['Guns N'' Roses']) as punctuation_ok,
       public.song_match('Bilie Jean', array['Billie Jean']) as typo_only_close;
