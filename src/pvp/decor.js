// Enfeites dos mapas do PVP (só desenho, não mudam nada no jogo): as poças de cerveja da taverna, que escorrem
// das torneiras dos barris, e os vazamentos de água com rachadura no casco (Bear Market).
// Saem da semente da sala, então todo mundo que assiste a mesma sala vê os mesmos enfeites.
// A arte e o desenho são os do Solo (render.js do Solo desenha `puddles` e `cracks`).
import { FLOOR, WALL } from './engine/constants.js'
import { tileAt, cornerCell, CORNER_IDS } from './engine/maps.js'
import { makeRng } from './engine/rng.js'
import { hullWallOf, TAVERN_KEG, TAVERN_BARREL } from '../solo/engine/wallmix.js'
import { LEVELS } from '../solo/engine/levels.js'

const LOOK = { tavern: LEVELS[0], hull: LEVELS[1], chop: LEVELS[2] }

// longe dos cantos onde os jogadores nascem (pra poça não ficar embaixo de ninguém logo no começo)
function farFromCorners(level, x, y, min = 3) {
  return CORNER_IDS.every((id) => { const c = cornerCell(id, level.cols, level.rows); return Math.abs(c.x - x) + Math.abs(c.y - y) >= min })
}

// em qual quarto do mapa a casa fica (0 a 3), ou -1 na linha/coluna do meio
function quarterOf(level, x, y) {
  const hx = (level.cols - 1) / 2, hy = (level.rows - 1) / 2
  if (x === hx || y === hy) return -1
  return (x > hx ? 1 : 0) + (y > hy ? 2 : 0)
}

export function makeDecor(map, level, seed) {
  const rng = makeRng((seed ^ 0x5eed1e) >>> 0) // sorteio separado do jogo: os enfeites não mexem na sorte da sala
  const look = LOOK[map]
  const puddles = [], cracks = []
  if (map === 'tavern') {
    // cerveja: no chão logo abaixo de um barril com torneira (ou pilha de barris) da parede, um por quarto do mapa
    for (const variant of [TAVERN_KEG, TAVERN_BARREL]) {
      for (let q = 0; q < 4; q++) {
        if (puddles.some((p) => p.q === q)) continue
        const spots = []
        for (let y = 2; y < level.rows - 2; y += 2) {
          for (let x = 2; x < level.cols - 2; x += 2) {
            if (tileAt(level, x, y) !== WALL || hullWallOf(x, y) !== variant) continue
            if (tileAt(level, x, y + 1) !== FLOOR || quarterOf(level, x, y + 1) !== q || !farFromCorners(level, x, y + 1)) continue
            spots.push([x, y + 1])
          }
        }
        if (!spots.length) continue
        const [x, y] = spots[Math.floor(rng() * spots.length)]
        puddles.push({ x, y, q, seed: rng() * 100, variant: puddles.length % 2, flip: false, set: look.puddleSet ?? null, kind: 'tap' })
      }
    }
  } else if (map === 'hull') {
    // vazamentos: um em cada quarto, na mesma posição espelhada (o mapa é espelhado, então a casa livre também é)
    const free = []
    for (let y = 1; y < (level.rows - 1) / 2; y++) {
      for (let x = 1; x < (level.cols - 1) / 2; x++) {
        if (tileAt(level, x, y) === FLOOR && farFromCorners(level, x, y, 4)) free.push([x, y])
      }
    }
    if (free.length) {
      const [x, y] = free[Math.floor(rng() * free.length)]
      const mx = level.cols - 1 - x, my = level.rows - 1 - y
      ;[[x, y, false], [mx, y, true], [x, my, false], [mx, my, true]].forEach(([px, py, flip], i) => {
        puddles.push({ x: px, y: py, seed: rng() * 100, variant: i % 2, flip, set: look.puddleSet ?? null })
        if (look.puddleCracks) cracks.push(makeCrack(px, py, rng))
      })
    }
  }
  return { puddles, cracks }
}

// Rachadura no chão saindo do vazamento (copiada do Solo: game.js makeCrack). Pontos em pixels do mapa (48 por casa).
function makeCrack(tx, ty, random) {
  const pts = []
  const x0 = tx * 48 + 24, y0 = ty * 48 + 8
  const dir0 = random() < 0.5 ? -1 : 1
  for (const [dir, len] of [[dir0, 50 + Math.floor(random() * 40)], [-dir0, 30 + Math.floor(random() * 24)]]) {
    let yf = y0, slope = (random() - 0.5) * 0.5, next = 8 + Math.floor(random() * 8)
    const branchAt = Math.floor(len * (0.35 + random() * 0.3))
    for (let i = 0; i < len; i++) {
      if (i === next) { slope = (random() - 0.5) * 0.7; next += 8 + Math.floor(random() * 10) }
      yf += slope + (random() - 0.5) * 0.7
      yf = Math.max(y0 - 11, Math.min(y0 + 11, yf))
      pts.push(x0 + dir * (i + 3), Math.round(yf))
      if (i === branchAt && dir === dir0) {
        const bs = (random() < 0.5 ? -1 : 1) * (0.7 + random() * 0.5), bl = 9 + Math.floor(random() * 9)
        let bx = x0 + dir * (i + 3), by = yf
        for (let j = 0; j < bl; j++) { bx += dir; by += bs + (random() - 0.5) * 0.4; pts.push(Math.round(bx), Math.round(by)) }
      }
    }
  }
  return { pts }
}
