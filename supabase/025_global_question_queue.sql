-- PYTH BOMB: one question queue for the WHOLE game (step 25)
-- Run in Supabase SQL Editor (best between games). Safe to run more than once.
--
-- Before: each room shuffled its own deck, and every new game reshuffled everything, so the
-- same question could show up again in the next game.
-- Now: every question has a counter of how many times it was dealt (times_dealt). The game
-- picks RANDOMLY among the questions dealt the FEWEST times. So a question that was just asked
-- goes to the "end of the line" and only comes back after ALL the others were asked once
-- (in any room, in any game). Then a new round starts, random again.
-- New questions added later start at 0, so they come up first until they catch up.
-- The question time stays at 17 seconds (same as 019).

alter table public.questions add column if not exists times_dealt int not null default 0;

create or replace function public.deal_question(p_room_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $function$
declare
  v_qid uuid;
  v_text text;
  v_min int;
begin
  -- the lowest "times dealt" among the questions that can be dealt
  select min(times_dealt) into v_min from questions where verified and active;
  if v_min is null then
    raise exception 'No verified questions available';
  end if;

  -- a random one among those (skip locked: two rooms at the same instant do not wait on each other)
  select id, text into v_qid, v_text
  from questions
  where verified and active and times_dealt = v_min
  order by random()
  limit 1
  for update skip locked;

  if v_qid is null then
    -- every candidate was locked by another room right now: take any random question
    select id, text into v_qid, v_text
    from questions where verified and active
    order by times_dealt, random() limit 1;
  end if;

  update questions set times_dealt = times_dealt + 1 where id = v_qid;

  update room_secrets set current_question_id = v_qid where room_id = p_room_id;

  update rooms
  set current_question_text = v_text,
      question_expires_at = now() + interval '17 seconds'
  where id = p_room_id;
end;
$function$;

-- check: should be true / true
select
  exists (select 1 from information_schema.columns where table_name = 'questions' and column_name = 'times_dealt') as has_counter,
  position('times_dealt' in pg_get_functiondef('public.deal_question(uuid)'::regprocedure)) > 0
    and position('17 seconds' in pg_get_functiondef('public.deal_question(uuid)'::regprocedure)) > 0 as new_deal_question;
