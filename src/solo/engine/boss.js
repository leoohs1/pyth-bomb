// Chefe do modo Solo: CHOP, o tubarão agiota (The Loan Shark: cobra a dívida em explosões). Antes era a Whale (baleia).
// A luta, em fases (b.mode):
//   'intro'    o buraco do meio borbulha e o CHOP salta pra fora (inofensivo e sem levar dano enquanto sai);
//   'surface'  ele luta: anda atrás do jogador (bombas e o buraco não o seguram; paredes e caixas sim) e leva
//              BOSS.hp explosões, piscando um pouco sem levar dano depois de cada uma;
//   com METADE da vida: 'toHole' (foge correndo pro buraco) -> 'sinking' (mergulha, splash) -> 'under'
//              (embaixo d'água: invencível e inofensivo; aparecem os COBRADORES, 1 caranguejo e 1 esqueleto) ->
//              'rising' (volta furioso, mais rápido) -> 'surface' de novo.
// A cada dano que ele leva cai um item útil na arena.
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
  enrageTime: 1.6,     // (só o desenho usa) duração da antiga transformação
  introSplashAt: 1.0,  // entrada: o buraco borbulha por 1 s e aí o CHOP salta pra fora
  introTime: 2.4,      // entrada inteira (depois disso ele começa a lutar)
  diveSpeed: 4.2,      // casas por segundo quando foge pro buraco
  sinkTime: 0.9,       // tempo mergulhando
  riseTime: 0.9,       // tempo voltando à tona
  underMin: 3,         // fica embaixo d'água pelo menos isso (segundos) ...
  underMax: 25,        // ... e no máximo isso, mesmo que os cobradores ainda estejam vivos
}

