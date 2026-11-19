// Motor do Pyth Dash (plataforma). Tudo em "casas" (1 casa = 1 bloco), y cresce pra baixo.
// Passo fixo: o jogo chama step() com dt pequeno (1/120 s). Sem React aqui: dá pra testar sozinho.
//
// Mecânicas da fase 1 (combinadas com a Halls em 2026-11-19):
// - Price Relay: poste que acende os blocos apagados de um grupo (alguns ficam acesos só alguns segundos: "fresh").
// - Publishers: 3 antenas no caminho; cada uma devolve a cor pra um pedaço do mundo (cinza = preço velho).
// - Oracle Beacon: o fim da fase; entrega o preço e o mundo inteiro volta a ser roxo.
// - Confidence Gems (3 escondidas), baús (o prêmio vem do sorteio do Pyth Entropy, de fora do motor),
//   Confidence Shield (aguenta 1 golpe) e Lazer Boots (corre mais rápido por um tempo).
import { ROWS } from './levels.js'

// ---- física (o "gosto" do pulo mora aqui)
export const P = {
  accGround: 42, accAir: 30, decel: 48, maxRun: 7.5,
  gravity: 70, fallMult: 1.45, jumpV: 24.5, jumpCut: 0.45, maxFall: 22, // pulo cheio ~4,2 casas de altura
  coyote: 0.1,     // ainda dá pra pular um tiquinho depois de sair da beirada
  buffer: 0.12,    // apertou pular um tiquinho antes de encostar no chão: pula assim que encostar
  stompV: 13, stompHoldV: 18,
  w: 0.7, h: 1.5,  // tamanho do herói (caixa de colisão)
  invuln: 1.6,     // segundos piscando depois de perder o escudo
  lazerTime: 10, lazerRun: 1.45, // Lazer Boots: corre 45% mais rápido por 10 s
}
const ENEMY = { w: 0.9, h: 0.9, speed: 1.8, wake: 17 }
const SOLID = new Set(['#', 'b', '?', '!', 'u', 'g', 'G', 'r', 'R', 'x', 'c'])
const EPS = 1e-4
const RESTORE_SPEED = 26 // casas por segundo da onda de cor
const STALE_WARN = 1.5   // segundos antes de apagar: o bloco pisca

const isGroup = (c) => c >= '1' && c <= '9'
const HARPY = { speed: 2.4, bob: 0.6 }
const freshEnemies = (level) => level.enemies.map((e) => (e.type === 'harpy'
  // harpia: voa de um lado pro outro (range casas pra cada lado), subindo e descendo um pouco
  ? { type: 'harpy', x: e.x, y: e.y, x0: e.x, baseY: e.y, range: e.range ?? 3, vx: -HARPY.speed, vy: 0, alive: true, awake: false, squashT: 0, t: 0 }
  : { x: e.x + 0.05, y: e.y + 0.1, vx: -ENEMY.speed, vy: 0, alive: true, awake: false, squashT: 0 }))
// plataforma que anda (polia): vai e volta entre (x, y) e (x+dx, y+dy) em "period" segundos;
// com group, só anda depois que o Price Relay daquele grupo acende
const freshMovers = (level) => (level.movers ?? []).map((m) => ({ ...m, x0: m.x, y0: m.y, t: 0, ddx: 0, ddy: 0 }))

export function createGame(level, { lives = 3 } = {}) {
  return {
    level,
    tiles: level.grid.map((r) => [...r]),
    cols: level.cols,
    player: spawnPlayer(level.start),
    coins: level.coins.map((c) => ({ ...c, taken: false })),
    enemies: freshEnemies(level),
    movers: freshMovers(level),
    // fase 3: sombras que repetem o que o herói fez (trail = por onde ele passou) e o chefe Talos
    trail: [],
    echoes: (level.echoes ?? []).map((z) => ({ ...z, active: false, startT: 0, visible: false, x: 0, y: 0, facing: 1, onGround: true, vx: 0, vy: 0, walkT: 0 })),
    boss: level.boss ? freshBoss(level.boss) : null,
    relays: (level.relays ?? []).map((r) => ({ ...r, on: false, t: 0 })),
    groupOn: {},  // grupo -> aceso?
    publishers: (level.publishers ?? []).map((p) => ({ ...p, on: false, t: 0 })),
    gems: (level.gems ?? []).map((gm) => ({ ...gm, taken: false })),
    chests: (level.chests ?? []).map((c, i) => ({ ...c, n: i, state: 'closed', loot: null, t: 0 })),
    chestAsks: [], // baús que abriram agora: o jogo pede o prêmio (Pyth Entropy) e chama openChest()
    items: [],     // poderes soltos no mundo (saíram de bloco ou baú)
    popped: [],    // moedas que saem dos oráculos (animação)
    bumps: [],     // blocos que pulam quando batem a cabeça
    coinsTaken: 0,
    bonusCoins: 0, // moedas que vieram dos baús
    gemsTaken: 0,
    restoreX: level.restoreStart ?? 8, // até onde o mundo já tem cor (o resto está cinza)
    restoreTo: level.restoreStart ?? 8,
    lives,
    time: 0,
    status: 'playing', // 'playing' | 'dying' | 'won' | 'gameover'
    statusT: 0,
    checkpoint: null,
    cpList: level.checkpoints ?? (level.checkpoint ? [level.checkpoint] : []), // vários checkpoints (o mais longe vale)
    cpIdx: -1,
    crumbles: [],   // pontes que estão tremendo/caídas: { x, y, t, state: 'shake' | 'gone' }
    debris: [],     // pedaços caindo (só enfeite)
    chaser: null,   // a tempestade/lava que persegue: { x, speed, kind } depois que o herói passa de x0
    // sons e efeitos deste passo: 'jump' 'coin' 'stomp' 'bump' 'die' 'win' 'gameover' 'checkpoint'
    //   'relay' 'stale' 'publisher' 'gem' 'chest' 'power' 'shieldbreak' 'item'
    events: [],
    prevJump: false,
  }
}

