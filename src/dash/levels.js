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
    cols, grid, coins: [], enemies: [], relays: [], publishers: [], gems: [], chests: [], movers: [], winds: [],
    start: { x: 2, y: FLOOR - 2 }, checkpoint: null, flag: cols - 8, restoreStart: 8,
  }
  const set = (x, y, c) => { if (x >= 0 && x < cols && y >= 0 && y < ROWS) grid[y][x] = c }
  return {
    L,
    // chão de x0 a x1; top = linha de cima (padrão FLOOR). Com top menor vira morro/penhasco
    ground(x0, x1, top = FLOOR) { for (let x = x0; x <= x1; x++) for (let y = top; y < ROWS; y++) set(x, y, '#') },
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
    publisher(x, y = FLOOR) { L.publishers.push({ x, y }) },
    // plataforma de mármore que anda (polia): w casas de largura, vai de (x,y) até (x+dx,y+dy) e volta em period s.
    // group: só anda depois que o Price Relay desse grupo acende. y = linha onde se pisa
    mover(x, y, w, { dx = 0, dy = 0, period = 4, group = 0 } = {}) { L.movers.push({ x, y, w, dx, dy, period, group }) },
    // zona de vento: rajadas que empurram (force < 0 = pra esquerda)
    wind(x0, x1, force, { period = 3.2, dur = 1.4, warn = 0.6 } = {}) { L.winds.push({ x0, x1, force, period, dur, warn }) },
    harpy(x, y, range = 3) { L.enemies.push({ type: 'harpy', x, y, range }) },
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

// Fase 2: "Mount Parnassus". Subida da montanha sagrada: polias de mármore (algumas ligadas por Price Relay),
// as primeiras harpias e, no fim, o vento dos deuses empurrando nos pilares.
function level2() {
  const F = FLOOR
  const b = makeBuilder(196)
  // 1) pé da montanha: chão, 1º Publisher, um degrau e a 1ª polia (anda sozinha, de lado)
  b.ground(0, 20)
  b.coins(4, F - 1, 3)
  b.publisher(7)
  b.row(11, F - 4, 'b?b')
  b.enemy(15)
  b.ground(21, 30, F - 2)
  b.coins(23, F - 3, 4)
  b.mover(31, F - 3, 3, { dx: 4, period: 4 })
  b.coins(33, F - 5, 3)
  // 2) a 1ª harpia num lugar plano, o poder antes dela, o baú e o relay que liga o elevador do penhasco
  b.ground(38, 47, F - 2)
  b.row(40, F - 6, '!')
  b.harpy(44, F - 6, 3)
  b.chest(42, F - 2)
  b.relay(46, 1, { y: F - 2 })
  b.mover(48, F - 2, 3, { dy: -6.6, period: 5, group: 1 }) // elevador: passa um pouco do alto do penhasco (janela de ~1 s pra sair andando)
  b.row(44, F - 9, 'bb') // GEM 1: pula do elevador lá em cima pra esquerda
  b.gem(44, F - 10)
  // 3) o alto do penhasco e a descida pro checkpoint
  b.ground(51, 75, F - 8)
  b.coins(54, F - 9, 6)
  b.enemy(62, F - 9); b.enemy(68, F - 9)
  b.ground(76, 100, F - 4)
  b.L.checkpoint = { x: 79, y: F - 4 }
  b.publisher(83, F - 4)
  b.row(88, F - 8, 'b?b')
  b.enemy(92, F - 5)
  b.coins(95, F - 5, 4)
  // 4) o abismo das polias: dois elevadores subindo e descendo ao contrário, uma polia de lado e uma harpia
  b.mover(103, F - 4, 3, { dy: 3, period: 4 })
  b.mover(109, F - 1, 3, { dy: -4, period: 4 })
  b.mover(115, F - 4, 3, { dx: 6, period: 5 })
  b.harpy(112, F - 9, 4)
  b.coins(104, F - 6, 2); b.coins(110, F - 7, 2)
  b.gem(110, F - 9) // GEM 2: em cima do 2º elevador quando ele está no alto
  b.ground(126, 150, F - 3)
  b.row(131, F - 6, 'bbb')
  b.chest(132, F - 6) // 2º baú, num degrau alto
  b.enemy(137, F - 4); b.enemy(144, F - 4)
  b.publisher(147, F - 3)
  // 5) o vento dos deuses: pilares com rajadas empurrando pra esquerda (o aviso vem antes)
  for (const x of [154, 159, 164, 169]) b.ground(x, x + 1, F - 3)
  b.wind(151, 175, -16)
  b.coins(156, F - 5, 2); b.coins(166, F - 5, 2)
  b.gem(163, F - 7) // GEM 3: no ar, entre dois pilares
  // 6) a chegada: chão, uns lag bugs e o Oracle Beacon
  b.ground(174, 195)
  b.enemy(181)
  b.L.flag = 188
  return { id: 'parnassus', name: 'Mount Parnassus', par: 130, theme: 'parnassus', ...b.L }
}

export const LEVELS = [level1(), level2()]
