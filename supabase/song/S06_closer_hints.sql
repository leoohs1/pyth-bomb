-- PYTH BOMB · GUESS THE SONG — step S06: more helpful "So close!" hints + more accepted spellings
-- Run in Supabase SQL Editor AFTER S05. Safe to run more than once.
-- 1) "So close!" now also shows when you type only PART of the artist or the title, as whole words
--    (e.g. "britney" for Britney Spears, "bohemian" for Bohemian Rhapsody, "smells like" for Smells Like Teen
--    Spirit). It is still NOT accepted as right, only a hint. Short single words that are just a small piece of a
--    long title ("love", "you") give no hint, so nobody can guess words one by one.
--    Typos are still NOT accepted (same as before): the hint also shows for a few wrong letters.
-- 2) A few more ways to write well-known songs are accepted: Living on a Prayer, Gangsta Paradise,
--    Mister Brightside, Seven Rings, Skater Boy, Thank You Next, aha...

create or replace function public.song_match(p_guess text, p_answers text[])
 returns int
 language plpgsql
 stable
 set search_path to 'public', 'extensions'
as $function$
declare
  g text := public.normalize_answer(p_guess);
  a text;
  n text;
  hint int;
  best int := 0;
begin
  if g = '' then return 0; end if;
  foreach a in array p_answers loop
    n := public.normalize_answer(a);
    if n = '' then continue; end if;
    -- same words, ignoring punctuation/accents/case/spaces ("guns n roses" = "Guns N' Roses", "acdc" = "AC/DC")
    if g = n or replace(g, ' ', '') = replace(n, ' ', '') then return 2; end if;
    -- the answer inside a longer guess ("queen bohemian rhapsody" has "queen")
    if length(n) >= 4 and (' ' || g || ' ') like ('% ' || n || ' %') then return 2; end if;
    -- only part of the answer, as whole words ("britney" for "Britney Spears"): NOT accepted, only the hint.
    -- needs at least 4 letters and at least 35% of the answer, so a common word ("love") gives nothing away
    if length(g) >= 4 and length(g) * 100 >= 35 * length(n) and (' ' || n || ' ') like ('% ' || g || ' %') then
      best := 1;
    end if;
    -- a few letters off: NOT accepted, only the "So close! Check the spelling" hint
    hint := case when length(n) <= 4 then 2 when length(n) <= 8 then 3 when length(n) <= 14 then 4 else 5 end;
    if length(g) >= 3 and levenshtein(left(g, 250), left(n, 250)) <= hint then best := 1; end if;
  end loop;
  return best;
end;
$function$;

-- more accepted spellings for the songs already in the game (12 songs)
update public.song_bank set title_answers = array(select distinct x from unnest(title_answers || array['Mister Brightside']::text[]) x) where deezer_id = 953097; -- The Killers - Mr. Brightside
update public.song_bank set title_answers = array(select distinct x from unnest(title_answers || array['Living on a Prayer']::text[]) x) where deezer_id = 538660022; -- Bon Jovi - Livin' on a Prayer
update public.song_bank set artist_answers = array(select distinct x from unnest(artist_answers || array['Aha']::text[]) x) where deezer_id = 664107; -- a-ha - Take on Me
update public.song_bank set title_answers = array(select distinct x from unnest(title_answers || array['Hit Me Baby One More Time']::text[]) x) where deezer_id = 540175; -- Britney Spears - ...Baby One More Time
update public.song_bank set title_answers = array(select distinct x from unnest(title_answers || array['Gangsta Paradise']::text[]) x) where deezer_id = 1584416372; -- Coolio - Gangsta's Paradise
update public.song_bank set title_answers = array(select distinct x from unnest(title_answers || array['Skater Boi', 'Skater Boy', 'Sk8er Boy']::text[]) x) where deezer_id = 15587466; -- Avril Lavigne - Sk8er Boi
update public.song_bank set title_answers = array(select distinct x from unnest(title_answers || array['7 Nation Army']::text[]) x) where deezer_id = 1153182282; -- The White Stripes - Seven Nation Army
update public.song_bank set artist_answers = array(select distinct x from unnest(artist_answers || array['Ke$ha']::text[]) x) where deezer_id = 4764905; -- Kesha - Tik Tok
update public.song_bank set title_answers = array(select distinct x from unnest(title_answers || array['Seven Rings']::text[]) x) where deezer_id = 629899842; -- Ariana Grande - 7 rings
update public.song_bank set title_answers = array(select distinct x from unnest(title_answers || array['Thank You Next', 'Thank You, Next']::text[]) x) where deezer_id = 629899852; -- Ariana Grande - thank u, next
update public.song_bank set title_answers = array(select distinct x from unnest(title_answers || array['God Plan']::text[]) x) where deezer_id = 533609232; -- Drake - God's Plan
update public.song_bank set title_answers = array(select distinct x from unnest(title_answers || array['Staying Alive']::text[]) x) where deezer_id = 427219162; -- Bee Gees - Stayin' Alive

-- check: should be 2 / 1 / 1 / 0
select public.song_match('Living on a Prayer', array['Livin'' on a Prayer', 'Living on a Prayer']) as new_spelling,
       public.song_match('britney', array['Britney Spears']) as part_of_the_name,
       public.song_match('Bilie Jean', array['Billie Jean']) as typo_only_hint,
       public.song_match('love', array['I Will Always Love You']) as no_free_hint;
