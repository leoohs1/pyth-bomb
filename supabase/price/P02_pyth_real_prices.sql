-- PYTH BOMB · GUESS THE PRICE — step P02: fetch REAL past prices from Pyth
-- Run in Supabase SQL Editor AFTER P01, and only AFTER the Pyth API key is saved in Vault:
--   Supabase dashboard -> Project -> Vault (Integrations -> Vault) -> "Add new secret"
--   Name: pyth_api_key    Secret: the key from Pyth Terminal ("View your API key")
-- (Do not paste the key in a chat or in a file of the project.)
-- Safe to run more than once.
--
-- Everything here lives in the schema price_private, which the website/players can NOT call:
-- nobody can read the key or spend the Pyth trial by calling these functions from the browser.
--
-- After running this file:
--   1) select price_private.probe();          -- tests the key with Bitcoin (shows Pyth's raw answer)
--   2) select price_private.fill(15);         -- fetches 15 real rounds (run it several times)
-- With 30+ real prices, the DEMO prices are turned off automatically.

create extension if not exists http with schema extensions;
create schema if not exists price_private;
revoke all on schema price_private from public, anon, authenticated;

-- the key, read from Supabase Vault
create or replace function price_private.api_key()
 returns text
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select decrypted_secret from vault.decrypted_secrets where name = 'pyth_api_key' limit 1
$function$;

-- one call to the Pyth History API: price of one feed at one moment
-- (GET https://pyth.dourolabs.app/v1/fixed_rate@200ms/price?ids=<id>&timestamp=<microseconds>)
create or replace function price_private.api_get(p_pro_id int, p_at timestamptz)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $function$
declare
  v_key text := price_private.api_key();
  v_url text;
  v_status int;
  v_content text;
begin
  if v_key is null then raise exception 'Save the Pyth API key in Vault first (name: pyth_api_key)'; end if;
  v_url := format('https://pyth.dourolabs.app/v1/fixed_rate@200ms/price?ids=%s&timestamp=%s',
                  p_pro_id, (extract(epoch from p_at) * 1000000)::bigint);
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '15000');
  select status, content into v_status, v_content
  from extensions.http((
    'GET', v_url,
    array[extensions.http_header('Authorization', 'Bearer ' || v_key)],
    null, null)::extensions.http_request);
  return jsonb_build_object(
    'status', v_status,
    'body', case when v_content ~ '^\s*[\[{]' then v_content::jsonb else to_jsonb(left(v_content, 500)) end);
end;
$function$;

-- reads the price out of Pyth's answer (accepts a few shapes: array, object, nested;
-- price as text or number, with or without the exponent applied)
create or replace function price_private.parse(p_body jsonb, p_exponent int)
 returns jsonb
 language plpgsql
 immutable
as $function$
declare
  v_obj jsonb;
  v_exp int;
  v_txt text;
  v_price numeric;
  v_conf numeric;
begin
  if p_body is null or jsonb_typeof(p_body) not in ('object', 'array') then return null; end if;
  v_obj := jsonb_path_query_first(p_body,
    '$.** ? (exists (@.price) && (@.price.type() == "string" || @.price.type() == "number"))');
  if v_obj is null then return null; end if;
  v_exp := coalesce((v_obj->>'exponent')::int, (v_obj->>'expo')::int, p_exponent);

  v_txt := v_obj->>'price';
  if v_txt is null or v_txt = '' then return null; end if;
  v_price := case when v_txt like '%.%' then v_txt::numeric else v_txt::numeric * power(10::numeric, v_exp) end;

  v_txt := coalesce(v_obj->>'confidence', v_obj->>'conf');
  v_conf := case when v_txt is null or v_txt = '' then 0
                 when v_txt like '%.%' then v_txt::numeric
                 else v_txt::numeric * power(10::numeric, v_exp) end;

  return jsonb_build_object('price', v_price, 'confidence', v_conf,
    'session', coalesce(v_obj->>'market_session', v_obj->>'marketSession'),
    'publish_time', v_obj->'publish_time');
end;
$function$;

-- a random past moment when the market was open:
-- crypto any time; stocks, gold and currencies Tue-Fri between 10:00 and 15:30 New York time
-- (Tue-Fri so that "24 hours before" is also a weekday)
create or replace function price_private.pick_time(p_hours text)
 returns timestamptz
 language plpgsql
 volatile
as $function$
declare
  d date;
