-- PYTH BOMB: only EASY questions for a test (step 16)
-- Run in Supabase SQL Editor. Safe to run more than once.
-- Turns OFF (active = false) every medium and hard question, so the game only deals easy ones.
-- NOTHING is deleted. To bring them back afterwards, run the second command below.

update public.questions
set active = false
where difficulty in ('medium', 'hard');

-- how many questions will be dealt now (only easy)
select difficulty, count(*) as dealt from public.questions where verified and active group by difficulty order by difficulty;

-- ===== TO GO BACK TO NORMAL (run this ONLY when the test is over; it also keeps the ones turned off on purpose earlier) =====
-- update public.questions set active = true
-- where difficulty in ('medium','hard')
--   and text not in (
--     'What is Pyth''s token called?',
--     'What do we call the entities that contribute market data to Pyth?',
--     'What service can developers use to fetch Pyth price updates and feed IDs?',
--     'What kind of data does Pyth primarily provide?',
--     'In which month did Pythenians 2.0 go live?',
--     'What is the name of the Swiss association responsible for fostering the Pyth ecosystem?',
--     'What does Pyth publish alongside each price to show how uncertain it is?',
--     'In which month and year did the PYTH retroactive airdrop happen?',
--     'What kind of data is it called when Pyth gets prices straight from exchanges and market makers, with no middlemen?'
--   );
