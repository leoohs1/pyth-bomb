-- PYTH BOMB: DESFAZ as 3 vidas do Recap Month (volta a start_game de antes do passo 40)
-- Rode no SQL Editor SÓ se o "Start game" der problema depois do 040. Pode rodar mais de uma vez.

do $$
begin
  if to_regprocedure('public.start_game_typed(uuid)') is not null then
    drop function public.start_game(uuid);                                -- tira a start_game nova
    alter function public.start_game_typed(uuid) rename to start_game;    -- a original volta com o nome de sempre
  end if;
end
$$;

grant execute on function public.start_game(uuid) to authenticated;

-- conferência: start_game_voltou deve ser true; guardada_ainda_existe deve ser false
select
  to_regprocedure('public.start_game(uuid)') is not null as start_game_voltou,
  to_regprocedure('public.start_game_typed(uuid)') is not null as guardada_ainda_existe;
