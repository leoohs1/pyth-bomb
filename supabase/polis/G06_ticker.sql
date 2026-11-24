-- PYTH POLIS · step G06: the PRICE STRIP at the bottom of the screen (Halls, 2026-11-24: "por enquanto gold")
-- Run in Supabase SQL Editor AFTER G05. Safe to run more than once. Changes nothing in the villages.
--
--  · polis_state now also sends 'ticker': real Pyth prices in US dollars and how much they moved today:
--      GOLD (gold) and OLIVE (follows Brent oil, Halls: "Olive vai ser pareado com OIL").
--  · The price comes from the same table the Market uses (polis_prices), written once a minute by the Railway
--    server. Until the server has a Pyth API key, the strip says "live price soon".

-- olive joins the price table (only for the strip for now; it is not sold at the Market yet)
alter table public.polis_prices drop constraint if exists polis_prices_kind_check;
alter table public.polis_prices add constraint polis_prices_kind_check check (kind in ('gold', 'grain', 'wood', 'marble', 'bronze', 'fish', 'olive'));
insert into polis_prices (kind, label, symbol, feed_id, base) values
  ('olive', 'Brent oil', 'Commodities.Index.BRENT/USD', 'f33ce961935076ef4dc98be75cf2126046eac1bffdcd7a0fa05ccf18b746fda6', 1.0)
on conflict (kind) do update set label = excluded.label, symbol = excluded.symbol, feed_id = excluded.feed_id;

-- the Market keeps only the 5 goods you can sell
create or replace function public.polis_market_json() returns jsonb language sql stable security definer set search_path to 'public' as $$
  select jsonb_agg(jsonb_build_object(
      'kind', p.kind, 'label', p.label, 'symbol', p.symbol, 'price', polis_price(p.kind), 'base', p.base,
      'change', case when p.open_usd > 0 and g.open_usd > 0 and p.usd is not null and g.usd > 0
                     then round(((p.usd / g.usd) / (p.open_usd / g.open_usd) - 1) * 100, 2) end,
      'live', p.usd is not null and p.updated_at > now() - interval '10 minutes' and coalesce(p.publish_time, 'epoch') > now() - interval '30 minutes',
      'publish_time', p.publish_time) order by array_position(array['grain', 'wood', 'marble', 'bronze', 'fish'], p.kind))
  from polis_prices p, polis_prices g where g.kind = 'gold' and p.kind in ('grain', 'wood', 'marble', 'bronze', 'fish')
$$;

create or replace function public.polis_ticker_json() returns jsonb language sql stable security definer set search_path to 'public' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'kind', p.kind, 'label', p.label, 'symbol', p.symbol, 'usd', p.usd,
      'change', case when p.open_usd > 0 and p.usd is not null then round((p.usd / p.open_usd - 1) * 100, 2) end,
      'live', p.usd is not null and p.updated_at > now() - interval '10 minutes',
      'publish_time', p.publish_time) order by array_position(array['gold', 'olive'], p.kind)), '[]'::jsonb)
  from polis_prices p where p.kind in ('gold', 'olive')
$$;

-- ---------------------------------------------------------------- state (G05 shape + ticker)
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
    'ticker', polis_ticker_json(),
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

revoke execute on function public.polis_ticker_json(), public.polis_market_json() from public, anon, authenticated;
grant execute on function public.polis_state() to authenticated;

-- check: should say true
select (public.polis_ticker_json() -> 0 ->> 'kind') = 'gold' and (public.polis_ticker_json() -> 1 ->> 'kind') = 'olive' as ticker_ready;
