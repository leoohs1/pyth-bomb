-- PYTH BOMB: turns off duplicate / near-duplicate questions (step 11)
-- Run in Supabase SQL Editor. Safe to run more than once.
-- It does NOT delete anything: it sets active = false, so the game never deals them
-- (and you can bring one back with: update public.questions set active = true where text = '...').
-- Kept versions: "What is the token of Pyth Network called?", "What do we call the data
-- providers that contribute market data to Pyth?", "What service is used to fetch Pyth Core
-- price updates?", "What kind of data is Pyth best known for providing?" and
-- "On what day did Pythenians 2.0 go live?".

update public.questions
set active = false
where text in (
  'What is Pyth''s token called?',
  'What do we call the entities that contribute market data to Pyth?',
  'What service can developers use to fetch Pyth price updates and feed IDs?',
  'What kind of data does Pyth primarily provide?',
  'In which month did Pythenians 2.0 go live?'
);
