-- PYTH BOMB: 3 perguntas do Recap sem "now" / "latest" (step 45)
-- Rode no SQL Editor do Supabase. Pode rodar mais de uma vez.
-- Por que: no Classic A/B/C/D as perguntas do Recap jogam fora do mês, e "now" / "latest" deixam de fazer sentido.
-- Agora elas dizem "October 2026". As respostas e as opções continuam iguais. Os arquivos 039 e 042 já têm o texto novo,
-- então rodar eles de novo não cria cópia.

update public.questions
   set text = 'As of late October 2026, Pyth Pro carries live post-market prices for 4 Korean stocks. During which hours (KST)?'
 where kind = 'choice' and text = 'Pyth Pro now carries live post-market prices for 4 Korean stocks. During which hours (KST)?';

update public.questions
   set text = 'In an October 2026 welcoming video, @thePIRB says you don''t need to … to join the Pyth community.'
 where kind = 'choice' and text = '@thePIRB''s latest welcoming video says you don''t need to … to join the Pyth community.';

update public.questions
   set text = 'As of late October 2026, which protocol says its WETH pool prices swaps off signed Pyth ETH/USD reports?'
 where kind = 'choice' and text = 'Which protocol says its WETH pool now prices swaps off signed Pyth ETH/USD reports?';

-- conferência: deve dar 3 (as três com o texto novo) e 0 (nenhuma com "now" / "latest" sobrando)
select
  count(*) filter (where text like 'As of late October 2026, Pyth Pro carries%'
                      or text like 'In an October 2026 welcoming video%'
                      or text like 'As of late October 2026, which protocol says its WETH%') as com_texto_novo,
  count(*) filter (where text like 'Pyth Pro now carries%'
                      or text like '@thePIRB''s latest welcoming video%'
                      or text like 'Which protocol says its WETH pool now prices%') as com_texto_antigo
from public.questions
where kind = 'choice';
