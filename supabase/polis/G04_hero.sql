-- PYTH POLIS · step G04: the HERO (Halls, 2026-11-24)
-- Run in Supabase SQL Editor AFTER G03. Safe to run more than once. Nothing existing is lost.
--
--  · Every player has a hero with a NAME and a CAPE COLOR (purple, red, blue, green, gold, white).
--  · ADVENTURES: send the hero away for 30 min, 2 h or 8 h. He comes back with a sack of mixed resources (fish too)
--    and XP. The loot is drawn when he leaves; you collect it when he is back. Higher level = bigger loot (+10%/level).
--  · Level from XP: level L needs 25·L·(L-1) XP (lv 2 = 50, lv 3 = 150, lv 4 = 300 ...), max level 20.
--  · One adventure at a time. Calculated from timestamps, no ticks.

create table if not exists public.polis_heroes (
  account_id uuid primary key references public.polis_accounts(id) on delete cascade,
  name text not null default 'Hero',
  color text not null default 'purple' check (color in ('purple', 'red', 'blue', 'green', 'gold', 'white')),
  xp int not null default 0,
  adv_kind int check (adv_kind between 0 and 2),
  adv_started_at timestamptz,
  adv_ends_at timestamptz,
  adv_loot jsonb
);
alter table public.polis_heroes enable row level security;
revoke all on table public.polis_heroes from anon, authenticated;

-- ---------------------------------------------------------------- rules
create or replace function public.polis_hero_level(p_xp int) returns int language sql immutable as $$
  select least(20, floor((1 + sqrt(1 + 8 * greatest(0, p_xp) / 50.0)) / 2)::int)
$$;
create or replace function public.polis_hero_xp_for(p_level int) returns int language sql immutable as $$
  select 25 * p_level * (p_level - 1)
$$;
-- the 3 adventures: seconds, XP, total loot at level 1
create or replace function public.polis_adventures() returns jsonb language sql immutable as $$
  select '[{"kind": 0, "secs": 1800, "xp": 10, "loot": 150},
           {"kind": 1, "secs": 7200, "xp": 35, "loot": 480},
           {"kind": 2, "secs": 28800, "xp": 120, "loot": 1500}]'::jsonb
$$;

create or replace function public.polis_hero_json(p_account uuid) returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare h polis_heroes; lvl int;
begin
  select * into h from polis_heroes where account_id = p_account;
  if h.account_id is null then h.name := 'Hero'; h.color := 'purple'; h.xp := 0; end if;
  lvl := polis_hero_level(h.xp);
  return jsonb_build_object(
    'name', h.name, 'color', h.color, 'xp', h.xp, 'level', lvl,
    'xp_level', polis_hero_xp_for(lvl), 'xp_next', case when lvl < 20 then polis_hero_xp_for(lvl + 1) end,
    'loot_mult', round(1 + 0.1 * (lvl - 1), 2),
    'adventure', case when h.adv_started_at is not null then jsonb_build_object(
      'kind', h.adv_kind, 'started_at', h.adv_started_at, 'ends_at', h.adv_ends_at, 'loot', h.adv_loot) end,
    'adventures', polis_adventures());
end;
$$;

-- ---------------------------------------------------------------- state (G03 shape + hero)
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
    'hero', polis_hero_json(me),
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

-- ---------------------------------------------------------------- hero actions
create or replace function public.polis_hero_set(p_name text, p_color text) returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  me uuid := polis_me();
  n text := left(regexp_replace(trim(coalesce(p_name, '')), '[[:cntrl:]<>]', '', 'g'), 16);
begin
  if me is null then raise exception 'Log in first'; end if;
  if length(n) < 2 then raise exception 'Give your hero a name (2 to 16 characters)'; end if;
  if p_color not in ('purple', 'red', 'blue', 'green', 'gold', 'white') then raise exception 'Pick a color'; end if;
  insert into polis_heroes (account_id, name, color) values (me, n, p_color)
  on conflict (account_id) do update set name = excluded.name, color = excluded.color;
  return polis_state();
end;
$$;

create or replace function public.polis_hero_go(p_kind int) returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  me uuid := polis_me();
  adv jsonb := polis_adventures()->p_kind;
  h polis_heroes;
  total numeric; w numeric[]; s numeric; loot jsonb;
