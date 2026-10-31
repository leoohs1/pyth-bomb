-- PYTH BOMB: PYTH RECAP MONTH (step 38) — o Classic com respostas A/B/C/D
-- Rode no SQL Editor do Supabase, de preferência ENTRE partidas. Pode rodar mais de uma vez.
--
-- O que muda: salas novas podem ser "choice" (alternativas). Nelas, a pessoa com a bomba toca em A, B, C ou D:
-- UMA chance só. Errar (ou o tempo acabar) = perde uma vida e a bomba passa. Acertar = a bomba passa.
-- O que NÃO muda: o Classic de digitar continua exatamente como está. Nenhuma função dele é reescrita:
--   * deal_question (sortear pergunta) é só RENOMEADA para deal_question_typed e vira a que o Classic usa;
--     a "deal_question" nova só escolhe entre ela e a do Recap.
--   * submit_answer (a resposta digitada, com a dica "so close") nem é tocada: o Recap usa submit_choice.
-- Se algo der errado: rode 038b_recap_month_DESFAZER.sql e tudo volta como era.

-- ============================================================
-- colunas novas (todas com valor padrão: nada muda pro Classic)
-- ============================================================
alter table public.questions add column if not exists kind text not null default 'typed';
alter table public.questions add column if not exists wrong_options text[];      -- as 3 opções erradas (a certa é accepted_answers[1])
alter table public.questions add column if not exists fact text;                 -- frase extra do recap (opcional)
alter table public.questions add column if not exists recap_on boolean not null default false; -- liga/desliga as perguntas do Recap do mês
alter table public.questions add column if not exists times_correct int not null default 0;     -- quantas vezes alguém ACERTOU esta pergunta (baralho do Recap)
alter table public.questions add column if not exists deck_tier int not null default 0;          -- 0 = perguntas do mês (saem primeiro); 1 = reserva "Pyth em geral" (saem depois, em cada volta)
alter table public.questions add column if not exists last_dealt_at timestamptz;                -- quando ela foi sorteada pela última vez

alter table public.rooms add column if not exists quiz_mode text not null default 'typed';  -- 'typed' (Classic) | 'choice' (Recap)
alter table public.rooms add column if not exists current_choices text[];        -- as 4 opções já embaralhadas (todo mundo vê; a certa NÃO é marcada)
alter table public.rooms add column if not exists last_recap jsonb;             -- a pergunta que acabou de fechar: {q, a, fact, src}

