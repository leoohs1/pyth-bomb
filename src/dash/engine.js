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
const SOLID = new Set(['#', 'b', '?', '!', 'u', 'g', 'G', 'r', 'R'])
const EPS = 1e-4
const RESTORE_SPEED = 26 // casas por segundo da onda de cor
const STALE_WARN = 1.5   // segundos antes de apagar: o bloco pisca

const isGroup = (c) => c >= '1' && c <= '9'
const freshEnemies = (level) => level.enemies.map((e) => ({ x: e.x + 0.05, y: e.y + 0.1, vx: -ENEMY.speed, vy: 0, alive: true, awake: false, squashT: 0 }))

export function createGame(level, { lives = 3 } = {}) {
  return {
    level,
    tiles: level.grid.map((r) => [...r]),
    cols: level.cols,
    player: spawnPlayer(level.start),
    coins: level.coins.map((c) => ({ ...c, taken: false })),
    enemies: freshEnemies(level),
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
    // sons e efeitos deste passo: 'jump' 'coin' 'stomp' 'bump' 'die' 'win' 'gameover' 'checkpoint'
    //   'relay' 'stale' 'publisher' 'gem' 'chest' 'power' 'shieldbreak' 'item'
    events: [],
    prevJump: false,
  }
}

function spawnPlayer(at) {
  return { x: at.x, y: at.y, vx: 0, vy: 0, onGround: false, facing: 1, coyote: 0, buffer: 0, jumping: false, walkT: 0, shield: false, invuln: 0, lazer: 0 }
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

  // checkpoint
  const cp = g.level.checkpoint
  if (cp && !g.checkpoint && p.x >= cp.x) { g.checkpoint = { x: cp.x, y: g.level.start.y }; g.events.push('checkpoint') }

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
  p.x += p.vx * dt
  const top = Math.floor(p.y + EPS), bot = Math.floor(p.y + P.h - EPS)
  if (p.vx > 0) {
    const tx = Math.floor(p.x + P.w)
    for (let ty = top; ty <= bot; ty++) if (solidAt(g, tx, ty)) { p.x = tx - P.w - EPS; p.vx = 0; break }
  } else if (p.vx < 0) {
    const tx = Math.floor(p.x)
    for (let ty = top; ty <= bot; ty++) if (solidAt(g, tx, ty)) { p.x = tx + 1 + EPS; p.vx = 0; break }
  }
}

function moveY(g, p, dt) {
  p.y += p.vy * dt
  const left = Math.floor(p.x + EPS), right = Math.floor(p.x + P.w - EPS)
  p.onGround = false
  if (p.vy > 0) {
    const ty = Math.floor(p.y + P.h)
    for (let tx = left; tx <= right; tx++) if (solidAt(g, tx, ty)) { p.y = ty - P.h; p.vy = 0; p.onGround = true; break }
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
