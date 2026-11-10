-- ============================================================
-- K02 — Pyth Poker: shuffle with Pyth Entropy (commit-reveal), checkable by anyone.
-- Run AFTER K01. Safe to run more than once.
--
-- How it works (same model as the Pyth Bomb PVP):
--  1. The game server on Railway draws a SECRET (32 bytes) and sends only its fingerprint
--     commit = sha256(secret) to our contract on Base, together with the request to Pyth Entropy.
--     The commit is recorded on-chain BEFORE the random number exists.
--  2. Pyth Entropy answers with a random number. The server saves (secret, commit, random, sequence)
--     in poker_draws. That table is hidden: nobody reads it from the browser.
--  3. Each new hand takes one ready draw:  seed = sha256(secret || random).
--     Deck = Fisher-Yates with sha256(seed || index) (index written as text: '51', '50', ... '1').
--  4. When the hand ENDS, the proof (secret, seed, commit, random, sequence, contract) goes into
--     rooms.poker_result.fair, so anyone can check sha256(secret) = commit on the contract and rebuild the deck.
--  If no draw is ready (Entropy off or slow), the hand uses a normal server shuffle and is marked
--  "server" (not Entropy), so the table never stops.
--
-- At the end the check returns ONE row; every column must be true.
-- ============================================================

-- the ready draws (filled by the Railway server with the service key; hidden from players)
create table if not exists public.poker_draws (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  chain text not null,           -- 'base-sepolia' or 'base'
  chain_name text,
  contract text not null,        -- our PythBombDraw contract
  explorer text,                 -- https://sepolia.basescan.org ...
  sequence text not null,        -- Entropy request number
  tx text,                       -- transaction of the request
  commit bytea not null,         -- sha256(secret), recorded on-chain
  random bytea not null,         -- number from Pyth Entropy
  secret bytea not null,         -- revealed only after the hand ends
  used_room uuid,
  used_hand int,
  used_at timestamptz,
  unique (chain, contract, sequence)
);
alter table public.poker_draws enable row level security;  -- no policies: the browser can't read it
revoke all on table public.poker_draws from anon, authenticated;
create index if not exists poker_draws_free on public.poker_draws (id) where used_at is null;

-- proof of each hand (hidden until the hand ends, like the deck)
alter table public.poker_hands add column if not exists proof jsonb;

-- ============================================================
-- the shuffle: Fisher-Yates. For i = 51 down to 1:
--   j = (first 4 bytes of sha256(seed || text(i)), as a number) mod (i + 1); swap cards i and j.
-- Same seed = same deck (the Verify screen does the same thing in the browser).
-- ============================================================
create or replace function public.poker_deck_from_seed(p_seed bytea)
 returns smallint[]
 language plpgsql
 immutable
as $function$
declare
  d smallint[] := array(select g::smallint from generate_series(0, 51) as g);
  h bytea;
  i int;
  j int;
  t smallint;
begin
  for i in reverse 51..1 loop
    h := sha256(p_seed || convert_to(i::text, 'UTF8'));
    j := (((get_byte(h, 0)::bigint << 24) | (get_byte(h, 1)::bigint << 16)
          | (get_byte(h, 2)::bigint << 8) | get_byte(h, 3)::bigint) % (i + 1))::int;
    t := d[i + 1]; d[i + 1] := d[j + 1]; d[j + 1] := t;
  end loop;
  return d;
end;
$function$;

-- THE place where the seed comes from: a ready Entropy draw, or the server shuffle if none is ready.
-- It also saves the proof of the hand (hidden in poker_hands until the hand ends).
create or replace function public.poker_new_seed(p_room_id uuid, p_hand_no int)
 returns bytea
 language plpgsql
 volatile
 security definer
 set search_path to 'public', 'extensions'
as $function$
declare
  d public.poker_draws;
  v_seed bytea;
  v_proof jsonb;
  v_n int;
begin
  -- how many players get cards (they were already marked "in hand" before the shuffle)
  select count(*) into v_n from players where room_id = p_room_id and poker_in_hand;

  select * into d from poker_draws where used_at is null order by id limit 1 for update skip locked;
  if found then
    update poker_draws set used_room = p_room_id, used_hand = p_hand_no, used_at = now() where id = d.id;
    v_seed := sha256(d.secret || d.random);
    v_proof := jsonb_build_object(
      'via', 'entropy', 'chain', d.chain, 'chain_name', d.chain_name, 'contract', d.contract,
      'explorer', d.explorer, 'sequence', d.sequence, 'tx', d.tx,
      'commit', '0x' || encode(d.commit, 'hex'), 'random', '0x' || encode(d.random, 'hex'),
      'secret', '0x' || encode(d.secret, 'hex'), 'seed', '0x' || encode(v_seed, 'hex'), 'dealt', v_n);
  else
    v_seed := extensions.gen_random_bytes(32);
    v_proof := jsonb_build_object('via', 'server', 'seed', '0x' || encode(v_seed, 'hex'), 'dealt', v_n);
  end if;

  insert into poker_hands (room_id, hand_no, deck_seed, deck, proof)
  values (p_room_id, p_hand_no, v_seed, poker_deck_from_seed(v_seed), v_proof)
  on conflict (room_id, hand_no) do update
    set deck_seed = excluded.deck_seed, deck = excluded.deck, proof = excluded.proof, created_at = now();
  return v_seed;
end;
$function$;
revoke execute on function public.poker_new_seed(uuid, int) from public, anon, authenticated;

-- when a hand ends (street becomes 'result'), the proof is added to the public result as "fair".
-- Never before: the secret/seed show the whole deck.
create or replace function public.poker_reveal_proof()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_proof jsonb;
begin
  if new.poker_street = 'result' and old.poker_street is distinct from 'result' and new.poker_result is not null then
    select proof into v_proof from poker_hands where room_id = new.id and hand_no = new.poker_hand_no;
    if v_proof is not null then
      new.poker_result := new.poker_result || jsonb_build_object('fair', v_proof);
    end if;
  end if;
  return new;
end;
$function$;
revoke execute on function public.poker_reveal_proof() from public, anon, authenticated;

drop trigger if exists poker_reveal_proof on public.rooms;
create trigger poker_reveal_proof
  before update of poker_street on public.rooms
  for each row
  when (new.poker_street = 'result')
  execute function public.poker_reveal_proof();

-- ============================================================
-- final check: ONE row, all true
-- ============================================================
select
  (select relrowsecurity from pg_class where oid = 'public.poker_draws'::regclass) as draws_protected,
  not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'poker_draws') as draws_no_policies,
  not has_table_privilege('anon', 'public.poker_draws', 'select')
    and not has_table_privilege('authenticated', 'public.poker_draws', 'select') as draws_hidden,
  exists (select 1 from information_schema.columns
          where table_schema = 'public' and table_name = 'poker_hands' and column_name = 'proof') as proof_ready,
  exists (select 1 from pg_trigger where tgname = 'poker_reveal_proof' and not tgisinternal) as reveal_ready,
  -- the shuffle is a real deck (52 different cards) and the same seed always gives the same deck
  (select count(distinct c) = 52 from unnest(public.poker_deck_from_seed(sha256('pyth'::bytea))) as c)
    and public.poker_deck_from_seed(sha256('pyth'::bytea)) = public.poker_deck_from_seed(sha256('pyth'::bytea)) as shuffle_ok;