function spawnPlayer(at) {
  return { x: at.x, y: at.y, vx: 0, vy: 0, onGround: false, facing: 1, coyote: 0, buffer: 0, jumping: false, walkT: 0, shield: false, invuln: 0, lazer: 0, portalCD: 0 }
}

export const solidAt = (g, tx, ty) => {
  if (tx < 0 || tx >= g.cols) return true // paredes invisíveis nas pontas
  if (ty < 0 || ty >= ROWS) return false
  const c = g.tiles[ty][tx]
  return SOLID.has(c) || (isGroup(c) && !!g.groupOn[c])
}

const overlap = (p, x, y, w, h) => p.x < x + w && p.x + P.w > x && p.y < y + h && p.y + P.h > y

// ---- um passo do jogo. input = { left, right, jump } (jump = botão segurado)
export function step(g, input, dt) {
  g.events = []
  g.time += g.status === 'playing' ? dt : 0
  for (const b of g.bumps) b.t += dt
  g.bumps = g.bumps.filter((b) => b.t < 0.2)
  for (const c of g.popped) { c.t += dt }
  g.popped = g.popped.filter((c) => c.t < 0.6)
  for (const c of g.chests) c.t += dt
  for (const pb of g.publishers) if (pb.on) pb.t += dt
  // a onda de cor anda até onde os publishers já devolveram
  if (g.restoreX < g.restoreTo) g.restoreX = Math.min(g.restoreTo, g.restoreX + RESTORE_SPEED * dt)
  stepRelays(g, dt)
  stepItems(g, dt)
  stepMovers(g, dt)

  if (g.status === 'dying') {
    g.statusT += dt
    const p = g.player
    p.vy = Math.min(P.maxFall, p.vy + P.gravity * dt); p.y += p.vy * dt // pulinho de "morri" e cai
    if (g.statusT > 1.6) respawn(g)
    return g
  }
  if (g.status === 'won') {
    g.statusT += dt
    const p = g.player
    // desce do beacon, anda um pouquinho e para pra comemorar
    if (!p.onGround) { p.vy = 5; moveY(g, p, dt) } else if (g.statusT < 1.4) { p.vx = 3; p.facing = 1; moveX(g, p, dt); p.walkT += dt } else p.vx = 0
    return g
  }
  if (g.status !== 'playing') return g

  const p = g.player
  const pressed = input.jump && !g.prevJump
  g.prevJump = !!input.jump
  // em cima de plataforma que anda: vai junto
  if (p.mover) {
    const m = p.mover
    if (p.x < m.x + m.w && p.x + P.w > m.x && Math.abs(p.y + P.h - (m.y - m.ddy)) < 0.2) { p.x += m.ddx; p.y = m.y - P.h }
    else p.mover = null
  }
  if (p.invuln > 0) p.invuln = Math.max(0, p.invuln - dt)
  if (p.lazer > 0) p.lazer = Math.max(0, p.lazer - dt)
  const maxRun = P.maxRun * (p.lazer > 0 ? P.lazerRun : 1)

  // correr
  const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0)
  if (dir) {
    const acc = (p.onGround ? P.accGround : P.accAir) * (p.lazer > 0 ? 1.3 : 1)
    const turning = Math.sign(p.vx) === -dir ? 2 : 1 // virar é mais rápido (fica responsivo)
    p.vx += dir * acc * turning * dt
    p.vx = Math.max(-maxRun, Math.min(maxRun, p.vx))
    p.facing = dir
  } else if (p.onGround) {
    const d = P.decel * dt
    p.vx = Math.abs(p.vx) <= d ? 0 : p.vx - Math.sign(p.vx) * d
  }
  if (Math.abs(p.vx) > maxRun) p.vx = Math.sign(p.vx) * Math.max(maxRun, Math.abs(p.vx) - P.decel * dt) // acabou o Lazer: desacelera
  // rajada de vento (empurra; dá pra andar contra)
  // no ar ela mexe na velocidade; no chão ela vai arrastando o herói devagar (windPush, em casas/s)
  p.windPush = 0
  for (const w of g.level.winds ?? []) {
    if (p.x + P.w < w.x0 || p.x > w.x1 || windState(g, w) !== 'on') continue
    p.windPush = w.force * 0.05
    if (!p.onGround) p.vx = Math.max(-maxRun * 1.4, Math.min(maxRun * 1.4, p.vx + w.force * dt))
  }

  // pular (com perdão de beirada e de botão adiantado)
  p.coyote = p.onGround ? P.coyote : Math.max(0, p.coyote - dt)
  p.buffer = pressed ? P.buffer : Math.max(0, p.buffer - dt)
  if (p.buffer > 0 && p.coyote > 0) {
    p.vy = -P.jumpV; p.onGround = false; p.coyote = 0; p.buffer = 0; p.jumping = true
    g.events.push('jump')
  }
  if (p.jumping && !input.jump && p.vy < 0) { p.vy *= P.jumpCut; p.jumping = false } // soltou o botão: pulo baixo
  if (p.vy >= 0) p.jumping = false

  // gravidade (caindo pesa mais: o pulo fica firme)
  const grav = P.gravity * (p.vy > 0 ? P.fallMult : 1)
  p.vy = Math.min(P.maxFall, p.vy + grav * dt)

  moveX(g, p, dt)
  moveY(g, p, dt)
  if (p.onGround && Math.abs(p.vx) > 0.2) p.walkT += dt * (Math.abs(p.vx) / P.maxRun)
  // pisou numa ponte que desaba: ela começa a tremer
  if (p.onGround && !p.mover) {
    const fy = Math.floor(p.y + P.h + 0.05)
    for (const fx of [Math.floor(p.x + 0.05), Math.floor(p.x + P.w - 0.05)]) {
      if (g.tiles[fy]?.[fx] === 'c' && !g.crumbles.some((c) => c.x === fx && c.y === fy)) { g.crumbles.push({ x: fx, y: fy, t: 0, state: 'shake' }); g.events.push('crumble') }
    }
  }
  // portais (redemoinho de Caríbdis): entrou, sai do outro lado
  if (p.portalCD > 0) p.portalCD -= dt
  for (const pt of g.level.portals ?? []) {
    if (p.portalCD > 0) break
    const cx = p.x + P.w / 2, cy = p.y + P.h / 2
    if (Math.hypot(cx - (pt.x + 0.5), cy - (pt.y + 0.5)) < 0.75) {
      p.x = pt.tx + 0.5 - P.w / 2; p.y = pt.ty + 0.5 - P.h / 2; p.vy = Math.min(p.vy, 0); p.portalCD = 0.8
      g.events.push('portal')
      break
    }
  }

  // moedas
  for (const c of g.coins) {
    if (c.taken) continue
    if (overlap(p, c.x + 0.2, c.y + 0.2, 0.6, 0.6)) { c.taken = true; g.coinsTaken++; g.events.push('coin') }
  }
  // Confidence Gems
  for (const gm of g.gems) {
    if (gm.taken) continue
    if (overlap(p, gm.x + 0.15, gm.y + 0.1, 0.7, 0.8)) { gm.taken = true; g.gemsTaken++; g.events.push('gem') }
  }
  // Price Relays (encosta no poste)
  for (const r of g.relays) {
    if (!overlap(p, r.x + 0.15, r.y - 2, 0.7, 2)) continue
    if (!r.on) { r.on = true; r.t = 0; g.groupOn[r.group] = true; g.events.push('relay') }
    else if (r.fresh) r.t = 0 // encostou de novo: o sinal fica fresco outra vez
  }
  // Publishers: passou pela antena, ela liga (não dá pra pular por cima: vale a coluna inteira)
  g.publishers.forEach((pb, i) => {
    if (pb.on || p.x + P.w / 2 < pb.x) return
    pb.on = true; pb.t = 0
    const next = g.publishers[i + 1]
    g.restoreTo = Math.max(g.restoreTo, next ? next.x - 3 : g.level.flag - 6)
    g.events.push('publisher')
  })
  // baús: encostou, abre (o prêmio vem de fora: Pyth Entropy)
  for (const c of g.chests) {
    if (c.state !== 'closed') continue
    if (overlap(p, c.x + 0.1, c.y - 0.9, 0.8, 0.9)) { c.state = 'opening'; c.t = 0; g.chestAsks.push(c.n); g.events.push('chest') }
  }
  // poderes soltos
  for (const it of g.items) {
    if (it.taken || it.rise > 0) continue
    if (overlap(p, it.x + 0.1, it.y + 0.1, 0.8, 0.8)) { it.taken = true; givePower(g, it.kind) }
  }
  g.items = g.items.filter((it) => !it.taken)

  stepEnemies(g, dt)
  stepEchoes(g)
  stepBoss(g, dt)

  // checkpoints (o mais longe que você passou)
  for (let i = g.cpIdx + 1; i < g.cpList.length; i++) {
    const cp = g.cpList[i]
    if (p.x < cp.x) break
    g.cpIdx = i; g.checkpoint = { x: cp.x, y: (cp.y ?? g.level.start.y + 2) - 2 }; g.events.push('checkpoint')
  }
  stepHazards(g, dt)

  // caiu no buraco
  if (p.y > ROWS + 1) die(g)

  // Oracle Beacon: entregou o preço
  if (g.status === 'playing' && p.x + P.w >= g.level.flag + 0.4) {
    g.status = 'won'; g.statusT = 0
    p.x = g.level.flag + 0.4 - P.w; p.vx = 0; p.vy = 0; p.onGround = false
    g.restoreTo = g.cols
    g.events.push('win')
  }
  return g
}

