-- PYTH POLIS · step G03: fishing (Halls, 2026-11-24: "o povo precisa de PEIXE!")
-- Run in Supabase SQL Editor AFTER G02. Safe to run more than once. Nothing existing is lost.
--
--  · FISH is the 5th resource. It is food: kept in the Granary (its own counter, same capacity as grain).
--    Troops will eat grain OR fish when training arrives.
--  · The pier on the Resources screen works from the start with 1 boat. You send it out for the same cycles as the
--    plots (30 min .. 24 h); the catch is fixed when it leaves, you collect it when it comes back.
--  · The DOCKS building (City) gives more boats (2 at level 1, 3 at level 4, 4 at level 8) and +10% fish per level.
--    Athenians fish 20% more.
--  · Like everything else: calculated from timestamps, no ticks.

alter table public.polis_villages add column if not exists fish numeric not null default 0;

create table if not exists public.polis_boats (
  account_id uuid not null references public.polis_accounts(id) on delete cascade,
  boat int not null check (boat between 0 and 3),
  cycle_secs int,
  started_at timestamptz,
  ends_at timestamptz,
  catch numeric not null default 0,
  primary key (account_id, boat)
);
alter table public.polis_boats enable row level security;
revoke all on table public.polis_boats from anon, authenticated;

-- ---------------------------------------------------------------- rules
create or replace function public.polis_building_kinds() returns text[] language sql immutable as $$
  select array['agora', 'storehouse', 'granary', 'docks', 'cellar', 'barracks', 'market', 'temple', 'agoge', 'harbor', 'sanctuary']
$$;

create or replace function public.polis_boat_count(p_docks int) returns int language sql immutable as $$
  select 1 + case when p_docks >= 1 then 1 else 0 end + case when p_docks >= 4 then 1 else 0 end + case when p_docks >= 8 then 1 else 0 end
$$;

-- fish per hour for one boat
create or replace function public.polis_fish_rate(p_docks int, p_tribe text) returns numeric language sql immutable as $$
  select round(45 * (1 + 0.1 * greatest(0, p_docks)) * case when p_tribe = 'athenian' then 1.2 else 1 end)
$$;

create or replace function public.polis_docks(p_account uuid) returns int language sql stable security definer set search_path to 'public' as $$
  select coalesce((select level from polis_buildings where account_id = p_account and kind = 'docks'), 0)
$$;

-- same costs as G02 plus the Docks
create or replace function public.polis_cost(p_kind text, p_to int) returns jsonb language plpgsql immutable as $$
declare
  f numeric := case when p_to <= 1 then 0.5 else power(1.6, p_to - 2) end;
  t numeric := case when p_to <= 1 then 60 else round(120 * power(1.7, p_to - 2)) end;
  b jsonb;
begin
  b := case p_kind
    when 'grain'      then '{"grain": 20, "wood": 70, "marble": 50, "bronze": 20}'
    when 'wood'       then '{"grain": 40, "wood": 30, "marble": 60, "bronze": 30}'
    when 'marble'     then '{"grain": 40, "wood": 70, "marble": 20, "bronze": 40}'
    when 'bronze'     then '{"grain": 50, "wood": 60, "marble": 60, "bronze": 10}'
    when 'warehouse'  then '{"grain": 30, "wood": 90, "marble": 110, "bronze": 40}'
    when 'storehouse' then '{"grain": 30, "wood": 90, "marble": 110, "bronze": 40}'
    when 'granary'    then '{"grain": 40, "wood": 100, "marble": 80, "bronze": 30}'
    when 'docks'      then '{"grain": 60, "wood": 120, "marble": 60, "bronze": 50}'
    when 'agora'      then '{"grain": 70, "wood": 90, "marble": 120, "bronze": 60}'
    when 'cellar'     then '{"grain": 40, "wood": 60, "marble": 90, "bronze": 20}'
    when 'barracks'   then '{"grain": 90, "wood": 120, "marble": 80, "bronze": 130}'
    when 'market'     then '{"grain": 80, "wood": 110, "marble": 90, "bronze": 60}'
    when 'temple'     then '{"grain": 120, "wood": 100, "marble": 200, "bronze": 90}'
    else '{"grain": 120, "wood": 150, "marble": 150, "bronze": 150}' -- agoge / harbor / sanctuary
  end::jsonb;
  return jsonb_build_object(
    'grain', round((b->>'grain')::numeric * f), 'wood', round((b->>'wood')::numeric * f),
    'marble', round((b->>'marble')::numeric * f), 'bronze', round((b->>'bronze')::numeric * f), 'secs', t);
