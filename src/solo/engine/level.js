import { COLS, ROWS, FLOOR, WALL, BLOCK, HOLE, BLOCK_CHANCE } from './constants.js'

// Monta uma fase: borda de paredes, paredes fixas em xadrez (casas com x e y pares)
// e blocos quebráveis sorteados. O canto onde o jogador nasce fica sempre livre
// (casa inicial + uma pra direita + uma pra baixo), senão ele explodiria na primeira bomba.
export function makeLevel(random = Math.random, blockChance = BLOCK_CHANCE) {
  const tiles = new Uint8Array(COLS * ROWS)
  const start = { x: 1, y: 1 }
  const safe = new Set(['1,1', '2,1', '1,2'])

  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      let t = FLOOR
      if (x === 0 || y === 0 || x === COLS - 1 || y === ROWS - 1) t = WALL
      else if (x % 2 === 0 && y % 2 === 0) t = WALL
      else if (!safe.has(`${x},${y}`) && random() < blockChance) t = BLOCK
      tiles[y * COLS + x] = t
    }
  }
  return { cols: COLS, rows: ROWS, tiles, start }
}

// Arena do chefe: aberta, só a borda e 4 pilares pra se esconder
export function makeArena() {
  const tiles = new Uint8Array(COLS * ROWS)
  const pillars = new Set(['4,4', `${COLS - 5},4`, `4,${ROWS - 5}`, `${COLS - 5},${ROWS - 5}`])
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const edge = x === 0 || y === 0 || x === COLS - 1 || y === ROWS - 1
      tiles[y * COLS + x] = edge || pillars.has(`${x},${y}`) ? WALL : FLOOR
    }
  }
  // buraco de 3x3 casas no meio, de onde o chefe sai (o chão ao redor continua normal)
  const hole = { x: (COLS - 3) / 2, y: (ROWS - 3) / 2, w: 3, h: 3 }
  for (let y = 0; y < hole.h; y++) for (let x = 0; x < hole.w; x++) tiles[(hole.y + y) * COLS + hole.x + x] = HOLE
  return { cols: COLS, rows: ROWS, tiles, start: { x: 1, y: 1 }, hole }
}

export function tileAt(level, x, y) {
  if (x < 0 || y < 0 || x >= level.cols || y >= level.rows) return WALL
  return level.tiles[y * level.cols + x]
}

export function setTile(level, x, y, t) {
  level.tiles[y * level.cols + x] = t
}
