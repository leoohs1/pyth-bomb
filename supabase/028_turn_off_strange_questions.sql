-- PYTH BOMB: turn off 30 niche / strange questions (step 28)
-- Run in Supabase SQL Editor. Safe to run more than once. NOTHING is deleted (active = false).
-- From a test with friends: some questions felt niche or strange (example: the Venice canals one).
-- Turned off: niche topics, "gotcha" questions, strange wording, and answers that need an
-- English word few players know (calf, foal, hummus...). One question is reworded instead.

update public.questions set active = false where text in (
  'In which country is the city of Venice, famous for its canals?',
  'Which man-made canal in Central America links the Atlantic to the Pacific?',
  'What is the capital of Australia?',
  'Which desert, located mainly in Chile, is considered the driest in the world?',
  'Which domestic feline animal is famous for dominating the internet with funny videos?',
  'What color is human blood when it is rich in oxygen?',
  'How long is an Olympic swimming pool?',
  'Which famous California NBA team wears purple and gold?',
  'In the English league, which London club is traditionally nicknamed "The Gunners"?',
  'Which North American archipelago is historically the birthplace of surfing?',
  'In tennis, what word is used for a score of zero?',
  'What is the center of a dartboard called?',
  'In which sport do players score a "try"?',
  'Which sport is played on horseback with long mallets?',
  'In which sport would a skater perform a "triple axel"?',
  'In which athletics event do athletes use a long pole to jump over a high bar?',
  'Which car model is turned into a time machine in Back to the Future?',
  'In which European city does the original heist of Money Heist (La Casa de Papel) take place?',
  'How many strings does a standard violin have?',
  'Which brass instrument uses a long slide to change notes?',
  'Which instrument has drums and cymbals and is played with sticks?',
  'Which long-running British series follows a time traveler in a blue police box called the TARDIS?',
  'In Dora the Explorer, what is the name of Dora''s monkey friend?',
  'Which ship carried the Pilgrims to America in 1620?',
  'What was the name of the first artificial satellite, launched in 1957?',
  'What is the main ingredient of hummus?',
  'What do you call a group of wolves?',
  'What do you call a baby cow?',
  'What do you call a baby horse?',
  'Which Swedish store is famous for flat-pack furniture and meatballs?'
);

-- reworded (same question, clearer English)
update public.questions set text = 'How many seasons are there in a year?'
where text = 'How many climate seasons make up a year?'
  and not exists (select 1 from public.questions where lower(text) = lower('How many seasons are there in a year?'));

-- check: turned_off should be 30; the second line shows how many questions are in play now
select count(*) filter (where not active) as turned_off from public.questions where text in (
  'In which country is the city of Venice, famous for its canals?',
  'Which man-made canal in Central America links the Atlantic to the Pacific?',
  'What is the capital of Australia?',
  'Which desert, located mainly in Chile, is considered the driest in the world?',
  'Which domestic feline animal is famous for dominating the internet with funny videos?',
  'What color is human blood when it is rich in oxygen?',
  'How long is an Olympic swimming pool?',
  'Which famous California NBA team wears purple and gold?',
  'In the English league, which London club is traditionally nicknamed "The Gunners"?',
  'Which North American archipelago is historically the birthplace of surfing?',
  'In tennis, what word is used for a score of zero?',
  'What is the center of a dartboard called?',
  'In which sport do players score a "try"?',
  'Which sport is played on horseback with long mallets?',
  'In which sport would a skater perform a "triple axel"?',
  'In which athletics event do athletes use a long pole to jump over a high bar?',
  'Which car model is turned into a time machine in Back to the Future?',
  'In which European city does the original heist of Money Heist (La Casa de Papel) take place?',
  'How many strings does a standard violin have?',
  'Which brass instrument uses a long slide to change notes?',
  'Which instrument has drums and cymbals and is played with sticks?',
  'Which long-running British series follows a time traveler in a blue police box called the TARDIS?',
  'In Dora the Explorer, what is the name of Dora''s monkey friend?',
  'Which ship carried the Pilgrims to America in 1620?',
  'What was the name of the first artificial satellite, launched in 1957?',
  'What is the main ingredient of hummus?',
  'What do you call a group of wolves?',
  'What do you call a baby cow?',
  'What do you call a baby horse?',
  'Which Swedish store is famous for flat-pack furniture and meatballs?'
);
select difficulty, count(*) as in_play from public.questions where verified and active group by difficulty order by difficulty;
