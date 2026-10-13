// Números do modo Solo que dá pra ajustar à vontade pra testar o "feeling" do jogo.

// Tamanho da fase em casas (já contando a borda de paredes). Ímpar nos dois sentidos,
// pra o xadrez de paredes fixas fechar certinho, como no Bomberman clássico.
// Teste de mapa mais largo: /solo?cols=19 (ou 21...). Precisa ser ímpar, entre 11 e 25.
const COLS_TEST = typeof window !== 'undefined' ? Number(new URLSearchParams(window.location.search).get('cols')) : 0
export const COLS = COLS_TEST >= 11 && COLS_TEST <= 25 && COLS_TEST % 2 === 1 ? COLS_TEST : 15
export const ROWS = 13

// Tipos de casa da grade
export const FLOOR = 0
export const WALL = 1   // parede fixa: não quebra
export const BLOCK = 2  // bloco quebrável

// Chance de cada casa livre começar com um bloco quebrável (0 a 1)
export const BLOCK_CHANCE = 0.62

// Jogador
export const PLAYER_SPEED = 3.4    // casas por segundo (Halls pediu 20% mais lento que 4.2)
export const START_BOMBS = 1       // quantas bombas ao mesmo tempo
export const START_RANGE = 2       // alcance da explosão, em casas pra cada lado
export const START_LIVES = 3

// Power-ups (limites máximos)
export const MAX_BOMBS = 6
export const MAX_RANGE = 7
export const SPEED_STEP = 0.4      // cada bota soma isso na velocidade
export const MAX_SPEED = 4.6

// Bomba e explosão (segundos)
export const FUSE_TIME = 2.4
export const FLAME_TIME = 0.55
export const BURN_TIME = 0.45      // quanto tempo o bloco leva "queimando" antes de sumir

// Passo fixo da simulação (60 vezes por segundo, igual em qualquer computador)
export const STEP = 1 / 60
