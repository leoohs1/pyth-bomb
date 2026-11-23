-- PYTH POLIS · step G02: tribes, 14 resource plots and buildings on the 14 city pads
-- Run in Supabase SQL Editor AFTER G01. Safe to run more than once. Existing villages are migrated (nothing is lost).
--
-- New in this step (Halls, 2026-11-23, Travian-style layout):
--  · TRIBE: Spartans (combat), Athenians (trade/economy), Delphians (defense/temple). Chosen once.
--  · RESOURCES screen: 14 plots around the village (4 grain, 4 wood, 3 marble, 3 bronze). Plots start empty
--    (level 0) except one of each kind; you build them up and run the same 30 min .. 24 h cycles on each.
--  · CITY screen: 14 marble pads. You start with the Agora and the Storehouse; the rest is built on free pads.
--    Storehouse holds wood/marble/bronze, Granary holds grain, Agora makes construction faster.
--    Other buildings unlock with the Agora/Barracks level (their effects arrive with troops, temple, etc.).
--  · Still one construction at a time; everything is calculated from timestamps.

alter table public.polis_accounts add column if not exists tribe text check (tribe in ('spartan', 'athenian', 'delphian'));
alter table public.polis_villages add column if not exists build_target text; -- 'plot:3' or 'pad:5'

create table if not exists public.polis_plots (
  account_id uuid not null references public.polis_accounts(id) on delete cascade,
  idx int not null check (idx between 0 and 13),
  kind text not null check (kind in ('grain', 'wood', 'marble', 'bronze')),
  level int not null default 0,
  cycle_secs int,
  started_at timestamptz,
  ends_at timestamptz,
  harvest numeric not null default 0,
  primary key (account_id, idx)
);

create table if not exists public.polis_buildings (
  account_id uuid not null references public.polis_accounts(id) on delete cascade,
  pad int not null check (pad between 0 and 13),
  kind text not null,
  level int not null default 1,
  primary key (account_id, pad),
  unique (account_id, kind)
);

alter table public.polis_plots enable row level security;
alter table public.polis_buildings enable row level security;
revoke all on table public.polis_plots, public.polis_buildings from anon, authenticated;

-- ---------------------------------------------------------------- layout and rules
-- which resource each plot is (matches the art public/polis/resources.webp)
create or replace function public.polis_plot_kind(p_idx int) returns text language sql immutable as $$
  select (array['grain', 'wood', 'bronze', 'wood', 'grain', 'marble', 'marble', 'grain', 'grain', 'wood', 'bronze', 'marble', 'bronze', 'wood'])[p_idx + 1]
$$;

-- buildings that exist, and what unlocks them
create or replace function public.polis_building_kinds() returns text[] language sql immutable as $$
  select array['agora', 'storehouse', 'granary', 'cellar', 'barracks', 'market', 'temple', 'agoge', 'harbor', 'sanctuary']
$$;

-- level a plot produces at (level 0 = empty plot, produces nothing)
create or replace function public.polis_rate(p_level int) returns numeric language sql immutable as $$
  select case when p_level <= 0 then 0 else round(40 * power(1.35, p_level - 1)) end
$$;

-- capacity of storehouse / granary at a level (0 = not built yet: a small store)
create or replace function public.polis_capacity(p_level int) returns numeric language sql immutable as $$
  select case when p_level <= 0 then 800 else round(1200 * power(1.5, p_level - 1)) end
$$;

-- cost to reach a level: jsonb {grain, wood, marble, bronze, secs}
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

-- what you need before building a kind (null = allowed)
create or replace function public.polis_needs(p_account uuid, p_kind text) returns text language plpgsql stable security definer set search_path to 'public' as $$
declare
  agora int := coalesce((select level from polis_buildings where account_id = p_account and kind = 'agora'), 0);
  barracks int := coalesce((select level from polis_buildings where account_id = p_account and kind = 'barracks'), 0);
  tribe text := (select a.tribe from polis_accounts a where a.id = p_account);
begin
  if p_kind in ('agora', 'storehouse', 'granary') then return null; end if;
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

-- construction time with the Agora's bonus (-5% per level after the 1st, at most -45%)
create or replace function public.polis_build_secs(p_account uuid, p_secs numeric) returns numeric language sql stable security definer set search_path to 'public' as $$
  select round(p_secs * (1 - least(0.45, 0.05 * greatest(0, coalesce((select level from polis_buildings where account_id = p_account and kind = 'agora'), 1) - 1))))
$$;

