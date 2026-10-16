-- PYTH BOMB: turn off one question (step 30)
-- Run in Supabase SQL Editor. Safe to run more than once.
-- Turns OFF "At what temperature in Celsius does water boil at sea level?" (feedback: weak question).
-- It is only deactivated (active = false), not deleted, so it can be turned back on later.

update public.questions
set active = false
where text = 'At what temperature in Celsius does water boil at sea level?';

-- check: should say 0 (no active copy left)
select count(*) as still_active
from public.questions
where text = 'At what temperature in Celsius does water boil at sea level?' and active;
