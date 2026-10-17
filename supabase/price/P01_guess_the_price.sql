-- PYTH BOMB · GUESS THE PRICE — step P01: the base of the mode (+ DEMO prices)
-- Run in Supabase SQL Editor. Safe to run more than once. Does NOT change the Hot Potato game.
--
-- How a match works:
--   * 10 rounds. Each round shows an asset (Bitcoin, Gold, Nvidia...), a past date and time, and
--     its price 24 hours before. Everybody guesses the price at that moment (20 seconds).
--   * Guesses stay hidden on the server until the round ends (nobody can peek).
--   * Points: the closer, the more (up to 1000). Inside Pyth's confidence band = PYTH PERFECT (1500).
--     The furthest guess "gets rugged" (just for fun, no penalty).
--   * After 10 rounds: podium by points.
-- Prices come from a bank on the server. This step fills it with DEMO prices (NOT real, only to
-- test the game). Step P02 (after the Pyth API key is saved in Supabase) fetches the real ones.

-- ============================================================
-- rooms / players: a room now has a mode, players have points
-- ============================================================
alter table public.rooms add column if not exists mode text not null default 'classic';
alter table public.rooms add column if not exists price_total int;      -- rounds in this match
alter table public.rooms add column if not exists price_phase text;     -- 'guess' | 'reveal'
alter table public.rooms add column if not exists price_round jsonb;    -- what everybody sees (never the answer)
alter table public.rooms add column if not exists price_reveal jsonb;   -- answer + everybody's guess, after the round
alter table public.players add column if not exists score int not null default 0;
alter table public.players add column if not exists price_guessed_round int; -- "already guessed" mark (not the value)
alter table public.players add column if not exists place int;          -- final place (same column as 026)

-- ============================================================
-- assets, price bank, secrets, guesses (all hidden from the browser: RLS on, no policies)
-- ============================================================
create table if not exists public.price_assets (
  pro_id int primary key,        -- Pyth Pro feed id
  symbol text not null,          -- Pyth symbol, e.g. Crypto.BTC/USD
  label text not null,           -- shown in the game
  kind text not null,            -- crypto | stock | metal | fx
  hours text not null,           -- '24/7' or 'ny_weekday' (New York weekdays, market open)
  exponent int not null,
  scale_pct numeric not null,    -- error (in %) that already gives 0 points
  decimals int not null default 2,
  quote text not null default 'USD',   -- currency of the price (USD, or BRL for USD/BRL)
  active boolean not null default true
);
alter table public.price_assets add column if not exists quote text not null default 'USD';
alter table public.price_assets enable row level security;

create table if not exists public.price_bank (
  id uuid primary key default gen_random_uuid(),
  pro_id int not null references public.price_assets(pro_id),
  at timestamptz not null,
  price numeric not null,
  confidence numeric not null default 0,
  ref_at timestamptz,
  ref_price numeric,
  source text not null default 'pyth',   -- 'pyth' (real) | 'demo'
  active boolean not null default true,
  times_dealt int not null default 0,
  created_at timestamptz not null default now(),
  unique (pro_id, at)
);
alter table public.price_bank enable row level security;

create table if not exists public.price_secrets (
  room_id uuid primary key references public.rooms(id) on delete cascade,
  bank_id uuid,
  answer numeric,
  confidence numeric,
  scale_pct numeric
);
alter table public.price_secrets enable row level security;

create table if not exists public.price_guesses (
  room_id uuid not null references public.rooms(id) on delete cascade,
  round int not null,
  player_id uuid not null references public.players(id) on delete cascade,
  guess numeric not null,
  updated_at timestamptz not null default now(),
  primary key (room_id, round, player_id)
);
alter table public.price_guesses enable row level security;

