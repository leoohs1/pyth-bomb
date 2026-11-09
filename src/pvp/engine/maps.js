// Mapas do PVP: sempre SIMÉTRICOS, pra nenhum canto ter vantagem.
// O mapa é sorteado num quarto só (em cima à esquerda) e espelhado pros outros 3 quartos:
// os mesmos caixotes e os mesmos itens escondidos pra todo mundo.
//
// - 'tavern' (The Rusty Anchor) e 'hull' (Bear Market): salas normais, cheias de caixotes com itens dentro
// - 'chop' (Shark Tank, a arena do CHOP): a FINAL. Quase sem caixotes; os itens vão aparecendo no chão (match.js)
import { COLS, ROWS, FLOOR, WALL, BLOCK, HOLE, BLOCK_CHANCE } from './constants.js'
import { shuffle, pick } from './rng.js'

export const MAPS = {
  tavern: { name: 'The Rusty Anchor', final: false },
  hull: { name: 'Bear Market', final: false },
  chop: { name: 'Shark Tank', final: true },
}

// Mapa de cada sala: a FINAL é sempre a arena do CHOP; as outras salas sorteiam taverna ou casco
// (o sorteio usa a sorte da sala; na fase 2 vem do Pyth Entropy)
export const ROOM_MAPS = ['tavern', 'hull']
export function pickRoomMap(final, rng) {
  return final ? 'chop' : pick(ROOM_MAPS, rng)
}

// Os 4 cantos, na mesma ordem de src/pvp/heroes.js (CORNERS): tl, tr, bl, br
export const CORNER_IDS = ['tl', 'tr', 'bl', 'br']
export function cornerCell(corner, cols = COLS, rows = ROWS) {
  const right = corner === 'tr' || corner === 'br'
  const bottom = corner === 'bl' || corner === 'br'
  return { x: right ? cols - 2 : 1, y: bottom ? rows - 2 : 1 }
}

// Quais cantos usar com n jogadores (sala de 2 = cantos opostos; de 3 = os dois de cima e o de baixo à esquerda)
export function cornersFor(n) {
  if (n <= 2) return ['tl', 'br'].slice(0, n)
  if (n === 3) return ['tl', 'tr', 'bl']
  return [...CORNER_IDS]
}

// Itens escondidos em CADA quarto do mapa: 1 bomba e 1 fogo garantidos + 2 sorteados (repetir na lista = mais chance)
const QUARTER_ITEMS = ['bomb', 'fire']
const QUARTER_BONUS = { count: 2, pool: ['bomb', 'fire', 'speed', 'speed', 'shield', 'kick', 'bomb', 'fire', 'detonator'] }

// a casa (x, y) e as espelhadas dela nos outros quartos
function mirrors(x, y, cols, rows) {
  const mx = cols - 1 - x, my = rows - 1 - y
  return [[x, y], [mx, y], [x, my], [mx, my]]
}

const isFixedWall = (x, y, cols, rows) =>
  x === 0 || y === 0 || x === cols - 1 || y === rows - 1 || (x % 2 === 0 && y % 2 === 0)

// casas onde cada jogador nasce + uma pra direita/esquerda e uma pra cima/baixo (o "L" livre do canto)
function safeCells(cols, rows) {
  const safe = new Set()
  for (const id of CORNER_IDS) {
    const c = cornerCell(id, cols, rows)
    const sx = c.x === 1 ? 1 : -1, sy = c.y === 1 ? 1 : -1
    for (const [x, y] of [[c.x, c.y], [c.x + sx, c.y], [c.x, c.y + sy]]) safe.add(x + ',' + y)
  }
  return safe
}

