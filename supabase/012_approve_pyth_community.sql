-- PYTH BOMB: approves the Pyth / community questions Halls checked (step 12)
-- Run in Supabase SQL Editor. Safe to run more than once. (Includes the same cuts as
-- 011_remove_duplicates.sql, so it works even if 011 was not run.)
--
-- 1) turns OFF (active = false, not deleted) the questions Halls cut
-- 2) marks every other Pyth / community question as verified = true, so the game starts
--    dealing them (the game only deals verified AND active questions)

update public.questions
set active = false
where text in (
  -- duplicates (same as 011)
  'What is Pyth''s token called?',
  'What do we call the entities that contribute market data to Pyth?',
  'What service can developers use to fetch Pyth price updates and feed IDs?',
  'What kind of data does Pyth primarily provide?',
  'In which month did Pythenians 2.0 go live?',
  -- cut by Halls
  'What is the name of the Swiss association responsible for fostering the Pyth ecosystem?',
  'What does Pyth publish alongside each price to show how uncertain it is?',
  'In which month and year did the PYTH retroactive airdrop happen?',
  'What kind of data is it called when Pyth gets prices straight from exchanges and market makers, with no middlemen?'
);

update public.questions
set verified = true
where active = true
  and verified = false
  and (
    category in ('pyth', 'community')
    or text = 'Which L1 known for parallel execution has community projects like Chog and Spiky Nads?'
  );

-- check: how many questions will the game deal, by category
select category, count(*) as dealt
from public.questions
where verified and active
group by category
order by category;
