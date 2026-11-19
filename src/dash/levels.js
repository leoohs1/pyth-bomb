// Fases do Pyth Dash (plataforma, modo PVE). Cada fase é montada por código com os "tijolinhos" abaixo,
// pra ficar fácil de mexer sem desenhar uma grade de 180 colunas à mão.
//
// Casas da grade (1 letra cada):
//   '.' vazio  '#' chão  'b' bloco de dados  '?' bloco oráculo (moeda)  '!' bloco oráculo com PODER (Confidence Shield)
//   'u' oráculo já usado  'g'/'G' vela verde (corpo/topo)  'r'/'R' vela vermelha (corpo/topo)
//   '1'..'9' bloco APAGADO do grupo N: só vira chão quando alguém liga o Price Relay daquele grupo
//   'f' parede FALSA (parece bloco, mas dá pra atravessar: esconde segredos)  'x' portão do chefe (abre quando ele cai)
//   'c' ponte que DESABA (treme quando você pisa, cai e volta depois de uns segundos)
// Coisas soltas (fora da grade): moedas (price updates), inimigos (lag bugs), Price Relays, os 3 Publishers,
// Confidence Gems, baús (sorteio do Pyth Entropy), checkpoint e o Oracle Beacon do fim (a "bandeira").

export const ROWS = 14
export const FLOOR = ROWS - 2 // linha do topo do chão

function makeBuilder(cols) {
  const grid = Array.from({ length: ROWS }, () => Array(cols).fill('.'))
  const L = {
    cols, grid, coins: [], enemies: [], relays: [], publishers: [], gems: [], chests: [], movers: [], winds: [],
    echoes: [], torches: [], dark: false, boss: null, portals: [], jets: [], chaser: null, signs: [], checkpoints: null,
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
    // zona da Echo Shadow: entre x0 e x1 uma sombra refaz o seu caminho "delay" segundos depois
    echo(x0, x1, delay = 2) { L.echoes.push({ x0, x1, delay }) },
    torch(x, y = FLOOR) { L.torches.push({ x, y }) },
    // retângulo de blocos iguais (ex.: parede falsa 'f')
    fill(x0, y0, x1, y1, c) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, c) },
    // chefe Talos: começa em x, briga entre ax0 e ax1 (acorda quando o herói passa de ax0)
    boss(x, ax0, ax1) { L.boss = { x, ax0, ax1, floor: FLOOR } },
    // chefe final: Kronos flutua; a vitória é acender os altares (em ordem). altars = [{ x, y }] (y = chão do altar)
    kronos(x, ax0, ax1, altars) { L.boss = { type: 'kronos', x, ax0, ax1, floor: FLOOR, altars } },
    // portal (redemoinho): entra em (x,y) e sai em (tx,ty)
    portal(x, y, tx, ty) { L.portals.push({ x, y, tx, ty }) },
    // jato de fogo saindo do chão em y, h casas de altura; liga a cada period s (phase desloca o ritmo)
    jet(x, y = FLOOR, h = 3, { period = 3, phase = 0 } = {}) { L.jets.push({ x, y, h, period, phase }) },
    // tempestade/lava que persegue o herói de x0 até x1 (lead = quantas casas atrás ela nasce)
    chaser(x0, x1, speed, kind, lead = 12) { L.chaser = { x0, x1, speed, kind, lead } },
    cp(x, y = FLOOR) { (L.checkpoints ??= []).push({ x, y }) },
    sign(x, y, text) { L.signs.push({ x, y, text }) },
    // Chart Ride: cada dia vira uma vela de "w" casas saindo da lava (verde subiu, vermelha caiu). A altura segue o
    // fechamento do dia (entre lo e hi casas), mas nunca sobe mais que 3 de uma vela pra outra (dá pra pular sempre).
    // A cada gapEvery velas fica 1 casa de lava no meio. Devolve onde o gráfico acabou.
    chart(x0, closes, { w = 2, lo = 2, hi = 9, gapEvery = 4, startH = ROWS - FLOOR } = {}) {
      const mn = Math.min(...closes), mx = Math.max(...closes)
      let x = x0, prevH = startH // começa na altura do chão de antes (a 1ª vela também só sobe até 3)
      closes.forEach((c, i) => {
        let h = Math.round(lo + ((c - mn) / (mx - mn || 1)) * (hi - lo))
        h = Math.min(h, prevH + 3)
        const up = i === 0 || c >= closes[i - 1]
        for (let dx = 0; dx < w; dx++) for (let y = ROWS - h; y < ROWS; y++) set(x + dx, y, y === ROWS - h ? (up ? 'G' : 'R') : (up ? 'g' : 'r'))
        prevH = h
        x += w
        if (gapEvery && (i + 1) % gapEvery === 0 && i < closes.length - 1) x += 1
      })
      return x
    },
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

