-- PYTH BOMB: turns OFF 17 niche medium/hard questions (step 24)
-- The easy-only test (016) had already been undone, so these were still being dealt.
-- Nothing is deleted. Safe to run more than once.

update public.questions set active = false where text in (
  'What is the name of the kingdom where most of The Lion King takes place?',
  'What is the name of the coffee shop in Friends?',
  'In Breaking Bad, what alias does Walter White use?',
  'Which NBA team plays its home games at Madison Square Garden?',
  'How many points is a touchdown worth before the extra point?',
  'Which tactical shooter from Valve officially replaced the famous CS:GO?',
  'In League of Legends, what is the role called for a player who stays in the neutral monster area instead of the lanes?',
  'Which virtual reality headset belongs to Meta?',
  'Which protein supplement extracted from milk is the most consumed in the fitness world?',
  'In which great geological era did the dinosaurs live?',
  'Which upgrade moved Ethereum to Proof of Stake?',
  'Which L1 known for parallel execution has community projects like Chog and Spiky Nads?',
  'In which Brazilian city is the famous Copacabana wave-pattern promenade?',
  'In which Brazilian state is Sugarloaf Mountain located?',
  'What is the maximum supply of PYTH?',
  'Pyth Core currently delivers data to more than how many blockchains?',
  'Which of these companies was one of Pyth''s first data providers: Nubank, Jane Street or Robinhood?'
);

-- check: questions the game can deal now, by difficulty
select difficulty, count(*) as in_play from public.questions where verified and active group by difficulty order by difficulty;