export function makeBoss(x, y) {
  return {
    x, y, hp: BOSS.hp, alive: true, deathT: 0,
    hurtT: 0, pauseT: 0, walkT: 0, enrageT: 0,
    mode: 'intro', introT: 0, sinkT: 0, riseT: 0, underT: 0, holeT: 0, dived: false,
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

// casas que a caixa do chefe encosta
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

// fogo encostando no chefe
export function bossTouchesTile(b, x, y) {
  const reach = BOSS.half + 0.3
  return Math.abs(x - b.x) < reach && Math.abs(y - b.y) < reach
}

export function bossTouchesPlayer(b, p) {
  const reach = BOSS.half + 0.25
  return Math.abs(p.x - b.x) < reach && Math.abs(p.y - b.y) < reach
}

// casa de chão livre mais perto de (x, y): a porta aparece ali quando o chefe cai (não pode ser dentro do buraco)
function nearestFloor(s, x, y) {
  let best = null, bestD = Infinity
  for (let ty = 1; ty < s.level.rows - 1; ty++) {
    for (let tx = 1; tx < s.level.cols - 1; tx++) {
      if (tileAt(s.level, tx, ty) !== FLOOR) continue
      const d = Math.abs(tx - x) + Math.abs(ty - y)
      if (d < bestD) { bestD = d; best = [tx, ty] }
    }
  }
  return best ?? [1, 1]
}

// os COBRADORES (1 caranguejo e 1 esqueleto) saem em volta do buraco, longe do jogador
function spawnCollectors(s, random) {
  const hole = s.level.hole, p = s.player
  const ring = []
  for (let y = hole.y - 1; y <= hole.y + hole.h; y++) {
    for (let x = hole.x - 1; x <= hole.x + hole.w; x++) {
      if (tileAt(s.level, x, y) === FLOOR && !s.bombs.some((q) => q.x === x && q.y === y)) ring.push([x, y])
    }
  }
  let spots = ring.filter(([x, y]) => Math.abs(x - p.x) + Math.abs(y - p.y) >= 3)
  if (spots.length < 2) spots = ring
  for (const type of ['crab', 'skeleton']) {
    if (!spots.length) break
    const [x, y] = spots.splice(Math.floor(random() * spots.length), 1)[0]
    s.enemies.push(makeEnemy(type, x, y))
  }
  s.events.push({ type: 'collectors', x: s.boss.x, y: s.boss.y })
}

export function updateBoss(s, dt, random = Math.random) {
  const b = s.boss
  if (!b.alive) { b.deathT += dt; return }
  b.hurtT = Math.max(0, b.hurtT - dt)
  b.walkT += dt
  const hole = s.level.hole
  const holeX = hole.x + hole.w / 2 - 0.5, holeY = hole.y + hole.h / 2 - 0.5 // onde o chefe fica quando está no buraco

  // entrada: o buraco borbulha, o CHOP salta pra fora (splash + nome na tela) e só então começa a lutar
  if (b.mode === 'intro') {
    b.introT += dt
    if (!b.introSplash && b.introT >= BOSS.introSplashAt) {
      b.introSplash = true
      s.shake = Math.min(0.5, s.shake + 0.4)
      s.events.push({ type: 'bossIntro', x: b.x, y: b.y, text: 'CHOP', color: '#ffd24a' })
      s.note = `${BOSS.name} the Loan Shark wants his money back`
      s.noteUntil = s.time + 3.5
    }
    if (b.introT >= BOSS.introTime) {
      b.mode = 'surface'
      if (s.supplies) { s.note = 'The old crew left you a shield! Break the crates for bombs and fire'; s.noteUntil = s.time + 4.5 }
    }
    return
  }

  // metade da vida: foge correndo pro buraco...
  if (b.mode === 'toHole') {
    b.holeT += dt
    const dx = holeX - b.x, dy = holeY - b.y
    const len = Math.hypot(dx, dy)
    if (Math.abs(dx) > 0.25) b.face = Math.sign(dx)
    if (len < 0.15 || b.holeT > 2.5) { // chegou (ou demorou demais, preso numa quina): mergulha de onde está
      b.x = holeX; b.y = holeY
      b.mode = 'sinking'
      b.sinkT = 0
      s.shake = Math.min(0.5, s.shake + 0.4)
      s.events.push({ type: 'bossDive', x: b.x, y: b.y })
    } else {
      const step = Math.min(len, BOSS.diveSpeed * dt)
      const nx = b.x + (dx / len) * step
      if (fits(s, nx, b.y)) b.x = nx
      const ny = b.y + (dy / len) * step
      if (fits(s, b.x, ny)) b.y = ny
    }
    return
  }
  // ...mergulha (splash)...
  if (b.mode === 'sinking') {
    b.sinkT += dt
    if (b.sinkT >= BOSS.sinkTime) {
      b.mode = 'under'
      b.underT = 0
      spawnCollectors(s, random)
      s.note = 'CHOP dived! The debt collectors are coming'
      s.noteUntil = s.time + 3.5
    }
    return
  }
  // ...fica embaixo d'água (invencível e inofensivo) enquanto os cobradores atacam...
  if (b.mode === 'under') {
    b.underT += dt
    if ((b.underT >= BOSS.underMin && !s.enemies.some((e) => e.alive)) || b.underT >= BOSS.underMax) {
      b.mode = 'rising'
      b.riseT = 0
      s.shake = Math.min(0.5, s.shake + 0.4)
      s.events.push({ type: 'bossIntro', x: b.x, y: b.y, text: 'CHOP IS FURIOUS!', color: '#ff6b6b' })
    }
    return
  }
  // ...e volta furioso
  if (b.mode === 'rising') {
    b.riseT += dt
    if (b.riseT >= BOSS.riseTime) { b.mode = 'surface'; b.hurtT = 0.6 }
    return
  }

  // levou explosão? (a pontinha de fogo desenhada dentro das caixas não conta)
  if (b.hurtT === 0 && s.flames.some((f) => !f.visual && bossTouchesTile(b, f.x, f.y))) {
    b.hp--
    b.hurtT = BOSS.invulnerable
    s.shake = Math.min(0.35, s.shake + 0.25)
    s.events.push({ type: 'enemyHit', x: b.x, y: b.y, killed: b.hp <= 0, boss: true })
    if (b.hp <= 0) {
      b.alive = false
      for (const e of s.enemies) e.alive = false // os cobradores somem junto com o chefe
      // a porta aparece onde ele caiu (numa casa de chão: o buraco não serve)
      const [dx, dy] = nearestFloor(s, Math.round(b.x), Math.round(b.y))
      s.door = { x: dx, y: dy, revealed: true }
      return
    }
    dropItem(s, random)
    if (!b.dived && angry(b)) { // metade da vida: ele foge pro buraco (fica invencível a partir daqui)
      b.dived = true
      b.mode = 'toHole'
      b.holeT = 0
      b.hurtT = BOSS.invulnerable
      s.note = 'CHOP is hurt! He runs back to the water...'
      s.noteUntil = s.time + 3
    }
    return
  }

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