// ---- perigos das fases 4 e 5: pontes que desabam, jatos de fogo e a tempestade/lava que persegue
const CRUMBLE = { shake: 0.45, back: 4 }
export const JET = { warn: 0.5, on: 1.0 }
export function jetState(g, j) {
  const period = j.period ?? 3, ph = (g.time + (j.phase ?? 0)) % period
  if (ph >= period - JET.on) return 'on'
  if (ph >= period - JET.on - JET.warn) return 'warn'
  return null
}
function stepHazards(g, dt) {
  const p = g.player
  for (const c of g.crumbles) {
    c.t += dt
    if (c.state === 'shake' && c.t >= CRUMBLE.shake) {
      c.state = 'gone'; c.t = 0; g.tiles[c.y][c.x] = '.'
      g.debris.push({ x: c.x, y: c.y, vy: 0, t: 0 })
    } else if (c.state === 'gone' && c.t >= CRUMBLE.back) {
      const inside = p.x < c.x + 1 && p.x + P.w > c.x && p.y < c.y + 1 && p.y + P.h > c.y
      if (!inside) { g.tiles[c.y][c.x] = 'c'; c.state = 'done' }
    }
  }
  g.crumbles = g.crumbles.filter((c) => c.state !== 'done')
  for (const d of g.debris) { d.t += dt; d.vy += P.gravity * 0.5 * dt; d.y += d.vy * dt }
  g.debris = g.debris.filter((d) => d.y < ROWS + 2)
  if (g.status !== 'playing') return
  // jatos de fogo: avisam (fumacinha) e depois sobem "h" casas
  for (const j of g.level.jets ?? []) {
    if (jetState(g, j) !== 'on' || p.invuln > 0) continue
    if (p.x < j.x + 0.85 && p.x + P.w > j.x + 0.15 && p.y < j.y && p.y + P.h > j.y - j.h) hurt(g, { x: j.x + 0.5 - ENEMY.w / 2 })
  }
  // tempestade (fase 4) / lava da liquidação (fase 5): acorda quando o herói passa de x0 e vem atrás dele
  const ch = g.level.chaser
  if (ch) {
    if (!g.chaser && p.x >= ch.x0) { g.chaser = { x: ch.x0 - (ch.lead ?? 10), speed: ch.speed, kind: ch.kind }; g.events.push('chaser') }
    if (g.chaser && p.x < ch.x1) {
      g.chaser.x += g.chaser.speed * dt
      if (p.x + P.w * 0.5 < g.chaser.x) die(g)
    }
  }
}