insert into public.price_assets (pro_id, symbol, label, kind, hours, exponent, scale_pct, decimals, quote) values
  (1, 'Crypto.BTC/USD', 'Bitcoin (BTC)', 'crypto', '24/7', -8, 6, 2, 'USD'),
  (2, 'Crypto.ETH/USD', 'Ethereum (ETH)', 'crypto', '24/7', -8, 8, 2, 'USD'),
  (6, 'Crypto.SOL/USD', 'Solana (SOL)', 'crypto', '24/7', -8, 10, 2, 'USD'),
  (3, 'Crypto.PYTH/USD', 'Pyth Network (PYTH)', 'crypto', '24/7', -8, 12, 4, 'USD'),
  (13, 'Crypto.DOGE/USD', 'Dogecoin (DOGE)', 'crypto', '24/7', -8, 12, 4, 'USD'),
  (346, 'Metal.XAU/USD', 'Gold (1 ounce)', 'metal', 'ny_weekday', -3, 3, 2, 'USD'),
  (345, 'Metal.XAG/USD', 'Silver (1 ounce)', 'metal', 'ny_weekday', -5, 4, 2, 'USD'),
  (327, 'FX.EUR/USD', 'Euro in US dollars (EUR/USD)', 'fx', 'ny_weekday', -5, 1.5, 4, 'USD'),
  (1506, 'FX.USD/BRL', 'US dollar in Brazilian reais (USD/BRL)', 'fx', 'ny_weekday', -5, 2, 4, 'BRL'),
  (1314, 'Equity.US.NVDA/USD', 'Nvidia (NVDA)', 'stock', 'ny_weekday', -5, 6, 2, 'USD'),
  (1435, 'Equity.US.TSLA/USD', 'Tesla (TSLA)', 'stock', 'ny_weekday', -5, 8, 2, 'USD'),
  (922, 'Equity.US.AAPL/USD', 'Apple (AAPL)', 'stock', 'ny_weekday', -5, 5, 2, 'USD'),
  (1292, 'Equity.US.MSFT/USD', 'Microsoft (MSFT)', 'stock', 'ny_weekday', -5, 5, 2, 'USD'),
  (954, 'Equity.US.AMZN/USD', 'Amazon (AMZN)', 'stock', 'ny_weekday', -5, 5, 2, 'USD'),
  (1272, 'Equity.US.META/USD', 'Meta (META)', 'stock', 'ny_weekday', -5, 6, 2, 'USD'),
  (1042, 'Equity.US.COIN/USD', 'Coinbase (COIN)', 'stock', 'ny_weekday', -5, 8, 2, 'USD')
on conflict (pro_id) do update set symbol = excluded.symbol, label = excluded.label, kind = excluded.kind,
  hours = excluded.hours, exponent = excluded.exponent, scale_pct = excluded.scale_pct, decimals = excluded.decimals,
  quote = excluded.quote;

