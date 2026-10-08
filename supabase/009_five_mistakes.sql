-- PYTH BOMB: 5-mistakes rule (step 9)
-- Run in Supabase SQL Editor AFTER 008_fair_passing.sql. Safe to run more than once.
--
-- New rule: the player holding the bomb can answer wrong up to 4 times. The 5th WRONG
-- answer on the same bomb makes it explode on them right away (they are eliminated and
-- the bomb continues in the rotation, exactly like a timer explosion).
--   * only wrong answers count (a question timeout does NOT count as a mistake)
--   * the counter starts again at 0 every time the bomb changes hands / a new round starts
--
--   rooms.holder_mistakes : wrong answers of the current holder (0..4; the UI shows 5 dots)
--   submit_answer         : now returns 'correct' | 'wrong' | 'timeout' | 'exploded'
--   new_round             : same as 008, plus holder_mistakes = 0

alter table public.rooms
  add column if not exists holder_mistakes int not null default 0;

-- ============================================================
-- new_round: same as 008 + resets the mistakes counter
-- ============================================================
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
        holder_mistakes = 0,
        last_event_at = now()
    where id = p_room_id;
    return;
  end if;

  -- o horário secreto: entre 55 e 65 segundos
  insert into room_secrets (room_id, bomb_explode_at)
  values (p_room_id, now() + make_interval(secs => 55 + random() * 10))
  on conflict (room_id) do update set bomb_explode_at = excluded.bomb_explode_at;

  v_next := public.pick_next_holder(p_room_id, p_avoid);

  update rooms
  set status = 'playing',
      bomb_holder_id = v_next,
      round_number = round_number + 1,
      round_started_at = now(),
      holder_mistakes = 0
  where id = p_room_id;

  perform deal_question(p_room_id);
end;
$function$;

-- ============================================================
-- submit_answer: same as 008, plus the 5-mistakes rule
-- ============================================================
create or replace function public.submit_answer(p_room_id uuid, p_answer text)
 returns text
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $function$
declare
  v_room rooms;
  v_me uuid;
  v_next uuid;
  v_qid uuid;
  v_norm text;
  v_ok boolean;
  v_mistakes int;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;

  -- if the bomb already exploded, resolve that first (same logic as the clock)
  perform public.tick(p_room_id);

  select * into v_room from rooms where id = p_room_id for update;
  if v_room.status <> 'playing' then raise exception 'Game is not running'; end if;

  select id into v_me from players
  where room_id = p_room_id and user_id = auth.uid() and alive limit 1;

  if v_me is null or v_room.bomb_holder_id is distinct from v_me then
    raise exception 'You do not have the bomb';
  end if;

  -- question time already over: new question (not a mistake)
  if v_room.question_expires_at is not null and now() >= v_room.question_expires_at then
    perform deal_question(p_room_id);
    return 'timeout';
  end if;

  select current_question_id into v_qid from room_secrets where room_id = p_room_id;
  v_norm := normalize_answer(p_answer);

  select exists (
    select 1 from questions q, unnest(q.accepted_answers) a
    where q.id = v_qid and normalize_answer(a) = v_norm
  ) into v_ok;

  if v_norm = '' or not v_ok then
    if v_norm = '' then
      return 'wrong';   -- empty answer: just ignored, not counted
    end if;

    v_mistakes := v_room.holder_mistakes + 1;

    if v_mistakes >= 5 then
      -- 5th mistake: the bomb explodes on the holder right now
      update players set alive = false where id = v_me;
      update rooms set last_victim_id = v_me, last_event_at = now(), holder_mistakes = 0
      where id = p_room_id;
      perform new_round(p_room_id, v_me);
      return 'exploded';
    end if;

    update rooms set holder_mistakes = v_mistakes where id = p_room_id;
    return 'wrong';   -- same question, no timer changes
  end if;

  -- correct: pass the bomb to the next alive player in the rotation; they get a fresh question
  v_next := public.pick_next_holder(p_room_id, v_me);

  if v_next is null then raise exception 'Nobody to pass to'; end if;

  update rooms set bomb_holder_id = v_next, holder_mistakes = 0 where id = p_room_id;
  perform deal_question(p_room_id);
  return 'correct';
end;
$function$;
