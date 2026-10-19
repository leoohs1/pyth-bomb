-- PYTH BOMB · GUESS THE SONG — step S05: the answer screen ("It was...") lasts 5 seconds (was 8)
-- Run in Supabase SQL Editor AFTER S04. Safe to run more than once. Nothing else changes:
-- after it, the GET READY countdown (5 s) and the next song.

create or replace function public.song_show_answer(p_room_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_room rooms;
  v_s song_bank;
  v_listen timestamptz;
  v_list jsonb;
begin
  select * into v_room from rooms where id = p_room_id;
  select b.* into v_s from song_secrets x join song_bank b on b.id = x.song_id where x.room_id = p_room_id;
  v_listen := (v_room.song_round->>'listen_at')::timestamptz;

  select coalesce(jsonb_agg(jsonb_build_object(
           'player_id', p.id, 'nickname', p.nickname,
           'artist', g.artist_at is not null, 'title', g.title_at is not null,
           'artist_secs', round(extract(epoch from g.artist_at - v_listen)::numeric, 1),
           'title_secs', round(extract(epoch from g.title_at - v_listen)::numeric, 1),
           'points', coalesce(g.points, 0), 'first', coalesce(g.first, false))
         order by coalesce(g.points, 0) desc, p.joined_at), '[]'::jsonb)
    into v_list
  from players p
  left join song_progress g on g.room_id = p_room_id and g.round = v_room.round_number and g.player_id = p.id
  where p.room_id = p_room_id;

  update rooms
  set song_phase = 'reveal',
      song_reveal = jsonb_build_object('round', v_room.round_number, 'artist', v_s.artist,
                                       'title', v_s.title, 'year', v_s.year, 'players', v_list),
      question_expires_at = now() + interval '5 seconds'
  where id = p_room_id;
end;
$function$;

revoke execute on function public.song_show_answer(uuid) from public, anon, authenticated;

-- check: should be true
select position('5 seconds' in pg_get_functiondef('public.song_show_answer(uuid)'::regprocedure)) > 0 as reveal_five_seconds;
