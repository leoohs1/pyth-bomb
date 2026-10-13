-- PYTH BOMB: 17 seconds per question (step 19)
-- Run in Supabase SQL Editor AFTER 018_lives.sql. Safe to run more than once.
-- Feedback from the first tests: 13 seconds was short, so each turn now lasts 17 seconds.
-- Only deal_question changes (the clock in tick/submit_answer already follows question_expires_at).

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
begin
  select question_deck, deck_cursor into v_deck, v_cursor
  from room_secrets where room_id = p_room_id for update;

  v_deck := coalesce(v_deck, '{}');
  v_cursor := coalesce(v_cursor, 0);

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
  where room_id = p_room_id;

  update rooms
  set current_question_text = v_text,
      question_expires_at = now() + interval '17 seconds'
  where id = p_room_id;
end;
$function$;

-- check: should be true
select position('17 seconds' in pg_get_functiondef('public.deal_question(uuid)'::regprocedure)) > 0 as seventeen_seconds;