export function makeMap(kind, rng) {
  if (kind === 'chop') return makeFinal(rng)
  const cols = COLS, rows = ROWS
  const tiles = new Uint8Array(cols * rows)
  const safe = safeCells(cols, rows)
  const halfX = (cols - 1) / 2, halfY = (rows - 1) / 2
  // sorteia só o quarto de cima à esquerda (incluindo a linha e a coluna do meio) e espelha
  for (let y = 0; y <= halfY; y++) {
    for (let x = 0; x <= halfX; x++) {
      let t = FLOOR
      if (isFixedWall(x, y, cols, rows)) t = WALL
      else if (!safe.has(x + ',' + y) && rng() < BLOCK_CHANCE) t = BLOCK
      for (const [mx, my] of mirrors(x, y, cols, rows)) tiles[my * cols + mx] = t
    }
  }

  // itens escondidos: escolhidos nos caixotes do quarto de cima à esquerda (fora da linha/coluna do meio) e espelhados
  const quarter = []
  for (let y = 1; y < halfY; y++) for (let x = 1; x < halfX; x++) if (tiles[y * cols + x] === BLOCK) quarter.push([x, y])
  const kinds = shuffle([...QUARTER_ITEMS, ...Array.from({ length: QUARTER_BONUS.count }, () => pick(QUARTER_BONUS.pool, rng))], rng)
  // o 1º item fica num dos 6 caixotes mais perto do canto (quem começa quebrando caixote já acha alguma coisa)
  const byDist = [...quarter].sort((a, b) => (a[0] + a[1]) - (b[0] + b[1]))
  const near = byDist.slice(0, 6)
  const chosen = []
  if (near.length) chosen.push(near[Math.floor(rng() * near.length)])
  for (const c of shuffle(quarter.filter((c) => !chosen.includes(c)), rng)) {
    if (chosen.length >= kinds.length) break
    chosen.push(c)
  }
  const hidden = []
  chosen.forEach(([x, y], i) => {
    for (const [mx, my] of mirrors(x, y, cols, rows)) hidden.push({ x: mx, y: my, kind: kinds[i] })
  })

  return { kind, cols, rows, tiles, hidden, final: false }
}

// FINAL na arena do CHOP: aberta, 4 pilares, o redemoinho (buraco) no meio e só 8 caixotes vazios pra se esconder
function makeFinal() {
  const cols = COLS, rows = ROWS
  const tiles = new Uint8Array(cols * rows)
  const pillars = new Set(['4,4', `${cols - 5},4`, `4,${rows - 5}`, `${cols - 5},${rows - 5}`])
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const edge = x === 0 || y === 0 || x === cols - 1 || y === rows - 1
      tiles[y * cols + x] = edge || pillars.has(`${x},${y}`) ? WALL : FLOOR
    }
  }
  const hole = { x: (cols - 3) / 2, y: (rows - 3) / 2, w: 3, h: 3 }
  for (let y = 0; y < hole.h; y++) for (let x = 0; x < hole.w; x++) tiles[(hole.y + y) * cols + hole.x + x] = HOLE
  const mx = (cols - 1) / 2, my = (rows - 1) / 2
  for (const [x, y] of [[mx - 2, 2], [mx + 2, 2], [mx - 2, rows - 3], [mx + 2, rows - 3], [2, my - 2], [2, my + 2], [cols - 3, my - 2], [cols - 3, my + 2]]) {
    tiles[y * cols + x] = BLOCK
  }
  return { kind: 'chop', cols, rows, tiles, hole, hidden: [], final: true }
}

export function tileAt(level, x, y) {
  if (x < 0 || y < 0 || x >= level.cols || y >= level.rows) return WALL
  return level.tiles[y * level.cols + x]
}

export function setTile(level, x, y, t) {
  level.tiles[y * level.cols + x] = t
}

// Ordem em que as casas fecham na morte súbita: uma espiral das bordas pro meio (só casas que não são parede)
export function closingOrder(level) {
  const out = []
  let x0 = 1, y0 = 1, x1 = level.cols - 2, y1 = level.rows - 2
  while (x0 <= x1 && y0 <= y1) {
    for (let x = x0; x <= x1; x++) out.push([x, y0])
    for (let y = y0 + 1; y <= y1; y++) out.push([x1, y])
    if (y1 > y0) for (let x = x1 - 1; x >= x0; x--) out.push([x, y1])
    if (x1 > x0) for (let y = y1 - 1; y > y0; y--) out.push([x0, y])
    x0++; y0++; x1--; y1--
  }
  return out.filter(([x, y]) => { const t = tileAt(level, x, y); return t === FLOOR || t === BLOCK })
}
