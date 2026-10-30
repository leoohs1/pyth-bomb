-- PYTH BOMB: DESFAZ o Recap Month (volta o sorteio de perguntas ao que era antes do passo 38)
-- Rode no SQL Editor SÓ se o Classic der problema depois do 038. Pode rodar mais de uma vez.
-- As colunas novas ficam (são inofensivas): só as funções voltam.

do $$
begin
  if to_regprocedure('public.deal_question_typed(uuid)') is not null then
    drop function public.deal_question(uuid);                              -- tira o despachante
    alter function public.deal_question_typed(uuid) rename to deal_question; -- a original volta com o nome de sempre
  end if;
end
$$;

drop function if exists public.submit_choice(uuid, text);
drop function if exists public.deal_choice_question(uuid);

-- conferência: classic_voltou deve ser true; despachante deve ser false
select
  to_regprocedure('public.deal_question(uuid)') is not null as classic_voltou,
  to_regprocedure('public.deal_question_typed(uuid)') is not null as despachante_ainda_existe;