end;
$$;

-- same as G02, the Docks are open from the start
create or replace function public.polis_needs(p_account uuid, p_kind text) returns text language plpgsql stable security definer set search_path to 'public' as $$
declare
  agora int := coalesce((select level from polis_buildings where account_id = p_account and kind = 'agora'), 0);
  barracks int := coalesce((select level from polis_buildings where account_id = p_account and kind = 'barracks'), 0);
  tribe text := (select a.tribe from polis_accounts a where a.id = p_account);
begin
  if p_kind in ('agora', 'storehouse', 'granary', 'docks') then return null; end if;
  if p_kind in ('cellar', 'barracks') then return case when agora >= 3 then null else 'Agora level 3' end; end if;
  if p_kind = 'market' then return case when agora >= 5 then null else 'Agora level 5' end; end if;
  if p_kind = 'temple' then return case when agora >= 7 then null else 'Agora level 7' end; end if;
  if p_kind in ('agoge', 'harbor', 'sanctuary') then
    if (p_kind = 'agoge' and tribe is distinct from 'spartan') or (p_kind = 'harbor' and tribe is distinct from 'athenian')
       or (p_kind = 'sanctuary' and tribe is distinct from 'delphian') then return 'Another tribe''s building'; end if;
    return case when barracks >= 5 then null else 'Barracks level 5' end;
  end if;
  return 'Unknown building';
end;
$$;

-- ---------------------------------------------------------------- state (G02 shape + fish and boats)
create or replace function public.polis_state() returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  me uuid := polis_me();
  a polis_accounts;
  v polis_villages;
  caps jsonb;
  docks int;
begin
  if me is null then return jsonb_build_object('logged_in', false, 'now', polis_now()); end if;
  perform polis_settle(me);
  select * into a from polis_accounts where id = me;
  select * into v from polis_villages where account_id = me;
  caps := polis_caps(me);
  docks := polis_docks(me);
  return jsonb_build_object(
    'logged_in', true, 'now', polis_now(), 'user', a.display_name, 'tribe', a.tribe,
    'village', jsonb_build_object(
      'name', v.name, 'grain', floor(v.grain), 'wood', floor(v.wood), 'marble', floor(v.marble), 'bronze', floor(v.bronze),
      'fish', floor(v.fish),
      'store_cap', caps->'store', 'granary_cap', caps->'granary',
      'build_kind', v.build_kind, 'build_level', v.build_level, 'build_until', v.build_until, 'build_target', v.build_target),
    'plots', (select jsonb_agg(jsonb_build_object(
        'idx', p.idx, 'kind', p.kind, 'level', p.level, 'rate', polis_rate(p.level),
        'cycle_secs', p.cycle_secs, 'started_at', p.started_at, 'ends_at', p.ends_at, 'harvest', p.harvest,
        'next', case when p.level < 10 then polis_cost(p.kind, p.level + 1) end, 'next_rate', polis_rate(p.level + 1)) order by p.idx)
      from polis_plots p where p.account_id = me),
    'boats', (select jsonb_agg(jsonb_build_object(
        'boat', i, 'cycle_secs', b.cycle_secs, 'started_at', b.started_at, 'ends_at', b.ends_at, 'catch', coalesce(b.catch, 0)) order by i)
      from generate_series(0, polis_boat_count(docks) - 1) i
      left join polis_boats b on b.account_id = me and b.boat = i),
    'fishing', jsonb_build_object('rate', polis_fish_rate(docks, a.tribe), 'docks', docks,
      'next_boat_at', case when docks < 1 then 1 when docks < 4 then 4 when docks < 8 then 8 end),
    'buildings', coalesce((select jsonb_agg(jsonb_build_object(
        'pad', b.pad, 'kind', b.kind, 'level', b.level,
        'next', case when b.level < 10 then polis_cost(b.kind, b.level + 1) end) order by b.pad)
      from polis_buildings b where b.account_id = me), '[]'::jsonb),
    'catalog', (select jsonb_agg(jsonb_build_object('kind', k, 'cost', polis_cost(k, 1), 'needs', polis_needs(me, k),
        'built', exists (select 1 from polis_buildings b where b.account_id = me and b.kind = k)))
      from unnest(polis_building_kinds()) k),
    'cycles', jsonb_build_array(
      jsonb_build_object('secs', 1800, 'mult', polis_cycle_mult(1800)), jsonb_build_object('secs', 3600, 'mult', polis_cycle_mult(3600)),
      jsonb_build_object('secs', 21600, 'mult', polis_cycle_mult(21600)), jsonb_build_object('secs', 43200, 'mult', polis_cycle_mult(43200)),
      jsonb_build_object('secs', 86400, 'mult', polis_cycle_mult(86400))));
