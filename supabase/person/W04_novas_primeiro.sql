-- PYTH BOMB · GUESS THE PERSON — step W04: the 10 newest people come first
-- Run in Supabase SQL Editor AFTER W01 and W02. Safe to run more than once. Best between matches.
-- The game always picks the person who was shown the fewest times. This sets the counters so that the NEXT
-- match uses only the 10 new people (Chop, Aaron, Pythia, Kirito, Pstar, West, Slem, Pontius, Ramzes, Pavle),
-- one each. After that match everybody has been shown once and the next ones mix all 20.
-- (Only the order changes: nobody is turned off and no photo is touched.)

update public.person_bank
   set times_dealt = 0
 where lower(name) in ('chop', 'aaron', 'pythia', 'kirito', 'pstar', 'west', 'slem', 'pontius', 'ramzes', 'pavle');

update public.person_bank
   set times_dealt = 1
 where lower(name) not in ('chop', 'aaron', 'pythia', 'kirito', 'pstar', 'west', 'slem', 'pontius', 'ramzes', 'pavle');

-- check: 10 new ones at 0 and the 10 older ones at 1
select
  count(*) filter (where times_dealt = 0) as new_ones_at_zero,
  count(*) filter (where times_dealt = 1) as older_ones_at_one
from public.person_bank
where active;
