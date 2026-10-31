-- PYTH BOMB: perguntas do PYTH RECAP MONTH (recap-base) — 46 perguntas de alternativas
-- Rode no SQL Editor do Supabase DEPOIS do 038_recap_month.sql. Pode rodar de novo sem duplicar.
-- Elas entram com active = false: o Classic de digitar NUNCA sorteia estas. Só salas "Recap Month" sorteiam (recap_on = true).
alter table public.questions add column if not exists deck_tier int not null default 0;   -- (o 038 também cria; aqui só por segurança)
insert into public.questions (text, accepted_answers, category, difficulty, source_reference, verified, active, kind, wrong_options, recap_on, deck_tier)
select v.text, v.accepted_answers, v.category, v.difficulty, v.source_reference, v.verified, v.active, v.kind, v.wrong_options, v.recap_on, v.deck_tier
from (values
  ('What does Pyth Network call itself on its website?', array['The Price Layer for Global Finance'], 'pyth', 'easy', 'recap-base | pyth.network', true, false, 'choice', array['The Wallet for Every Chain', 'The Exchange for Every Asset', 'The Bank for On-Chain Money'], true, 1),
  ('What does an oracle do for a blockchain?', array['Brings real-world data, like prices, on-chain'], 'pyth', 'easy', 'recap-base | ', true, false, 'choice', array['Mines new coins', 'Stores users'' passwords', 'Speeds up the internet'], true, 1),
  ('Where does Pyth get its prices from?', array['Directly from exchanges, market makers and trading firms'], 'pyth', 'easy', 'recap-base | Pyth blog, Q1 2023', true, false, 'choice', array['Scraped from public websites', 'Posts on social media', 'Anonymous volunteers'], true, 1),
  ('Which of these firms publishes its market data to Pyth?', array['Jane Street'], 'pyth', 'easy', 'recap-base | pyth.network', true, false, 'choice', array['Walmart', 'Netflix', 'Toyota'], true, 1),
  ('Which of these is listed among Pyth''s publishers?', array['Revolut'], 'pyth', 'easy', 'recap-base | pyth.network', true, false, 'choice', array['Spotify', 'Airbnb', 'Uber'], true, 1),
  ('Which set of asset classes does Pyth Pro cover?', array['Crypto, equities, FX and commodities'], 'pyth', 'easy', 'recap-base | pyth.network', true, false, 'choice', array['Only crypto', 'Only US stocks', 'Only real estate and art'], true, 1),
  ('Which of these is NOT a kind of data Pyth provides?', array['Weather forecasts'], 'pyth', 'easy', 'recap-base | pyth.network', true, false, 'choice', array['Crypto prices', 'Stock prices', 'FX rates'], true, 1),
  ('Pyth is a "pull" oracle. What does that mean?', array['Apps pull the latest price onto their chain when they need it'], 'pyth', 'medium', 'recap-base | Pyth blog, Q1 2023', true, false, 'choice', array['Prices are pushed to every chain on a fixed timer', 'Only the Pyth team can fetch prices', 'Prices can only be read once a day'], true, 1),
  ('Besides a price, what does Pyth report to show how uncertain that price is?', array['A confidence interval'], 'pyth', 'medium', 'recap-base | docs.pyth.network', true, false, 'choice', array['A credit rating', 'A transaction fee', 'A voting score'], true, 1),
  ('How does Pyth combine the prices from many publishers?', array['With a median that resists outliers'], 'pyth', 'medium', 'recap-base | docs.pyth.network', true, false, 'choice', array['It always takes the highest price', 'It adds all the prices together', 'It uses whichever price arrives first'], true, 1),
  ('In OHLC candlestick data, what does the "H" stand for?', array['High'], 'pyth', 'easy', 'recap-base | docs.pyth.network', true, false, 'choice', array['Hourly', 'Hash', 'Holdings'], true, 1),
  ('Where do apps fetch Pyth''s signed price updates?', array['Hermes'], 'pyth', 'medium', 'recap-base | docs.pyth.network', true, false, 'choice', array['Apollo', 'Athena', 'Zeus'], true, 1),
  ('Which cross-chain messaging protocol has Pyth used to deliver prices to other blockchains?', array['Wormhole'], 'pyth', 'medium', 'recap-base | Pyth blog, Q1 2023', true, false, 'choice', array['LayerZero', 'Axelar', 'Chainlink CCIP'], true, 1),
  ('Pyth first went live on mainnet in 2021 on which blockchain?', array['Solana'], 'pyth', 'medium', 'recap-base | Pyth blog, Q1 2023', true, false, 'choice', array['Ethereum', 'Bitcoin', 'Cardano'], true, 1),
  ('How many data providers did Pyth launch with on mainnet in 2021?', array['25'], 'pyth', 'hard', 'recap-base | Pyth blog, Q1 2023', true, false, 'choice', array['5', '100', '250'], true, 1),
  ('As of September 2026, Pyth''s website lists more than how many live price feeds?', array['3,600'], 'pyth', 'medium', 'recap-base | pyth.network', true, false, 'choice', array['360', '36', '36,000'], true, 1),
  ('As of September 2026, Pyth''s website lists more than how many data publishers?', array['138'], 'pyth', 'medium', 'recap-base | pyth.network', true, false, 'choice', array['13', '380', '1,380'], true, 1),
  ('Pyth''s website lists more than how much in transaction volume?', array['$5 trillion'], 'pyth', 'medium', 'recap-base | pyth.network', true, false, 'choice', array['$5 million', '$5 billion', '$500 billion'], true, 1),
  ('How many blockchains does Pyth''s website list as connected (September 2026)?', array['114'], 'pyth', 'medium', 'recap-base | pyth.network', true, false, 'choice', array['14', '54', '314'], true, 1),
  ('Which Pyth product delivers low-latency market data to institutions, trading venues and AI systems?', array['Pyth Pro'], 'pyth', 'easy', 'recap-base | pyth.network', true, false, 'choice', array['Pyth Wallet', 'Pyth Swap', 'Pyth Entropy'], true, 1),
  ('What is Pyth Terminal?', array['A self-serve web app to explore Pyth''s price feeds'], 'pyth', 'easy', 'recap-base | docs.pyth.network', true, false, 'choice', array['A hardware wallet', 'A command-line game', 'A stablecoin'], true, 1),
  ('What can you see for a price feed in Pyth Terminal?', array['Candlestick (OHLC) charts'], 'pyth', 'easy', 'recap-base | docs.pyth.network', true, false, 'choice', array['Live video streams', 'Weather maps', 'Private messages'], true, 1),
  ('What does Pyth''s MCP server let AI tools like Claude and Cursor do?', array['Connect to Pyth market data'], 'pyth', 'easy', 'recap-base | docs.pyth.network', true, false, 'choice', array['Send emails for you', 'Design logos', 'Host websites'], true, 1),
  ('What are Pyth Indices built to provide?', array['Continuous, around-the-clock benchmark prices'], 'pyth', 'easy', 'recap-base | pyth.network', true, false, 'choice', array['Daily weather reports', 'A ranking of top traders', 'Random numbers'], true, 1),
  ('Which Pyth Pro plan starts at $2,500 per month?', array['Pro'], 'pyth', 'medium', 'recap-base | Pyth Pro plans', true, false, 'choice', array['Free', 'Starter', 'Enterprise'], true, 1),
  ('Pyth Pro''s fastest fixed-rate channel updates every how many milliseconds?', array['50'], 'pyth', 'medium', 'recap-base | docs.pyth.network', true, false, 'choice', array['5', '500', '5,000'], true, 1),
  ('What kind of platform is Polymarket, which uses Pyth Pro?', array['A prediction market'], 'pyth', 'easy', 'recap-base | pyth.network', true, false, 'choice', array['A video game studio', 'A ride-hailing app', 'A hardware-wallet maker'], true, 1),
  ('Kalshi, which uses Pyth data, is regulated by which US agency?', array['CFTC'], 'pyth', 'medium', 'recap-base | Pythian Bulletin, Oct 30', true, false, 'choice', array['SEC', 'FDIC', 'IRS'], true, 1),
  ('Nasdaq Basic is available through which Pyth product?', array['The Data Marketplace'], 'pyth', 'medium', 'recap-base | pyth.network', true, false, 'choice', array['Pyth Entropy', 'Pyth Terminal', 'Express Relay'], true, 1),
  ('Which venue does Pyth describe as a 24/7 macro trading venue built with Pyth?', array['Hyperliquid'], 'pyth', 'medium', 'recap-base | pyth.network', true, false, 'choice', array['Uniswap', 'OpenSea', 'Aave'], true, 1),
  ('Kraken uses Pyth Indices for 24/7 perpetuals on which commodity?', array['Oil'], 'pyth', 'medium', 'recap-base | pyth.network', true, false, 'choice', array['Wheat', 'Coffee', 'Lumber'], true, 1),
  ('Which firm publishes 24/7 benchmark US Treasury pricing on Pyth?', array['Tradeweb'], 'pyth', 'medium', 'recap-base | pyth.network', true, false, 'choice', array['Coinbase', 'Kraken', 'Polymarket'], true, 1),
  ('OpenYield strengthens its pricing on Pyth Pro for which kind of asset?', array['US Treasuries'], 'pyth', 'medium', 'recap-base | pyth.network', true, false, 'choice', array['Gold', 'Bitcoin', 'Oil'], true, 1),
  ('Coinbase Derivatives launched 24/7 thematic equity futures with Pyth and which index provider?', array['MarketVector'], 'pyth', 'medium', 'recap-base | pyth.network', true, false, 'choice', array['MSCI', 'FTSE Russell', 'S&P Dow Jones'], true, 1),
  ('What does Pyth Entropy generate?', array['Random numbers'], 'pyth', 'easy', 'recap-base | docs.pyth.network', true, false, 'choice', array['Stablecoins', 'Price charts', 'Wallet addresses'], true, 1),
  ('Which of these is a use case for Pyth Entropy?', array['A lottery'], 'pyth', 'easy', 'recap-base | docs.pyth.network', true, false, 'choice', array['Streaming music', 'Editing photos', 'Sending email'], true, 1),
  ('Pyth Entropy is a random number generator for which kind of smart contracts?', array['EVM-based'], 'pyth', 'medium', 'recap-base | docs.pyth.network', true, false, 'choice', array['Bitcoin-only', 'Cardano-only', 'Cosmos-only'], true, 1),
  ('Pyth Entropy is built on which kind of protocol?', array['Commit-reveal'], 'pyth', 'medium', 'recap-base | docs.pyth.network', true, false, 'choice', array['Proof of work', 'Zero-knowledge rollup', 'Multisig voting'], true, 1),
  ('What kind of token is PYTH?', array['The governance token of Pyth Network'], 'pyth', 'easy', 'recap-base | docs.pyth.network', true, false, 'choice', array['A stablecoin pegged to the dollar', 'A wrapped Bitcoin', 'An NFT collection'], true, 1),
  ('How is Pyth governed?', array['By the Pyth DAO, through votes of staked PYTH'], 'pyth', 'medium', 'recap-base | docs.pyth.network', true, false, 'choice', array['By one CEO', 'By Wormhole guardians alone', 'By Solana validators'], true, 1),
  ('How long does voting on a Pyth DAO proposal last?', array['7 days'], 'pyth', 'medium', 'recap-base | docs.pyth.network', true, false, 'choice', array['1 day', '3 days', '30 days'], true, 1),
  ('In Pyth governance, each staked PYTH token gives how many votes?', array['One vote'], 'pyth', 'medium', 'recap-base | docs.pyth.network', true, false, 'choice', array['Ten votes', 'Half a vote', 'A hundred votes'], true, 1),
  ('In Oracle Integrity Staking, what can happen to staked PYTH if a publisher''s data is inaccurate?', array['It can be slashed'], 'pyth', 'easy', 'recap-base | docs.pyth.network', true, false, 'choice', array['It doubles in value', 'It becomes an NFT', 'It is sent to the publisher as a gift'], true, 1),
  ('What are stakers who assign their stake to a publisher''s pool called?', array['Delegators'], 'pyth', 'medium', 'recap-base | docs.pyth.network', true, false, 'choice', array['Miners', 'Validators', 'Auditors'], true, 1),
  ('Which Pyth product was wound down after a governance decision in July 2026?', array['Express Relay'], 'pyth', 'medium', 'recap-base | docs.pyth.network', true, false, 'choice', array['Pyth Entropy', 'Pyth Terminal', 'Pyth Pro'], true, 1),
  ('Which company operates the relayers that receive publisher updates for Pyth Pro?', array['Douro Labs'], 'pyth', 'hard', 'recap-base | docs.pyth.network', true, false, 'choice', array['Binance', 'Jump Trading', 'Wormhole Foundation'], true, 1)
) as v(text, accepted_answers, category, difficulty, source_reference, verified, active, kind, wrong_options, recap_on, deck_tier)
where not exists (select 1 from public.questions q where q.text = v.text and q.kind = 'choice');

-- garante a camada de reserva também nas que já existiam (se este arquivo já tinha sido rodado antes)
update public.questions set deck_tier = 1 where kind = 'choice' and source_reference like 'recap-base%';


-- conferência: deve mostrar 46
select count(*) as perguntas_do_recap from public.questions where kind = 'choice' and source_reference like 'recap-base%';

-- (para DESLIGAR este mês depois: update public.questions set recap_on = false where source_reference like 'recap-base%';)