-- ---------------------------------------------------------------- migration of G01 villages
-- every account gets its 14 plots (the old field of each kind becomes the first plot of that kind) and its
-- Agora (pad 1) + Storehouse (pad 4, at the old warehouse level)
insert into polis_plots (account_id, idx, kind)
select a.id, i, polis_plot_kind(i) from polis_accounts a cross join generate_series(0, 13) i
on conflict do nothing;
update polis_plots p set level = greatest(p.level, f.level), cycle_secs = coalesce(p.cycle_secs, f.cycle_secs),
  started_at = coalesce(p.started_at, f.started_at), ends_at = coalesce(p.ends_at, f.ends_at),
  harvest = case when p.started_at is null then f.harvest else p.harvest end
from polis_fields f
where f.account_id = p.account_id and f.kind = p.kind
  and p.idx = (select min(i) from generate_series(0, 13) i where polis_plot_kind(i) = f.kind)
  and p.level = 0;
-- one plot of each kind starts at level 1 for everyone
update polis_plots set level = 1 where level = 0 and idx in (0, 1, 2, 5);
insert into polis_buildings (account_id, pad, kind, level) select account_id, 1, 'agora', 1 from polis_villages on conflict do nothing;
insert into polis_buildings (account_id, pad, kind, level) select account_id, 4, 'storehouse', greatest(1, warehouse) from polis_villages on conflict do nothing;
-- constructions that were running in G01 point at their new place
update polis_villages v set build_target = 'pad:4', build_kind = 'storehouse' where build_kind = 'warehouse' and build_target is null;
update polis_villages v set build_target = 'plot:' || (select min(i) from generate_series(0, 13) i where polis_plot_kind(i) = v.build_kind)
where build_kind in ('grain', 'wood', 'marble', 'bronze') and build_target is null;

-- ---------------------------------------------------------------- helpers
create or replace function public.polis_settle(p_account uuid) returns void language plpgsql security definer set search_path to 'public' as $$
declare v polis_villages; n int;
begin
  select * into v from polis_villages where account_id = p_account for update;
  if v.build_kind is null or v.build_until > polis_now() then return; end if;
  n := split_part(coalesce(v.build_target, ''), ':', 2)::int;
  if v.build_target like 'plot:%' then
    update polis_plots set level = v.build_level where account_id = p_account and idx = n;
  elsif v.build_target like 'pad:%' then
    insert into polis_buildings (account_id, pad, kind, level) values (p_account, n, v.build_kind, v.build_level)
    on conflict (account_id, pad) do update set level = excluded.level;
  end if;
  update polis_villages set build_kind = null, build_level = null, build_until = null, build_target = null where account_id = p_account;
end;
$$;

create or replace function public.polis_caps(p_account uuid) returns jsonb language sql stable security definer set search_path to 'public' as $$
  select jsonb_build_object(
    'store', polis_capacity(coalesce((select level from polis_buildings where account_id = p_account and kind = 'storehouse'), 0)),
    'granary', polis_capacity(coalesce((select level from polis_buildings where account_id = p_account and kind = 'granary'), 0)))
$$;

-- ---------------------------------------------------------------- state
create or replace function public.polis_state() returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  me uuid := polis_me();
  a polis_accounts;
  v polis_villages;
  caps jsonb;