function stepMovers(g, dt) {
  for (const m of g.movers ?? []) {
    const ox = m.x, oy = m.y
    if (!m.group || g.groupOn[m.group]) m.t += dt
    const f = (1 - Math.cos((2 * Math.PI * m.t) / m.period)) / 2
    m.x = m.x0 + (m.dx ?? 0) * f
    m.y = m.y0 + (m.dy ?? 0) * f
    m.ddx = m.x - ox; m.ddy = m.y - oy
  }
}

// vento: 'warn' (avisa), 'on' (empurrando) ou null. Ciclo: espera, avisa (warn s), sopra (dur s)
export function windState(g, w) {
  const period = w.period ?? 3.2, dur = w.dur ?? 1.4, warn = w.warn ?? 0.6
  const ph = g.time % period
  if (ph >= period - dur) return 'on'
  if (ph >= period - dur - warn) return 'warn'
  return null
}

// relays "fresh": o sinal envelhece e os blocos apagam (quem estiver em cima cai)
function stepRelays(g, dt) {
  for (const r of g.relays) {
    if (!r.on || !r.fresh) continue
    r.t += dt
    if (r.t >= r.fresh) { r.on = false; r.t = 0; g.groupOn[r.group] = false; g.events.push('stale') }
  }
}

// quanto falta pra apagar (0..1, 1 = acabou de acender); null se não é "fresh" ou está apagado
export function freshLeft(g, group) {
  const r = g.relays.find((q) => q.group === group && q.fresh)
  if (!r || !r.on) return null
  return 1 - r.t / r.fresh
}
export const staleWarn = (g, group) => { const r = g.relays.find((q) => q.group === group && q.fresh); return !!r && r.on && r.fresh - r.t < STALE_WARN }

// poder solto: sobe saindo do bloco/baú, depois escorrega pro lado e cai até o chão (aí fica parado esperando)
function stepItems(g, dt) {
  for (const it of g.items) {
    it.t += dt
    if (it.rise > 0) { const d = Math.min(it.rise, dt * 2.5); it.y -= d; it.rise -= d; continue }
    if (it.landed) continue
    it.vy = Math.min(P.maxFall, (it.vy ?? 0) + P.gravity * 0.6 * dt)
    it.x += (it.vx ?? 0) * dt
    const row = Math.floor(it.y + 0.5)
    if (it.vx > 0 && solidAt(g, Math.floor(it.x + 0.95), row)) { it.x = Math.floor(it.x + 0.95) - 0.95; it.vx = -it.vx }
    else if (it.vx < 0 && solidAt(g, Math.floor(it.x + 0.05), row)) { it.x = Math.floor(it.x + 0.05) + 0.95; it.vx = -it.vx }
    it.y += it.vy * dt
    const foot = Math.floor(it.y + 1)
    // em cima de bloco continua escorregando; quando cai de uma altura e encosta no chão, para ali
    if (it.vy > 0 && solidAt(g, Math.floor(it.x + 0.5), foot)) { const fell = it.vy > 6 || !it.vx; it.y = foot - 1; it.vy = 0; if (fell) it.landed = true }
    if (it.y > ROWS + 1) it.taken = true // caiu no buraco: sumiu
  }
  g.items = g.items.filter((it) => !it.taken)
}

