-- PYTH BOMB: perguntas do PYTH RECAP MONTH (recap-extra) — 20 perguntas de alternativas
-- Rode no SQL Editor do Supabase DEPOIS do 038_recap_month.sql. Pode rodar de novo sem duplicar.
-- Elas entram com active = false: o Classic de digitar NUNCA sorteia estas. Só salas "Recap Month" sorteiam (recap_on = true).
insert into public.questions (text, accepted_answers, category, difficulty, source_reference, verified, active, kind, wrong_options, recap_on)
select v.text, v.accepted_answers, v.category, v.difficulty, v.source_reference, v.verified, v.active, v.kind, v.wrong_options, v.recap_on
from (values
  ('Besides current and historical prices, what chart data does Pyth''s MCP server give AI agents?', array['Candlesticks'], 'pyth', 'medium', 'recap-extra | Pythian Bulletin, Oct 9', true, false, 'choice', array['Order books', 'News headlines', 'Social sentiment'], true),
  ('In "ARR", what does the first R stand for?', array['Recurring'], 'pyth', 'easy', 'recap-extra | Pythian Bulletin, Oct 16', true, false, 'choice', array['Revenue', 'Rate', 'Return'], true),
  ('What is the name of Pyth''s regular content kit for partners and community creators?', array['Pythian Bulletin'], 'pyth', 'easy', 'recap-extra | Pythian Bulletins, October', true, false, 'choice', array['Pyth Digest', 'Oracle Weekly', 'Pythia Post'], true),
  ('What is the name of the Pyth community NFT collection that thePIRB said could be upgraded in its HUB?', array['Pythenians'], 'pyth', 'medium', 'recap-extra | Pythian Bulletin, Oct 3', true, false, 'choice', array['Pythons', 'Pyth Punks', 'Oracle Owls'], true),
  ('Which DEX opened its beta on Pyth Pro data on 19 Oct?', array['PopDEX'], 'pyth', 'medium', 'recap-extra | Pythian Bulletin, Oct 20', true, false, 'choice', array['Raydium', 'Uniswap', 'dYdX'], true),
  ('Nysa Finance lets users borrow USDC against which Ondo token?', array['USDY'], 'pyth', 'medium', 'recap-extra | Pythian Bulletin, Oct 20', true, false, 'choice', array['BUIDL', 'USDT', 'wstETH'], true),
  ('Which protocol says its WETH pool now prices swaps off signed Pyth ETH/USD reports?', array['yieldbasis'], 'pyth', 'medium', 'recap-extra | Pythian Bulletin, Oct 30', true, false, 'choice', array['Uniswap', 'Balancer', 'Aave'], true),
  ('Pyth highlighted a product running on its 24/5 feed for which stock?', array['TSLA'], 'pyth', 'medium', 'recap-extra | Pythian Bulletin, Oct 20', true, false, 'choice', array['AAPL', 'NVDA', 'AMZN'], true),
  ('Over the last 30 days, Pyth data settled roughly 2.4x as many prediction-market contracts as which other oracle?', array['Chainlink'], 'pyth', 'easy', 'recap-extra | Pythian Bulletin, Oct 30', true, false, 'choice', array['API3', 'RedStone', 'Band Protocol'], true),
  ('Which metal had Pyth''s biggest hourly series on Kalshi, with 46.6K contracts in 30 days?', array['Platinum'], 'pyth', 'medium', 'recap-extra | Pythian Bulletin, Oct 30', true, false, 'choice', array['Palladium', 'Silver', 'Copper'], true),
  ('On Polymarket, Pyth settles daily up/down markets on stocks like Apple and which other big tech company?', array['Microsoft'], 'pyth', 'medium', 'recap-extra | Pythian Bulletin, Oct 30', true, false, 'choice', array['Intel', 'Oracle', 'IBM'], true),
  ('Kalshi uses which Pyth Index to resolve its Dow Jones price markets?', array['US30'], 'pyth', 'medium', 'recap-extra | Pythian Bulletin, Oct 30', true, false, 'choice', array['NAS100', 'SPX500', 'DAX40'], true),
  ('In "RWA perps", what does RWA stand for?', array['Real-world assets'], 'pyth', 'easy', 'recap-extra | Pythian Bulletin, Oct 27', true, false, 'choice', array['Random wallet addresses', 'Rapid withdrawal accounts', 'Reserve-weighted allocation'], true),
  ('The Pyth Treasury indices update from 02:30 to 17:00 on weekdays in which city''s time?', array['New York'], 'pyth', 'easy', 'recap-extra | Pythian Bulletin, Oct 30', true, false, 'choice', array['London', 'Tokyo', 'Singapore'], true),
  ('How many tenors, from 2Y to 30Y, do the new Pyth Treasury indices cover?', array['7'], 'pyth', 'easy', 'recap-extra | Pythian Bulletin, Oct 30', true, false, 'choice', array['4', '10', '14'], true),
  ('Pyth''s Oct 2 blog says finance is increasingly consumed by software rather than by what?', array['Terminals'], 'pyth', 'medium', 'recap-extra | Pythian Bulletin, Oct 3', true, false, 'choice', array['Banks', 'Regulators', 'Exchanges'], true),
  ('MCP Server 1.1 added funding rates and which type of moving-average price?', array['EMA'], 'pyth', 'medium', 'recap-extra | Pythian Bulletin, Oct 16', true, false, 'choice', array['VWAP', 'RSI', 'ATR'], true),
  ('Which gas benchmark was added to Pyth Indices in September 2026?', array['Henry Hub'], 'pyth', 'medium', 'recap-extra | Pythian Bulletin, Oct 6', true, false, 'choice', array['TTF', 'NBP', 'JKM'], true),
  ('Which metal index was the fourth most viewed feed in Pyth Terminal in September?', array['Silver Index'], 'pyth', 'medium', 'recap-extra | Pythian Bulletin, Oct 6', true, false, 'choice', array['Copper Index', 'Platinum Index', 'Palladium Index'], true),
  ('Which research firm''s RWA Markets dashboard tracks Pyth''s share of RWA perp volume?', array['Zinn Research'], 'pyth', 'medium', 'recap-extra | Pythian Bulletin, Oct 27', true, false, 'choice', array['Messari', 'Galaxy Research', 'Kaiko Research'], true)
) as v(text, accepted_answers, category, difficulty, source_reference, verified, active, kind, wrong_options, recap_on)
where not exists (select 1 from public.questions q where q.text = v.text and q.kind = 'choice');


-- conferência: deve mostrar 20
select count(*) as perguntas_do_recap from public.questions where kind = 'choice' and source_reference like 'recap-extra%';

-- (para DESLIGAR este mês depois: update public.questions set recap_on = false where source_reference like 'recap-extra%';)
