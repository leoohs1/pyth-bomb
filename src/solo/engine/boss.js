// Chefe do modo Solo: The Whale (a baleia que manipula o mercado).
// - Ocupa 2x2 casas, anda devagar atrás do jogador; bombas não a seguram (ela passa por cima).
// - Leva BOSS_HP explosões; depois de cada uma fica piscando um pouco sem levar dano.
// - De tempos em tempos para e solta FUDs na arena.
// - Com metade da vida fica brava: anda e invoca mais rápido.
import { FLOOR } from './constants.js'
import { tileAt } from './level.js'
import { makeEnemy } from './enemies.js'

export const BOSS = {
  name: 'The Whale',
  hp: 6,
  half: 0.9,           // metade do tamanho (caixa de 1.8 casa)
  speed: 1.2,
  angrySpeed: 1.75,
  invulnerable: 1.2,   // segundos piscando depois de levar dano
  summonEvery: 7,
  angrySummonEvery: 4.5,
  summonPause: 0.9,    // fica parada um tiquinho ao invocar
  maxMinions: 4,
}

export function makeBoss(x, y) {
  return {
    x, y, hp: BOSS.hp, alive: true, deathT: 0,
    hurtT: 0, summonT: BOSS.summonEvery * 0.6, pauseT: 0, walkT: 0,
  }
}

const angry = (b) => b.hp <= BOSS.hp / 2

// casas que a caixa da baleia encosta
function tilesUnder(cx, cy) {
  const r = BOSS.half + 0.5
  const out = []
  for (let y = Math.floor(cy - r) + 1; y <= Math.ceil(cy + r) - 1; y++) {
    for (let x = Math.floor(cx - r) + 1; x <= Math.ceil(cx + r) - 1; x++) out.push([x, y])
  }
  return out
}

const fits = (s, cx, cy) => tilesUnder(cx, cy).every(([x, y]) => tileAt(s.level, x, y) === FLOOR)

// fogo encostando na baleia
export function bossTouchesTile(b, x, y) {
  const reach = BOSS.half + 0.3
  return Math.abs(x - b.x) < reach && Math.abs(y - b.y) < reach
}

export function bossTouchesPlayer(b, p) {
  const reach = BOSS.half + 0.25
  return Math.abs(p.x - b.x) < reach && Math.abs(p.y - b.y) < reach
}

export function updateBoss(s, dt, random = Math.random) {
  const b = s.boss
  if (!b.alive) { b.deathT += dt; return }
  b.hurtT = Math.max(0, b.hurtT - dt)
  b.walkT += dt

  // levou explosão?
  if (b.hurtT === 0 && s.flames.some((f) => bossTouchesTile(b, f.x, f.y))) {
    b.hp--
    b.hurtT = BOSS.invulnerable
    s.shake = Math.min(0.35, s.shake + 0.25)
    s.events.push({ type: 'enemyHit', x: b.x, y: b.y, killed: b.hp <= 0, boss: true })
    if (b.hp <= 0) {
      b.alive = false
      for (const e of s.enemies) e.alive = false // os FUDs somem junto com a chefe
      // a porta aparece onde ela caiu
      s.door = { x: Math.round(b.x), y: Math.round(b.y), revealed: true }
      return
    }
  }

  // invocar FUDs
  b.summonT -= dt
  const minions = s.enemies.filter((e) => e.alive).length
  if (b.summonT <= 0) {
    b.summonT = angry(b) ? BOSS.angrySummonEvery : BOSS.summonEvery
    if (minions < BOSS.maxMinions) {
      b.pauseT = BOSS.summonPause
      const p = s.player
      const spots = []
      for (let y = 1; y < s.level.rows - 1; y++) {
        for (let x = 1; x < s.level.cols - 1; x++) {
          if (tileAt(s.level, x, y) === FLOOR && Math.abs(x - p.x) + Math.abs(y - p.y) >= 4 &&
            Math.abs(x - b.x) <= 3 && Math.abs(y - b.y) <= 3 && !bossTouchesTile(b, x, y)) spots.push([x, y])
        }
      }
      const n = Math.min(angry(b) ? 2 : 1, BOSS.maxMinions - minions)
      for (let i = 0; i < n && spots.length; i++) {
        const [x, y] = spots.splice(Math.floor(random() * spots.length), 1)[0]
        s.enemies.push(makeEnemy('fud', x, y))
      }
    }
  }

  if (b.pauseT > 0) { b.pauseT -= dt; return }

  // anda na direção do jogador (um eixo de cada vez, pra deslizar nas paredes)
  const p = s.player
  const dx = p.x - b.x, dy = p.y - b.y
  const len = Math.hypot(dx, dy)
  if (len < 0.05) return
  const step = (angry(b) ? BOSS.angrySpeed : BOSS.speed) * dt
  const nx = b.x + (dx / len) * step
  if (fits(s, nx, b.y)) b.x = nx
  const ny = b.y + (dy / len) * step
  if (fits(s, b.x, ny)) b.y = ny
}