function givePower(g, kind) {
  const p = g.player
  if (kind === 'shield') p.shield = true
  if (kind === 'lazer') p.lazer = P.lazerTime
  g.events.push('power')
}

// o jogo chama quando o sorteio do baú chega. loot = { kind: 'coins'|'shield'|'lazer', amount?, rarity }
export function openChest(g, n, loot) {
  const c = g.chests[n]
  if (!c || c.state === 'open') return
  c.state = 'open'; c.t = 0; c.loot = loot
  if (loot.kind === 'coins') {
    g.bonusCoins += loot.amount
    for (let i = 0; i < Math.min(6, loot.amount); i++) g.popped.push({ x: c.x + (i - 2.5) * 0.35, y: c.y - 2, t: -i * 0.06 })
    g.events.push('coin')
  } else {
    g.items.push({ kind: loot.kind, x: c.x, y: c.y - 1, rise: 1, vx: 0, vy: 0, t: 0, taken: false })
    g.events.push('item')
  }
}

function moveX(g, p, dt) {
  p.x += (p.vx + (p.windPush || 0)) * dt
  const top = Math.floor(p.y + EPS), bot = Math.floor(p.y + P.h - EPS)
  const mv = p.vx + (p.windPush || 0)
  if (mv > 0) {
    const tx = Math.floor(p.x + P.w)
    for (let ty = top; ty <= bot; ty++) if (solidAt(g, tx, ty)) { p.x = tx - P.w - EPS; p.vx = 0; break }
  } else if (mv < 0) {
    const tx = Math.floor(p.x)
    for (let ty = top; ty <= bot; ty++) if (solidAt(g, tx, ty)) { p.x = tx + 1 + EPS; p.vx = 0; break }
  }
}

function moveY(g, p, dt) {
  const feetBefore = p.y + P.h
  p.y += p.vy * dt
  const left = Math.floor(p.x + EPS), right = Math.floor(p.x + P.w - EPS)
  p.onGround = false
  p.mover = null
  if (p.vy >= 0) {
    for (const m of g.movers ?? []) {
      if (p.x >= m.x + m.w || p.x + P.w <= m.x) continue
      if (feetBefore <= m.y + 0.06 + Math.abs(m.ddy) && p.y + P.h >= m.y) { p.y = m.y - P.h; p.vy = 0; p.onGround = true; p.mover = m; break }
    }
  }
  if (p.vy > 0) {
    const ty = Math.floor(p.y + P.h)
    for (let tx = left; tx <= right; tx++) if (solidAt(g, tx, ty)) { p.y = ty - P.h; p.vy = 0; p.onGround = true; p.mover = null; break }
  } else if (p.vy < 0) {
    const ty = Math.floor(p.y)
    // bate a cabeça: no bloco mais perto do meio do herói
    const mid = Math.floor(p.x + P.w / 2)
    const hits = [mid, left, right].filter((tx, i, a) => a.indexOf(tx) === i && solidAt(g, tx, ty))
    if (hits.length) {
      p.y = ty + 1 + EPS; p.vy = 0; p.jumping = false
      bump(g, hits[0], ty)
    }
  }
}

function bump(g, tx, ty) {
  if (ty < 0 || tx < 0 || tx >= g.cols) return
  const t = g.tiles[ty][tx]
  if (t === '?') {
    g.tiles[ty][tx] = 'u'
    g.popped.push({ x: tx, y: ty - 1, t: 0 })
    g.coinsTaken++
    g.events.push('coin')
  }
  if (t === '!') {
    // oráculo do poder: sai o Confidence Shield (se já tem escudo, sai moeda)
    g.tiles[ty][tx] = 'u'
    if (g.player.shield) { g.popped.push({ x: tx, y: ty - 1, t: 0 }); g.coinsTaken++; g.events.push('coin') }
    else { g.items.push({ kind: 'shield', x: tx, y: ty, rise: 1, vx: 2.2, vy: 0, t: 0, taken: false }); g.events.push('item') }
  }
  if (t === '?' || t === '!' || t === 'b') {
    g.bumps.push({ x: tx, y: ty, t: 0 })
    g.events.push('bump')
    // quem estiver em cima do bloco leva o tranco
    for (const e of g.enemies) if (e.alive && Math.abs(e.x + ENEMY.w / 2 - (tx + 0.5)) < 0.8 && Math.abs(e.y + ENEMY.h - ty) < 0.2) killEnemy(g, e)
  }
}

