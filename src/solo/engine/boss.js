// Chefe do modo Solo: The Loan Shark (o tubarão agiota: cobra a dívida em explosões). Antes era a Whale (baleia).
// - Ocupa 2x2 casas, anda devagar atrás do jogador; bombas não a seguram (ela passa por cima).
// - Leva BOSS_HP explosões; depois de cada uma fica piscando um pouco sem levar dano.
// - De tempos em tempos para e solta FUDs na arena.
// - Com metade da vida fica brava: antes, PARA por um instante (treme, pisca roxo, não leva dano)
//   pra todo mundo perceber a transformação; depois anda e invoca mais rápido.
import { FLOOR, HOLE, MAX_BOMBS, MAX_RANGE, MAX_SPEED } from './constants.js'
import { tileAt } from './level.js'
import { makeEnemy } from './enemies.js'

export const BOSS = {
  name: 'CHOP', // o tubarão agiota (The Loan Shark)
  hp: 6,
  half: 0.9,           // metade do tamanho (caixa de 1.8 casa)
  speed: 1.2,
  angrySpeed: 1.75,
  invulnerable: 1.2,   // segundos piscando depois de levar dano
  summonEvery: 7,
  angrySummonEvery: 4.5,
  summonPause: 0.9,    // fica parada um tiquinho ao invocar
  maxMinions: 4,
  enrageTime: 1.6,     // segundos da transformação (parada, piscando, sem levar dano)
  introSplashAt: 1.0,  // entrada: o buraco borbulha por 1 s e aí o CHOP salta pra fora
  introTime: 2.4,      // entrada inteira (depois disso ele começa a lutar)
}

export function makeBoss(x, y) {
  return {
    x, y, hp: BOSS.hp, alive: true, deathT: 0,
    hurtT: 0, summonT: BOSS.summonEvery * 0.6, pauseT: 0, walkT: 0, enrageT: 0,
    mode: 'intro', introT: 0, // 'intro' = ainda saindo do buraco (inofensivo e sem levar dano); 'surface' = lutando
  }
}

// A cada dano que o chefe leva, cai um item na arena (bomba, fogo, bota ou escudo, o que o jogador ainda pode usar)
// numa casa livre, longe dele e do jogador: dá pra se recuperar sem a luta virar moleza.
function dropItem(s, random) {
  const p = s.player, b = s.boss
  const kinds = []
  if (p.maxBombs < MAX_BOMBS) kinds.push('bomb')
  if (p.range < MAX_RANGE) kinds.push('fire')
  if (p.speed < MAX_SPEED - 1e-6) kinds.push('speed')
  if (!p.shield) kinds.push('shield')
  if (!kinds.length) return
  const spots = []
  for (let y = 1; y < s.level.rows - 1; y++) {
    for (let x = 1; x < s.level.cols - 1; x++) {
      if (tileAt(s.level, x, y) !== FLOOR) continue
      if (Math.abs(x - b.x) + Math.abs(y - b.y) < 3 || Math.abs(x - p.x) + Math.abs(y - p.y) < 2) continue
      if (s.bombs.some((q) => q.x === x && q.y === y) || s.powerups.some((q) => !q.taken && q.x === x && q.y === y)) continue
      spots.push([x, y])
    }
  }
  if (!spots.length) return
  const [x, y] = spots[Math.floor(random() * spots.length)]
  s.powerups.push({ x, y, kind: kinds[Math.floor(random() * kinds.length)], revealed: true, taken: false, revealedAt: s.time })
  s.events.push({ type: 'itemDrop', x, y })
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

// o chefe é barrado pelas paredes e pelas caixas, mas passa por cima do buraco da arena e das bombas
const fits = (s, cx, cy) => tilesUnder(cx, cy).every(([x, y]) => { const t = tileAt(s.level, x, y); return t === FLOOR || t === HOLE })

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

  // entrada: o buraco borbulha, o CHOP salta pra fora (splash + nome na tela) e só então começa a lutar
  if (b.mode === 'intro') {
    b.introT += dt
    if (!b.introSplash && b.introT >= BOSS.introSplashAt) {
      b.introSplash = true
      s.shake = Math.min(0.5, s.shake + 0.4)
      s.events.push({ type: 'bossIntro', x: b.x, y: b.y })
      s.note = `${BOSS.name} the Loan Shark wants his money back`
      s.noteUntil = s.time + 3.5
    }
    if (b.introT >= BOSS.introTime) {
      b.mode = 'surface'
      if (s.supplies) { s.note = 'The old crew left you a shield! Break the crates for bombs and fire'; s.noteUntil = s.time + 4.5 }
    }
    return
  }

  // levou explosão? (a pontinha de fogo desenhada dentro das caixas não conta)
  if (b.hurtT === 0 && s.flames.some((f) => !f.visual && bossTouchesTile(b, f.x, f.y))) {
    const wasAngry = angry(b)
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
    dropItem(s, random)
    if (!wasAngry && angry(b)) {
      // transformação: para, treme e fica invencível até terminar; depois já invoca reforço
      b.enrageT = BOSS.enrageTime
      b.hurtT = Math.max(b.hurtT, BOSS.enrageTime)
      b.summonT = 0
      s.shake = Math.min(0.5, s.shake + 0.4)
      s.events.push({ type: 'bossEnrage', x: b.x, y: b.y })
      s.note = `${BOSS.name} is ENRAGED! Faster, and more FUD`
      s.noteUntil = s.time + 3.5
    }
  }
  if (b.enrageT > 0) { b.enrageT = Math.max(0, b.enrageT - dt); return }

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
  if (Math.abs(dx) > 0.25) b.face = Math.sign(dx) // o tubarão olha pro lado em que o jogador está
  const len = Math.hypot(dx, dy)
  if (len < 0.05) return
  const step = (angry(b) ? BOSS.angrySpeed : BOSS.speed) * dt
  const nx = b.x + (dx / len) * step
  if (fits(s, nx, b.y)) b.x = nx
  const ny = b.y + (dy / len) * step
  if (fits(s, b.x, ny)) b.y = ny
}
