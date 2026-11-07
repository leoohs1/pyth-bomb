-- PYTH BOMB · GUESS THE PERSON — step W03: 25 seconds per person (was 20)
-- Run in Supabase SQL Editor AFTER W01. Safe to run more than once. Best between matches.
-- Only the length of the guessing time changes. The photo gets sharper by fractions of the time
-- (src/person/PersonPhoto.jsx): very blurry for the first 3 s, a good view before the half, and
-- fully sharp for the last 5 s. Points still go from 1000 (instant) down to 300 at the last second,
-- now spread over 25 s. Matches that are running keep their 20 s until the next person.

create or replace function public.person_next_round(p_room_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_room rooms;
  v_p person_bank;
  v_used uuid[];
  v_ready interval;
begin
  select * into v_room from rooms where id = p_room_id;
  if v_room.round_number >= coalesce(v_room.person_total, 10) then
    perform person_finish(p_room_id);
    return;
  end if;

  select coalesce(used, '{}') into v_used from person_secrets where room_id = p_room_id;
  v_used := coalesce(v_used, '{}');

  select * into v_p from person_bank
  where active and not (id = any(v_used))
  order by times_dealt, random() limit 1
  for update skip locked;
  if v_p.id is null then
    select * into v_p from person_bank where active order by times_dealt, random() limit 1;
  end if;
  if v_p.id is null then raise exception 'No people available'; end if;

  update person_bank set times_dealt = times_dealt + 1 where id = v_p.id;
  insert into person_secrets (room_id, person_id, used) values (p_room_id, v_p.id, array[v_p.id])
  on conflict (room_id) do update set person_id = excluded.person_id, used = person_secrets.used || v_p.id;

  -- 5 s "get ready" before the first person; 3 s between the others (time for every phone to load the photo)
  v_ready := case when v_room.round_number = 0 then interval '5 seconds' else interval '3 seconds' end;

  update players set person_got_round = null where room_id = p_room_id;
  update rooms
  set round_number = round_number + 1,
      person_phase = 'ready',
      person_reveal = null,
      person_round = jsonb_build_object('file', v_p.file, 'guess_at', now() + v_ready, 'guess_secs', 25),
      round_started_at = now() + v_ready,
      question_expires_at = now() + v_ready
  where id = p_room_id;
end;
$function$;

revoke execute on function public.person_next_round(uuid) from public, anon, authenticated;

-- check: true
select position('''guess_secs'', 25' in pg_get_functiondef('public.person_next_round(uuid)'::regprocedure)) > 0 as twenty_five_seconds;
