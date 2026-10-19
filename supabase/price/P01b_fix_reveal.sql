-- PYTH BOMB · GUESS THE PRICE — step P01b: fix for the reveal (run once, after P01)
-- The reveal was blocked by a Supabase safety rule ("DELETE requires a WHERE clause").
-- This is the same function as in P01, now with "where true". Safe to run more than once.

create or replace function public.price_reveal(p_room_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_room rooms;
  v_s price_secrets;
  v_list jsonb;
  v_worst uuid;
begin
  select * into v_room from rooms where id = p_room_id;
  select * into v_s from price_secrets where room_id = p_room_id;

  create temp table if not exists price_tmp (player_id uuid, nickname text, guess numeric, err_pct numeric, perfect boolean, points int) on commit drop;
  delete from price_tmp where true; -- (o Supabase exige um where em delete/update)
  insert into price_tmp
  select p.id, p.nickname, g.guess,
         case when g.guess is null then null else abs(g.guess - v_s.answer) / v_s.answer * 100 end,
         g.guess is not null and abs(g.guess - v_s.answer) <= greatest(v_s.confidence, v_s.answer * 0.0001),
         0
  from players p
  left join price_guesses g on g.room_id = p_room_id and g.round = v_room.round_number and g.player_id = p.id
  where p.room_id = p_room_id;

  update price_tmp set points = case
    when guess is null then 0
    when perfect then 1500
    else round(1000 * greatest(0, 1 - err_pct / v_s.scale_pct))::int end
  where true;

  update players p set score = p.score + t.points from price_tmp t where p.id = t.player_id;

  -- the furthest guess (only when at least 2 people guessed)
  if (select count(*) from price_tmp where guess is not null) >= 2 then
    select player_id into v_worst from price_tmp where guess is not null order by err_pct desc limit 1;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'player_id', player_id, 'nickname', nickname, 'guess', guess,
           'err_pct', round(err_pct, 3), 'perfect', perfect, 'points', points)
         order by err_pct asc nulls last), '[]'::jsonb)
    into v_list from price_tmp;

  update rooms
  set price_phase = 'reveal',
      price_reveal = jsonb_build_object('round', v_room.round_number, 'answer', v_s.answer,
                                        'confidence', v_s.confidence, 'worst', v_worst, 'guesses', v_list),
      question_expires_at = now() + interval '9 seconds',
      last_victim_id = coalesce(v_worst, last_victim_id),
      last_event_at = case when v_worst is not null then now() else last_event_at end
  where id = p_room_id;
end;
$function$;


revoke execute on function public.price_reveal(uuid) from public, anon, authenticated;

-- check: should be true
select position('where true' in pg_get_functiondef('public.price_reveal(uuid)'::regprocedure)) > 0 as reveal_fixed;
