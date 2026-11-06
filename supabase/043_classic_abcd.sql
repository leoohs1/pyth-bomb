-- PYTH BOMB: CLASSIC A/B/C/D (step 43) — o Classic com alternativas, com perguntas GERAIS (+ todas as do Recap)
-- Rode DEPOIS de rodar de novo o 038 e o 040 (eles agora sabem escolher o "baralho": Recap ou Classic A/B/C/D). Pode rodar mais de uma vez.
--
-- Regras do Classic A/B/C/D: 10 segundos por pergunta, 2 vidas, uma chance só, baralho em voltas (as de "desafio" primeiro,
-- as óbvias de reserva), com contadores PRÓPRIOS (não mexe no baralho do Recap).
-- O Recap Month continua separado (15 s, 3 vidas, só perguntas de Pyth).

alter table public.questions add column if not exists classic_on boolean not null default false;
alter table public.questions add column if not exists classic_tier int not null default 0;
alter table public.questions add column if not exists c_times_dealt int not null default 0;
alter table public.questions add column if not exists c_times_correct int not null default 0;
alter table public.questions add column if not exists c_last_dealt_at timestamptz;
alter table public.rooms add column if not exists quiz_pool text not null default 'recap';

-- A mesma pergunta pode existir em dois formatos (digitar e alternativas) com o MESMO texto. O índice antigo olhava só o texto
-- e barrava isso (erro 23505 questions_text_unique); o novo olha texto + tipo. Seguro de rodar de novo.
create unique index if not exists questions_text_kind_unique on public.questions (lower(text), kind);
drop index if exists public.questions_text_unique;

-- todas as perguntas do Recap também jogam no Classic A/B/C/D (camada 0 = saem primeiro)
update public.questions set classic_on = true, classic_tier = 0 where kind = 'choice' and recap_on;

-- conferência: recap_no_classic deve ser 175 (as do Recap); depois dos arquivos 044a, 044b e 044c o total passa de 700
select
  count(*) filter (where kind = 'choice' and recap_on and classic_on) as recap_no_classic,
  count(*) filter (where kind = 'choice' and classic_on) as total_no_classic,
  position('quiz_pool' in pg_get_functiondef('public.deal_choice_question(uuid)'::regprocedure)) > 0 as baralho_novo_ativo,
  position('v_pool' in pg_get_functiondef('public.start_game(uuid)'::regprocedure)) > 0 as vidas_novas_ativas
from public.questions;