function stepEnemies(g, dt) {
  const p = g.player
  for (const e of g.enemies) {
    if (!e.alive) { e.squashT += dt; continue }
    if (!e.awake) { if (Math.abs(e.x - p.x) < ENEMY.wake) e.awake = true; else continue }
    if (e.type === 'harpy') {
      e.t += dt
      e.x += e.vx * dt
      if (e.x < e.x0 - e.range) { e.x = e.x0 - e.range; e.vx = HARPY.speed }
      if (e.x > e.x0 + e.range) { e.x = e.x0 + e.range; e.vx = -HARPY.speed }
      e.y = e.baseY + Math.sin(e.t * 3) * HARPY.bob
    } else {
    // anda e vira na parede ou na beirada (não se joga no buraco)
    e.vy = Math.min(P.maxFall, e.vy + P.gravity * dt)
    e.x += e.vx * dt
    const top = Math.floor(e.y + EPS), bot = Math.floor(e.y + ENEMY.h - EPS)
    const front = e.vx > 0 ? Math.floor(e.x + ENEMY.w) : Math.floor(e.x)
    let turn = false
    for (let ty = top; ty <= bot; ty++) if (solidAt(g, front, ty)) turn = true
    const footY = Math.floor(e.y + ENEMY.h + 0.05)
    const grounded = solidAt(g, Math.floor(e.x + ENEMY.w / 2), footY)
    if (grounded && !solidAt(g, front, footY) && front >= 0 && front < g.cols) turn = true
    if (turn) { e.x -= e.vx * dt; e.vx = -e.vx }
    e.y += e.vy * dt
    const fy = Math.floor(e.y + ENEMY.h)
    const l = Math.floor(e.x + EPS), r = Math.floor(e.x + ENEMY.w - EPS)
    for (let tx = l; tx <= r; tx++) if (solidAt(g, tx, fy)) { e.y = fy - ENEMY.h; e.vy = 0; break }
    if (e.y > ROWS + 1) e.alive = false
    }

    // encostou no herói: pisou em cima (mata o bug) ou levou dano
    if (g.status !== 'playing') continue
    if (p.x < e.x + ENEMY.w && p.x + P.w > e.x && p.y < e.y + ENEMY.h && p.y + P.h > e.y) {
      const fromAbove = p.vy > 0 && p.y + P.h - e.y < 0.55
      if (fromAbove) {
        killEnemy(g, e)
        p.vy = -(g.prevJump ? P.stompHoldV : P.stompV); p.jumping = g.prevJump
      } else if (p.invuln <= 0) {
        hurt(g, e)
      }
    }
  }
}

// levou um golpe: com escudo, só perde o escudo (e pisca um tempinho); sem escudo, perde a vida
// ---- Echo Shadow: guarda por onde o herói passou e, depois de "delay" segundos, uma sombra refaz o mesmo caminho.
// Encostou nela = dano (não dá pra pisar, é só uma sombra). Some quando o herói sai da zona.
function stepEchoes(g) {
  const p = g.player
  if (!g.echoes?.length) return
  g.trail.push({ t: g.time, x: p.x, y: p.y, f: p.facing, og: p.onGround, vx: p.vx, vy: p.vy, w: p.walkT })
  const keep = g.time - 4
  while (g.trail.length && g.trail[0].t < keep) g.trail.shift()
  for (const z of g.echoes) {
    if (!z.active && p.x >= z.x0 && p.x <= z.x1) { z.active = true; z.startT = g.time; z.visible = false }
    if (z.active && (p.x > z.x1 + 3 || p.x < z.x0 - 6)) { z.active = false; z.visible = false }
    if (!z.active) continue
    const want = g.time - z.delay
    if (want < z.startT) { z.visible = false; continue }
    let s0 = null
    for (let i = g.trail.length - 1; i >= 0; i--) if (g.trail[i].t <= want) { s0 = g.trail[i]; break }
    if (!s0) continue
    z.visible = true
    z.x = s0.x; z.y = s0.y; z.facing = s0.f; z.onGround = s0.og; z.vx = s0.vx; z.vy = s0.vy; z.walkT = s0.w
    if (g.status === 'playing' && p.invuln <= 0 && p.x < z.x + P.w - 0.15 && p.x + P.w > z.x + 0.15 && p.y < z.y + P.h - 0.2 && p.y + P.h > z.y + 0.2) {
      hurt(g, { x: z.x - (ENEMY.w - P.w) / 2 })
    }
  }
}