// Fase 3: "Echoes of the Styx". O submundo escuro (só as tochas e o herói iluminam), sombras que repetem os seus passos,
// paredes falsas com segredos, o rio Estige atravessado em barcos (polias de lado) e o 1º chefe: TALOS, o gigante de bronze.
function level3() {
  const F = FLOOR
  const b = makeBuilder(200)
  b.L.dark = true
  // 1) a entrada da caverna: tochas, o 1º Publisher, e a 1ª zona de sombra (corredor reto pra aprender)
  b.ground(0, 49)
  for (const x of [3, 14, 26, 37]) b.torch(x)
  b.publisher(8)
  b.coins(4, F - 1, 3)
  b.row(16, F - 4, 'b?b')
  b.enemy(22)
  b.echo(24, 60, 2)
  b.coins(27, F - 1, 6)
  // 2) a parede com segredo: por fora é um bloco de pedra; os 2 de baixo da esquerda são FALSOS e escondem uma salinha
  //    com o baú e o Price Relay que acende o caminho alto até a GEM 1. O caminho normal sobe pela escada e passa por cima.
  b.stairs(39, 3) // (entre a escada e a parede ficam 2 casas de chão: quem descer ali e andar pra parede acha a salinha)
  b.fill(44, F - 5, 49, F - 5, '#')     // teto da parede
  b.fill(49, F - 4, 49, F - 1, '#')     // fundo da salinha
  b.fill(44, F - 4, 48, F - 1, 'f')     // fachada falsa (atravessa)
  b.chest(45)
  b.relay(47, 1)
  b.row(52, F - 7, '111')
  b.row(57, F - 8, '111')
  b.gem(61, F - 10)
  b.coins(52, F - 8, 3)
  b.ground(50, 56)
  b.enemy(53)
  b.row(59, F - 2, 'b'); b.row(62, F - 3, 'b') // pedrinhas pra atravessar o rio
  b.coins(59, F - 3, 1); b.coins(62, F - 4, 1)
  // 3) checkpoint, 2º Publisher, a 2ª sombra (mais rápida) numa subida, e um nicho escondido com o 2º baú
  b.ground(65, 83)
  b.torch(66); b.torch(80)
  b.cp(68)
  b.publisher(72)
  b.echo(76, 108, 1.6)
  b.stairs(79, 4)
  b.ground(83, 92, F - 4)
  b.enemy(88, F - 5)
  b.coins(85, F - 5, 5)
  b.torch(90, F - 4)
  b.ground(96, 106, F - 3)
  b.enemy(99, F - 4)
  b.fill(102, F - 6, 106, F - 6, '#')  // teto do nicho
  b.fill(105, F - 5, 106, F - 4, '#')  // fundo do nicho
  b.fill(102, F - 5, 104, F - 4, 'f')  // fachada falsa
  b.chest(103, F - 3)
  b.ground(107, 112, F - 3)
  b.torch(108, F - 3)
  // 4) o rio Estige: barcos (polias de lado), uma pedra no meio e a GEM 2 em cima do 2º barco
  b.mover(114, F - 2, 3, { dx: 6, period: 5 })
  b.mover(124, F - 3, 3, { dx: 6, period: 5 })
  b.ground(134, 135, F - 4)
  b.mover(137, F - 2, 3, { dx: 3, period: 4 })
  b.gem(128, F - 8)
  b.coins(116, F - 4, 3); b.coins(126, F - 5, 3)
  b.ground(142, 199)
  b.torch(144)
  b.publisher(146)
  b.cp(148) // checkpoint logo antes da arena: quem morre pro Talos tenta de novo daqui
  // 5) a arena do TALOS (portão fechado até ele cair) e a GEM 3 num degrau alto da arena
  for (const x of [152, 168, 183]) b.torch(x)
  b.row(153, F - 4, 'b')
  b.row(155, F - 7, 'bb')
  b.gem(156, F - 9)
  b.boss(172, 152, 183)
  b.fill(184, F - 6, 185, F - 1, 'x')
  // 6) depois do portão: o Oracle Beacon
  b.coins(187, F - 1, 3)
  b.L.flag = 193
  return { id: 'styx', name: 'Echoes of the Styx', par: 160, theme: 'styx', ...b.L }
}

// Formato da queda do BTC de agosto de 2024 (fechamentos diários APROXIMADOS, em mil dólares, 22/jul a 25/ago).
// Não são dados da Pyth: a API de histórico da Pyth agora pede chave (Pyth Pro). Dá pra trocar pelos reais depois.
const BTC_AUG_2024 = [67.6, 65.9, 65.4, 65.8, 68.0, 67.9, 68.2, 66.8, 66.2, 64.6, 65.3, 61.4, 60.7, 58.1, 54.0, 56.0, 55.1, 61.7,
  60.9, 60.9, 58.7, 59.3, 60.6, 58.7, 57.5, 58.9, 59.4, 58.5, 59.5, 59.0, 61.2, 60.4, 64.1, 64.2, 64.2]

