// Inimigos do modo Solo (humor cripto). Andam de casa em casa; bombas e blocos os bloqueiam.
// - FUD: lento, vaga sem rumo.
// - Bear: persegue o jogador quando ele está por perto.
// - Rug Pull: rápido e imprevisível.
import { FLOOR } from './constants.js'
import { tileAt } from './level.js'

export const ENEMY_TYPES = {
  fud: { name: 'FUD', speed: 1.5, turnChance: 0.3, chase: 0 },
  bear: { name: 'Bear', speed: 1.9, turnChance: 0.3, chase: 0.75 },
  rug: { name: 'Rug Pull', speed: 2.7, turnChance: 0.5, chase: 0 },
}

const DIRS = {
  up: { dx: 0, dy: -1 },
  down: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
}
const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' }

export function makeEnemy(type, x, y) {
  return { type, x, y, tx: x, ty: y, dir: null, alive: true, deathT: 0, walkT: Math.random() * 10 }
}

function open(s, x, y) {
  return tileAt(s.level, x, y) === FLOOR && !s.bombs.some((b) => b.x === x && b.y === y)
}

function chooseDir(s, e, random) {
  const kind = ENEMY_TYPES[e.type]
  const options = Object.keys(DIRS).filter((d) => open(s, e.tx + DIRS[d].dx, e.ty + DIRS[d].dy))
  if (!options.length) return null
  // evita dar meia-volta, a não ser em beco sem saída
  const forward = options.filter((d) => d !== OPPOSITE[e.dir])
  const pool = forward.length ? forward : options

  const p = s.player
  if (kind.chase && p.alive && Math.abs(p.x - e.tx) + Math.abs(p.y - e.ty) <= 7 && random() < kind.chase) {
    const dist = (d) => Math.abs(p.x - (e.tx + DIRS[d].dx)) + Math.abs(p.y - (e.ty + DIRS[d].dy))
    return options.reduce((best, d) => (dist(d) < dist(best) ? d : best))
  }
  if (e.dir && pool.includes(e.dir) && random() > kind.turnChance) return e.dir
  return pool[Math.floor(random() * pool.length)]
}

export function updateEnemy(s, e, dt, random = Math.random) {
  if (!e.alive) { e.deathT += dt; return }
  e.walkT += dt
  let step = ENEMY_TYPES[e.type].speed * dt

  // chegou no centro de uma casa: escolhe pra onde ir
  if (e.x === e.tx && e.y === e.ty) {
    e.dir = chooseDir(s, e, random)
    if (!e.dir) return
    e.tx += DIRS[e.dir].dx
    e.ty += DIRS[e.dir].dy
  } else if (!open(s, e.tx, e.ty)) {
    // soltaram uma bomba na frente: dá meia-volta
    e.tx -= DIRS[e.dir].dx
    e.ty -= DIRS[e.dir].dy
    e.dir = OPPOSITE[e.dir]
  }

  const dx = e.tx - e.x, dy = e.ty - e.y
  const dist = Math.abs(dx) + Math.abs(dy)
  if (dist <= step) { e.x = e.tx; e.y = e.ty; step -= dist }
  else { e.x += Math.sign(dx) * step; e.y += Math.sign(dy) * step }
}