// ---- TALOS, o gigante de bronze (1º mini-chefe). Anda até você, levanta o martelo (aviso) e bate no chão:
// saem duas ondas pelo chão (pula por cima). Pisa na cabeça dele 3 vezes; a cada golpe ele fica mais rápido.
// Quando ele cai, o portão ('x') abre.
export const BOSS = { w: 1.8, h: 2.6, hp: 3, walk: 1.6, wave: 6.5 }
function freshBoss(b) {
  if (b.type === 'kronos') return freshKronos(b)
  return { ...b, x: b.x, y: (b.floor ?? 12) - BOSS.h, hp: BOSS.hp, state: 'sleep', t: 0, vx: 0, inv: 0, alive: true, deadT: 0, facing: -1, waves: [] }
}
function stepBoss(g, dt) {
  const b = g.boss
  if (!b) return
  if (b.type === 'kronos') { stepKronos(g, dt); return }
  const p = g.player
  if (!b.alive) { b.deadT += dt; return }
  for (const w of b.waves) w.x += w.dir * BOSS.wave * dt
  b.waves = b.waves.filter((w) => w.x > b.ax0 - 1 && w.x < b.ax1 + 1)
  if (b.state === 'sleep') { if (p.x >= b.ax0) { b.state = 'walk'; b.t = 0; g.events.push('bosswake') } return }
  b.t += dt
  b.inv = Math.max(0, b.inv - dt)
  const fast = 1 + (BOSS.hp - b.hp) * 0.35
  const cx = b.x + BOSS.w / 2, pc = p.x + P.w / 2
  if (b.state === 'walk') {
    b.facing = pc < cx ? -1 : 1
    b.vx = b.facing * BOSS.walk * fast
    b.x = Math.max(b.ax0, Math.min(b.ax1 - BOSS.w, b.x + b.vx * dt))
    if (b.t > 2.2 / fast) { b.state = 'windup'; b.t = 0; b.vx = 0 }
  } else if (b.state === 'windup') {
    if (b.t > 0.6 / fast) {
      b.state = 'slam'; b.t = 0
      const feet = b.y + BOSS.h
      b.waves.push({ x: cx, y: feet, dir: -1 }, { x: cx, y: feet, dir: 1 })
      g.events.push('slam')
    }
  } else if (b.state === 'slam') {
    if (b.t > 0.75) { b.state = 'walk'; b.t = 0 }
  }
  if (g.status !== 'playing') return
  // ondas no chão: pega quem está pisando no chão perto dela
  for (const w of b.waves) {
    if (p.invuln <= 0 && p.onGround && Math.abs(p.y + P.h - w.y) < 0.2 && Math.abs(pc - w.x) < 0.55) hurt(g, { x: w.x - ENEMY.w / 2 })
  }
  // encostou no Talos: de cima = golpe nele; do lado = dano em você
  if (p.x < b.x + BOSS.w && p.x + P.w > b.x && p.y < b.y + BOSS.h && p.y + P.h > b.y) {
    const fromAbove = p.vy > 0 && p.y + P.h - b.y < 0.75
    if (fromAbove && b.inv <= 0) {
      b.hp--; b.inv = 1.2
      p.vy = -P.stompHoldV * 1.1; p.jumping = true
      g.events.push('bosshit')
      if (b.hp <= 0) {
        b.alive = false; b.deadT = 0; b.waves = []
        for (const row of g.tiles) for (let i = 0; i < row.length; i++) if (row[i] === 'x') row[i] = '.'
        g.events.push('bossdown')
      }
    } else if (!fromAbove && p.invuln <= 0) {
      hurt(g, { x: b.x + BOSS.w / 2 - ENEMY.w / 2 })
      p.vx = (pc < cx ? -1 : 1) * 7
    }
  }
}

