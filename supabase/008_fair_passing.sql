-- PYTH BOMB: fair bomb passing (step 8)
-- Run in Supabase SQL Editor AFTER 007_timers2.sql. Safe to run more than once.
--
-- Before: every pass (and every new round after an explosion) picked a random alive
-- player, so the same person could get the bomb again and again while others waited.
-- Now the bomb follows a ROTATION: when a game starts, the players are shuffled ONCE
-- into an order, and the bomb always goes to the next ALIVE player in that order
-- (circular). So after the bomb leaves you, it goes to EVERYBODY else alive before it
-- comes back to you, and that holds for every player. After an explosion the bomb
-- continues from the victim's place in the order. Dead players are skipped.
--
--   room_secrets.pass_order : the shuffled order for the current game
--   pick_next_holder()      : next alive player after the one passing (internal)
--   submit_answer / new_round use pick_next_holder instead of random()
-- A new game (start_game -> new_round with no "avoid") shuffles a new order.

alter table public.room_secrets
  add column if not exists pass_order uuid[] not null default '{}';

-- ============================================================
-- pick_next_holder: internal helper (browsers may NOT call it)
-- ============================================================
create or replace function public.pick_next_holder(p_room_id uuid, p_avoid uuid default null)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_order uuid[];
  v_i int;
  v_n int;
  v_k int;
  v_cand uuid;
  v_none constant uuid := '00000000-0000-0000-0000-000000000000';
begin
  select pass_order into v_order from room_secrets where room_id = p_room_id for update;

  if p_avoid is null or coalesce(array_length(v_order, 1), 0) = 0 then
    -- new game (or no order yet): shuffle everybody alive once
    select coalesce(array_agg(id order by random()), '{}') into v_order
    from players where room_id = p_room_id and alive;
  else
    -- safety: anybody alive who is not in the order yet goes to the end
    select v_order || coalesce(array_agg(id order by joined_at), '{}') into v_order
    from players where room_id = p_room_id and alive and not (id = any (v_order));
  end if;

  v_n := coalesce(array_length(v_order, 1), 0);
  if v_n = 0 then return null; end if;

  v_i := coalesce(array_position(v_order, p_avoid), 0);   -- 0 when nobody is passing

  for v_k in 1 .. v_n loop
    v_cand := v_order[((v_i + v_k - 1) % v_n) + 1];
    if v_cand <> coalesce(p_avoid, v_none)
       and exists (select 1 from players where id = v_cand and alive) then
      update room_secrets set pass_order = v_order where room_id = p_room_id;
      return v_cand;
    end if;
  end loop;

  return null;
end;
$function$;

revoke execute on function public.pick_next_holder(uuid, uuid) from public, anon, authenticated;

-- ============================================================
-- new_round: same as 007, but the new holder comes from pick_next_holder
-- (room_secrets row is created BEFORE picking so the order can be saved)
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
      round_started_at = now()
  where id = p_room_id;

  perform deal_question(p_room_id);
end;
$function$;

-- ============================================================
-- submit_answer: same as 002, but the bomb goes to pick_next_holder
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

  -- question time already over: new question
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
    return 'wrong';   -- same question, no timer changes
  end if;

  -- correct: pass the bomb to the next alive player in the rotation; they get a fresh question
  v_next := public.pick_next_holder(p_room_id, v_me);

  if v_next is null then raise exception 'Nobody to pass to'; end if;

  update rooms set bomb_holder_id = v_next where id = p_room_id;
  perform deal_question(p_room_id);
  return 'correct';
end;
$function$;
