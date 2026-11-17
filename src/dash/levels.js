// Fases do Pyth Dash (plataforma, modo PVE). Cada fase é montada por código com os "tijolinhos" abaixo,
// pra ficar fácil de mexer sem desenhar uma grade de 160 colunas à mão.
//
// Casas da grade (1 letra cada):
//   '.' vazio  '#' chão  'b' bloco de dados  '?' bloco oráculo (dá moeda quando bate a cabeça)  'u' oráculo já usado
//   'g'/'G' vela verde (corpo/topo)  'r'/'R' vela vermelha (corpo/topo)  — as velas do gráfico de preço são os "canos"
// Coisas soltas (fora da grade): moedas (price updates), inimigos (lag bugs), checkpoint e a bandeira do fim.

export const ROWS = 14
export const FLOOR = ROWS - 2 // linha do topo do chão

function makeBuilder(cols) {
  const grid = Array.from({ length: ROWS }, () => Array(cols).fill('.'))
  const L = { cols, grid, coins: [], enemies: [], start: { x: 2, y: FLOOR - 2 }, checkpoint: null, flag: cols - 8 }
  const set = (x, y, c) => { if (x >= 0 && x < cols && y >= 0 && y < ROWS) grid[y][x] = c }
  return {
    L,
    ground(x0, x1) { for (let x = x0; x <= x1; x++) for (let y = FLOOR; y < ROWS; y++) set(x, y, '#') },
    row(x, y, str) { [...str].forEach((c, i) => { if (c !== ' ') set(x + i, y, c) }) },
    // vela do gráfico: 2 casas de largura, h de altura a partir do chão
    candle(x, h, up = true) {
      const body = up ? 'g' : 'r', top = up ? 'G' : 'R'
      for (let i = 0; i < h; i++) for (const dx of [0, 1]) set(x + dx, FLOOR - 1 - i, i === h - 1 ? top : body)
    },
    // escada de blocos subindo (n degraus)
    stairs(x, n, dir = 1) {
      for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) set(dir > 0 ? x + i : x - i, FLOOR - 1 - j, 'b')
    },
    coin(x, y) { L.coins.push({ x, y }) },
    coins(x, y, n, dy = 0) { for (let i = 0; i < n; i++) L.coins.push({ x: x + i, y: y + (dy ? Math.round(Math.sin((i / Math.max(1, n - 1)) * Math.PI) * dy) : 0) }) },
    enemy(x, y = FLOOR - 1) { L.enemies.push({ x, y }) },
  }
}

// Fase 1: "Price Feed Plains" — aprender a correr, pular, pisar nos lag bugs e bater nos oráculos
function level1() {
  const b = makeBuilder(170)
  b.ground(0, 40); b.ground(44, 79); b.ground(83, 118); b.ground(122, 169)
  // começo: oráculos e blocos
  b.row(12, FLOOR - 4, '?')
  b.row(16, FLOOR - 4, 'b?b?b')
  b.row(18, FLOOR - 8, '?')
  b.coins(15, FLOOR - 5, 0); b.coins(6, FLOOR - 1, 4)
  b.enemy(22)
  // velas do gráfico (sobe, desce...)
  b.candle(26, 2, true); b.candle(33, 3, false)
  b.enemy(30)
  b.coins(26, FLOOR - 4, 2); b.coins(33, FLOOR - 5, 2)
  // primeiro buraco
  b.coins(40, FLOOR - 4, 4, 1)
  b.row(48, FLOOR - 4, 'bbbb')
  b.row(52, FLOOR - 8, 'b??b')
  b.coins(48, FLOOR - 5, 4)
  b.enemy(55); b.enemy(57)
  b.candle(62, 3, true); b.candle(68, 2, false)
  b.enemy(65)
  b.coins(71, FLOOR - 1, 5)
  // checkpoint e o segundo buraco, com plataforma no meio
  b.L.checkpoint = { x: 76 }
  b.row(79, FLOOR - 4, 'bbbb')
  b.coins(79, FLOOR - 5, 4)
  b.row(88, FLOOR - 4, '?b?')
  b.enemy(92); b.enemy(97)
  b.row(96, FLOOR - 7, 'bbbbbb')
  b.coins(96, FLOOR - 8, 6)
  b.enemy(99, FLOOR - 8)
  b.candle(104, 2, true); b.candle(108, 3, true); b.candle(112, 3, false)
  b.coins(108, FLOOR - 5, 2)
  // último buraco e o fim
  b.coins(118, FLOOR - 4, 4, 1)
  b.enemy(128); b.enemy(131); b.enemy(134)
  b.row(126, FLOOR - 4, 'b?b')
  b.stairs(142, 6)
  b.coins(142, FLOOR - 8, 3)
  b.L.flag = 158
  return { id: 'plains', name: 'Price Feed Plains', par: 75, ...b.L }
}

export const LEVELS = [level1()]
