// Fases do Pyth Dash (plataforma, modo PVE). Cada fase é montada por código com os "tijolinhos" abaixo,
// pra ficar fácil de mexer sem desenhar uma grade de 180 colunas à mão.
//
// Casas da grade (1 letra cada):
//   '.' vazio  '#' chão  'b' bloco de dados  '?' bloco oráculo (moeda)  '!' bloco oráculo com PODER (Confidence Shield)
//   'u' oráculo já usado  'g'/'G' vela verde (corpo/topo)  'r'/'R' vela vermelha (corpo/topo)
//   '1'..'9' bloco APAGADO do grupo N: só vira chão quando alguém liga o Price Relay daquele grupo
// Coisas soltas (fora da grade): moedas (price updates), inimigos (lag bugs), Price Relays, os 3 Publishers,
// Confidence Gems, baús (sorteio do Pyth Entropy), checkpoint e o Oracle Beacon do fim (a "bandeira").

export const ROWS = 14
export const FLOOR = ROWS - 2 // linha do topo do chão

function makeBuilder(cols) {
  const grid = Array.from({ length: ROWS }, () => Array(cols).fill('.'))
  const L = {
    cols, grid, coins: [], enemies: [], relays: [], publishers: [], gems: [], chests: [],
    start: { x: 2, y: FLOOR - 2 }, checkpoint: null, flag: cols - 8, restoreStart: 8,
  }
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
    // Price Relay: o poste que liga os blocos apagados do grupo. y = chão onde ele fica em pé.
    // fresh = segundos que o sinal dura (o bloco "envelhece" e apaga; toca de novo pra renovar). Sem fresh: fica ligado.
    relay(x, group, { y = FLOOR, fresh = 0 } = {}) { L.relays.push({ x, y, group, fresh }) },
    publisher(x) { L.publishers.push({ x }) },
    gem(x, y) { L.gems.push({ x, y }) },
    chest(x, y = FLOOR) { L.chests.push({ x, y }) },
  }
}

// Fase 1: "Delphi's Olive Grove" (antes "Price Feed Plains"; virou Grécia antiga em 2026-11-19). Segue os 7 momentos combinados com a Halls (2026-11-19):
// 1 começo seguro · 2 primeiro lag bug · 3 oracle blocks e o poder · 4 primeiro Price Relay · 5 checkpoint e segredo
// 6 desafio final (sinal "fresco" que apaga) · 7 Oracle Beacon. Os 3 Publishers ficam no caminho (não dá pra pular).
function level1() {
  const b = makeBuilder(184)
  b.ground(0, 63); b.ground(72, 111); b.ground(127, 183)

  // 1) começo seguro: chão reto, moedas, o 1º Publisher logo ali (o mundo começa a voltar a ter cor)
  b.coins(5, FLOOR - 1, 4)
  b.publisher(11)
  b.candle(16, 2, true)
  b.coins(16, FLOOR - 4, 2)

  // 2) o 1º lag bug, andando devagar entre duas velas (dá pra ver e pular em cima com calma)
  b.candle(23, 2, true); b.candle(37, 2, false)
  b.enemy(31)
  b.coins(28, FLOOR - 4, 5, 1)

  // 3) oracle blocks: um de moeda, o do PODER (Confidence Shield) e uma fileira pra subir
  b.row(42, FLOOR - 4, '?')
  b.row(46, FLOOR - 4, 'b!b')
  b.row(52, FLOOR - 4, 'b?b?b')
  b.row(58, FLOOR - 7, 'bb') // depois da fileira: degrau pro 1º segredo
  b.gem(59, FLOOR - 9)        // GEM 1: sobe na fileira, pula pro degrau e pega lá em cima
  b.coins(52, FLOOR - 5, 3)
  b.enemy(49)
  b.chest(60)                 // 1º baú (Pyth Entropy), num lugar tranquilo

  // 4) o 1º Price Relay: a ponte está apagada (cinza); encosta no poste e ela acende
  b.relay(62, 1)
  b.row(64, FLOOR, '11111111')
  b.coins(65, FLOOR - 2, 6)

  // 5) checkpoint, 2º Publisher e o caminho secreto: um relay em cima da vela acende uma escada pro céu
  b.L.checkpoint = { x: 76 }
  b.publisher(80)
  b.candle(86, 3, true)
  b.relay(86, 2, { y: FLOOR - 3 })
  b.row(89, FLOOR - 5, '22')
  b.row(92, FLOOR - 7, '22')
  b.row(95, FLOOR - 9, '2222222')
  b.coins(95, FLOOR - 10, 5)
  b.gem(101, FLOOR - 11)      // GEM 2: no fim da escada do céu
  b.chest(98, FLOOR - 9)      // 2º baú, lá em cima (prêmio de quem achou o segredo)
  b.enemy(93); b.enemy(99)
  b.candle(104, 2, false)
  b.enemy(107)

  // 6) desafio final: buraco grande; o relay acende plataformas por 7 s ("fresh") e depois elas envelhecem e apagam.
  //    Por cima, um caminho mais difícil leva à GEM 3.
  b.relay(109, 3, { fresh: 7 })
  b.row(113, FLOOR - 2, '333')
  b.row(118, FLOOR - 3, '333')
  b.row(123, FLOOR - 2, '333')
  b.row(121, FLOOR - 6, '33')
  b.gem(123, FLOOR - 9)       // GEM 3: sobe na plataforma alta e pula antes que ela apague
  b.coins(113, FLOOR - 3, 3); b.coins(118, FLOOR - 4, 3); b.coins(123, FLOOR - 3, 3)
  b.publisher(131)            // 3º Publisher: do outro lado do buraco
  b.enemy(137); b.enemy(141)
  b.candle(144, 3, false)
  b.row(139, FLOOR - 4, 'b?b')
  b.enemy(150); b.enemy(153)

  // 7) a escada final e o Oracle Beacon (entrega o preço; o mundo inteiro volta a ser roxo)
  b.stairs(157, 6)
  b.coins(157, FLOOR - 8, 3)
  b.L.flag = 172
  return { id: 'delphi', name: "Delphi's Olive Grove", par: 110, ...b.L }
}

export const LEVELS = [level1()]