// ---- KRONOS, the Stale Titan (chefe final). Ele flutua alto (não dá pra pisar nele): pra vencer, acenda os 3 altares
// da arena, um de cada vez (o próximo brilha). A cada altar aceso ele cambaleia e fica mais bravo:
//   fase 1: pilares de gelo (aviso no chão, depois sobem)   fase 2: + a foice varre o chão e chama 2 Laglings
//   fase 3: tudo mais rápido. Com os 3 acesos ele cai, a Genesis Flame volta e o portão abre.
export const KRONOS = { w: 3, h: 4, flyY: 1.2 }
function freshKronos(b) {
  return { ...b, x: b.x, y: KRONOS.flyY, phase: 0, state: 'sleep', t: 0, atk: 0, swp: 0, stun: 0, alive: true, deadT: 0, facing: -1,
    altars: b.altars.map((a) => ({ ...a, lit: false })), pillars: [], sweeps: [] }
}
function stepKronos(g, dt) {
  const k = g.boss, p = g.player
  if (!k.alive) { k.deadT += dt; return }
  for (const pl of k.pillars) pl.t += dt
  k.pillars = k.pillars.filter((pl) => pl.t < 1.5)
  for (const sw of k.sweeps) sw.x += sw.dir * 7.5 * dt
  k.sweeps = k.sweeps.filter((sw) => sw.x > k.ax0 - 2 && sw.x < k.ax1 + 2)
  if (k.state === 'sleep') { if (p.x >= k.ax0) { k.state = 'fight'; k.t = 0; g.events.push('bosswake') } return }
  k.t += dt
  if (k.stun > 0) k.stun -= dt
  const pc = p.x + P.w / 2, kc = k.x + KRONOS.w / 2
  // flutua atrás do herói (devagar), sempre no alto
  if (k.stun <= 0) {
    k.facing = pc < kc ? -1 : 1
    k.x = Math.max(k.ax0, Math.min(k.ax1 - KRONOS.w, k.x + Math.sign(pc - kc) * Math.min(Math.abs(pc - kc), (1.4 + k.phase * 0.5) * dt)))
  }
  k.y = KRONOS.flyY + Math.sin(k.t * 1.6) * 0.4
  if (k.stun <= 0) {
    k.atk += dt
    if (k.atk > 2.8 - k.phase * 0.6) {
      k.atk = 0
      const floor = k.floor ?? 12
      k.pillars.push({ x: Math.max(k.ax0, Math.min(k.ax1 - 1, Math.floor(pc))), y: floor, t: 0 })
      g.events.push('freeze')
    }
    if (k.phase >= 1) {
      k.swp += dt
      if (k.swp > 4.6 - k.phase * 0.9) {
        k.swp = 0
        const fromLeft = pc > (k.ax0 + k.ax1) / 2
        k.sweeps.push({ x: fromLeft ? k.ax0 - 1 : k.ax1 + 1, dir: fromLeft ? 1 : -1, y: k.floor ?? 12 })
        g.events.push('sweep')
      }
    }
  }
  if (g.status !== 'playing') return
  // pilar de gelo: 0,8 s de aviso, depois sobe 2,5 casas por 0,6 s
  for (const pl of k.pillars) {
    if (pl.t < 0.8 || pl.t > 1.4 || p.invuln > 0) continue
    if (p.x < pl.x + 0.9 && p.x + P.w > pl.x + 0.1 && p.y + P.h > pl.y - 2.5) hurt(g, { x: pl.x + 0.5 - ENEMY.w / 2 })
  }
  // a foice: varre o chão (pula por cima)
  for (const sw of k.sweeps) {
    if (p.invuln > 0) continue
    if (Math.abs(pc - sw.x) < 0.7 && p.y + P.h > sw.y - 0.9) hurt(g, { x: sw.x - ENEMY.w / 2 })
  }
  // encostar nele (pulando alto) também machuca
  if (p.invuln <= 0 && p.x < k.x + KRONOS.w && p.x + P.w > k.x && p.y < k.y + KRONOS.h && p.y + P.h > k.y + 0.5) hurt(g, { x: kc - ENEMY.w / 2 })
  // altares: só o próximo da fila acende
  const next = k.altars.find((a) => !a.lit)
  if (next && p.x < next.x + 1 && p.x + P.w > next.x && p.y < next.y && p.y + P.h > next.y - 2) {
    next.lit = true; k.phase++; k.stun = 1.2; k.atk = 0; k.swp = 0; k.pillars = []
    g.events.push('altar')
    if (k.phase === 1) {
      for (const ex of [k.ax0 + 2, k.ax1 - 3]) g.enemies.push({ x: ex, y: (k.floor ?? 12) - 1 + 0.1, vx: -ENEMY.speed, vy: 0, alive: true, awake: true, squashT: 0 })
    }
    if (k.phase >= k.altars.length) {
      k.alive = false; k.deadT = 0; k.sweeps = []; k.pillars = []
      for (const row of g.tiles) for (let i = 0; i < row.length; i++) if (row[i] === 'x') row[i] = '.'
      g.events.push('bossdown')
    }
  }
}

function hurt(g, e) {
  const p = g.player
  if (p.shield) {
    p.shield = false; p.invuln = P.invuln
    p.vy = -9; p.vx = (p.x + P.w / 2 < e.x + ENEMY.w / 2 ? -1 : 1) * 5
    g.events.push('shieldbreak')
    return
  }
  die(g)
}

function killEnemy(g, e) {
  e.alive = false; e.squashT = 0
  g.events.push('stomp')
}

function die(g) {
  if (g.status !== 'playing') return
  g.status = 'dying'; g.statusT = 0
  g.lives--
  const p = g.player
  p.vx = 0; p.vy = p.y > ROWS ? 0 : -16 // pulinho pra cima e cai pra fora da tela
  p.shield = false; p.lazer = 0
  g.events.push('die')
}

function respawn(g) {
  if (g.lives <= 0) { g.status = 'gameover'; g.statusT = 0; g.events.push('gameover'); return }
  const at = g.checkpoint ?? g.level.start
  g.player = spawnPlayer({ x: at.x, y: at.y ?? g.level.start.y })
  g.enemies = freshEnemies(g.level) // inimigos voltam pro lugar
  g.trail = []
  for (const z of g.echoes ?? []) { z.active = false; z.visible = false }
  g.chaser = null
  for (const c of g.crumbles) if (c.state === 'gone') g.tiles[c.y][c.x] = 'c'
  g.crumbles = []
  if (g.boss?.alive) g.boss = freshBoss(g.level.boss) // o chefe volta com a vida cheia
  // relays "fresh" apagam de novo (os normais continuam acesos: a ponte que você ligou fica)
  for (const r of g.relays) if (r.fresh && r.on) { r.on = false; r.t = 0; g.groupOn[r.group] = false }
  g.status = 'playing'; g.statusT = 0
  g.prevJump = true // não pula sozinho se o botão ainda estiver apertado
}

// estrelas da fase: entregar o preço, achar as 3 Confidence Gems, terminar dentro do tempo "par"
export function starsOf(g) {
  const total = g.coins.length + g.level.grid.flat().filter((c) => c === '?').length
  return {
    finished: g.status === 'won',
    allGems: g.gemsTaken >= g.gems.length,
    fast: g.status === 'won' && g.time <= g.level.par,
    total,
    gems: g.gems.length,
  }
}

export const ENEMY_SIZE = ENEMY