-- ============================================================
-- deal_choice_question: sorteia uma pergunta de alternativas. O "baralho" do Recap funciona em VOLTAS:
--   * volta 1: só saem perguntas novas, sem repetir nenhuma. Dentro de cada volta, primeiro as perguntas DO MÊS
--     (deck_tier 0) e só depois a reserva "Pyth em geral" (deck_tier 1);
--   * quando acabam as novas, começa a volta 2 e, dentro de cada camada, a ordem é:
--       primeiro as que NINGUÉM acertou (erraram ou o tempo estourou), depois as que alguém já acertou (fim do baralho);
--       empatando, a que saiu há mais tempo vem primeiro (nunca repete a que acabou de sair).
-- Só faz diferença quando as perguntas começam a faltar. Também grava o "recap" da pergunta que acabou de fechar.
-- ============================================================
create or replace function public.deal_choice_question(p_room_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $function$
declare
  v_prev uuid;
  v_qid uuid;
  v_text text;
  v_correct text;
  v_wrong text[];
  v_opts text[];
begin
  -- recap da pergunta anterior (a que acabou de ser respondida, ou que estourou o tempo)
  select current_question_id into v_prev from room_secrets where room_id = p_room_id;
  if v_prev is not null then
    update rooms set last_recap = (
      select jsonb_build_object(
        'q', q.text,
        'a', q.accepted_answers[1],
        'fact', q.fact,
        'src', nullif(split_part(coalesce(q.source_reference, ''), ' | ', 2), '')
      ) from questions q where q.id = v_prev
    ) where id = p_room_id;
  else
    update rooms set last_recap = null where id = p_room_id;   -- partida nova: começa sem recap
  end if;

  select id, text, accepted_answers[1], wrong_options into v_qid, v_text, v_correct, v_wrong
  from questions
  where kind = 'choice' and verified and recap_on
  order by times_dealt, deck_tier, (times_correct > 0), last_dealt_at nulls first, random()
  limit 1
  for update skip locked;

  if v_qid is null then
    -- (duas salas no mesmo instante e a melhor estava travada pela outra: pega a melhor sem travar)
    select id, text, accepted_answers[1], wrong_options into v_qid, v_text, v_correct, v_wrong
    from questions where kind = 'choice' and verified and recap_on
    order by times_dealt, deck_tier, (times_correct > 0), last_dealt_at nulls first, random()
    limit 1;
  end if;

  if v_qid is null then
    raise exception 'No multiple-choice questions are turned on';
  end if;

  update questions set times_dealt = times_dealt + 1, last_dealt_at = now() where id = v_qid;

  -- as 4 opções (a certa + as 3 erradas) embaralhadas
  select array_agg(o order by random()) into v_opts
  from unnest(array[v_correct] || coalesce(v_wrong, '{}')) as o;

  update room_secrets set current_question_id = v_qid where room_id = p_room_id;

  update rooms
  set current_question_text = v_text,
      current_choices = v_opts,
      question_expires_at = now() + interval '15 seconds'
  where id = p_room_id;
end;
$function$;

-- ============================================================
-- deal_question: o Classic continua com a função de sempre (agora chamada deal_question_typed)
-- ============================================================
do $$
begin
  if to_regprocedure('public.deal_question_typed(uuid)') is null then
    alter function public.deal_question(uuid) rename to deal_question_typed;
  end if;
end
$$;

create or replace function public.deal_question(p_room_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $function$
declare
  v_mode text;
begin
  select quiz_mode into v_mode from rooms where id = p_room_id;
  if v_mode = 'choice' then
    perform public.deal_choice_question(p_room_id);
  else
    perform public.deal_question_typed(p_room_id);
  end if;
end;
$function$;

revoke execute on function public.deal_question(uuid)        from public, anon, authenticated;
revoke execute on function public.deal_question_typed(uuid)  from public, anon, authenticated;
revoke execute on function public.deal_choice_question(uuid) from public, anon, authenticated;

-- ============================================================
-- submit_choice: a resposta do Recap (UMA chance). p_choice = o texto da opção tocada.
-- Devolve 'correct' | 'wrong' (perdeu uma vida) | 'timeout' | 'exploded' (acabaram as vidas)
-- ============================================================
create or replace function public.submit_choice(p_room_id uuid, p_choice text)
 returns text
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $function$
declare
  v_room rooms;
  v_me uuid;
  v_next uuid;
  v_qid uuid;
  v_ok boolean;
  v_res text;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;

  -- resolve primeiro um relógio já vencido (mesma lógica do submit_answer)
  perform public.tick(p_room_id);

  select * into v_room from rooms where id = p_room_id for update;
  if v_room.status <> 'playing' then raise exception 'Game is not running'; end if;
  if v_room.quiz_mode <> 'choice' then raise exception 'This room is not a multiple-choice room'; end if;

  select id into v_me from players
  where room_id = p_room_id and user_id = auth.uid() and alive limit 1;

  if v_me is null or v_room.bomb_holder_id is distinct from v_me then
    raise exception 'You do not have the bomb';
  end if;

  -- os segundos acabaram (e o relógio ainda não pegou): o turno falha
  if v_room.question_expires_at is not null
     and now() >= v_room.question_expires_at + interval '600 milliseconds' then
    v_res := public.fail_turn(p_room_id);
    return case when v_res = 'out' then 'exploded' else 'timeout' end;
  end if;

  select current_question_id into v_qid from room_secrets where room_id = p_room_id;

  -- só vale uma das opções que estão na tela; a certa é accepted_answers[1]
  if p_choice is null or not (p_choice = any (coalesce(v_room.current_choices, '{}'))) then
    raise exception 'That is not one of the options';
  end if;

  select exists (
    select 1 from questions q where q.id = v_qid and q.accepted_answers[1] = p_choice
  ) into v_ok;

  if not v_ok then
    v_res := public.fail_turn(p_room_id);       -- perde uma vida e a bomba passa
    return case when v_res = 'out' then 'exploded' else 'wrong' end;
  end if;

  -- certo: a pergunta vai pro fim do baralho (só volta depois das que ninguém acertou)
  update questions set times_correct = times_correct + 1 where id = v_qid;

  -- a bomba passa já, e o próximo ganha uma pergunta nova
  v_next := public.pick_next_holder(p_room_id, v_me);
  if v_next is null then raise exception 'Nobody to pass to'; end if;

  update rooms set bomb_holder_id = v_next, holder_mistakes = 0 where id = p_room_id;
  perform public.deal_question(p_room_id);
  return 'correct';
end;
$function$;

-- conferência: tudo deve dar true
select
  exists (select 1 from information_schema.columns where table_name = 'rooms' and column_name = 'quiz_mode') as sala_tem_quiz_mode,
  exists (select 1 from information_schema.columns where table_name = 'questions' and column_name = 'kind') as pergunta_tem_kind,
  to_regprocedure('public.deal_question_typed(uuid)') is not null as classic_preservado,
  position('deal_choice_question' in pg_get_functiondef('public.deal_question(uuid)'::regprocedure)) > 0 as despachante_ok,
  to_regprocedure('public.submit_choice(uuid,text)') is not null as submit_choice_ok;