-- DEMO prices (made up, NOT real). Turned off automatically when real Pyth prices arrive (P02).
insert into public.price_bank (pro_id, at, price, confidence, ref_at, ref_price, source) values
  (1, '2026-10-13T22:30:00.000Z', 96635.4143, 38.6542, '2026-10-12T22:30:00.000Z', 95348.1503, 'demo'),
  (1, '2026-03-02T18:00:00.000Z', 91777.3494, 36.7109, '2026-03-01T18:00:00.000Z', 91850.6844, 'demo'),
  (1, '2026-06-23T16:00:00.000Z', 86393.2908, 34.5573, '2026-06-22T16:00:00.000Z', 88777.3743, 'demo'),
  (1, '2026-02-13T02:00:00.000Z', 97764.974, 39.106, '2026-02-12T02:00:00.000Z', 95758.1053, 'demo'),
  (2, '2026-01-13T21:30:00.000Z', 3928.3599, 1.5713, '2026-01-12T21:30:00.000Z', 4047.4142, 'demo'),
  (2, '2026-07-16T10:30:00.000Z', 3327.5501, 1.331, '2026-07-15T10:30:00.000Z', 3394.822, 'demo'),
  (2, '2026-09-26T06:00:00.000Z', 3001.7703, 1.2007, '2026-09-25T06:00:00.000Z', 3166.3759, 'demo'),
  (2, '2026-09-27T08:30:00.000Z', 3948.6127, 1.5794, '2026-09-26T08:30:00.000Z', 4030.0292, 'demo'),
  (6, '2026-06-14T06:30:00.000Z', 163.2883, 0.0653, '2026-06-13T06:30:00.000Z', 157.1773, 'demo'),
  (6, '2026-08-05T21:30:00.000Z', 170.5726, 0.0682, '2026-08-04T21:30:00.000Z', 163.4406, 'demo'),
  (6, '2026-05-15T16:00:00.000Z', 170.7226, 0.0683, '2026-05-14T16:00:00.000Z', 160.148, 'demo'),
  (6, '2026-06-30T07:30:00.000Z', 193.6405, 0.0775, '2026-06-29T07:30:00.000Z', 201.4891, 'demo'),
  (3, '2026-09-20T09:30:00.000Z', 0.210494, 0.000084, '2026-09-19T09:30:00.000Z', 0.196197, 'demo'),
  (3, '2026-08-31T10:00:00.000Z', 0.195198, 0.000078, '2026-08-30T10:00:00.000Z', 0.199733, 'demo'),
  (3, '2026-01-21T21:00:00.000Z', 0.190756, 0.000076, '2026-01-20T21:00:00.000Z', 0.208499, 'demo'),
  (3, '2026-10-13T14:30:00.000Z', 0.133592, 0.000053, '2026-10-12T14:30:00.000Z', 0.134114, 'demo'),
  (13, '2026-01-22T05:30:00.000Z', 0.210714, 0.000084, '2026-01-21T05:30:00.000Z', 0.226384, 'demo'),
  (13, '2026-01-13T15:00:00.000Z', 0.280261, 0.000112, '2026-01-12T15:00:00.000Z', 0.312089, 'demo'),
  (13, '2026-04-27T16:30:00.000Z', 0.213716, 0.000085, '2026-04-26T16:30:00.000Z', 0.227098, 'demo'),
  (13, '2026-02-25T16:00:00.000Z', 0.237855, 0.000095, '2026-02-24T16:00:00.000Z', 0.26552, 'demo'),
  (346, '2026-09-04T17:00:00.000Z', 4391.9336, 1.7568, '2026-09-03T17:00:00.000Z', 4415.9684, 'demo'),
  (346, '2025-12-31T18:30:00.000Z', 3186.4191, 1.2746, '2025-12-30T18:30:00.000Z', 3173.6399, 'demo'),
  (346, '2026-08-04T16:00:00.000Z', 2997.0233, 1.1988, '2026-08-03T16:00:00.000Z', 2994.2541, 'demo'),
  (346, '2026-03-10T16:30:00.000Z', 4145.4067, 1.6582, '2026-03-09T16:30:00.000Z', 4142.3829, 'demo'),
  (345, '2026-04-03T15:30:00.000Z', 38.8353, 0.0155, '2026-04-02T15:30:00.000Z', 38.6425, 'demo'),
  (345, '2026-08-18T16:30:00.000Z', 33.207, 0.0133, '2026-08-17T16:30:00.000Z', 32.6767, 'demo'),
  (345, '2026-10-06T16:00:00.000Z', 36.3149, 0.0145, '2026-10-05T16:00:00.000Z', 36.3917, 'demo'),
  (345, '2026-02-24T18:00:00.000Z', 36.973, 0.0148, '2026-02-23T18:00:00.000Z', 37.132, 'demo'),
  (327, '2026-02-27T17:00:00.000Z', 1.198373, 0.000479, '2026-02-26T17:00:00.000Z', 1.206786, 'demo'),
  (327, '2026-09-11T15:30:00.000Z', 1.29052, 0.000516, '2026-09-10T15:30:00.000Z', 1.296796, 'demo'),
  (327, '2026-08-14T17:30:00.000Z', 1.351318, 0.000541, '2026-08-13T17:30:00.000Z', 1.348052, 'demo'),
  (327, '2026-06-16T16:30:00.000Z', 1.226816, 0.000491, '2026-06-15T16:30:00.000Z', 1.22746, 'demo'),
  (1506, '2026-01-09T17:30:00.000Z', 4.450349, 0.00178, '2026-01-08T17:30:00.000Z', 4.494871, 'demo'),
  (1506, '2026-07-24T17:00:00.000Z', 6.594168, 0.002638, '2026-07-23T17:00:00.000Z', 6.517609, 'demo'),
  (1506, '2026-06-11T15:30:00.000Z', 5.556578, 0.002223, '2026-06-10T15:30:00.000Z', 5.534059, 'demo'),
  (1506, '2026-01-30T18:00:00.000Z', 4.865826, 0.001946, '2026-01-29T18:00:00.000Z', 4.830574, 'demo'),
  (1314, '2026-03-11T17:00:00.000Z', 185.8644, 0.0743, '2026-03-10T17:00:00.000Z', 188.5716, 'demo'),
  (1314, '2026-06-04T16:00:00.000Z', 166.4489, 0.0666, '2026-06-03T16:00:00.000Z', 161.3701, 'demo'),
  (1314, '2026-01-22T17:00:00.000Z', 171.7887, 0.0687, '2026-01-21T17:00:00.000Z', 172.356, 'demo'),
  (1314, '2026-05-06T16:00:00.000Z', 190.2786, 0.0761, '2026-05-05T16:00:00.000Z', 187.3203, 'demo'),
  (1435, '2026-06-05T16:30:00.000Z', 335.9773, 0.1344, '2026-06-04T16:30:00.000Z', 338.3614, 'demo'),
  (1435, '2026-01-23T15:30:00.000Z', 350.7154, 0.1403, '2026-01-22T15:30:00.000Z', 331.5202, 'demo'),
  (1435, '2026-10-07T17:00:00.000Z', 352.644, 0.1411, '2026-10-06T17:00:00.000Z', 351.3876, 'demo'),
  (1435, '2026-09-08T17:30:00.000Z', 304.2508, 0.1217, '2026-09-07T17:30:00.000Z', 309.8885, 'demo'),
  (922, '2026-03-13T18:00:00.000Z', 225.9141, 0.0904, '2026-03-12T18:00:00.000Z', 225.6224, 'demo'),
  (922, '2026-04-17T15:30:00.000Z', 225.1893, 0.0901, '2026-04-16T15:30:00.000Z', 225.1689, 'demo'),
  (922, '2026-04-10T17:00:00.000Z', 271.4688, 0.1086, '2026-04-09T17:00:00.000Z', 267.8961, 'demo'),
  (922, '2026-02-18T17:00:00.000Z', 290.7289, 0.1163, '2026-02-17T17:00:00.000Z', 293.0071, 'demo'),
  (1292, '2026-01-27T18:00:00.000Z', 521.1656, 0.2085, '2026-01-26T18:00:00.000Z', 518.4785, 'demo'),
  (1292, '2026-08-28T15:00:00.000Z', 521.8585, 0.2087, '2026-08-27T15:00:00.000Z', 520.5281, 'demo'),
  (1292, '2025-12-31T16:30:00.000Z', 338.347, 0.1353, '2025-12-30T16:30:00.000Z', 341.8098, 'demo'),
  (1292, '2026-07-09T16:30:00.000Z', 707.6446, 0.2831, '2026-07-08T16:30:00.000Z', 691.9342, 'demo'),
  (954, '2026-05-26T18:00:00.000Z', 208.5751, 0.0834, '2026-05-25T18:00:00.000Z', 204.7018, 'demo'),
  (954, '2026-02-24T18:00:00.000Z', 231.0555, 0.0924, '2026-02-23T18:00:00.000Z', 238.3307, 'demo'),
  (954, '2026-03-10T17:30:00.000Z', 194.0835, 0.0776, '2026-03-09T17:30:00.000Z', 197.0947, 'demo'),
  (954, '2026-09-24T15:30:00.000Z', 235.3589, 0.0941, '2026-09-23T15:30:00.000Z', 238.1988, 'demo'),
  (1272, '2026-10-13T18:00:00.000Z', 730.4633, 0.2922, '2026-10-12T18:00:00.000Z', 712.6114, 'demo'),
  (1272, '2026-01-14T18:30:00.000Z', 703.3567, 0.2813, '2026-01-13T18:30:00.000Z', 691.5789, 'demo'),
  (1272, '2026-07-31T18:00:00.000Z', 561.9469, 0.2248, '2026-07-30T18:00:00.000Z', 561.587, 'demo'),
  (1272, '2026-01-22T18:00:00.000Z', 788.0438, 0.3152, '2026-01-21T18:00:00.000Z', 791.8902, 'demo'),
  (1042, '2026-02-27T18:00:00.000Z', 283.654, 0.1135, '2026-02-26T18:00:00.000Z', 293.6065, 'demo'),
  (1042, '2026-08-26T18:00:00.000Z', 273.1937, 0.1093, '2026-08-25T18:00:00.000Z', 276.2831, 'demo'),
  (1042, '2026-10-01T15:30:00.000Z', 208.6095, 0.0834, '2026-09-30T15:30:00.000Z', 205.3481, 'demo'),
  (1042, '2026-01-30T18:00:00.000Z', 234.621, 0.0938, '2026-01-29T18:00:00.000Z', 227.0223, 'demo')