begin
  if p_hours = '24/7' then
    return date_trunc('hour', now() - interval '2 days' - (random() * 360) * interval '1 day')
           + case when random() < 0.5 then interval '30 minutes' else interval '0' end;
  end if;
  loop
    d := (now() at time zone 'America/New_York')::date - (3 + floor(random() * 360))::int;
    exit when extract(isodow from d) between 2 and 5;
  end loop;
  return (d + time '10:00' + floor(random() * 12) * interval '30 minutes') at time zone 'America/New_York';
end;
$function$;

-- step 1: test the key with Bitcoin, 3 days ago at 15:00 UTC (shows Pyth's raw answer + what we read)
create or replace function price_private.probe()
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_at timestamptz := date_trunc('day', now()) - interval '3 days' + interval '15 hours';
  v_r jsonb;
begin
  v_r := price_private.api_get(1, v_at);
  return jsonb_build_object('asked_for', v_at, 'http_status', v_r->'status',
    'we_read', price_private.parse(v_r->'body', -8), 'pyth_answer', v_r->'body');
end;
$function$;

-- step 2: fetch p_count real rounds into the price bank (run it several times to get more)
create or replace function price_private.fill(p_count int default 15)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_a price_assets;
  v_at timestamptz;
  v_ref timestamptz;
  v_r1 jsonb; v_r2 jsonb; v_p1 jsonb; v_p2 jsonb;
  v_want int := greatest(1, least(coalesce(p_count, 15), 100));
  v_ins int := 0;
  v_try int := 0;
  v_err text;
  v_n int;
begin
  if price_private.api_key() is null then
    raise exception 'Save the Pyth API key in Vault first (name: pyth_api_key)';
  end if;

  while v_ins < v_want and v_try < v_want * 3 loop
    v_try := v_try + 1;
    select * into v_a from price_assets where active order by random() limit 1;
    v_at := price_private.pick_time(v_a.hours);
    v_ref := v_at - interval '1 day';
    begin
      v_r1 := price_private.api_get(v_a.pro_id, v_at);
      if (v_r1->>'status')::int <> 200 then
        v_err := format('%s at %s: HTTP %s %s', v_a.symbol, v_at, v_r1->>'status', left((v_r1->'body')::text, 200));
        continue;
      end if;
      v_p1 := price_private.parse(v_r1->'body', v_a.exponent);
      if v_p1 is null or (v_p1->>'price')::numeric <= 0 then
        v_err := format('%s at %s: no price in the answer', v_a.symbol, v_at);
        continue;
      end if;
      -- stocks: only moments of the normal trading session (skips holidays)
      if v_a.kind = 'stock' and v_p1->>'session' is not null and v_p1->>'session' !~* 'regular' then continue; end if;

      v_r2 := price_private.api_get(v_a.pro_id, v_ref);
      v_p2 := price_private.parse(v_r2->'body', v_a.exponent);
      if v_p2 is null or (v_p2->>'price')::numeric <= 0 then continue; end if;

      insert into price_bank (pro_id, at, price, confidence, ref_at, ref_price, source)
      values (v_a.pro_id, v_at, (v_p1->>'price')::numeric, (v_p1->>'confidence')::numeric,
              v_ref, (v_p2->>'price')::numeric, 'pyth')
      on conflict (pro_id, at) do nothing;
      get diagnostics v_n = row_count;
      v_ins := v_ins + v_n;
    exception when others then
      v_err := format('%s at %s: %s', v_a.symbol, v_at, sqlerrm);
    end;
  end loop;

  -- with enough real prices, the DEMO ones leave the game
  if (select count(*) from price_bank where source = 'pyth' and active) >= 30 then
    update price_bank set active = false where source = 'demo' and active;
  end if;

  return jsonb_build_object('new_real_rounds', v_ins, 'tries', v_try,
    'real_rounds_total', (select count(*) from price_bank where source = 'pyth'),
    'demo_still_on', (select count(*) from price_bank where source = 'demo' and active),
    'last_problem', v_err);
end;
$function$;

revoke all on all functions in schema price_private from public, anon, authenticated;

-- check: all true
select
  exists (select 1 from pg_extension where extname = 'http') as http_ready,
  exists (select 1 from pg_namespace where nspname = 'price_private') as private_schema,
  exists (select 1 from vault.decrypted_secrets where name = 'pyth_api_key') as key_saved;
