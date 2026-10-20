-- PYTH BOMB: 13 seconds per question (step 34)
-- Run in Supabase SQL Editor (best between games). Safe to run more than once.
--
-- Feedback from the community game: a bit more time. Each question now lasts 13 seconds
-- (it was 11). Everything else stays the same: 2 lives, 5 guesses, time out = lose a life.
-- This is the same deal_question as 025 (one question queue for the whole game), only the time
-- changes. If 025 was never run, running this one also turns the queue on.

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
      question_expires_at = now() + interval '13 seconds'
  where id = p_room_id;
end;
$function$;

-- check: should be true / true
select
  exists (select 1 from information_schema.columns where table_name = 'questions' and column_name = 'times_dealt') as has_queue,
  position('13 seconds' in pg_get_functiondef('public.deal_question(uuid)'::regprocedure)) > 0 as thirteen_seconds;
