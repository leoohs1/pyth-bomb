-- PYTH BOMB · POKER (Texas Hold'em Sit & Go) — step K01: the server
-- Run in Supabase SQL Editor. Safe to run more than once. Does NOT change the other games.
--
-- How a match works:
--   * One room = one small tournament ("Sit & Go") for 2 to 9 players. PLAY CHIPS ONLY:
--     no money, no crypto, no prizes. Chips are not saved after the match.
--   * Everybody starts with the same chips (1500). Blinds start at 25/50 and go up every 5 minutes.
--   * 20 seconds per decision. Time runs out: free CHECK when there is nothing to pay, FOLD when
--     there is a bet to pay. Two time-outs in a row = "away": the server plays check/fold for that
--     player in every hand until they press "I'm back" (poker_back).
--   * A player with no chips is out (watches the rest). Last player with chips wins.
--
-- Where things are:
--   * Public (everybody sees): rooms.poker_* (board, pot sizes, whose turn, blinds...) and
--     players.poker_* (seat, chips, bet, folded...). The browser reads them; only the server writes.
--   * Hidden: poker_hole (the 2 cards of each player: each player can read ONLY their own row),
--     poker_hands (the deck of every hand and the random seed it came from: nobody can read it).
--   * Cards are numbers 0..51: rank = card / 4 (0 = two ... 12 = ace), suit = card % 4
--     (0 clubs, 1 diamonds, 2 hearts, 3 spades).
--
-- The shuffle: every hand gets a fresh 32-byte random seed (pgcrypto, cryptographic randomness);
-- the deck is the 52 cards sorted by sha256(seed + card). The seed is saved in poker_hands.deck_seed,
-- so the deck can be rebuilt and checked later. poker_new_seed() is the ONE place that makes the
-- seed: in phase 2 (Pyth Entropy) only that function changes.
--
-- Settings (change any time, they count from the next match):
--   update public.poker_settings set act_seconds = 30 where id = 1;
--   update public.poker_settings set start_stack = 2000, level_minutes = 6 where id = 1;
-- EMERGENCY: turn the mode off:  update public.mode_switches set enabled = false where mode = 'poker';

create extension if not exists pgcrypto with schema extensions;

-- ============================================================
-- rooms / players (new columns only; "if not exists" keeps it safe)
-- ============================================================
alter table public.rooms add column if not exists mode text not null default 'classic';
alter table public.rooms add column if not exists poker_cfg jsonb;              -- the settings of this match
alter table public.rooms add column if not exists poker_started_at timestamptz; -- blinds clock starts here
alter table public.rooms add column if not exists poker_hand_no int not null default 0;
alter table public.rooms add column if not exists poker_level int;              -- 0 = first blind level
alter table public.rooms add column if not exists poker_sb int;
alter table public.rooms add column if not exists poker_bb int;
alter table public.rooms add column if not exists poker_level_ends_at timestamptz;
alter table public.rooms add column if not exists poker_dealer int;             -- seat of the dealer button
alter table public.rooms add column if not exists poker_sb_seat int;
alter table public.rooms add column if not exists poker_bb_seat int;
alter table public.rooms add column if not exists poker_street text;            -- ready | preflop | flop | turn | river | result | finished
alter table public.rooms add column if not exists poker_board smallint[] not null default '{}';
alter table public.rooms add column if not exists poker_turn uuid;              -- player who must act now
alter table public.rooms add column if not exists poker_turn_seat int;
alter table public.rooms add column if not exists poker_turn_ends_at timestamptz;
alter table public.rooms add column if not exists poker_current_bet int not null default 0; -- highest bet in this street
alter table public.rooms add column if not exists poker_min_raise int not null default 0;   -- size of the last full raise
alter table public.rooms add column if not exists poker_full_bet int not null default 0;    -- bet level after the last FULL raise
alter table public.rooms add column if not exists poker_next_at timestamptz;    -- end of a pause (between streets / hands)
alter table public.rooms add column if not exists poker_last jsonb;             -- last action (for the screen)
alter table public.rooms add column if not exists poker_result jsonb;           -- end of hand: pots, winners, shown cards
alter table public.players add column if not exists score int not null default 0;
alter table public.players add column if not exists place int;
alter table public.players add column if not exists poker_seat int;             -- 0..8
alter table public.players add column if not exists poker_stack int not null default 0;     -- chips behind
alter table public.players add column if not exists poker_bet int not null default 0;       -- chips in front, this street
alter table public.players add column if not exists poker_committed int not null default 0; -- chips put in the pot, this hand
alter table public.players add column if not exists poker_hand_start int not null default 0; -- chips at the start of the hand
alter table public.players add column if not exists poker_in_hand boolean not null default false;
alter table public.players add column if not exists poker_folded boolean not null default false;
alter table public.players add column if not exists poker_allin boolean not null default false;
alter table public.players add column if not exists poker_acted boolean not null default false;
alter table public.players add column if not exists poker_acted_level int not null default -1;
alter table public.players add column if not exists poker_away boolean not null default false;
alter table public.players add column if not exists poker_timeouts int not null default 0;
alter table public.players add column if not exists poker_out boolean not null default false;
alter table public.players add column if not exists poker_action text;          -- label over the seat: Check, Call, Raise...
alter table public.players add column if not exists poker_score int;            -- hand strength, only at showdown
alter table public.players add column if not exists poker_won int not null default 0;       -- chips won in the last hand

-- ============================================================
-- on/off switch + settings (hidden from the browser: RLS on, no policies)
-- ============================================================
create table if not exists public.mode_switches (
  mode text primary key,
  enabled boolean not null default true,
  note text
);
alter table public.mode_switches enable row level security;
insert into public.mode_switches (mode, enabled) values ('poker', true) on conflict (mode) do nothing;

create table if not exists public.poker_settings (
  id int primary key default 1 check (id = 1),
  start_stack int not null default 1500,
  level_minutes numeric not null default 5,
  act_seconds int not null default 20,
  max_players int not null default 9 check (max_players between 2 and 9),
  -- after the last level the blinds keep doubling
  blinds jsonb not null default '[[25,50],[50,100],[75,150],[100,200],[150,300],[200,400],[300,600],[400,800],[500,1000],[600,1200],[800,1600],[1000,2000],[1500,3000],[2000,4000],[3000,6000],[4000,8000],[5000,10000]]'
);
alter table public.poker_settings enable row level security;
insert into public.poker_settings (id) values (1) on conflict (id) do nothing;

-- ============================================================
-- hidden cards
-- ============================================================
create table if not exists public.poker_hands (
  room_id uuid not null references public.rooms(id) on delete cascade,
  hand_no int not null,
  deck_seed bytea not null,        -- the random seed of this hand (phase 2: comes from Pyth Entropy)
  deck smallint[] not null,        -- the deck made from the seed
  created_at timestamptz not null default now(),
  primary key (room_id, hand_no)
);
alter table public.poker_hands enable row level security;  -- no policies: nobody reads it from the browser

create table if not exists public.poker_hole (
  room_id uuid not null references public.rooms(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  hand_no int not null,
  cards smallint[] not null,
  primary key (room_id, player_id)
);
alter table public.poker_hole enable row level security;
drop policy if exists "read my own cards" on public.poker_hole;
create policy "read my own cards" on public.poker_hole
  for select to authenticated
  using (exists (select 1 from public.players p where p.id = poker_hole.player_id and p.user_id = auth.uid()));

-- ============================================================
-- hand evaluator: a bigger number = a better hand (7 or 5 cards)
-- number = category * 2^20 + up to 5 tie-break ranks (4 bits each)
-- categories: 8 straight flush, 7 four of a kind, 6 full house, 5 flush, 4 straight,
--             3 three of a kind, 2 two pair, 1 pair, 0 high card
-- ============================================================
create or replace function public.poker_straight_high(p_mask int)
 returns int
 language plpgsql
 immutable
as $function$
declare
  m int := p_mask;
  h int;
begin
  if (m >> 14) & 1 = 1 then m := m | 2; end if;  -- the ace also counts as a one (A-2-3-4-5)
  for h in reverse 14..5 loop
    if (m >> (h - 4)) & 31 = 31 then return h; end if;
  end loop;
  return 0;
end;
$function$;

create or replace function public.poker_pack(p_cat int, p_ranks int[])
 returns int
 language plpgsql
 immutable
as $function$
declare
  v int := p_cat;
  i int;
begin
  for i in 1..5 loop
    v := (v << 4) | coalesce(p_ranks[i], 0);
  end loop;
  return v;
end;
$function$;

create or replace function public.poker_score(p_cards smallint[])
 returns int
 language plpgsql
 immutable
 set search_path to 'public'
as $function$
declare
  cnt int[] := array_fill(0, array[14]);   -- how many of each rank (2..14)
  scnt int[] := array_fill(0, array[4]);   -- how many of each suit
  smask int[] := array_fill(0, array[4]);  -- ranks present in each suit (bits)
  mask int := 0;                           -- ranks present (bits)
  c int; r int; s int; fs int := 0; hi int;
  quad int := 0;
  trips int[] := '{}'; pairs int[] := '{}'; singles int[] := '{}'; ks int[] := '{}';
begin
  foreach c in array p_cards loop
    r := c / 4 + 2; s := c % 4 + 1;
    cnt[r] := cnt[r] + 1;
    scnt[s] := scnt[s] + 1;
    smask[s] := smask[s] | (1 << r);
    mask := mask | (1 << r);
  end loop;

  for s in 1..4 loop
    if scnt[s] >= 5 then fs := s; end if;
  end loop;
  if fs > 0 then
    hi := poker_straight_high(smask[fs]);
    if hi > 0 then return poker_pack(8, array[hi]); end if;
  end if;

  for r in reverse 14..2 loop
    if cnt[r] = 4 then quad := r;
    elsif cnt[r] = 3 then trips := trips || r;
    elsif cnt[r] = 2 then pairs := pairs || r;
    elsif cnt[r] = 1 then singles := singles || r;
    end if;
  end loop;

  if quad > 0 then
    select max(x) into hi from unnest(trips || pairs || singles) x;
    return poker_pack(7, array[quad, coalesce(hi, 0)]);
  end if;
  if cardinality(trips) >= 2 or (cardinality(trips) = 1 and cardinality(pairs) >= 1) then
    return poker_pack(6, array[trips[1], greatest(coalesce(trips[2], 0), coalesce(pairs[1], 0))]);
  end if;
  if fs > 0 then
    for r in reverse 14..2 loop
      if (smask[fs] >> r) & 1 = 1 and cardinality(ks) < 5 then ks := ks || r; end if;
    end loop;
    return poker_pack(5, ks);
  end if;
  hi := poker_straight_high(mask);
  if hi > 0 then return poker_pack(4, array[hi]); end if;
  if cardinality(trips) = 1 then
    return poker_pack(3, array[trips[1]] || singles[1:2]);
  end if;
  if cardinality(pairs) >= 2 then
    return poker_pack(2, array[pairs[1], pairs[2], greatest(coalesce(pairs[3], 0), coalesce(singles[1], 0))]);
  end if;
  if cardinality(pairs) = 1 then
    return poker_pack(1, array[pairs[1]] || singles[1:3]);
  end if;
  return poker_pack(0, singles[1:5]);
end;
$function$;

create or replace function public.poker_hand_name(p_score int)
 returns text
 language sql
 immutable
as $function$
  select case p_score >> 20
    when 8 then case when (p_score >> 16) & 15 = 14 then 'Royal flush' else 'Straight flush' end
    when 7 then 'Four of a kind'
    when 6 then 'Full house'
    when 5 then 'Flush'
    when 4 then 'Straight'
    when 3 then 'Three of a kind'
    when 2 then 'Two pair'
    when 1 then 'Pair'
    else 'High card' end
$function$;

-- ============================================================
-- the shuffle
-- ============================================================
-- the deck made from a seed: the 52 cards sorted by sha256(seed + card number). Same seed = same deck.
create or replace function public.poker_deck_from_seed(p_seed bytea)
 returns smallint[]
 language sql
 immutable
as $function$
  select array_agg(i::smallint order by sha256(p_seed || decode(lpad(to_hex(i), 2, '0'), 'hex')), i)
  from generate_series(0, 51) as i
$function$;

-- THE place where the seed comes from (internal). Phase 2 (Pyth Entropy) replaces only this function.
create or replace function public.poker_new_seed(p_room_id uuid, p_hand_no int)
 returns bytea
 language sql
 volatile
 security definer
 set search_path to 'public', 'extensions'
as $function$
  select extensions.gen_random_bytes(32)
$function$;

-- ============================================================
-- seats (internal): the next seat going clockwise after p_from (p_from itself comes last)
--   p_kind 'alive'  = still has chips in the tournament
-- ============================================================
create or replace function public.poker_next_seat(p_room_id uuid, p_from int, p_kind text)
 returns int
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select poker_seat from players
  where room_id = p_room_id and poker_seat is not null
    and case p_kind when 'alive' then not poker_out
                    when 'in_hand' then poker_in_hand
                    else false end
  order by ((poker_seat - p_from - 1) % 9 + 9) % 9
  limit 1
$function$;

-- who must act next (internal): clockwise after p_from, a player still in the hand, not all-in,
-- who has not acted in this street or has less in front than the current bet.
-- (if everybody else is all-in and this player already covers them, nobody needs to act)
create or replace function public.poker_find_next(p_room_id uuid, p_from int)
 returns uuid
 language plpgsql
 stable
 security definer
 set search_path to 'public'
as $function$
declare
  v_cur int;
  p players;
  v_others int;
  v_max int;
begin
  select poker_current_bet into v_cur from rooms where id = p_room_id;
  for p in
    select * from players
    where room_id = p_room_id and poker_in_hand and not poker_folded and not poker_allin
    order by ((poker_seat - p_from - 1) % 9 + 9) % 9
  loop
    if not p.poker_acted or p.poker_bet < v_cur then
      select count(*) filter (where not poker_allin), coalesce(max(poker_bet), 0)
        into v_others, v_max
      from players
      where room_id = p_room_id and poker_in_hand and not poker_folded and id <> p.id;
      if v_others = 0 and p.poker_bet >= v_max then continue; end if;
      return p.id;
    end if;
  end loop;
  return null;
end;
$function$;

-- ============================================================
-- one action (internal): fold | check | call | raise (p_to = my total bet in this street) | allin
-- ============================================================
create or replace function public.poker_apply(p_room_id uuid, p_player_id uuid, p_action text, p_to int, p_auto boolean)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_room rooms;
  p players;
  v_call int;
  v_max_to int;
  v_to int;
  v_min_to int;
  v_label text;
  v_amount int;
  v_can_raise boolean;
  v_action text := p_action;
begin
  select * into v_room from rooms where id = p_room_id;
  select * into p from players where id = p_player_id;
  v_call := greatest(0, v_room.poker_current_bet - p.poker_bet);
  v_max_to := p.poker_bet + p.poker_stack;

  -- can this player raise? only if betting was "reopened" for them (a full raise since they last
  -- acted, or they did not act yet) and somebody else can still answer
  v_can_raise := (not p.poker_acted or p.poker_acted_level < v_room.poker_full_bet)
    and exists (select 1 from players where room_id = p_room_id and id <> p.id
                and poker_in_hand and not poker_folded and not poker_allin);

  if v_action = 'allin' then
    v_action := case when v_max_to <= v_room.poker_current_bet or not v_can_raise then 'call' else 'raise' end;
    v_to := v_max_to;
  else
    v_to := p_to;
  end if;
  if v_action = 'call' and v_call = 0 then v_action := 'check'; end if;
  if v_action = 'raise' and v_to is not null and v_to >= v_max_to and v_max_to <= v_room.poker_current_bet then
    v_action := 'call';  -- "raise" with less than the bet = all my chips to call
  end if;

  if v_action = 'fold' then
    update players set poker_folded = true, poker_action = 'Fold' where id = p.id;
    v_amount := 0;
    v_label := 'Fold';

  elsif v_action = 'check' then
    if v_call > 0 then raise exception 'You can not check: there is a bet of % to call', v_call; end if;
    update players set poker_action = 'Check' where id = p.id;
    v_amount := 0;
    v_label := 'Check';

  elsif v_action = 'call' then
    v_amount := least(v_call, p.poker_stack);
    update players
    set poker_stack = poker_stack - v_amount,
        poker_bet = poker_bet + v_amount,
        poker_committed = poker_committed + v_amount,
        poker_allin = (poker_stack - v_amount = 0),
        poker_action = case when poker_stack - v_amount = 0 then 'All-in' else 'Call' end
    where id = p.id;
    v_label := case when p.poker_stack - v_amount = 0 then 'All-in' else 'Call' end;

  elsif v_action = 'raise' then
    if v_to is null then raise exception 'Say how much to raise'; end if;
    if not v_can_raise then raise exception 'You can only call or fold now'; end if;
    v_to := least(v_to, v_max_to);
    v_min_to := v_room.poker_current_bet + greatest(v_room.poker_min_raise, 1);
    if v_to <= v_room.poker_current_bet then raise exception 'A raise must be more than the current bet'; end if;
    if v_to < v_min_to and v_to < v_max_to then raise exception 'The minimum raise is to %', v_min_to; end if;
    v_amount := v_to - p.poker_bet;
    v_label := case when v_to = v_max_to then 'All-in' when v_room.poker_current_bet = 0 then 'Bet' else 'Raise' end;
    update players
    set poker_stack = poker_stack - v_amount,
        poker_bet = v_to,
        poker_committed = poker_committed + v_amount,
        poker_allin = (poker_stack - v_amount = 0),
        poker_action = v_label
    where id = p.id;
    if v_to - v_room.poker_current_bet >= v_room.poker_min_raise then
      -- a full raise: it sets the new minimum and reopens the betting for everybody
      update rooms set poker_min_raise = v_to - v_room.poker_current_bet, poker_full_bet = v_to, poker_current_bet = v_to
      where id = p_room_id;
    else
      -- an all-in smaller than a full raise: others must call it, but it does not reopen raising
      update rooms set poker_current_bet = v_to where id = p_room_id;
    end if;

  else
    raise exception 'Unknown action %', p_action;
  end if;

  update players
  set poker_acted = true,
      poker_acted_level = (select poker_full_bet from rooms where id = p_room_id),
      poker_timeouts = case when p_auto then poker_timeouts else 0 end
  where id = p.id;

  update rooms
  set poker_last = jsonb_build_object('player_id', p.id, 'seat', p.poker_seat, 'action', v_label,
                                      'amount', v_amount, 'auto', p_auto, 'at', now())
  where id = p_room_id;
end;
$function$;

-- ============================================================
-- after an action (internal): give the turn to the next player, or close the street.
-- Players who are away (or gone for 60 s) act at once: check if free, otherwise fold.
-- ============================================================
create or replace function public.poker_continue(p_room_id uuid, p_from int)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_room rooms;
  v_from int := p_from;
  v_next uuid;
  p players;
  v_live int;
  v_guard int := 0;
begin
  loop
    v_guard := v_guard + 1;
    if v_guard > 50 then raise exception 'poker_continue: too many steps'; end if;

    select count(*) into v_live from players where room_id = p_room_id and poker_in_hand and not poker_folded;
    if v_live <= 1 then
      perform poker_end_hand(p_room_id);
      return;
    end if;

    v_next := poker_find_next(p_room_id, v_from);
    if v_next is null then
      -- everybody acted: short pause, then the tick deals the next street
      update rooms set poker_turn = null, poker_turn_seat = null, poker_turn_ends_at = null,
                       poker_next_at = now() + interval '1 second'
      where id = p_room_id;
      return;
    end if;

    select * into p from players where id = v_next;
    if p.poker_away or p.last_seen < now() - interval '60 seconds' then
      update players set poker_away = true where id = p.id;
      select * into v_room from rooms where id = p_room_id;
      perform poker_apply(p_room_id, p.id,
                          case when p.poker_bet >= v_room.poker_current_bet then 'check' else 'fold' end,
                          null, true);
      v_from := p.poker_seat;
      continue;
    end if;

    select * into v_room from rooms where id = p_room_id;
    update rooms
    set poker_turn = p.id, poker_turn_seat = p.poker_seat,
        poker_turn_ends_at = now() + make_interval(secs => coalesce((v_room.poker_cfg->>'act_seconds')::int, 20)),
        poker_next_at = null
    where id = p_room_id;
    return;
  end loop;
end;
$function$;

-- ============================================================
-- a new hand (internal): button moves, blinds, fresh deck, 2 cards each
-- ============================================================
create or replace function public.poker_new_hand(p_room_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_room rooms;
  v_cfg jsonb;
  v_alive int;
  v_level int;
  v_blinds jsonb;
  v_n int;
  v_sb int; v_bb int;
  v_dealer int; v_sb_seat int; v_bb_seat int;
  v_hand int;
  v_seed bytea;
  v_deck smallint[];
  v_k int := 0;
  p players;
  v_post int;
begin
  select * into v_room from rooms where id = p_room_id;
  v_cfg := v_room.poker_cfg;

  select count(*) into v_alive from players where room_id = p_room_id and not poker_out;
  if v_alive <= 1 then
    perform poker_finish(p_room_id);
    return;
  end if;

  -- blind level from the clock
  v_level := greatest(0, floor(extract(epoch from now() - v_room.poker_started_at)
                               / (coalesce((v_cfg->>'level_minutes')::numeric, 5) * 60)))::int;
  v_blinds := v_cfg->'blinds';
  v_n := jsonb_array_length(v_blinds);
  if v_level < v_n then
    v_sb := (v_blinds->v_level->>0)::int; v_bb := (v_blinds->v_level->>1)::int;
  else
    v_sb := (v_blinds->(v_n - 1)->>0)::int * (2 ^ (v_level - v_n + 1))::int;
    v_bb := (v_blinds->(v_n - 1)->>1)::int * (2 ^ (v_level - v_n + 1))::int;
  end if;

  -- button to the next player with chips; heads-up: the button is the small blind
  v_dealer := poker_next_seat(p_room_id, coalesce(v_room.poker_dealer, -1), 'alive');
  if v_alive = 2 then
    v_sb_seat := v_dealer;
  else
    v_sb_seat := poker_next_seat(p_room_id, v_dealer, 'alive');
  end if;
  v_bb_seat := poker_next_seat(p_room_id, v_sb_seat, 'alive');

  update players
  set poker_in_hand = not poker_out, poker_folded = poker_out, poker_allin = false,
      poker_bet = 0, poker_committed = 0, poker_acted = false, poker_acted_level = -1,
      poker_action = null, poker_score = null, poker_won = 0, poker_hand_start = poker_stack
  where room_id = p_room_id;

  v_hand := v_room.poker_hand_no + 1;
  v_seed := poker_new_seed(p_room_id, v_hand);
  v_deck := poker_deck_from_seed(v_seed);
  insert into poker_hands (room_id, hand_no, deck_seed, deck) values (p_room_id, v_hand, v_seed, v_deck)
  on conflict (room_id, hand_no) do update set deck_seed = excluded.deck_seed, deck = excluded.deck, created_at = now();

  -- deal one card at a time, starting left of the button
  delete from poker_hole where room_id = p_room_id;
  for p in
    select * from players where room_id = p_room_id and poker_in_hand
    order by ((poker_seat - v_dealer - 1) % 9 + 9) % 9
  loop
    v_k := v_k + 1;
    insert into poker_hole (room_id, player_id, hand_no, cards)
    values (p_room_id, p.id, v_hand, array[v_deck[v_k], v_deck[v_k + v_alive]]);
  end loop;

  -- blinds (a short stack posts what it has and is all-in)
  select * into p from players where room_id = p_room_id and poker_seat = v_sb_seat;
  v_post := least(p.poker_stack, v_sb);
  update players set poker_stack = poker_stack - v_post, poker_bet = v_post, poker_committed = v_post,
                     poker_allin = (poker_stack - v_post = 0), poker_action = 'SB'
  where id = p.id;
  select * into p from players where room_id = p_room_id and poker_seat = v_bb_seat;
  v_post := least(p.poker_stack, v_bb);
  update players set poker_stack = poker_stack - v_post, poker_bet = v_post, poker_committed = v_post,
                     poker_allin = (poker_stack - v_post = 0), poker_action = 'BB'
  where id = p.id;

  update rooms
  set poker_hand_no = v_hand, round_number = v_hand,
      poker_level = v_level, poker_sb = v_sb, poker_bb = v_bb,
      poker_level_ends_at = poker_started_at
        + make_interval(secs => (v_level + 1) * coalesce((v_cfg->>'level_minutes')::numeric, 5) * 60),
      poker_dealer = v_dealer, poker_sb_seat = v_sb_seat, poker_bb_seat = v_bb_seat,
      poker_street = 'preflop', poker_board = '{}',
      poker_current_bet = v_bb, poker_min_raise = v_bb, poker_full_bet = v_bb,
      poker_turn = null, poker_turn_seat = null, poker_turn_ends_at = null, poker_next_at = null,
      poker_last = null, poker_result = null
  where id = p_room_id;

  -- first to act: left of the big blind (heads-up: the button)
  perform poker_continue(p_room_id, v_bb_seat);
end;
$function$;

-- ============================================================
-- next street (internal): flop (3 cards), turn (1), river (1), then showdown.
-- If fewer than 2 players can still bet (all-in), the cards come out one street at a time.
-- ============================================================
create or replace function public.poker_next_street(p_room_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_room rooms;
  v_deck smallint[];
  v_n int;
  v_k int;
  v_pos int;
  v_next text;
  v_can_act int;
begin
  select * into v_room from rooms where id = p_room_id;
  if v_room.poker_street = 'river' then
    perform poker_end_hand(p_room_id);
    return;
  end if;

  update players
  set poker_bet = 0, poker_acted = false, poker_acted_level = -1,
      poker_action = case when poker_folded or poker_allin then poker_action else null end
  where room_id = p_room_id;

  select deck into v_deck from poker_hands where room_id = p_room_id and hand_no = v_room.poker_hand_no;
  select count(*) into v_n from players where room_id = p_room_id and poker_in_hand;
  v_k := case v_room.poker_street when 'preflop' then 3 else 1 end;
  v_next := case v_room.poker_street when 'preflop' then 'flop' when 'flop' then 'turn' else 'river' end;
  v_pos := 2 * v_n + cardinality(v_room.poker_board) + 1;

  update rooms
  set poker_board = poker_board || v_deck[v_pos : v_pos + v_k - 1],
      poker_street = v_next,
      poker_current_bet = 0, poker_min_raise = poker_bb, poker_full_bet = 0,
      poker_turn = null, poker_turn_seat = null, poker_turn_ends_at = null, poker_next_at = null
  where id = p_room_id;

  select count(*) into v_can_act from players
  where room_id = p_room_id and poker_in_hand and not poker_folded and not poker_allin;
  if v_can_act >= 2 then
    perform poker_continue(p_room_id, v_room.poker_dealer);
  else
    update rooms set poker_next_at = now() + interval '2 seconds' where id = p_room_id;
  end if;
end;
$function$;

-- ============================================================
-- end of the hand (internal): main pot and side pots, ties split (odd chip to the first winner
-- left of the button), cards shown at showdown, players with no chips are out
-- ============================================================
create or replace function public.poker_end_hand(p_room_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_room rooms;
  v_live int;
  v_showdown boolean;
  v_lvl int;
  v_prev int := 0;
  v_cnt int;
  v_amount int;
  v_best int;
  v_elig uuid[];
  v_win uuid[];
  v_share int;
  v_rem int;
  i int;
  v_pots jsonb := '[]';
  v_last int;
  v_players jsonb;
  v_alive int;
  b record;
  v_k int := 0;
begin
  select * into v_room from rooms where id = p_room_id;
  select count(*) into v_live from players where room_id = p_room_id and poker_in_hand and not poker_folded;
  v_showdown := v_live >= 2;

  update players set poker_won = 0 where room_id = p_room_id;
  if v_showdown then
    update players p set poker_score = poker_score(h.cards || v_room.poker_board)
    from poker_hole h
    where p.room_id = p_room_id and p.poker_in_hand and not p.poker_folded
      and h.room_id = p_room_id and h.player_id = p.id;
  end if;

  -- pots in layers: each layer is paid by everybody who put in at least that much
  for v_lvl in
    select distinct poker_committed from players
    where room_id = p_room_id and poker_committed > 0 order by 1
  loop
    select count(*) into v_cnt from players where room_id = p_room_id and poker_committed >= v_lvl;
    v_amount := (v_lvl - v_prev) * v_cnt;

    select array_agg(id order by ((poker_seat - v_room.poker_dealer - 1) % 9 + 9) % 9), max(poker_score)
      into v_elig, v_best
    from players
    where room_id = p_room_id and poker_committed >= v_lvl and poker_in_hand and not poker_folded;

    if v_elig is null then
      -- nobody left in this layer (should not happen): chips go back to who put them
      update players set poker_won = poker_won + (v_lvl - v_prev)
      where room_id = p_room_id and poker_committed >= v_lvl;
      v_win := '{}';
    else
      select array_agg(id order by ((poker_seat - v_room.poker_dealer - 1) % 9 + 9) % 9)
        into v_win
      from players
      where id = any (v_elig) and (v_best is null or poker_score = v_best);
      v_share := v_amount / cardinality(v_win);
      v_rem := v_amount % cardinality(v_win);
      for i in 1..cardinality(v_win) loop
        update players set poker_won = poker_won + v_share + case when i <= v_rem then 1 else 0 end
        where id = v_win[i];
      end loop;
    end if;

    -- for the screen: layers with the same players form one pot (main pot, side pot 1, ...)
    v_last := jsonb_array_length(v_pots) - 1;
    if v_last >= 0 and (v_pots->v_last->'eligible') = to_jsonb(coalesce(v_elig, '{}')) then
      v_pots := jsonb_set(v_pots, array[v_last::text, 'amount'],
                          to_jsonb((v_pots->v_last->>'amount')::int + v_amount));
    else
      v_pots := v_pots || jsonb_build_array(jsonb_build_object(
        'amount', v_amount, 'eligible', to_jsonb(coalesce(v_elig, '{}')), 'winners', to_jsonb(v_win),
        'returned', cardinality(coalesce(v_elig, '{}')) = 1 and v_cnt = 1));
    end if;
    v_prev := v_lvl;
  end loop;

  update players set poker_stack = poker_stack + poker_won where room_id = p_room_id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'player_id', p.id, 'seat', p.poker_seat, 'nickname', p.nickname,
           'committed', p.poker_committed, 'won', p.poker_won, 'folded', p.poker_folded,
           'cards', case when v_showdown and not p.poker_folded then to_jsonb(h.cards) else null end,
           'score', case when v_showdown and not p.poker_folded then p.poker_score else null end,
           'hand', case when v_showdown and not p.poker_folded then poker_hand_name(p.poker_score) else null end)
         order by p.poker_seat), '[]'::jsonb)
    into v_players
  from players p
  left join poker_hole h on h.room_id = p_room_id and h.player_id = p.id
  where p.room_id = p_room_id and p.poker_in_hand;

  -- busted players: the one who started the hand with more chips gets the better place
  select count(*) into v_alive from players where room_id = p_room_id and not poker_out and poker_stack > 0;
  for b in
    select id from players
    where room_id = p_room_id and poker_in_hand and not poker_out and poker_stack = 0
    order by poker_hand_start desc, poker_seat
  loop
    v_k := v_k + 1;
    update players set poker_out = true, alive = false, place = v_alive + v_k where id = b.id;
  end loop;

  update rooms
  set poker_street = 'result',
      poker_turn = null, poker_turn_seat = null, poker_turn_ends_at = null,
      poker_next_at = now() + case when v_showdown then interval '6 seconds' else interval '3 seconds' end,
      poker_result = jsonb_build_object('hand_no', v_room.poker_hand_no, 'showdown', v_showdown,
                                        'board', to_jsonb(v_room.poker_board), 'pots', v_pots, 'players', v_players)
  where id = p_room_id;
end;
$function$;

-- ============================================================
-- end of the tournament (internal)
-- ============================================================
create or replace function public.poker_finish(p_room_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_win uuid;
begin
  select id into v_win from players
  where room_id = p_room_id and not poker_out and poker_seat is not null
  order by poker_stack desc limit 1;
  update players set place = 1, score = poker_stack where id = v_win;
  update rooms
  set status = 'finished', winner_id = v_win,
      poker_street = 'finished', poker_turn = null, poker_turn_seat = null,
      poker_turn_ends_at = null, poker_next_at = null
  where id = p_room_id;
end;
$function$;

-- ============================================================
-- start (host only; 2 to 9 players; refused if the mode is switched off)
-- ============================================================
create or replace function public.poker_start_game(p_room_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_room rooms;
  s poker_settings;
  v_n int;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select * into v_room from rooms where id = p_room_id for update;
  if v_room.id is null then raise exception 'Room not found'; end if;
  if v_room.mode is distinct from 'poker' then raise exception 'This is not a poker room'; end if;
  if v_room.host_user_id is distinct from auth.uid() then raise exception 'Only the host can start the game'; end if;
  if v_room.status = 'playing' then raise exception 'Game already running'; end if;
  if not coalesce((select enabled from mode_switches where mode = 'poker'), true) then
    raise exception 'Poker is turned off for now';
  end if;

  select * into s from poker_settings where id = 1;
  select count(*) into v_n from players where room_id = p_room_id;
  if v_n < 2 then raise exception 'You need at least 2 players'; end if;
  if v_n > s.max_players then
    raise exception 'A poker table has room for % players. Some players need to leave (or open another room).', s.max_players;
  end if;

  -- random seats, same chips for everybody
  with seats as (
    select id, (row_number() over (order by random()) - 1)::int as seat from players where room_id = p_room_id
  )
  update players p
  set poker_seat = seats.seat, poker_stack = s.start_stack, poker_bet = 0, poker_committed = 0,
      poker_hand_start = s.start_stack, poker_in_hand = false, poker_folded = false, poker_allin = false,
      poker_acted = false, poker_acted_level = -1, poker_away = false, poker_timeouts = 0,
      poker_out = false, poker_action = null, poker_score = null, poker_won = 0,
      score = 0, place = null, alive = true
  from seats where p.id = seats.id;

  delete from poker_hole where room_id = p_room_id;
  delete from poker_hands where room_id = p_room_id;

  update rooms
  set status = 'playing', winner_id = null, last_victim_id = null, round_number = 0,
      bomb_holder_id = null, current_question_text = null,
      poker_cfg = jsonb_build_object('start_stack', s.start_stack, 'level_minutes', s.level_minutes,
                                     'act_seconds', s.act_seconds, 'blinds', s.blinds),
      poker_started_at = now() + interval '3 seconds',
      poker_hand_no = 0, poker_level = 0,
      poker_sb = (s.blinds->0->>0)::int, poker_bb = (s.blinds->0->>1)::int,
      poker_level_ends_at = now() + interval '3 seconds' + make_interval(secs => s.level_minutes * 60),
      poker_dealer = floor(random() * v_n)::int, poker_sb_seat = null, poker_bb_seat = null,
      poker_street = 'ready', poker_board = '{}',
      poker_turn = null, poker_turn_seat = null, poker_turn_ends_at = null,
      poker_current_bet = 0, poker_min_raise = 0, poker_full_bet = 0,
      poker_next_at = now() + interval '3 seconds',  -- 3 s "get ready" before the first hand
      poker_last = null, poker_result = null
  where id = p_room_id;
end;
$function$;

-- ============================================================
-- my action: p_action = 'fold' | 'check' | 'call' | 'raise' | 'allin'
-- p_to (only for 'raise') = my TOTAL bet in this street after the raise
-- ============================================================
create or replace function public.poker_act(p_room_id uuid, p_action text, p_to int default null)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_room rooms;
  v_me players;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if p_action is null or p_action not in ('fold', 'check', 'call', 'raise', 'allin') then
    raise exception 'Unknown action';
  end if;
  select * into v_room from rooms where id = p_room_id for update;
  if v_room.id is null or v_room.mode is distinct from 'poker' or v_room.status <> 'playing' then
    raise exception 'No poker game running in this room';
  end if;
  select * into v_me from players where room_id = p_room_id and user_id = auth.uid();
  if v_me.id is null then raise exception 'You are not in this room'; end if;
  if v_room.poker_street not in ('preflop', 'flop', 'turn', 'river') or v_room.poker_turn is distinct from v_me.id then
    raise exception 'It is not your turn';
  end if;

  update players set last_seen = now(), poker_away = false where id = v_me.id;
  perform poker_apply(p_room_id, v_me.id, p_action, p_to, false);
  perform poker_continue(p_room_id, v_me.poker_seat);
  return jsonb_build_object('ok', true);
end;
$function$;

-- "I'm back": stop the automatic check/fold
create or replace function public.poker_back(p_room_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  update players set poker_away = false, poker_timeouts = 0, last_seen = now()
  where room_id = p_room_id and user_id = auth.uid();
end;
$function$;

-- my 2 cards in the current hand (same as reading poker_hole, which only shows my own row)
create or replace function public.poker_my_cards(p_room_id uuid)
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to 'public'
as $function$
declare
  v jsonb;
begin
  if auth.uid() is null then return null; end if;
  select jsonb_build_object('hand_no', h.hand_no, 'cards', to_jsonb(h.cards)) into v
  from poker_hole h join players p on p.id = h.player_id
  where h.room_id = p_room_id and p.user_id = auth.uid();
  return v;
end;
$function$;

-- ============================================================
-- tick: every browser calls it once a second; moves the game forward (pauses, time-outs)
-- and returns the server clock
-- ============================================================
create or replace function public.poker_tick(p_room_id uuid)
 returns timestamptz
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_room rooms;
  p players;
begin
  select * into v_room from rooms where id = p_room_id for update;
  if v_room.id is null or v_room.mode is distinct from 'poker' or v_room.status <> 'playing' then return now(); end if;

  if v_room.poker_street in ('ready', 'result') then
    if now() >= v_room.poker_next_at then perform poker_new_hand(p_room_id); end if;
  elsif v_room.poker_street in ('preflop', 'flop', 'turn', 'river') then
    if v_room.poker_turn is null then
      if v_room.poker_next_at is not null and now() >= v_room.poker_next_at then
        perform poker_next_street(p_room_id);
      end if;
    elsif now() > v_room.poker_turn_ends_at + interval '500 milliseconds' then
      -- time is up: free check, or fold. Two in a row = away.
      select * into p from players where id = v_room.poker_turn;
      update players
      set poker_timeouts = poker_timeouts + 1,
          poker_away = (poker_timeouts + 1 >= 2)
      where id = p.id;
      perform poker_apply(p_room_id, p.id,
                          case when p.poker_bet >= v_room.poker_current_bet then 'check' else 'fold' end,
                          null, true);
      perform poker_continue(p_room_id, p.poker_seat);
    end if;
  end if;
  return now();
end;
$function$;

revoke execute on function public.poker_new_seed(uuid, int) from public, anon, authenticated;
revoke execute on function public.poker_next_seat(uuid, int, text) from public, anon, authenticated;
revoke execute on function public.poker_find_next(uuid, int) from public, anon, authenticated;
revoke execute on function public.poker_apply(uuid, uuid, text, int, boolean) from public, anon, authenticated;
revoke execute on function public.poker_continue(uuid, int) from public, anon, authenticated;
revoke execute on function public.poker_new_hand(uuid) from public, anon, authenticated;
revoke execute on function public.poker_next_street(uuid) from public, anon, authenticated;
revoke execute on function public.poker_end_hand(uuid) from public, anon, authenticated;
revoke execute on function public.poker_finish(uuid) from public, anon, authenticated;

-- check: all true
select
  exists (select 1 from information_schema.columns where table_name = 'rooms' and column_name = 'poker_board') as rooms_ready,
  exists (select 1 from information_schema.columns where table_name = 'players' and column_name = 'poker_stack') as players_ready,
  (select relrowsecurity from pg_class where oid = 'public.poker_hole'::regclass) as cards_protected,
  (select relrowsecurity from pg_class where oid = 'public.poker_hands'::regclass) as deck_protected,
  public.poker_score('{48,49,50,51,44,0,4}') > public.poker_score('{0,1,2,4,5,8,12}') as evaluator_ok,
  (select enabled from public.mode_switches where mode = 'poker') as mode_on;
