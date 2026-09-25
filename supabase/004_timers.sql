-- PYTH BOMB: timers, playtest values (step 4)
-- Run in Supabase SQL Editor AFTER 002_questions.sql.
--
--   question timer : 10s      -> 12s   (deal_question)
--   bomb timer     : 20-40s   -> 80-90s (new_round; secret, server-side only)
--
-- Nothing else changes: wrong answers never reset the question timer, timeout = new
-- question for the same holder, correct answer passes the bomb, the bomb timer is never
-- reset by answers/timeouts/new questions, one life per player.
-- Both are "create or replace", so existing permissions (revoke from browsers) are kept.

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
  where room_id = p_room_id;

  update rooms
  set current_question_text = v_text,
      question_expires_at = now() + interval '12 seconds'
  where id = p_room_id;
end;
$function$;

create or replace function public.new_round(p_room_id uuid, p_avoid uuid DEFAULT NULL::uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_next uuid;
  v_alive int;
begin
  select count(*) into v_alive from players where room_id = p_room_id and alive;

  if v_alive <= 1 then
    update rooms
    set status = 'finished',
        bomb_holder_id = null,
        winner_id = (select id from players where room_id = p_room_id and alive limit 1),
        current_question_text = null,
        question_expires_at = null,
        last_event_at = now()
    where id = p_room_id;
    return;
  end if;

  select id into v_next from players
  where room_id = p_room_id and alive and (p_avoid is null or id <> p_avoid)
  order by random() limit 1;

  if v_next is null then
    select id into v_next from players where room_id = p_room_id and alive order by random() limit 1;
  end if;

  update rooms
  set status = 'playing',
      bomb_holder_id = v_next,
      round_number = round_number + 1,
      round_started_at = now()
  where id = p_room_id;

  -- o horário secreto: entre 80 e 90 segundos
  insert into room_secrets (room_id, bomb_explode_at)
  values (p_room_id, now() + make_interval(secs => 80 + random() * 10))
  on conflict (room_id) do update set bomb_explode_at = excluded.bomb_explode_at;

  perform deal_question(p_room_id);
end;
$function$;
