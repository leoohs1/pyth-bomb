// Números do Pyth Bomb PVP. Estas regras rodam igual no navegador (teste local) e no servidor de jogo,
// por isso aqui não tem nada de tela, janela ou React: só regra.
// (Copiado do Solo e ajustado pro PVP; o Solo continua com os números dele em src/solo/engine/constants.js.)

// Tamanho da sala em casas (com a borda). Ímpar nos dois sentidos, pro xadrez de paredes fixas fechar certinho.
export const COLS = 15
export const ROWS = 13

// Tipos de casa (os mesmos números do Solo, pra poder usar o desenho dele)
export const FLOOR = 0
export const WALL = 1
export const BLOCK = 2
export const HOLE = 3

// Passo fixo da simulação: 60 passinhos por segundo, igual em qualquer computador (e no servidor)
export const STEP = 1 / 60

// Jogador (decidido com a Halls em 2026-11-09: começa com 1 bomba e alcance 2)
export const PLAYER_SPEED = 3.4
export const START_BOMBS = 1
export const START_RANGE = 2

// Limites dos itens
export const MAX_BOMBS = 6
export const MAX_RANGE = 6
export const SPEED_STEP = 0.4
export const MAX_SPEED = 5.0

// Itens especiais
export const SHIELD_INVULN = 2
export const DETONATOR_FUSE = 6
export const KICK_SPEED = 9

// Bomba e explosão (segundos)
export const FUSE_TIME = 2.4
export const FLAME_TIME = 0.55
export const BURN_TIME = 0.45

// Itens no chão: o fogo queima o item e ele some sozinho depois de um tempo
export const ITEM_LIFE = 20
export const ITEM_BLINK = 4
export const ITEM_GRACE = 0.7

// Salas normais: chance de cada casa livre ter um caixote quebrável
export const BLOCK_CHANCE = 0.6

// Tempo da sala (Halls, 2026-11-09): 2 minutos; depois as paredes fecham das bordas pro meio até sobrar um
export const COUNTDOWN = 3          // 3, 2, 1, GO!
export const ROUND_TIME = 120
export const CLOSE_EVERY = 0.32     // a cada quantos segundos cai mais um bloco do fechamento
export const CLOSE_WARN = 0.9       // quanto tempo antes a casa pisca avisando que vai fechar
export const END_DELAY = 2          // segundos mostrando a sala depois que alguém ganhou

// FINAL (arena do CHOP): ninguém começa com item extra; os itens vão aparecendo no chão
export const FINAL_ITEM_EVERY = 3.5 // a cada quantos segundos aparece um item novo
export const FINAL_ITEM_MAX = 5     // no máximo tantos itens no chão ao mesmo tempo
export const FINAL_ITEM_FIRST = 2   // o primeiro item aparece logo depois do GO

// Quem cai da internet: fica parado no lugar por até 15 s (Halls); depois disso conta como eliminado.
// (Quem controla isso é o servidor; a regra só oferece a função eliminate().)
export const RECONNECT_GRACE = 15