on conflict (pro_id, at) do nothing;

-- ============================================================
-- next round (internal): picks a price nobody has seen for the longest time, hides the answer
-- ============================================================
create or replace function public.price_next_round(p_room_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_room rooms;
  v_b price_bank;
  v_a price_assets;
  v_min int;
  v_prev int;
begin
  select * into v_room from rooms where id = p_room_id;
  if v_room.round_number >= coalesce(v_room.price_total, 10) then
    perform price_finish(p_room_id);
    return;
  end if;

  v_prev := (v_room.price_round->>'pro_id')::int;
  select min(b.times_dealt) into v_min
  from price_bank b join price_assets a on a.pro_id = b.pro_id where b.active and a.active;

  -- a random one among the least dealt, avoiding the same asset twice in a row
  select b.* into v_b
  from price_bank b join price_assets a on a.pro_id = b.pro_id
  where b.active and a.active and b.times_dealt = v_min and b.pro_id is distinct from v_prev
  order by random() limit 1
  for update of b skip locked;
  if v_b.id is null then
    select b.* into v_b
    from price_bank b join price_assets a on a.pro_id = b.pro_id
    where b.active and a.active
    order by b.times_dealt, random() limit 1;
  end if;
  if v_b.id is null then raise exception 'No prices available'; end if;

  select * into v_a from price_assets where pro_id = v_b.pro_id;
  update price_bank set times_dealt = times_dealt + 1 where id = v_b.id;

  insert into price_secrets (room_id, bank_id, answer, confidence, scale_pct)
  values (p_room_id, v_b.id, v_b.price, v_b.confidence, v_a.scale_pct)
  on conflict (room_id) do update
    set bank_id = excluded.bank_id, answer = excluded.answer,
        confidence = excluded.confidence, scale_pct = excluded.scale_pct;

  update players set price_guessed_round = null where room_id = p_room_id;
  update rooms
  set round_number = round_number + 1,
      price_phase = 'guess',
      price_reveal = null,
      price_round = jsonb_build_object(
        'pro_id', v_a.pro_id, 'label', v_a.label, 'kind', v_a.kind, 'decimals', v_a.decimals, 'quote', v_a.quote,
        'at', v_b.at, 'ref_at', v_b.ref_at, 'ref_price', v_b.ref_price, 'demo', v_b.source = 'demo'),
      round_started_at = now(),
      question_expires_at = now() + interval '20 seconds'
  where id = p_room_id;
end;
$function$;

-- ============================================================
-- reveal (internal): points for everybody, the answer goes public, the worst guess "gets rugged"
-- ============================================================
create or replace function public.price_reveal(p_room_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_room rooms;
  v_s price_secrets;
  v_list jsonb;
  v_worst uuid;
begin
  select * into v_room from rooms where id = p_room_id;
  select * into v_s from price_secrets where room_id = p_room_id;

  create temp table if not exists price_tmp (player_id uuid, nickname text, guess numeric, err_pct numeric, perfect boolean, points int) on commit drop;
  delete from price_tmp;
  insert into price_tmp
  select p.id, p.nickname, g.guess,
         case when g.guess is null then null else abs(g.guess - v_s.answer) / v_s.answer * 100 end,
         g.guess is not null and abs(g.guess - v_s.answer) <= greatest(v_s.confidence, v_s.answer * 0.0001),
         0
  from players p
  left join price_guesses g on g.room_id = p_room_id and g.round = v_room.round_number and g.player_id = p.id
  where p.room_id = p_room_id;

  update price_tmp set points = case
    when guess is null then 0
    when perfect then 1500
    else round(1000 * greatest(0, 1 - err_pct / v_s.scale_pct))::int end;

  update players p set score = p.score + t.points from price_tmp t where p.id = t.player_id;

  -- the furthest guess (only when at least 2 people guessed)
  if (select count(*) from price_tmp where guess is not null) >= 2 then
    select player_id into v_worst from price_tmp where guess is not null order by err_pct desc limit 1;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'player_id', player_id, 'nickname', nickname, 'guess', guess,
           'err_pct', round(err_pct, 3), 'perfect', perfect, 'points', points)
         order by err_pct asc nulls last), '[]'::jsonb)
    into v_list from price_tmp;

  update rooms
  set price_phase = 'reveal',
      price_reveal = jsonb_build_object('round', v_room.round_number, 'answer', v_s.answer,
                                        'confidence', v_s.confidence, 'worst', v_worst, 'guesses', v_list),
      question_expires_at = now() + interval '9 seconds',
      last_victim_id = coalesce(v_worst, last_victim_id),
      last_event_at = case when v_worst is not null then now() else last_event_at end
  where id = p_room_id;