// Fase 4: "Aegean Crossing". Ilhas no mar roxo: pontes que desabam, redemoinhos (portais) e, no fim, a tempestade
// vem atrás de você.
function level4() {
  const F = FLOOR
  const b = makeBuilder(210)
  // 1) a 1ª ilha e a 1ª ponte que desaba
  b.ground(0, 22)
  b.publisher(7)
  b.coins(3, F - 1, 3)
  b.row(12, F - 4, 'b?b')
  b.enemy(17)
  b.row(23, F, 'ccccccccc')
  b.coins(24, F - 2, 7)
  // 2) ilha 2: o poder, a harpia, o baú e o redemoinho que leva por cima do mar largo
  b.ground(32, 50)
  b.row(36, F - 4, '!')
  b.harpy(42, F - 6, 3)
  b.chest(46)
  b.portal(49, F - 2, 62, F - 2)
  // 3) ilha 3: checkpoint, 2º Publisher, a GEM 1 num degrau alto e pedrinhas que desabam
  b.ground(60, 86)
  b.cp(66)
  b.publisher(71)
  b.row(75, F - 3, 'b'); b.row(77, F - 6, 'bb')
  b.gem(78, F - 8)
  b.enemy(82)
  b.row(88, F - 2, 'c'); b.row(91, F - 3, 'c'); b.row(94, F - 2, 'c')
  b.coins(88, F - 3, 1); b.coins(91, F - 4, 1); b.coins(94, F - 3, 1)
  // 4) ilha 4: harpias; um redemoinho secreto num degrau alto leva pra uma ilhota no céu (GEM 2 + baú)
  b.ground(97, 125)
  b.harpy(108, F - 6, 3); b.harpy(118, F - 7, 3)
  b.row(100, F - 3, 'b') // degrau pra chegar no degrau alto do redemoinho secreto
  b.row(103, F - 5, 'bbb')
  b.portal(104, F - 6, 141, F - 10)
  b.row(140, F - 8, 'bbb')
  b.gem(142, F - 10)
  b.chest(140, F - 8)
  b.portal(123, F - 2, 136, F - 2)
  // 5) ilha 5: checkpoint e 3º Publisher
  b.ground(134, 156)
  b.cp(137)
  b.publisher(147)
  b.coins(150, F - 1, 4)
  // 6) a tempestade vem atrás: corre pelas pontes que desabam até o Oracle Beacon
  b.chaser(152, 200, 5.2, 'storm')
  b.row(157, F, 'cccccccc')
  b.gem(161, F - 4) // GEM 3: no ar, em cima da ponte (pula sem parar)
  b.ground(165, 169)
  b.row(171, F - 2, 'c'); b.row(174, F - 3, 'c'); b.row(177, F - 2, 'c')
  b.ground(180, 209)
  b.enemy(188)
  b.coins(182, F - 1, 4)
  b.L.flag = 200
  return { id: 'aegean', name: 'Aegean Crossing', par: 150, theme: 'aegean', ...b.L }
}

