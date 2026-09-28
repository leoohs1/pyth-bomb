-- PYTH BOMB: question bank, batch 2 (29 questions)
-- Run in Supabase SQL Editor. Safe to run more than once (duplicate question text is skipped).
-- ALL rows here are pyth/community, so all go in as verified = false until Halls checks them.
-- To approve after checking:
--   update public.questions set verified = true
--   where category in ('pyth','community') and verified = false and text in (
--     -- paste the exact question texts you approved, one per line, comma-separated
--   );
-- Or, to approve everything in this batch at once (only once you've checked them all):
--   update public.questions set verified = true where category in ('pyth','community') and verified = false;

insert into public.questions (category, difficulty, text, accepted_answers, source_reference, verified) values
  ('community', 'easy', 'What kind of ancestor does Planck come from?', array['dinosaur', 'dino'], 'Confirmed community lore', false),
  ('community', 'easy', 'What kind of teeth did Ricardo have removed?', array['wisdom teeth', 'wisdom tooth'], 'Confirmed community lore', false),
  ('community', 'easy', 'What does PIRB mean?', array['Pyth Integrated Reckon Bird'], 'Confirmed community lore', false),
  ('community', 'medium', 'Who is the dev handling Pyth feeds?', array['Samurai', 'Samu'], 'Confirmed community lore', false),
  ('community', 'easy', 'What precious metal are Boname''s tits made of?', array['silver'], 'Confirmed community lore', false),
  ('community', 'easy', 'Which member is somehow always online and always AFK?', array['Adrian'], 'Confirmed community lore', false),
  ('community', 'medium', 'Which member has a fluffy friend whose eyes go into purple laser mode?', array['Crown', 'CrownOfLagos'], 'Confirmed community lore', false),
  ('community', 'medium', 'Which member is always counting NFTs because they''ve lost track of how many they own?', array['Cakky'], 'Confirmed community lore', false),
  ('community', 'medium', 'Who is the spy with a Pyth eye?', array['Hinkah'], 'Confirmed community lore', false),
  ('community', 'medium', 'Which member could hack NASA while coding a new feature for Pyth feeds?', array['Samu', 'Samurai'], 'Confirmed community lore', false),
  ('community', 'medium', 'Who somehow keeps the Pythenians team from losing the plot?', array['Planck'], 'Confirmed Pythenians community lore', false),
  ('community', 'medium', 'Who made the new Pythenians brand and badges system?', array['Kirito'], 'Confirmed Pythenians community lore', false),
  ('community', 'medium', 'Who keeps throwing ideas into the fire as the Pythenians giga brain manager?', array['Noname', 'N0name', 'N0name_Trader'], 'Confirmed Pythenians community lore', false),
  ('community', 'easy', 'On what day did Pythenians 2.0 go live?', array['27', '27th', 'September 27', 'September 27th'], 'Confirmed Pythenians community lore', false),
  ('community', 'easy', 'In which month did Pythenians 2.0 go live?', array['September', 'Sep'], 'Confirmed Pythenians community lore', false),
  ('community', 'easy', 'Which event happens every Monday?', array['Market Quorum'], 'Confirmed community event lore', false),
  ('community', 'easy', 'Who hosts Market Quorum?', array['Noname', 'N0name', 'N0name_Trader'], 'Confirmed community event lore', false),
  ('community', 'easy', 'Who hosts Pyth Design?', array['Kirito'], 'Confirmed community event lore', false),
  ('community', 'easy', 'Who hosts Pyth Poker?', array['Borys'], 'Confirmed community event lore', false),
  ('community', 'easy', 'Who hosts SolCasino?', array['Eukodal'], 'Confirmed community event lore', false),
  ('community', 'easy', 'Who hosts Pyth Game Night on Saturdays?', array['Ricardo', 'Ricardinho', 'Halls'], 'Confirmed community event lore', false),
  ('pyth', 'easy', 'What type of network is Pyth?', array['oracle', 'oracle network', 'financial oracle', 'financial oracle network', 'decentralized oracle'], 'Pyth official docs', false),
  ('pyth', 'easy', 'What kind of data does Pyth primarily provide?', array['market data', 'financial market data', 'price data', 'prices', 'real-time market data'], 'Pyth official docs', false),
  ('pyth', 'easy', 'What is Pyth''s token called?', array['PYTH', '$PYTH'], 'Pyth official docs', false),
  ('pyth', 'easy', 'What do we call the entities that contribute market data to Pyth?', array['publishers', 'publisher', 'data publishers'], 'Pyth official docs', false),
  ('pyth', 'easy', 'Name one type of institution that can provide market data to Pyth.', array['exchange', 'bank', 'trading firm', 'market maker'], 'Pyth official docs', false),
  ('pyth', 'easy', 'What is the front door to Pyth''s market data?', array['Pyth Terminal', 'Terminal'], 'Pyth official website', false),
  ('pyth', 'medium', 'What service can developers use to fetch Pyth price updates and feed IDs?', array['Hermes', 'Hermes API'], 'Pyth official docs', false),
  ('pyth', 'easy', 'What color is most associated with Pyth''s branding?', array['purple'], 'Pyth brand/community association', false)
on conflict do nothing;
