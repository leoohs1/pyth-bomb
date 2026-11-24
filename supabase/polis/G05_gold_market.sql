-- PYTH POLIS · step G05: GOLD is the money, and the MARKET pays real Pyth prices (Halls, 2026-11-24)
-- Run in Supabase SQL Editor AFTER G04. Safe to run more than once (the reset below happens only the first time).
--
--  · GOLD 🪙 is the game's money. Every construction and upgrade now costs gold (no more wood/marble/bronze).
--  · Grain, wood, marble, bronze and fish are harvested as before: sell them at the MARKET for gold
--    (food will also feed the army later).
--  · Market prices follow REAL Pyth prices: each good is paired with a real feed and priced in gold as
--    (real price of the good ÷ real price of gold), scaled so that it starts at a base value:
--      grain = wheat · wood = cotton · marble = aluminium · bronze = copper · fish = live cattle · gold = gold
--    The Railway server writes the prices once a minute (polis_set_prices, service key only). Until it does, the
--    market uses the base prices.
--  · RESET (Halls: "zera tudo"): everybody's village starts again (logins, tribe and hero name/color are kept):
--    500 gold, 100 of each resource, the first plots at level 1, Agora + Storehouse, hero back to level 1.

alter table public.polis_villages add column if not exists gold numeric not null default 500;
alter table public.polis_villages alter column grain set default 100;
alter table public.polis_villages alter column wood set default 100;
alter table public.polis_villages alter column marble set default 100;
alter table public.polis_villages alter column bronze set default 100;

create table if not exists public.polis_meta (key text primary key, value text, at timestamptz not null default now());
alter table public.polis_meta enable row level security;
revoke all on table public.polis_meta from anon, authenticated;

create table if not exists public.polis_prices (
  kind text primary key check (kind in ('gold', 'grain', 'wood', 'marble', 'bronze', 'fish')),
  label text not null,          -- the real thing it follows ("Wheat")
  symbol text not null,         -- Pyth symbol
  feed_id text not null,        -- Pyth price feed id
  base numeric not null,        -- gold per unit when the real ratio is at its reference
  usd numeric,                  -- latest real price (feed units)
  publish_time timestamptz,     -- when Pyth published it
  updated_at timestamptz,       -- when our server wrote it
  open_usd numeric,             -- first price of the (UTC) day, for the daily change
  open_day date,
  ref_ratio numeric             -- (good / gold) the first time we saw both = the base price
);
alter table public.polis_prices enable row level security;
revoke all on table public.polis_prices from anon, authenticated;
insert into polis_prices (kind, label, symbol, feed_id, base) values
  ('gold',   'Gold',        'Metal.Index.GOLD/USD',              'fa0f57505be633c026896e15afef2c7ce2cf8ff9a45349d1da737f4f01266b01', 1),
  ('grain',  'Wheat',       'Commodities.Index.RWHEAT/USc',      '2ce2d1aed956d847f4b72c28c1fb5a520107a0500d8f180bedbe4f45b758794c', 0.8),
  ('wood',   'Cotton',      'Commodities.Index.RCOTTON/USc',     'cddebbb880cbe01c5fd98e8700e16ce4268ec20e02d21122b607a040341a2af9', 0.9),
  ('marble', 'Aluminium',   'Metal.AL3M/USD',                    '9397ba38556359e78a52853b5db5e350e86b9e9a6c01094698130112f3d10cb6', 1.0),
  ('bronze', 'Copper',      'Commodities.Index.CU/USD',          'b2b238aeb6ef5a722c5cf278595bf40434e174cac4f88c8ad5b6f5009b548c59', 1.2),
  ('fish',   'Live cattle', 'Commodities.Index.RLIVECATTLE/USc', '15a3e4116a15e60b1b4a168348a16ebdadc476f5a6f5cb962bd5724f42727d23', 1.1)
on conflict (kind) do update set label = excluded.label, symbol = excluded.symbol, feed_id = excluded.feed_id, base = excluded.base;

