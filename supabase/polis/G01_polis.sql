-- PYTH POLIS (working name) · step G01: accounts, the village, the 4 resource fields and the collection cycles
-- Run in Supabase SQL Editor. Safe to run more than once (it never deletes players' villages).
--
-- A slow Greek village game for the Pyth community (Halls, 2026-11-23):
--  · login with USERNAME + PASSWORD (our own table: the password is stored as a bcrypt hash, nobody can read it).
--    Every browser already has an anonymous Supabase badge; logging in ties that badge to the account.
--  · 4 resources: grain, wood, marble, bronze. Each has a field. The player picks how long the field works:
--    30 min, 1 h, 6 h, 12 h or 24 h. Short cycles give a bit more per hour (for who plays often), long ones keep
--    producing while you are away. When the cycle ends the harvest waits for you to COLLECT it.
--  · the warehouse limits how much of each resource you can keep; a harvest that doesn't fit stays in the field.
--  · upgrades (fields and warehouse) cost resources and take time; one construction at a time.
--  · everything is calculated from timestamps when someone asks (no clock ticking every second).
-- Nobody reads these tables from the browser: everything goes through the polis_* functions below.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.polis_accounts (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,          -- always lowercase
  display_name text not null,             -- as the player typed it
  pass_hash text not null,                -- bcrypt
  created_at timestamptz not null default now(),
  last_login timestamptz,
  fails int not null default 0,           -- wrong passwords in a row
  locked_until timestamptz                -- 5 wrong passwords = wait 1 minute
);

-- which anonymous browser badge is logged into which account (one account can be open on several devices)
create table if not exists public.polis_sessions (
  user_id uuid primary key,
  account_id uuid not null references public.polis_accounts(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.polis_villages (
  account_id uuid primary key references public.polis_accounts(id) on delete cascade,
  name text not null,
  grain numeric not null default 500,
  wood numeric not null default 500,
  marble numeric not null default 500,
  bronze numeric not null default 500,
  warehouse int not null default 1,
  build_kind text,                        -- what is being built right now (null = builders free)
  build_level int,                        -- the level it will reach
  build_until timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.polis_fields (
  account_id uuid not null references public.polis_accounts(id) on delete cascade,
  kind text not null check (kind in ('grain', 'wood', 'marble', 'bronze')),
  level int not null default 1,
  cycle_secs int,                         -- the cycle that is running or waiting to be collected
  started_at timestamptz,
  ends_at timestamptz,
  harvest numeric not null default 0,     -- what the running/finished cycle gives (locked when it starts)
  primary key (account_id, kind)
);

alter table public.polis_accounts enable row level security;
alter table public.polis_sessions enable row level security;
alter table public.polis_villages enable row level security;
alter table public.polis_fields enable row level security;
revoke all on table public.polis_accounts, public.polis_sessions, public.polis_villages, public.polis_fields from anon, authenticated;

-- ---------------------------------------------------------------- rules (numbers to tune later)
-- the game's clock (one place, so tests can move time)
create or replace function public.polis_now() returns timestamptz language sql stable as $$ select now() $$;

-- production per hour of a field at a level
create or replace function public.polis_rate(p_level int) returns numeric language sql immutable as $$
  select round(40 * power(1.35, greatest(1, p_level) - 1))
$$;

-- cycles: seconds -> bonus per hour (short cycles pay a bit more per hour)
create or replace function public.polis_cycle_mult(p_secs int) returns numeric language sql immutable as $$
  select case p_secs when 1800 then 2.6 when 3600 then 2.3 when 21600 then 1.6 when 43200 then 1.25 when 86400 then 1.0 else null end
$$;

-- warehouse: how much of EACH resource fits
create or replace function public.polis_capacity(p_level int) returns numeric language sql immutable as $$
  select round(1200 * power(1.5, greatest(1, p_level) - 1))
$$;

-- cost to reach a level: jsonb {grain, wood, marble, bronze, secs}
create or replace function public.polis_cost(p_kind text, p_to int) returns jsonb language plpgsql immutable as $$
declare
  f numeric := power(1.6, greatest(2, p_to) - 2);
  b jsonb;
begin
  b := case p_kind
    when 'grain'     then '{"grain": 20, "wood": 70, "marble": 50, "bronze": 20}'
    when 'wood'      then '{"grain": 40, "wood": 30, "marble": 60, "bronze": 30}'
    when 'marble'    then '{"grain": 40, "wood": 70, "marble": 20, "bronze": 40}'
    when 'bronze'    then '{"grain": 50, "wood": 60, "marble": 60, "bronze": 10}'
    when 'warehouse' then '{"grain": 30, "wood": 90, "marble": 110, "bronze": 40}'
  end::jsonb;
  return jsonb_build_object(
    'grain', round((b->>'grain')::numeric * f), 'wood', round((b->>'wood')::numeric * f),
    'marble', round((b->>'marble')::numeric * f), 'bronze', round((b->>'bronze')::numeric * f),
    'secs', round(120 * power(1.7, greatest(2, p_to) - 2)));
end;
$$;

-- ---------------------------------------------------------------- helpers
-- the account of whoever is calling (null = not logged in)
create or replace function public.polis_me() returns uuid language sql stable security definer set search_path to 'public' as $$
  select account_id from polis_sessions where user_id = auth.uid()
$$;

-- finishes a construction whose time is up (called before reading or changing the village)
create or replace function public.polis_settle(p_account uuid) returns void language plpgsql security definer set search_path to 'public' as $$
declare v polis_villages;
begin
  select * into v from polis_villages where account_id = p_account for update;
  if v.build_kind is null or v.build_until > polis_now() then return; end if;
  if v.build_kind = 'warehouse' then
    update polis_villages set warehouse = v.build_level where account_id = p_account;
  else
    update polis_fields set level = v.build_level where account_id = p_account and kind = v.build_kind;
  end if;
  update polis_villages set build_kind = null, build_level = null, build_until = null where account_id = p_account;
end;
$$;

-- everything the screen needs, in one go
create or replace function public.polis_state() returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  me uuid := polis_me();
  a polis_accounts;
  v polis_villages;
  fields jsonb;
begin
  if me is null then return jsonb_build_object('logged_in', false, 'now', polis_now()); end if;
  perform polis_settle(me);
  select * into a from polis_accounts where id = me;
  select * into v from polis_villages where account_id = me;
  select jsonb_agg(jsonb_build_object(
      'kind', f.kind, 'level', f.level, 'rate', polis_rate(f.level),
      'cycle_secs', f.cycle_secs, 'started_at', f.started_at, 'ends_at', f.ends_at, 'harvest', f.harvest,
      'next', case when f.level < 10 then polis_cost(f.kind, f.level + 1) end,
      'next_rate', case when f.level < 10 then polis_rate(f.level + 1) end)
    order by array_position(array['grain', 'wood', 'marble', 'bronze'], f.kind))
  into fields from polis_fields f where f.account_id = me;
  return jsonb_build_object(
    'logged_in', true, 'now', polis_now(),
    'user', a.display_name,
    'village', jsonb_build_object(
      'name', v.name, 'grain', floor(v.grain), 'wood', floor(v.wood), 'marble', floor(v.marble), 'bronze', floor(v.bronze),
      'warehouse', v.warehouse, 'capacity', polis_capacity(v.warehouse),
      'warehouse_next', case when v.warehouse < 10 then polis_cost('warehouse', v.warehouse + 1) end,
      'capacity_next', case when v.warehouse < 10 then polis_capacity(v.warehouse + 1) end,
      'build_kind', v.build_kind, 'build_level', v.build_level, 'build_until', v.build_until),
    'fields', fields,
    'cycles', jsonb_build_array(
      jsonb_build_object('secs', 1800, 'mult', polis_cycle_mult(1800)), jsonb_build_object('secs', 3600, 'mult', polis_cycle_mult(3600)),
      jsonb_build_object('secs', 21600, 'mult', polis_cycle_mult(21600)), jsonb_build_object('secs', 43200, 'mult', polis_cycle_mult(43200)),
      jsonb_build_object('secs', 86400, 'mult', polis_cycle_mult(86400))));
end;
$$;

-- ---------------------------------------------------------------- account
create or replace function public.polis_register(p_username text, p_password text, p_village text)
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
  if exists (select 1 from polis_accounts where username = u) then raise exception 'This username is taken'; end if;
  insert into polis_accounts (username, display_name, pass_hash, last_login)
  values (u, trim(p_username), crypt(p_password, gen_salt('bf', 8)), polis_now()) returning id into acc;
  insert into polis_villages (account_id, name) values (acc, vname);
  insert into polis_fields (account_id, kind) select acc, k from unnest(array['grain', 'wood', 'marble', 'bronze']) k;
  insert into polis_sessions (user_id, account_id) values (auth.uid(), acc)
  on conflict (user_id) do update set account_id = excluded.account_id, created_at = now();
  return polis_state();
end;
$$;

create or replace function public.polis_login(p_username text, p_password text)
returns jsonb language plpgsql security definer set search_path to 'public', 'extensions' as $$
declare a polis_accounts;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  -- (wrong password RETURNS an error instead of raising one: raising would undo the counter of wrong tries)
  select * into a from polis_accounts where username = lower(trim(coalesce(p_username, ''))) for update;
  if a.id is null then return jsonb_build_object('logged_in', false, 'error', 'Wrong username or password'); end if;
  if a.locked_until is not null and a.locked_until > polis_now() then
    return jsonb_build_object('logged_in', false, 'error', 'Too many tries. Wait a minute and try again');
  end if;
  if a.pass_hash <> crypt(coalesce(p_password, ''), a.pass_hash) then
    update polis_accounts set fails = case when fails + 1 >= 5 then 0 else fails + 1 end,
      locked_until = case when fails + 1 >= 5 then polis_now() + interval '1 minute' else null end
    where id = a.id;
    return jsonb_build_object('logged_in', false, 'error', 'Wrong username or password');
  end if;
  update polis_accounts set fails = 0, locked_until = null, last_login = polis_now() where id = a.id;
  insert into polis_sessions (user_id, account_id) values (auth.uid(), a.id)
  on conflict (user_id) do update set account_id = excluded.account_id, created_at = now();
  return polis_state();
end;
$$;

create or replace function public.polis_logout() returns jsonb language plpgsql security definer set search_path to 'public' as $$
begin
  delete from polis_sessions where user_id = auth.uid();
  return jsonb_build_object('logged_in', false, 'now', polis_now());
end;
$$;

-- ---------------------------------------------------------------- playing
-- start a cycle on a field (it must be empty: nothing running and nothing waiting to be collected)
create or replace function public.polis_start(p_kind text, p_secs int) returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  me uuid := polis_me();
  f polis_fields;
  m numeric := polis_cycle_mult(p_secs);
begin
  if me is null then raise exception 'Log in first'; end if;
  if m is null then raise exception 'Pick a cycle: 30 min, 1 h, 6 h, 12 h or 24 h'; end if;
  perform polis_settle(me);
  select * into f from polis_fields where account_id = me and kind = p_kind for update;
  if f.kind is null then raise exception 'Unknown field'; end if;
  if f.started_at is not null then raise exception 'This field is already working'; end if;
  update polis_fields set cycle_secs = p_secs, started_at = polis_now(), ends_at = polis_now() + p_secs * interval '1 second',
    harvest = round(polis_rate(f.level) * (p_secs / 3600.0) * m)
  where account_id = me and kind = p_kind;
  return polis_state();
end;
$$;

-- collect a finished harvest into the warehouse (what doesn't fit stays in the field)
create or replace function public.polis_collect(p_kind text) returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  me uuid := polis_me();
  f polis_fields;
  v polis_villages;
  have numeric;
  room numeric;
  moved numeric;
begin
  if me is null then raise exception 'Log in first'; end if;
  perform polis_settle(me);
  select * into f from polis_fields where account_id = me and kind = p_kind for update;
  if f.kind is null then raise exception 'Unknown field'; end if;
  if f.started_at is null then raise exception 'Nothing to collect here'; end if;
  if f.ends_at > polis_now() then raise exception 'Not ready yet'; end if;
  select * into v from polis_villages where account_id = me for update;
  have := case p_kind when 'grain' then v.grain when 'wood' then v.wood when 'marble' then v.marble else v.bronze end;
  room := greatest(0, polis_capacity(v.warehouse) - have);
  moved := least(room, f.harvest);
  if moved <= 0 then raise exception 'Your warehouse is full. Spend some or upgrade it'; end if;
  update polis_villages set
    grain = grain + case when p_kind = 'grain' then moved else 0 end,
    wood = wood + case when p_kind = 'wood' then moved else 0 end,
    marble = marble + case when p_kind = 'marble' then moved else 0 end,
    bronze = bronze + case when p_kind = 'bronze' then moved else 0 end
  where account_id = me;
  if f.harvest - moved > 0 then
    update polis_fields set harvest = f.harvest - moved where account_id = me and kind = p_kind; -- the rest waits
  else
    update polis_fields set cycle_secs = null, started_at = null, ends_at = null, harvest = 0 where account_id = me and kind = p_kind;
  end if;
  return polis_state() || jsonb_build_object('collected', jsonb_build_object('kind', p_kind, 'amount', moved, 'left', f.harvest - moved));
end;
$$;

-- upgrade a field or the warehouse (pays now, finishes later; one construction at a time)
create or replace function public.polis_upgrade(p_kind text) returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  me uuid := polis_me();
  v polis_villages;
  lvl int;
  c jsonb;
begin
  if me is null then raise exception 'Log in first'; end if;
  if p_kind not in ('grain', 'wood', 'marble', 'bronze', 'warehouse') then raise exception 'Unknown building'; end if;
  perform polis_settle(me);
  select * into v from polis_villages where account_id = me for update;
  if v.build_kind is not null then raise exception 'Your builders are busy. Wait for the current construction'; end if;
  lvl := case when p_kind = 'warehouse' then v.warehouse else (select level from polis_fields where account_id = me and kind = p_kind) end;
  if lvl >= 10 then raise exception 'Already at the top level'; end if;
  c := polis_cost(p_kind, lvl + 1);
  if v.grain < (c->>'grain')::numeric or v.wood < (c->>'wood')::numeric or v.marble < (c->>'marble')::numeric or v.bronze < (c->>'bronze')::numeric then
    raise exception 'Not enough resources';
  end if;
  update polis_villages set
    grain = grain - (c->>'grain')::numeric, wood = wood - (c->>'wood')::numeric,
    marble = marble - (c->>'marble')::numeric, bronze = bronze - (c->>'bronze')::numeric,
    build_kind = p_kind, build_level = lvl + 1, build_until = polis_now() + (c->>'secs')::numeric * interval '1 second'
  where account_id = me;
  return polis_state();
end;
$$;

-- who may call what: the browser only gets the polis_* game functions
revoke execute on function public.polis_settle(uuid) from public, anon, authenticated;
revoke execute on function public.polis_me() from public, anon, authenticated;
grant execute on function public.polis_state(), public.polis_register(text, text, text), public.polis_login(text, text),
  public.polis_logout(), public.polis_start(text, int), public.polis_collect(text), public.polis_upgrade(text) to authenticated;

-- check: should say true, true, true
select
  exists (select 1 from information_schema.tables where table_name = 'polis_fields') as tables_ready,
  (select relrowsecurity from pg_class where oid = 'public.polis_accounts'::regclass) as accounts_protected,
  has_function_privilege('authenticated', 'public.polis_login(text, text)', 'execute') as login_ready;