end;
$$;

-- ---------------------------------------------------------------- boats
create or replace function public.polis_fish_start(p_boat int, p_secs int) returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  me uuid := polis_me();
  m numeric := polis_cycle_mult(p_secs);
  docks int;
  b polis_boats;
begin
  if me is null then raise exception 'Log in first'; end if;
  if m is null then raise exception 'Pick a cycle: 30 min, 1 h, 6 h, 12 h or 24 h'; end if;
  perform polis_settle(me);
  docks := polis_docks(me);
  if p_boat is null or p_boat < 0 or p_boat >= polis_boat_count(docks) then raise exception 'Build the Docks to get more boats'; end if;
  insert into polis_boats (account_id, boat) values (me, p_boat) on conflict do nothing;
  select * into b from polis_boats where account_id = me and boat = p_boat for update;
  if b.started_at is not null then raise exception 'This boat is already at sea'; end if;
  update polis_boats set cycle_secs = p_secs, started_at = polis_now(), ends_at = polis_now() + p_secs * interval '1 second',
    catch = round(polis_fish_rate(docks, (select tribe from polis_accounts where id = me)) * (p_secs / 3600.0) * m)
  where account_id = me and boat = p_boat;
  return polis_state();
end;
$$;

create or replace function public.polis_fish_collect(p_boat int) returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  me uuid := polis_me();
  b polis_boats;
  v polis_villages;
  room numeric; moved numeric;
begin
  if me is null then raise exception 'Log in first'; end if;
  perform polis_settle(me);
  select * into b from polis_boats where account_id = me and boat = p_boat for update;
  if b.started_at is null then raise exception 'This boat is at the pier'; end if;
  if b.ends_at > polis_now() then raise exception 'Still fishing'; end if;
  select * into v from polis_villages where account_id = me for update;
  room := greatest(0, (polis_caps(me)->>'granary')::numeric - v.fish);
  moved := least(room, b.catch);
  if moved <= 0 then raise exception 'Your granary is full of fish. Spend some or upgrade it'; end if;
  update polis_villages set fish = fish + moved where account_id = me;
  if b.catch - moved > 0 then
    update polis_boats set catch = b.catch - moved where account_id = me and boat = p_boat;
  else
    update polis_boats set cycle_secs = null, started_at = null, ends_at = null, catch = 0 where account_id = me and boat = p_boat;
  end if;
  return polis_state() || jsonb_build_object('collected', jsonb_build_object('kind', 'fish', 'amount', moved, 'left', b.catch - moved));
end;
$$;

revoke execute on function public.polis_docks(uuid) from public, anon, authenticated;
grant execute on function public.polis_state(), public.polis_fish_start(int, int), public.polis_fish_collect(int) to authenticated;

-- check: should say true, true
select
  exists (select 1 from information_schema.columns where table_name = 'polis_villages' and column_name = 'fish') as fish_ready,
  has_function_privilege('authenticated', 'public.polis_fish_collect(int)', 'execute') as boats_ready;