-- ---------------------------------------------------------------- the reset (only once)
do $$
begin
  if not exists (select 1 from polis_meta where key = 'g05_reset') then
    update polis_villages set grain = 100, wood = 100, marble = 100, bronze = 100, fish = 0, gold = 500,
      build_kind = null, build_level = null, build_until = null, build_target = null;
    update polis_plots set level = case when idx in (0, 1, 2, 5) then 1 else 0 end, cycle_secs = null, started_at = null, ends_at = null, harvest = 0;
    delete from polis_buildings;
    insert into polis_buildings (account_id, pad, kind, level) select account_id, 1, 'agora', 1 from polis_villages;
    insert into polis_buildings (account_id, pad, kind, level) select account_id, 4, 'storehouse', 1 from polis_villages;
    delete from polis_boats;
    update polis_heroes set xp = 0, adv_kind = null, adv_started_at = null, adv_ends_at = null, adv_loot = null;
    insert into polis_meta (key, value) values ('g05_reset', 'done');
  end if;
end $$;

-- ---------------------------------------------------------------- prices
-- gold per unit of a good right now
create or replace function public.polis_price(p_kind text) returns numeric language sql stable security definer set search_path to 'public' as $$
  select round(case when p.usd is null or g.usd is null or p.ref_ratio is null or g.usd = 0 then p.base
                    else p.base * (p.usd / g.usd) / p.ref_ratio end, 3)
  from polis_prices p, polis_prices g where p.kind = p_kind and g.kind = 'gold'
$$;

-- called by the Railway server once a minute with {"gold": {"usd": 4012.5, "t": 1795600000}, "grain": {...}, ...}
create or replace function public.polis_set_prices(p jsonb) returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare k text; today date := (now() at time zone 'utc')::date; n int := 0;
begin
  for k in select kind from polis_prices loop
    if p ? k and (p->k->>'usd') is not null and (p->k->>'usd')::numeric > 0 then
      update polis_prices set usd = (p->k->>'usd')::numeric,
        publish_time = case when p->k ? 't' then to_timestamp((p->k->>'t')::bigint) else publish_time end,
        updated_at = now(),
        open_usd = case when open_day is distinct from today then (p->k->>'usd')::numeric else open_usd end,
        open_day = today
      where kind = k;
      n := n + 1;
    end if;
  end loop;
  -- the first time we see a good together with gold, that ratio becomes its base price
  update polis_prices p set ref_ratio = p.usd / g.usd
  from polis_prices g where g.kind = 'gold' and p.kind <> 'gold' and p.ref_ratio is null and p.usd is not null and g.usd > 0;
  return jsonb_build_object('updated', n);
end;
$$;

create or replace function public.polis_market_json() returns jsonb language sql stable security definer set search_path to 'public' as $$
  select jsonb_agg(jsonb_build_object(
      'kind', p.kind, 'label', p.label, 'symbol', p.symbol, 'price', polis_price(p.kind), 'base', p.base,
      'change', case when p.open_usd > 0 and g.open_usd > 0 and p.usd is not null and g.usd > 0
                     then round(((p.usd / g.usd) / (p.open_usd / g.open_usd) - 1) * 100, 2) end,
      'live', p.usd is not null and p.updated_at > now() - interval '10 minutes' and coalesce(p.publish_time, 'epoch') > now() - interval '30 minutes',
      'publish_time', p.publish_time) order by array_position(array['grain', 'wood', 'marble', 'bronze', 'fish'], p.kind))
  from polis_prices p, polis_prices g where g.kind = 'gold' and p.kind <> 'gold'
$$;

-- costs in gold: the sum of the old material costs (same curve: half at level 1, x1.6 per level after)
create or replace function public.polis_cost(p_kind text, p_to int) returns jsonb language plpgsql immutable as $$
declare
  f numeric := case when p_to <= 1 then 0.5 else power(1.6, p_to - 2) end;
  t numeric := case when p_to <= 1 then 60 else round(120 * power(1.7, p_to - 2)) end;
  b numeric;
