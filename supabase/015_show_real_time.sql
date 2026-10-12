-- PYTH BOMB: the question timer shows the REAL time left on the bomb (step 15)
-- Run in Supabase SQL Editor AFTER 014_chat.sql. Safe to run more than once.
--
-- The question timer is 10 seconds, but when the bomb is about to explode it can not be longer
-- than what the bomb has left. So if the bomb explodes in 2 seconds, the timer on screen shows 2s;
-- in 3 seconds, 3s; and so on. Nothing else changes: nobody gets extra time, the bomb still explodes
-- at its secret time (this replaces any earlier version of deal_question, including the
-- "minimum 5 seconds" idea that was dropped).

create or replace function public.deal_question(p_room_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $function$
declare
  v_deck uuid[];
  v_cursor int;
  v_qid uuid;
  v_text text;
  v_bomb timestamptz;
begin
  select question_deck, deck_cursor into v_deck, v_cursor
  from room_secrets where room_id = p_room_id for update;

  v_deck := coalesce(v_deck, '{}');
  v_cursor := coalesce(v_cursor, 0);

  -- deck empty or finished: reshuffle all verified + active questions
  if v_cursor >= coalesce(array_length(v_deck, 1), 0) then
    select coalesce(array_agg(id order by random()), '{}') into v_deck
    from questions where verified and active;
    v_cursor := 0;
  end if;

  if coalesce(array_length(v_deck, 1), 0) = 0 then
    raise exception 'No verified questions available';
  end if;

  v_qid := v_deck[v_cursor + 1];
  select text into v_text from questions where id = v_qid;

  update room_secrets
  set question_deck = v_deck, deck_cursor = v_cursor + 1, current_question_id = v_qid
  where room_id = p_room_id
  returning bomb_explode_at into v_bomb;

  -- 10 seconds, but never more than what the bomb has left (so the timer shows the real time)
  update rooms
  set current_question_text = v_text,
      question_expires_at = least(now() + interval '10 seconds', coalesce(v_bomb, now() + interval '10 seconds'))
  where id = p_room_id;
end;
$function$;

-- check: should say true (the function uses the bomb time) and no "5 seconds" extension
select
  position('least(now()' in pg_get_functiondef('public.deal_question(uuid)'::regprocedure)) > 0 as shows_real_time,
  position('greatest(bomb_explode_at' in pg_get_functiondef('public.deal_question(uuid)'::regprocedure)) = 0 as no_extension;