begin
  if me is null then raise exception 'Log in first'; end if;
  if p_kind is null or adv is null then raise exception 'Unknown adventure'; end if;
  insert into polis_heroes (account_id) values (me) on conflict do nothing;
  select * into h from polis_heroes where account_id = me for update;
  if h.adv_started_at is not null then raise exception 'Your hero is already on an adventure'; end if;
  total := (adv->>'loot')::numeric * (1 + 0.1 * (polis_hero_level(h.xp) - 1));
  w := array[0.4 + random(), 0.4 + random(), 0.4 + random(), 0.4 + random(), 0.4 + random()];
  s := w[1] + w[2] + w[3] + w[4] + w[5];
  loot := jsonb_build_object('grain', round(total * w[1] / s), 'wood', round(total * w[2] / s), 'marble', round(total * w[3] / s),
    'bronze', round(total * w[4] / s), 'fish', round(total * w[5] / s), 'xp', (adv->>'xp')::int);
  update polis_heroes set adv_kind = p_kind, adv_started_at = polis_now(),
    adv_ends_at = polis_now() + (adv->>'secs')::int * interval '1 second', adv_loot = loot
  where account_id = me;
  return polis_state();
end;
$$;

create or replace function public.polis_hero_collect() returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  me uuid := polis_me();
  h polis_heroes; v polis_villages; caps jsonb; l jsonb; got jsonb; before int;
  sc numeric; gc numeric;
begin
  if me is null then raise exception 'Log in first'; end if;
  perform polis_settle(me);
  select * into h from polis_heroes where account_id = me for update;
  if h.adv_started_at is null then raise exception 'Your hero is at home'; end if;
  if h.adv_ends_at > polis_now() then raise exception 'Your hero is still away'; end if;
  select * into v from polis_villages where account_id = me for update;
  caps := polis_caps(me); sc := (caps->>'store')::numeric; gc := (caps->>'granary')::numeric;
  l := h.adv_loot;
  -- what fits in the storehouse / granary goes in; the rest stays behind (the screen warns before)
  got := jsonb_build_object(
    'grain', least((l->>'grain')::numeric, greatest(0, gc - v.grain)), 'wood', least((l->>'wood')::numeric, greatest(0, sc - v.wood)),
    'marble', least((l->>'marble')::numeric, greatest(0, sc - v.marble)), 'bronze', least((l->>'bronze')::numeric, greatest(0, sc - v.bronze)),
    'fish', least((l->>'fish')::numeric, greatest(0, gc - v.fish)));
  update polis_villages set grain = grain + (got->>'grain')::numeric, wood = wood + (got->>'wood')::numeric,
    marble = marble + (got->>'marble')::numeric, bronze = bronze + (got->>'bronze')::numeric, fish = fish + (got->>'fish')::numeric
  where account_id = me;
  before := polis_hero_level(h.xp);
  update polis_heroes set xp = xp + (l->>'xp')::int, adv_kind = null, adv_started_at = null, adv_ends_at = null, adv_loot = null
  where account_id = me;
  return polis_state() || jsonb_build_object('collected', jsonb_build_object('kind', 'hero', 'loot', got, 'xp', (l->>'xp')::int,
    'level_up', polis_hero_level(h.xp + (l->>'xp')::int) > before,
    'lost', (l->>'grain')::numeric + (l->>'wood')::numeric + (l->>'marble')::numeric + (l->>'bronze')::numeric + (l->>'fish')::numeric
      - ((got->>'grain')::numeric + (got->>'wood')::numeric + (got->>'marble')::numeric + (got->>'bronze')::numeric + (got->>'fish')::numeric)));
end;
$$;

revoke execute on function public.polis_hero_json(uuid) from public, anon, authenticated;
grant execute on function public.polis_state(), public.polis_hero_set(text, text), public.polis_hero_go(int), public.polis_hero_collect() to authenticated;

-- check: should say true, true
select
  exists (select 1 from information_schema.tables where table_name = 'polis_heroes') as hero_ready,
  has_function_privilege('authenticated', 'public.polis_hero_go(int)', 'execute') as adventures_ready;