begin
  b := case p_kind
    when 'grain' then 160 when 'wood' then 160 when 'marble' then 170 when 'bronze' then 180
    when 'warehouse' then 270 when 'storehouse' then 270 when 'granary' then 250 when 'docks' then 290
    when 'agora' then 340 when 'cellar' then 210 when 'barracks' then 420 when 'market' then 340 when 'temple' then 510
    else 570 end; -- agoge / harbor / sanctuary
  return jsonb_build_object('gold', round(b * f), 'secs', t);
end;
$$;

create or replace function public.polis_pay_and_queue(p_account uuid, p_target text, p_kind text, p_to int) returns void language plpgsql security definer set search_path to 'public' as $$
declare v polis_villages; c jsonb;
begin
  select * into v from polis_villages where account_id = p_account for update;
  if v.build_kind is not null then raise exception 'Your builders are busy. Wait for the current construction'; end if;
  if p_to > 10 then raise exception 'Already at the top level'; end if;
  c := polis_cost(p_kind, p_to);
  if v.gold < (c->>'gold')::numeric then raise exception 'Not enough gold. Sell goods at the Market'; end if;
  update polis_villages set gold = gold - (c->>'gold')::numeric,
    build_kind = p_kind, build_level = p_to, build_target = p_target,
    build_until = polis_now() + polis_build_secs(p_account, (c->>'secs')::numeric) * interval '1 second'
  where account_id = p_account;
end;
$$;

-- ---------------------------------------------------------------- state (G04 shape + gold and market)
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
      'fish', floor(v.fish), 'gold', floor(v.gold),
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
    'market', polis_market_json(),
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

-- ---------------------------------------------------------------- selling
create or replace function public.polis_sell(p_kind text, p_amount int) returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  me uuid := polis_me();
  v polis_villages;
  have numeric; price numeric; got numeric;
begin
  if me is null then raise exception 'Log in first'; end if;
  if p_kind not in ('grain', 'wood', 'marble', 'bronze', 'fish') then raise exception 'You cannot sell that'; end if;
  if p_amount is null or p_amount < 1 then raise exception 'Choose how much to sell'; end if;
  perform polis_settle(me);
  select * into v from polis_villages where account_id = me for update;
  have := floor(case p_kind when 'grain' then v.grain when 'wood' then v.wood when 'marble' then v.marble when 'bronze' then v.bronze else v.fish end);
  if p_amount > have then raise exception 'You only have % of that', have; end if;
  price := polis_price(p_kind);
  got := floor(p_amount * price);
  if got < 1 then raise exception 'Sell a bit more: that is worth less than 1 gold'; end if;
  update polis_villages set gold = gold + got,
    grain = grain - case when p_kind = 'grain' then p_amount else 0 end, wood = wood - case when p_kind = 'wood' then p_amount else 0 end,
    marble = marble - case when p_kind = 'marble' then p_amount else 0 end, bronze = bronze - case when p_kind = 'bronze' then p_amount else 0 end,
    fish = fish - case when p_kind = 'fish' then p_amount else 0 end
  where account_id = me;
  return polis_state() || jsonb_build_object('sold', jsonb_build_object('kind', p_kind, 'amount', p_amount, 'gold', got, 'price', price));
end;
$$;

revoke execute on function public.polis_set_prices(jsonb) from public, anon, authenticated;
grant execute on function public.polis_set_prices(jsonb) to service_role;
revoke execute on function public.polis_market_json(), public.polis_price(text) from public, anon, authenticated;
grant execute on function public.polis_state(), public.polis_sell(text, int) to authenticated;

-- check: should say true, true, true
select
  exists (select 1 from information_schema.columns where table_name = 'polis_villages' and column_name = 'gold') as gold_ready,
  (select count(*) = 6 from polis_prices) as prices_ready,
  has_function_privilege('authenticated', 'public.polis_sell(text, int)', 'execute') as market_ready;
