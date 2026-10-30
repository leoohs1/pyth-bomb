-- PYTH BOMB: 3 vidas no PYTH RECAP MONTH (step 40)
-- Rode no SQL Editor do Supabase, DEPOIS do 038, de preferência ENTRE partidas. Pode rodar mais de uma vez.
--
-- O Classic de digitar continua com 2 vidas (nada muda pra ele). Só as salas "choice" (Recap Month) começam com 3.
-- Como: a start_game de sempre é só RENOMEADA para start_game_typed e continua fazendo tudo igual; a "start_game" nova
-- chama ela e, se a sala for do Recap, põe 3 vidas em todo mundo. O "Play again" também passa por aqui, então recomeça com 3.
-- Se algo der errado: rode 040b_recap_three_lives_DESFAZER.sql e a start_game original volta.

do $$
begin
  if to_regprocedure('public.start_game_typed(uuid)') is null then
    alter function public.start_game(uuid) rename to start_game_typed;
  end if;
end
$$;

create or replace function public.start_game(p_room_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_mode text;
begin
  -- tudo que o jogo já fazia (confere o dono, zera tudo, sorteia a primeira pergunta...)
  perform public.start_game_typed(p_room_id);

  select quiz_mode into v_mode from rooms where id = p_room_id;
  if v_mode = 'choice' then
    update players set lives = 3 where room_id = p_room_id;
  end if;
end;
$function$;

revoke execute on function public.start_game(uuid)       from public, anon;
grant  execute on function public.start_game(uuid)       to authenticated;
revoke execute on function public.start_game_typed(uuid) from public, anon, authenticated;

-- conferência: as duas devem dar true
select
  to_regprocedure('public.start_game_typed(uuid)') is not null as start_game_original_guardada,
  position('start_game_typed' in pg_get_functiondef('public.start_game(uuid)'::regprocedure)) > 0 as recap_com_3_vidas_ativo;
