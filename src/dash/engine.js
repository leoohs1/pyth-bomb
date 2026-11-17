// Motor do Pyth Dash (plataforma). Tudo em "casas" (1 casa = 1 bloco), y cresce pra baixo.
// Passo fixo: o jogo chama step() com dt pequeno (1/120 s). Sem React aqui: dá pra testar sozinho.
import { ROWS } from './levels.js'

// ---- física (o "gosto" do pulo mora aqui)
export const P = {
  accGround: 42, accAir: 30, decel: 48, maxRun: 7.5,
  gravity: 70, fallMult: 1.45, jumpV: 22, jumpCut: 0.5, maxFall: 22,
  coyote: 0.1,     // ainda dá pra pular um tiquinho depois de sair da beirada
  buffer: 0.12,    // apertou pular um tiquinho antes de encostar no chão: pula assim que encostar
  stompV: 13, stompHoldV: 18,
  w: 0.7, h: 1.5,  // tamanho do herói (caixa de colisão)
}
const ENEMY = { w: 0.9, h: 0.9, speed: 1.8, wake: 17 }
const SOLID = new Set(['#', 'b', '?', 'u', 'g', 'G', 'r', 'R'])
const EPS = 1e-4

export function createGame(level, { lives = 3 } = {}) {
  return {
    level,
    tiles: level.grid.map((r) => [...r]),
    cols: level.cols,
    player: spawnPlayer(level.start),
    coins: level.coins.map((c) => ({ ...c, taken: false })),
    enemies: level.enemies.map((e) => ({ x: e.x + 0.05, y: e.y + 0.1, vx: -ENEMY.speed, vy: 0, alive: true, awake: false, squashT: 0 })),
    popped: [],   // moedas que saem dos oráculos (animação)
    bumps: [],    // blocos que pulam quando batem a cabeça
    coinsTaken: 0,
    lives,
    time: 0,
    status: 'playing', // 'playing' | 'dying' | 'won' | 'gameover'
    statusT: 0,
    checkpoint: null,
    events: [],   // sons e efeitos deste passo: 'jump' 'coin' 'stomp' 'bump' 'die' 'win' 'gameover' 'checkpoint'
    prevJump: false,
  }
}

function spawnPlayer(at) {
  return { x: at.x, y: at.y, vx: 0, vy: 0, onGround: false, facing: 1, coyote: 0, buffer: 0, jumping: false, walkT: 0 }
}

export const solidAt = (g, tx, ty) => {
  if (tx < 0 || tx >= g.cols) return true // paredes invisíveis nas pontas
  if (ty < 0 || ty >= ROWS) return false
  return SOLID.has(g.tiles[ty][tx])
}

// ---- um passo do jogo. input = { left, right, jump } (jump = botão segurado)
export function step(g, input, dt) {
  g.events = []
  g.time += g.status === 'playing' ? dt : 0
  for (const b of g.bumps) b.t += dt
  g.bumps = g.bumps.filter((b) => b.t < 0.2)
  for (const c of g.popped) { c.t += dt }
  g.popped = g.popped.filter((c) => c.t < 0.6)

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
    // desce pelo mastro e anda pra direita
    if (!p.onGround) { p.vy = 5; moveY(g, p, dt) } else { p.vx = 3; p.facing = 1; moveX(g, p, dt); p.walkT += dt }
    return g
  }
  if (g.status !== 'playing') return g

  const p = g.player
  const pressed = input.jump && !g.prevJump
  g.prevJump = !!input.jump

  // correr
  const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0)
  if (dir) {
    const acc = p.onGround ? P.accGround : P.accAir
    const turning = Math.sign(p.vx) === -dir ? 2 : 1 // virar é mais rápido (fica responsivo)
    p.vx += dir * acc * turning * dt
    p.vx = Math.max(-P.maxRun, Math.min(P.maxRun, p.vx))
    p.facing = dir
  } else if (p.onGround) {
    const d = P.decel * dt
    p.vx = Math.abs(p.vx) <= d ? 0 : p.vx - Math.sign(p.vx) * d
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

  // moedas
  for (const c of g.coins) {
    if (c.taken) continue
    if (p.x < c.x + 0.8 && p.x + P.w > c.x + 0.2 && p.y < c.y + 0.8 && p.y + P.h > c.y + 0.2) {
      c.taken = true; g.coinsTaken++; g.events.push('coin')
    }
  }

  stepEnemies(g, dt)

  // checkpoint
  const cp = g.level.checkpoint
  if (cp && !g.checkpoint && p.x >= cp.x) { g.checkpoint = { x: cp.x, y: g.level.start.y }; g.events.push('checkpoint') }

  // caiu no buraco
  if (p.y > ROWS + 1) die(g)

  // bandeira
  if (g.status === 'playing' && p.x + P.w >= g.level.flag + 0.4) {
    g.status = 'won'; g.statusT = 0
    p.x = g.level.flag + 0.4 - P.w; p.vx = 0; p.vy = 0; p.onGround = false
    g.events.push('win')
  }
  return g
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
  if (t === '?' || t === 'b') {
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
      } else {
        die(g)
      }
    }
  }
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
  g.events.push('die')
}

function respawn(g) {
  if (g.lives <= 0) { g.status = 'gameover'; g.statusT = 0; g.events.push('gameover'); return }
  const at = g.checkpoint ?? g.level.start
  g.player = spawnPlayer({ x: at.x, y: at.y ?? g.level.start.y })
  // inimigos voltam pro lugar (os da frente do checkpoint)
  g.enemies = g.level.enemies.map((e) => ({ x: e.x + 0.05, y: e.y + 0.1, vx: -ENEMY.speed, vy: 0, alive: true, awake: false, squashT: 0 }))
  g.status = 'playing'; g.statusT = 0
  g.prevJump = true // não pula sozinho se o botão ainda estiver apertado
}

// estrelas da fase: terminar, pegar todas as moedas, terminar dentro do tempo "par"
export function starsOf(g) {
  const total = g.coins.length + g.level.grid.flat().filter((c) => c === '?').length
  return {
    finished: g.status === 'won',
    allCoins: g.coinsTaken >= total,
    fast: g.status === 'won' && g.time <= g.level.par,
    total,
  }
}

export const ENEMY_SIZE = ENEMY
