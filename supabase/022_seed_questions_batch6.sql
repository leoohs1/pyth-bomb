-- PYTH BOMB: question bank, batch 6 — 48 EASY questions ON + 21 Brazil questions OFF (2026-10-16)
-- Made from another Claude's list of 150, after removing the ones we already had (or very similar
-- ones) and the niche ones. Brazilian music/geography is saved but TURNED OFF (active = false,
-- category 'brazil'), ready for a future "host picks a category" option.
-- Run in Supabase SQL Editor. Safe to run more than once (duplicate question text is skipped).

alter table public.questions drop constraint if exists questions_category_check;
alter table public.questions add constraint questions_category_check
  check (category in ('pyth', 'community', 'general', 'sports', 'movies', 'fun', 'music', 'tv', 'geography', 'history', 'science', 'food', 'games', 'tech', 'animals', 'brands', 'brazil'));

insert into public.questions (category, difficulty, text, accepted_answers, source_reference, verified, active) values
  ('tv', 'easy', 'Which Spanish series features a big bank heist and robbers wearing Salvador Dali masks?', array['Money Heist', 'La Casa de Papel', 'Casa de Papel'], 'Claude batch 6 (easy)', true, true),
  ('tv', 'easy', 'Which TV series follows survivors during a zombie apocalypse?', array['The Walking Dead', 'Walking Dead', 'TWD'], 'Claude batch 6 (easy)', true, true),
  ('tv', 'easy', 'Which comedy series takes place in the office of a paper company called Dunder Mifflin?', array['The Office', 'Office'], 'Claude batch 6 (easy)', true, true),
  ('tv', 'easy', 'Which sitcom stars Will Smith living with his rich relatives in Bel-Air?', array['The Fresh Prince of Bel-Air', 'Fresh Prince of Bel Air', 'Fresh Prince'], 'Claude batch 6 (easy)', true, true),
  ('tv', 'easy', 'Which singing competition has judges sitting in chairs that turn around?', array['The Voice', 'Voice'], 'Claude batch 6 (easy)', true, true),
  ('tv', 'easy', 'Which medical drama series follows the surgeon Meredith Grey?', array['Grey''s Anatomy', 'Greys Anatomy'], 'Claude batch 6 (easy)', true, true),
  ('tv', 'easy', 'Which animated comedy features Cartman, Stan, Kyle and Kenny?', array['South Park'], 'Claude batch 6 (easy)', true, true),
  ('tv', 'easy', 'Which cartoon woodpecker is famous for his crazy laugh?', array['Woody Woodpecker', 'Woody'], 'Claude batch 6 (easy)', true, true),
  ('tv', 'easy', 'Which cartoon follows the adventures of Finn the human and Jake the dog?', array['Adventure Time'], 'Claude batch 6 (easy)', true, true),
  ('tv', 'easy', 'Which cartoon features the superhero sisters Blossom, Bubbles and Buttercup?', array['The Powerpuff Girls', 'Powerpuff Girls'], 'Claude batch 6 (easy)', true, true),
  ('movies', 'easy', 'In which Jim Carrey movie does a man turn green after putting on a magic mask?', array['The Mask', 'Mask'], 'Claude batch 6 (easy)', true, true),
  ('movies', 'easy', 'Which Steven Spielberg movie is about a giant shark attacking swimmers?', array['Jaws'], 'Claude batch 6 (easy)', true, true),
  ('movies', 'easy', 'Which classic movie features Dorothy walking down a yellow brick road?', array['The Wizard of Oz', 'Wizard of Oz'], 'Claude batch 6 (easy)', true, true),
  ('movies', 'easy', 'Which Marvel movie brings together Iron Man, Thor, Hulk and Captain America as one team?', array['The Avengers', 'Avengers'], 'Claude batch 6 (easy)', true, true),
  ('movies', 'easy', 'What is the name of the killer doll from the Child''s Play movies?', array['Chucky'], 'Claude batch 6 (easy)', true, true),
  ('movies', 'easy', 'Which Pixar movie features emotions named Joy, Sadness, Anger and Fear?', array['Inside Out'], 'Claude batch 6 (easy)', true, true),
  ('movies', 'easy', 'Which animated movie features a black dragon named Toothless?', array['How to Train Your Dragon'], 'Claude batch 6 (easy)', true, true),
  ('games', 'easy', 'Which video game series stars the angry Spartan warrior Kratos?', array['God of War'], 'Claude batch 6 (easy)', true, true),
  ('games', 'easy', 'Which mobile game is all about matching colorful candies?', array['Candy Crush', 'Candy Crush Saga'], 'Claude batch 6 (easy)', true, true),
  ('games', 'easy', 'Which horror game series features zombies and the evil Umbrella Corporation?', array['Resident Evil', 'Biohazard'], 'Claude batch 6 (easy)', true, true),
  ('games', 'easy', 'Which game mixes soccer with rocket-powered cars?', array['Rocket League'], 'Claude batch 6 (easy)', true, true),
  ('sports', 'easy', 'What is the three-letter name of the video referee system used in soccer?', array['VAR', 'Video Assistant Referee'], 'Claude batch 6 (easy)', true, true),
  ('sports', 'easy', 'What do soccer goalkeepers usually wear on their hands?', array['gloves', 'goalkeeper gloves'], 'Claude batch 6 (easy)', true, true),
  ('sports', 'easy', 'In soccer, what is the player who protects the goal called?', array['goalkeeper', 'goalie', 'keeper'], 'Claude batch 6 (easy)', true, true),
  ('sports', 'easy', 'What is Europe''s most famous yearly club soccer competition called?', array['Champions League', 'UEFA Champions League', 'UCL'], 'Claude batch 6 (easy)', true, true),
  ('sports', 'easy', 'Which European national soccer team traditionally plays in orange?', array['Netherlands', 'The Netherlands', 'Holland'], 'Claude batch 6 (easy)', true, true),
  ('sports', 'easy', 'In which sport did Simone Biles become an Olympic champion?', array['gymnastics', 'artistic gymnastics'], 'Claude batch 6 (easy)', true, true),
  ('geography', 'easy', 'What is the capital of Chile?', array['Santiago', 'Santiago de Chile'], 'Claude batch 6 (easy)', true, true),
  ('geography', 'easy', 'Havana is the capital of which Caribbean country?', array['Cuba'], 'Claude batch 6 (easy)', true, true),
  ('geography', 'easy', 'What is the capital of Spain?', array['Madrid'], 'Claude batch 6 (easy)', true, true),
  ('geography', 'easy', 'On which continent is China?', array['Asia'], 'Claude batch 6 (easy)', true, true),
  ('history', 'easy', 'In which year did humans first walk on the Moon?', array['1969'], 'Claude batch 6 (easy)', true, true),
  ('history', 'easy', 'Which world war began in 1914?', array['World War I', 'World War 1', 'WWI', 'WW1', 'First World War', 'the first', 'first'], 'Claude batch 6 (easy)', true, true),
  ('history', 'easy', 'Which young girl became famous for the diary she wrote while hiding from the Nazis?', array['Anne Frank', 'Anne'], 'Claude batch 6 (easy)', true, true),
  ('history', 'easy', 'Johannes Gutenberg is famous for which invention that made books easy to copy?', array['printing press', 'the printing press', 'press', 'printing'], 'Claude batch 6 (easy)', true, true),
  ('science', 'easy', 'What is it called when liquid water turns into vapor?', array['evaporation'], 'Claude batch 6 (easy)', true, true),
  ('science', 'easy', 'Which instrument is used to see tiny things like cells and bacteria?', array['microscope', 'a microscope'], 'Claude batch 6 (easy)', true, true),
  ('science', 'easy', 'Which movement of the Earth causes day and night?', array['rotation', 'Earth''s rotation', 'spinning', 'spin'], 'Claude batch 6 (easy)', true, true),
  ('animals', 'easy', 'Which animal is famous for building dams in rivers?', array['beaver'], 'Claude batch 6 (easy)', true, true),
  ('animals', 'easy', 'Are whales fish or mammals?', array['mammals', 'mammal'], 'Claude batch 6 (easy)', true, true),
  ('animals', 'easy', 'What do you call a baby horse?', array['foal', 'colt', 'filly'], 'Claude batch 6 (easy)', true, true),
  ('food', 'easy', 'Which popular hot drink is made from roasted and ground beans?', array['coffee'], 'Claude batch 6 (easy)', true, true),
  ('food', 'easy', 'Which fruit is used to make the red sauce on a pizza?', array['tomato', 'tomatoes'], 'Claude batch 6 (easy)', true, true),
  ('food', 'easy', 'Which orange vegetable do cartoon rabbits love to eat?', array['carrot', 'carrots'], 'Claude batch 6 (easy)', true, true),
  ('food', 'easy', 'Which frozen dessert comes in flavors like chocolate, strawberry and vanilla?', array['ice cream', 'icecream', 'gelato'], 'Claude batch 6 (easy)', true, true),
  ('tech', 'easy', 'What is the name of Google''s web browser?', array['Chrome', 'Google Chrome'], 'Claude batch 6 (easy)', true, true),
  ('tech', 'easy', 'What is the name of the Japanese art of paper folding?', array['origami'], 'Claude batch 6 (easy)', true, true),
  ('tech', 'easy', 'What is the "@" symbol called in English?', array['at sign', 'at', 'at symbol', 'at-sign'], 'Claude batch 6 (easy)', true, true),
  ('brazil', 'easy', 'Which Brazilian singer is famous for the song "Exagerado"?', array['Cazuza'], 'Claude batch 6 (easy)', true, false),
  ('brazil', 'easy', 'Which Brazilian singer was known as the "Queen of Sofrencia"?', array['Marilia Mendonca', 'Marília Mendonça', 'Marilia'], 'Claude batch 6 (easy)', true, false),
  ('brazil', 'easy', 'Which Brazilian band released "Anna Julia"?', array['Los Hermanos'], 'Claude batch 6 (easy)', true, false),
  ('brazil', 'easy', 'Which Brazilian band sings "Dias de Luta, Dias de Gloria"?', array['Charlie Brown Jr', 'Charlie Brown Junior', 'Charlie Brown', 'CBJR'], 'Claude batch 6 (easy)', true, false),
  ('brazil', 'easy', 'Which Brazilian country music duo released "E o Amor"?', array['Zeze Di Camargo e Luciano', 'Zezé Di Camargo & Luciano', 'Zeze di Camargo and Luciano', 'Zeze Di Camargo'], 'Claude batch 6 (easy)', true, false),
  ('brazil', 'easy', 'Which Brazilian rock band released "Mulher de Fases"?', array['Raimundos'], 'Claude batch 6 (easy)', true, false),
  ('brazil', 'easy', 'Which Brazilian band released "Vou Deixar"?', array['Skank'], 'Claude batch 6 (easy)', true, false),
  ('brazil', 'easy', 'Which Brazilian singer released the hit "Envolver"?', array['Anitta'], 'Claude batch 6 (easy)', true, false),
  ('brazil', 'easy', 'Which musical instrument is a must in Brazilian forro music?', array['accordion', 'sanfona'], 'Claude batch 6 (easy)', true, false),
  ('brazil', 'easy', 'Which Brazilian singer is famous for the hit "Poeira"?', array['Ivete Sangalo', 'Ivete'], 'Claude batch 6 (easy)', true, false),
  ('brazil', 'easy', 'In which Brazilian state is the city of Curitiba?', array['Parana', 'Paraná'], 'Claude batch 6 (easy)', true, false),
  ('brazil', 'easy', 'In which Brazilian state is the city of Florianopolis?', array['Santa Catarina', 'SC'], 'Claude batch 6 (easy)', true, false),
  ('brazil', 'easy', 'Fortaleza is the capital of which Brazilian state?', array['Ceara', 'Ceará'], 'Claude batch 6 (easy)', true, false),
  ('brazil', 'easy', 'Which region of Brazil includes Mato Grosso and Mato Grosso do Sul?', array['Central-West', 'Center-West', 'Centro-Oeste', 'Midwest'], 'Claude batch 6 (easy)', true, false),
  ('brazil', 'easy', 'In which Brazilian state are the Iguacu Falls?', array['Parana', 'Paraná'], 'Claude batch 6 (easy)', true, false),
  ('brazil', 'easy', 'What is the largest Brazilian state by area?', array['Amazonas'], 'Claude batch 6 (easy)', true, false),
  ('brazil', 'easy', 'Belem is the capital of which Brazilian state?', array['Para', 'Pará'], 'Claude batch 6 (easy)', true, false),
  ('brazil', 'easy', 'In which region of Brazil is the city of Recife?', array['Northeast', 'Nordeste'], 'Claude batch 6 (easy)', true, false),
  ('brazil', 'easy', 'Who was the first president of Brazil?', array['Deodoro da Fonseca', 'Deodoro', 'Marechal Deodoro'], 'Claude batch 6 (easy)', true, false),
  ('brazil', 'easy', 'Which Brazilian snack is made with tapioca starch and cheese?', array['pao de queijo', 'pão de queijo', 'cheese bread', 'Brazilian cheese bread'], 'Claude batch 6 (easy)', true, false),
  ('brazil', 'easy', 'Which Brazilian cocktail is made with cachaca, lime, sugar and ice?', array['caipirinha'], 'Claude batch 6 (easy)', true, false)
on conflict do nothing;

-- check: batch 6 questions turned ON (should be 48) and OFF (should be 21)
select count(*) filter (where active) as batch6_on, count(*) filter (where not active) as batch6_off
from public.questions where source_reference = 'Claude batch 6 (easy)';
select count(*) as questions_in_play from public.questions where verified and active;