begin
  if me is null then return jsonb_build_object('logged_in', false, 'now', polis_now()); end if;
  perform polis_settle(me);
  select * into a from polis_accounts where id = me;
  select * into v from polis_villages where account_id = me;
  caps := polis_caps(me);
  return jsonb_build_object(
    'logged_in', true, 'now', polis_now(), 'user', a.display_name, 'tribe', a.tribe,
    'village', jsonb_build_object(
      'name', v.name, 'grain', floor(v.grain), 'wood', floor(v.wood), 'marble', floor(v.marble), 'bronze', floor(v.bronze),
      'store_cap', caps->'store', 'granary_cap', caps->'granary',
      'build_kind', v.build_kind, 'build_level', v.build_level, 'build_until', v.build_until, 'build_target', v.build_target),
    'plots', (select jsonb_agg(jsonb_build_object(
        'idx', p.idx, 'kind', p.kind, 'level', p.level, 'rate', polis_rate(p.level),
        'cycle_secs', p.cycle_secs, 'started_at', p.started_at, 'ends_at', p.ends_at, 'harvest', p.harvest,
        'next', case when p.level < 10 then polis_cost(p.kind, p.level + 1) end, 'next_rate', polis_rate(p.level + 1)) order by p.idx)
      from polis_plots p where p.account_id = me),
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

-- ---------------------------------------------------------------- account
create or replace function public.polis_set_tribe(p_tribe text) returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare me uuid := polis_me();
begin
  if me is null then raise exception 'Log in first'; end if;
  if p_tribe not in ('spartan', 'athenian', 'delphian') then raise exception 'Pick a tribe'; end if;
  update polis_accounts set tribe = p_tribe where id = me and tribe is null;
  return polis_state();
end;
$$;

create or replace function public.polis_register(p_username text, p_password text, p_village text, p_tribe text)
returns jsonb language plpgsql security definer set search_path to 'public', 'extensions' as $$
declare
  u text := lower(trim(coalesce(p_username, '')));
  vname text := left(regexp_replace(trim(coalesce(p_village, '')), '[[:cntrl:]<>]', '', 'g'), 24);
  acc uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if u !~ '^[a-z0-9_]{3,16}$' then raise exception 'Username: 3 to 16 letters, numbers or _'; end if;
  if length(coalesce(p_password, '')) < 6 or length(p_password) > 72 then raise exception 'Password: at least 6 characters'; end if;
  if length(vname) < 2 then raise exception 'Give your village a name (2 to 24 characters)'; end if;
  if p_tribe not in ('spartan', 'athenian', 'delphian') then raise exception 'Pick a tribe'; end if;
  if exists (select 1 from polis_accounts where username = u) then raise exception 'This username is taken'; end if;
  insert into polis_accounts (username, display_name, pass_hash, last_login, tribe)
  values (u, trim(p_username), crypt(p_password, gen_salt('bf', 8)), polis_now(), p_tribe) returning id into acc;
  insert into polis_villages (account_id, name) values (acc, vname);
  insert into polis_fields (account_id, kind) select acc, k from unnest(array['grain', 'wood', 'marble', 'bronze']) k; -- (G01 table, kept)
  insert into polis_plots (account_id, idx, kind, level)
  select acc, i, polis_plot_kind(i), case when i in (0, 1, 2, 5) then 1 else 0 end from generate_series(0, 13) i;
  insert into polis_buildings (account_id, pad, kind, level) values (acc, 1, 'agora', 1), (acc, 4, 'storehouse', 1);
  insert into polis_sessions (user_id, account_id) values (auth.uid(), acc)
  on conflict (user_id) do update set account_id = excluded.account_id, created_at = now();
  return polis_state();
end;
$$;

-- ---------------------------------------------------------------- plots
create or replace function public.polis_plot_start(p_idx int, p_secs int) returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  me uuid := polis_me();
  p polis_plots;
  m numeric := polis_cycle_mult(p_secs);
begin
  if me is null then raise exception 'Log in first'; end if;
  if m is null then raise exception 'Pick a cycle: 30 min, 1 h, 6 h, 12 h or 24 h'; end if;
  perform polis_settle(me);
  select * into p from polis_plots where account_id = me and idx = p_idx for update;
  if p.kind is null then raise exception 'Unknown plot'; end if;
  if p.level < 1 then raise exception 'Build this plot first'; end if;
  if p.started_at is not null then raise exception 'This plot is already working'; end if;
  update polis_plots set cycle_secs = p_secs, started_at = polis_now(), ends_at = polis_now() + p_secs * interval '1 second',
    harvest = round(polis_rate(p.level) * (p_secs / 3600.0) * m)
  where account_id = me and idx = p_idx;
  return polis_state();
end;
$$;

create or replace function public.polis_plot_collect(p_idx int) returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  me uuid := polis_me();
  p polis_plots;
  v polis_villages;
  caps jsonb;
  have numeric; room numeric; moved numeric;
begin
  if me is null then raise exception 'Log in first'; end if;
  perform polis_settle(me);
  select * into p from polis_plots where account_id = me and idx = p_idx for update;
  if p.kind is null then raise exception 'Unknown plot'; end if;
  if p.started_at is null then raise exception 'Nothing to collect here'; end if;
  if p.ends_at > polis_now() then raise exception 'Not ready yet'; end if;
  select * into v from polis_villages where account_id = me for update;
  caps := polis_caps(me);
  have := case p.kind when 'grain' then v.grain when 'wood' then v.wood when 'marble' then v.marble else v.bronze end;
  room := greatest(0, (case when p.kind = 'grain' then caps->>'granary' else caps->>'store' end)::numeric - have);
  moved := least(room, p.harvest);
  if moved <= 0 then raise exception '%', case when p.kind = 'grain' then 'Your granary is full. Spend some or upgrade it' else 'Your storehouse is full. Spend some or upgrade it' end; end if;
  update polis_villages set
    grain = grain + case when p.kind = 'grain' then moved else 0 end, wood = wood + case when p.kind = 'wood' then moved else 0 end,
    marble = marble + case when p.kind = 'marble' then moved else 0 end, bronze = bronze + case when p.kind = 'bronze' then moved else 0 end
  where account_id = me;
  if p.harvest - moved > 0 then
    update polis_plots set harvest = p.harvest - moved where account_id = me and idx = p_idx;
  else
    update polis_plots set cycle_secs = null, started_at = null, ends_at = null, harvest = 0 where account_id = me and idx = p_idx;
  end if;
  return polis_state() || jsonb_build_object('collected', jsonb_build_object('kind', p.kind, 'amount', moved, 'left', p.harvest - moved));
end;
$$;

-- ---------------------------------------------------------------- construction (plots and buildings)
create or replace function public.polis_pay_and_queue(p_account uuid, p_target text, p_kind text, p_to int) returns void language plpgsql security definer set search_path to 'public' as $$
declare v polis_villages; c jsonb;
begin
  select * into v from polis_villages where account_id = p_account for update;
  if v.build_kind is not null then raise exception 'Your builders are busy. Wait for the current construction'; end if;
  if p_to > 10 then raise exception 'Already at the top level'; end if;
  c := polis_cost(p_kind, p_to);
  if v.grain < (c->>'grain')::numeric or v.wood < (c->>'wood')::numeric or v.marble < (c->>'marble')::numeric or v.bronze < (c->>'bronze')::numeric then
    raise exception 'Not enough resources';
  end if;
  update polis_villages set
    grain = grain - (c->>'grain')::numeric, wood = wood - (c->>'wood')::numeric,
    marble = marble - (c->>'marble')::numeric, bronze = bronze - (c->>'bronze')::numeric,
    build_kind = p_kind, build_level = p_to, build_target = p_target,
    build_until = polis_now() + polis_build_secs(p_account, (c->>'secs')::numeric) * interval '1 second'
  where account_id = p_account;
end;
$$;

create or replace function public.polis_plot_upgrade(p_idx int) returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare me uuid := polis_me(); p polis_plots;
begin
  if me is null then raise exception 'Log in first'; end if;
  perform polis_settle(me);
  select * into p from polis_plots where account_id = me and idx = p_idx;
  if p.kind is null then raise exception 'Unknown plot'; end if;
  perform polis_pay_and_queue(me, 'plot:' || p_idx, p.kind, p.level + 1);
  return polis_state();
end;
$$;

-- build a new building on a free pad, or upgrade the one that is there
create or replace function public.polis_build(p_pad int, p_kind text) returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare me uuid := polis_me(); b polis_buildings; need text;
begin
  if me is null then raise exception 'Log in first'; end if;
  if p_pad < 0 or p_pad > 13 then raise exception 'Unknown place'; end if;
  perform polis_settle(me);
  select * into b from polis_buildings where account_id = me and pad = p_pad;
  if b.kind is not null then
    perform polis_pay_and_queue(me, 'pad:' || p_pad, b.kind, b.level + 1); -- upgrade
  else
    if not (p_kind = any(polis_building_kinds())) then raise exception 'Unknown building'; end if;
    if exists (select 1 from polis_buildings where account_id = me and kind = p_kind) then raise exception 'You already have this building'; end if;
    need := polis_needs(me, p_kind);
    if need is not null then raise exception 'Needs %', need; end if;
    perform polis_pay_and_queue(me, 'pad:' || p_pad, p_kind, 1);
  end if;
  return polis_state();
end;
$$;

-- the browser only gets the game functions
revoke execute on function public.polis_settle(uuid), public.polis_caps(uuid), public.polis_needs(uuid, text),
  public.polis_build_secs(uuid, numeric), public.polis_pay_and_queue(uuid, text, text, int) from public, anon, authenticated;
grant execute on function public.polis_state(), public.polis_set_tribe(text), public.polis_register(text, text, text, text),
  public.polis_plot_start(int, int), public.polis_plot_collect(int), public.polis_plot_upgrade(int), public.polis_build(int, text) to authenticated;
-- G01 versions with the old shape are not used by the new screens
revoke execute on function public.polis_register(text, text, text), public.polis_start(text, int), public.polis_collect(text), public.polis_upgrade(text) from public, anon, authenticated;

-- check: should say true, true, true
select
  exists (select 1 from information_schema.tables where table_name = 'polis_plots') as plots_ready,
  exists (select 1 from information_schema.tables where table_name = 'polis_buildings') as buildings_ready,
  has_function_privilege('authenticated', 'public.polis_build(int, text)', 'execute') as build_ready;