end;
$function$;

-- ============================================================
-- end of the match (internal): places by points (1st, 2nd, 3rd... for the podium)
-- ============================================================
create or replace function public.price_finish(p_room_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  with r as (
    select id, row_number() over (order by score desc, joined_at) as rk
    from players where room_id = p_room_id
  )
  update players p set place = r.rk from r where p.id = r.id;

  update rooms
  set status = 'finished',
      winner_id = (select id from players where room_id = p_room_id and place = 1 limit 1),
      price_phase = null,
      question_expires_at = null
  where id = p_room_id;
end;
$function$;

-- ============================================================
-- start (host only)
-- ============================================================
create or replace function public.price_start_game(p_room_id uuid, p_rounds int default 10)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_room rooms;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select * into v_room from rooms where id = p_room_id for update;
  if v_room.id is null then raise exception 'Room not found'; end if;
  if v_room.mode is distinct from 'price' then raise exception 'This is not a Guess the Price room'; end if;
  if v_room.host_user_id is distinct from auth.uid() then raise exception 'Only the host can start the game'; end if;
  if v_room.status = 'playing' then raise exception 'Game already running'; end if;
  if not exists (select 1 from price_bank where active) then raise exception 'No prices available yet'; end if;

  update players set score = 0, place = null, alive = true, price_guessed_round = null where room_id = p_room_id;
  delete from price_guesses where room_id = p_room_id;
  update rooms
  set status = 'playing', winner_id = null, last_victim_id = null, round_number = 0,
      price_total = greatest(3, least(20, coalesce(p_rounds, 10))),
      price_phase = null, price_round = null, price_reveal = null,
      bomb_holder_id = null, current_question_text = null
  where id = p_room_id;

  perform price_next_round(p_room_id);
end;
$function$;

-- ============================================================
-- guess (can be changed until the time runs out; when everybody here guessed, reveals right away)
-- ============================================================
create or replace function public.price_submit_guess(p_room_id uuid, p_guess numeric)
 returns text
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_room rooms;
  v_me uuid;
  v_here int;
  v_done int;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if p_guess is null or p_guess <= 0 or p_guess > 1000000000000 then raise exception 'Type a valid price'; end if;

  select * into v_room from rooms where id = p_room_id for update;
  if v_room.id is null or v_room.mode is distinct from 'price' or v_room.status <> 'playing'
     or v_room.price_phase is distinct from 'guess' then
    return 'closed';
  end if;
  if now() > v_room.question_expires_at + interval '600 milliseconds' then return 'late'; end if;

  select id into v_me from players where room_id = p_room_id and user_id = auth.uid();
  if v_me is null then raise exception 'You are not in this room'; end if;

  insert into price_guesses (room_id, round, player_id, guess)
  values (p_room_id, v_room.round_number, v_me, p_guess)
  on conflict (room_id, round, player_id) do update set guess = excluded.guess, updated_at = now();
  update players set price_guessed_round = v_room.round_number, last_seen = now() where id = v_me;

  select count(*) filter (where last_seen > now() - interval '45 seconds'),
         count(*) filter (where last_seen > now() - interval '45 seconds' and price_guessed_round = v_room.round_number)
    into v_here, v_done
  from players where room_id = p_room_id;
  if v_here > 0 and v_done >= v_here then perform price_reveal(p_room_id); end if;
  return 'ok';
end;
$function$;

-- ============================================================
-- tick: every player's browser calls it once a second; it moves the match forward on time
-- ============================================================
create or replace function public.price_tick(p_room_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_room rooms;
begin
  select * into v_room from rooms where id = p_room_id for update;
  if v_room.id is null or v_room.mode is distinct from 'price' or v_room.status <> 'playing' then return; end if;
  if v_room.price_phase = 'guess' and now() >= v_room.question_expires_at + interval '600 milliseconds' then
    perform price_reveal(p_room_id);
  elsif v_room.price_phase = 'reveal' and now() >= v_room.question_expires_at then
    perform price_next_round(p_room_id);
  end if;
end;
$function$;

revoke execute on function public.price_next_round(uuid) from public, anon, authenticated;
revoke execute on function public.price_reveal(uuid) from public, anon, authenticated;
revoke execute on function public.price_finish(uuid) from public, anon, authenticated;

-- check: rooms_have_mode true, assets 16, demo_prices 64
select
  exists (select 1 from information_schema.columns where table_name = 'rooms' and column_name = 'mode') as rooms_have_mode,
  (select count(*) from public.price_assets) as assets,
  (select count(*) from public.price_bank where source = 'demo') as demo_prices;