// Fase 5: "Hephaestus Forge". A forja do vulcão: jatos de fogo, pistões sobre a lava, o Chart Ride (as plataformas são as
// velas de um gráfico de preço) e, no fim, a lava da liquidação vem atrás de você.
function level5() {
  const F = FLOOR
  const b = makeBuilder(232)
  // 1) entrada: os primeiros jatos (avisam com fumaça antes de soltar fogo) e pistões sobre a lava
  b.ground(0, 25)
  b.publisher(7)
  b.enemy(10)
  b.jet(14, F, 3, { period: 3 }); b.jet(20, F, 3, { period: 3, phase: 1.5 })
  b.mover(27, F - 1, 2, { dy: -3, period: 3 })
  b.mover(31, F - 4, 2, { dy: 3, period: 3 })
  b.mover(36, F - 2, 2, { dx: 2, period: 2.5 })
  b.gem(31, F - 9) // GEM 1: em cima do 2º pistão quando ele está no alto
  b.coins(27, F - 5, 2); b.coins(36, F - 4, 2); b.coins(44, F - 1, 3)
  b.ground(41, 60)
  b.cp(44)
  b.row(47, F - 4, 'b!b')
  b.jet(50, F, 3, { period: 2.6 }); b.jet(55, F, 3, { period: 2.6, phase: 1.3 })
  b.chest(52)
  b.publisher(58)
  // 2) o Chart Ride: as velas do gráfico saindo da lava
  b.sign(61, F - 4, 'BTC/USD · Aug 2024 crash (shape)')
  const xe = b.chart(62, BTC_AUG_2024)
  for (const x of [66, 72, 80, 88, 96, 106, 114, 122, 130, 136]) { let y = 0; while (y < ROWS && b.L.grid[y][x] === '.') y++; if (y < ROWS) b.coin(x, y - 2) } // moedas em cima das velas
  b.gem(62 + 2 * 17 + 4, F - 9) // GEM 2: no alto, logo depois do fundo do tombo
  // 3) a forja: checkpoint, 3º Publisher, jatos e um degrau alto com o 2º baú
  const xc = xe + 1
  b.ground(xc, xc + 30)
  b.cp(xc + 3)
  b.publisher(xc + 8)
  b.jet(xc + 13, F, 3, { period: 2.4 }); b.jet(xc + 21, F, 4, { period: 2.4, phase: 1.2 })
  b.row(xc + 16, F - 3, 'b'); b.row(xc + 17, F - 6, 'bbb')
  b.chest(xc + 18, F - 6)
  b.enemy(xc + 26)
  // 4) a lava da liquidação vem atrás: ilhas e pistões até o Oracle Beacon
  const x5 = xc + 31
  b.chaser(x5, x5 + 46, 5.4, 'lava')
  b.mover(x5 + 1, F - 1, 2, { dx: 2, period: 2 })
  b.ground(x5 + 6, x5 + 10)
  b.mover(x5 + 12, F - 2, 2, { dy: -2, period: 2 })
  b.ground(x5 + 16, x5 + 19, F - 2)
  b.gem(x5 + 17, F - 6) // GEM 3: no meio da fuga
  b.ground(x5 + 23, x5 + 26, F - 1)
  b.ground(x5 + 29, 231)
  b.coins(x5 + 30, F - 1, 4)
  b.L.flag = x5 + 40
  return { id: 'forge', name: 'Hephaestus Forge', par: 170, theme: 'forge', ...b.L }
}

// Fase 6: "Tartarus: The Stale Fortress". A fortaleza do Kronos: um pouco de tudo (sombra, pontes que desabam, polias,
// parede falsa) e a luta final: acender os 3 altares enquanto o Kronos ataca. Aí a Genesis Flame volta.
function level6() {
  const F = FLOOR
  const b = makeBuilder(200)
  // 1) o portão da fortaleza: sombra e uma ponte que desaba
  b.ground(0, 30)
  b.publisher(7)
  b.echo(12, 40, 1.8)
  b.coins(14, F - 1, 6)
  b.row(31, F, 'cccccc')
  b.gem(33, F - 5) // GEM 1: no ar em cima da ponte
  b.ground(37, 58)
  b.enemy(46); b.enemy(52)
  // 2) checkpoint e o abismo das polias (com uma harpia)
  b.cp(60)
  b.ground(59, 70)
  b.publisher(64)
  b.mover(72, F - 2, 3, { dx: 5, period: 4 })
  b.coins(73, F - 4, 3); b.coins(83, F - 6, 3); b.coins(89, F - 4, 3)
  b.mover(82, F - 4, 3, { dy: 3, period: 3.5 })
  b.mover(88, F - 2, 3, { dx: 4, period: 4 })
  b.harpy(84, F - 9, 4)
  b.ground(96, 125)
  // 3) a parede com segredo (igual a do Estige): GEM 2 e o baú lá dentro; o caminho passa por cima
  b.stairs(102, 3)
  b.fill(107, F - 5, 112, F - 5, '#')
  b.fill(112, F - 4, 112, F - 1, '#')
  b.fill(107, F - 4, 111, F - 1, 'f')
  b.chest(108)
  b.gem(110, F - 2)
  b.enemy(118); b.enemy(122)
  // 4) a arena do Kronos: 3 altares (o do meio fica num degrau alto), o portão e a Genesis Flame
  b.ground(126, 199)
  b.publisher(128)
  b.cp(131)
  b.row(156, F - 3, 'b')
  b.row(159, F - 5, 'bbb')
  b.gem(150, F - 6) // GEM 3: no ar, no começo da arena
  b.coins(98, F - 1, 4); b.coins(132, F - 1, 4)
  b.kronos(170, 138, 185, [{ x: 142, y: F }, { x: 160, y: F - 5 }, { x: 180, y: F }])
  b.fill(186, F - 6, 187, F - 1, 'x')
  b.L.flag = 194
  return { id: 'tartarus', name: 'Tartarus: The Stale Fortress', par: 180, theme: 'tartarus', final: true, ...b.L }
}

export const LEVELS = [level1(), level2(), level3(), level4(), level5(), level6()]
