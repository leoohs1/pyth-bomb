// Regras de UMA SALA do Pyth Bomb PVP (2 a 4 jogadores, um em cada canto, sem monstros).
// Sem tela, sem rede: só regra. O navegador (teste local) e o servidor de jogo usam este mesmo arquivo.
//
// Como usar:
//   const s = createMatch({ players: [{ id, name, hero }, ...], map: 'tavern', seed })
//   a cada passo fixo (STEP = 1/60 s): step(s, inputs)
//   inputs = { [id]: { dir: 'up'|'down'|'left'|'right'|null, bomb: true/false, detonate: true/false } }
//   (bomb e detonate são "toques": a regra lê e apaga.)
//
// Quem vence (regra da Halls): quem sobrar vivo. Se todo mundo morrer junto, quem morreu por ÚLTIMO.
// Empate exato (morreram no mesmo passinho): sorteio (tiebreak; na fase 2 vem do Pyth Entropy).
//
// Posições em "casas" com vírgula (x = 3.5 é meio caminho entre a casa 3 e a 4), igual ao Solo.
import {
  FLOOR, BLOCK, WALL, STEP,
  PLAYER_SPEED, START_BOMBS, START_RANGE,
  SPEED_STEP, MAX_SPEED, MAX_BOMBS, MAX_RANGE,
  SHIELD_INVULN, DETONATOR_FUSE, KICK_SPEED,
  FUSE_TIME, FLAME_TIME, BURN_TIME, ITEM_LIFE, ITEM_GRACE,
  COUNTDOWN, ROUND_TIME, CLOSE_EVERY, CLOSE_WARN, END_DELAY,
  FINAL_ITEM_EVERY, FINAL_ITEM_MAX, FINAL_ITEM_FIRST,
} from './constants.js'
import { makeMap, tileAt, setTile, cornersFor, cornerCell, closingOrder, MAPS } from './maps.js'
import { makeRng, pick } from './rng.js'

const DIRS = {
  up: { dx: 0, dy: -1 },
  down: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
}

// itens que aparecem no chão da FINAL (repetir = mais chance)
const FINAL_POOL = ['bomb', 'bomb', 'bomb', 'fire', 'fire', 'fire', 'speed', 'speed', 'shield', 'kick', 'detonator']

const defaultTiebreak = (ids, rng) => pick(ids, rng)

// players: na ordem dos cantos (quem sorteia a ordem é o servidor). map: 'tavern' | 'hull' | 'chop'
export function createMatch({ players, map = 'tavern', seed = 1, tiebreak = defaultTiebreak }) {
  const rng = makeRng(seed)
  const level = makeMap(map, rng)
  const corners = cornersFor(players.length)
  return {
    map,
    mapName: MAPS[map]?.name ?? map,
    final: level.final,
    seed,
    rng,
    tiebreak,
    level,
    players: players.map((pl, i) => {
      const c = cornerCell(corners[i], level.cols, level.rows)
      return {
        id: pl.id, name: pl.name, hero: pl.hero, bot: !!pl.bot, corner: corners[i],
        x: c.x, y: c.y,
        alive: true, deathT: 0, diedAt: null, killedBy: null, cause: null,
        speed: PLAYER_SPEED, maxBombs: START_BOMBS, range: START_RANGE,
        shield: false, kick: false, detonator: false,
        facing: 'down', flip: false, moving: false, walkT: 0, invulnT: 0,
        connected: true,
      }
    }),
    bombs: [],    // { x, y, timer, fuse, range, owner, passFor: [ids], remote, slide }
    flames: [],   // { x, y, t, kind, sides, owner, visual }
    burning: [],  // caixotes queimando: { x, y, t }
    powerups: level.hidden.map((h) => ({ ...h, revealed: false, taken: false })),
    status: 'countdown', // 'countdown' | 'playing' | 'ending' | 'over'
    phaseT: COUNTDOWN,
    clock: ROUND_TIME,
    closing: null,   // morte súbita: { order: [[x, y]...], i, t }
    closingWarn: [], // casas que vão fechar logo (piscando)
    nextItemT: FINAL_ITEM_FIRST,
    deathOrder: [],
    winner: null,
    result: null, // { winner, places: [ids do 1º ao último], tie: [ids] | null }
    time: 0,
    shake: 0,
    events: [],
  }
}

const bombAt = (s, x, y) => s.bombs.find((b) => b.x === x && b.y === y)
const overlaps = (p, x, y) => Math.abs(p.x - x) < 1 && Math.abs(p.y - y) < 1

// a casa deixa ESTE jogador entrar? (a bomba que nasceu embaixo dele não trava, até ele sair de cima)
function walkable(s, p, x, y) {
  if (tileAt(s.level, x, y) !== FLOOR) return false
  const b = bombAt(s, x, y)
  return !b || b.passFor.includes(p.id)
}

// anda num eixo com o "deslize de quina" do Bomberman (igual ao Solo)
function moveAxis(s, p, main, cross, sign, step) {
  const lane = Math.round(p[cross])
  const off = p[cross] - lane
  const cur = Math.round(p[main])
  const free = (m, c) => (main === 'x' ? walkable(s, p, m, c) : walkable(s, p, c, m))

  if (Math.abs(off) > 1e-6) {
    if (free(cur + sign, lane)) {
      const k = Math.min(step, Math.abs(off))
      p[cross] = k === Math.abs(off) ? lane : p[cross] - Math.sign(off) * k
      step -= k
    } else if (Math.abs(off) >= 0.2 && free(cur + sign, lane + Math.sign(off))) {
      const target = lane + Math.sign(off)
      const k = Math.min(step, Math.abs(target - p[cross]))
      p[cross] += Math.sign(target - p[cross]) * k
      return
    } else {
      return
    }
  }
  if (step <= 0) return

  let next = p[main] + sign * step
  if (!free(cur + sign, lane)) {
    next = sign > 0 ? Math.min(next, Math.max(p[main], cur)) : Math.max(next, Math.min(p[main], cur))
  }
  p[main] = next
}

// fogo: lados que encostam em outro fogo (só pro desenho, igual ao Solo)
const SIDE = { left: 1, right: 2, up: 4, down: 8 }
const BACK = { left: 2, right: 1, up: 8, down: 4 }
const ALL_SIDES = 15

function addFlame(s, x, y, kind, sides, owner) {
  const f = s.flames.find((q) => q.x === x && q.y === y && !q.visual)
  if (f) {
    f.t = FLAME_TIME
    f.owner = owner
    if (f.kind !== kind) { f.kind = 'center'; f.sides = ALL_SIDES }
    else f.sides |= sides
    return f
  }
  const nf = { x, y, t: FLAME_TIME, kind, sides, owner }
  s.flames.push(nf)
  return nf
}

function explode(s, bomb) {
  s.bombs.splice(s.bombs.indexOf(bomb), 1)
  const own = bomb.owner
  const center = addFlame(s, bomb.x, bomb.y, 'center', ALL_SIDES, own)
  for (const [name, d] of Object.entries(DIRS)) {
    const kind = d.dx ? 'h' : 'v'
    let prev = center
    for (let i = 1; i <= bomb.range; i++) {
      const x = bomb.x + d.dx * i
      const y = bomb.y + d.dy * i
      const t = tileAt(s.level, x, y)
      if (t === WALL) break
      if (t === BLOCK) {
        if (!s.burning.some((b) => b.x === x && b.y === y)) {
          s.burning.push({ x, y, t: BURN_TIME })
          s.events.push({ type: 'blockBroken', x, y })
        }
        prev.sides |= SIDE[name]
        s.flames.push({ x, y, t: FLAME_TIME, kind, sides: BACK[name], visual: true, owner: own })
        break
      }
      prev.sides |= SIDE[name]
      const other = bombAt(s, x, y)
      if (other) { other.timer = 0; addFlame(s, x, y, 'center', ALL_SIDES, own); break } // reação em cadeia
      prev = addFlame(s, x, y, kind, BACK[name], own) // (o buraco da final deixa o fogo passar por cima)
    }
  }
  s.shake = Math.min(0.25, s.shake + 0.12)
  s.events.push({ type: 'explode', x: bomb.x, y: bomb.y, range: bomb.range, owner: own })
}

const flameAt = (s, x, y) => s.flames.find((f) => f.x === x && f.y === y && !f.visual)

// machuca o jogador. crush = esmagado pela parede da morte súbita (o escudo não salva)
function hurt(s, p, by, cause, crush = false) {
  if (!p.alive) return
  if (!crush && p.invulnT > 0) return
  if (!crush && p.shield) {
    p.shield = false
    p.invulnT = SHIELD_INVULN
    s.shake = Math.min(0.35, s.shake + 0.2)
    s.events.push({ type: 'shieldBreak', x: p.x, y: p.y, id: p.id })
    return
  }
  p.alive = false
  p.moving = false
  p.diedAt = s.time
  p.killedBy = by ?? null
  p.cause = cause
  s.deathOrder.push(p.id)
  s.shake = Math.min(0.4, s.shake + 0.3)
  s.events.push({ type: 'playerHit', x: p.x, y: p.y, id: p.id, by: by ?? null, cause })
}

// Tira o jogador da sala (caiu da internet e não voltou a tempo). Quem chama é o servidor.
export function eliminate(s, id, cause = 'left') {
  const p = s.players.find((q) => q.id === id)
  if (!p || !p.alive) return
  p.shield = false
  hurt(s, p, null, cause, true)
}

function applyPowerup(p, kind) {
  const before = [p.maxBombs, p.range, p.speed]
  if (kind === 'bomb') p.maxBombs = Math.min(MAX_BOMBS, p.maxBombs + 1)
  else if (kind === 'fire') p.range = Math.min(MAX_RANGE, p.range + 1)
  else if (kind === 'speed') p.speed = Math.min(MAX_SPEED, p.speed + SPEED_STEP)
  else if (kind === 'shield') p.shield = true
  else if (kind === 'kick') p.kick = true
  else if (kind === 'detonator') p.detonator = true
  else return false
  return !['bomb', 'fire', 'speed'].includes(kind) || before.some((v, i) => v !== [p.maxBombs, p.range, p.speed][i])
}

// chute: andando contra uma bomba (com o item), ela sai deslizando até bater em algo
function tryKick(s, p, d) {
  if (!p.kick) return false
  const px = Math.round(p.x), py = Math.round(p.y)
  if ((d.dx ? Math.abs(p.x - px) : Math.abs(p.y - py)) > 0.2) return false
  const b = bombAt(s, px + d.dx, py + d.dy)
  if (!b || b.passFor.includes(p.id) || b.slide) return false
  if (!slideFree(s, b, d.dx, d.dy)) return false
  b.slide = { dx: d.dx, dy: d.dy, p: 0 }
  s.events.push({ type: 'kick', x: b.x, y: b.y, id: p.id })
  return true
}

function slideFree(s, b, dx, dy) {
  const x = b.x + dx, y = b.y + dy
  if (tileAt(s.level, x, y) !== FLOOR || bombAt(s, x, y)) return false
  return !s.players.some((p) => p.alive && Math.round(p.x) === x && Math.round(p.y) === y)
}

function updateSlides(s, dt) {
  for (const b of s.bombs) {
    if (!b.slide) continue
    b.slide.p += KICK_SPEED * dt
    while (b.slide && b.slide.p >= 1) {
      b.x += b.slide.dx
      b.y += b.slide.dy
      b.slide.p -= 1
      if (flameAt(s, b.x, b.y)) { b.slide = null; b.timer = 0; break }
      if (!slideFree(s, b, b.slide.dx, b.slide.dy)) b.slide = null
    }
  }
}

// FINAL: um item novo aparece numa casa livre qualquer (longe de bombas, fogo e de quem está em cima)
function spawnFinalItem(s) {
  const live = s.powerups.filter((pu) => pu.revealed && !pu.taken).length
  if (live >= FINAL_ITEM_MAX) return
  const warn = new Set(s.closingWarn.map(([x, y]) => x + ',' + y))
  const free = []
  for (let y = 1; y < s.level.rows - 1; y++) {
    for (let x = 1; x < s.level.cols - 1; x++) {
      if (tileAt(s.level, x, y) !== FLOOR || bombAt(s, x, y) || flameAt(s, x, y) || warn.has(x + ',' + y)) continue
      if (s.powerups.some((pu) => pu.x === x && pu.y === y && !pu.taken)) continue
      if (s.players.some((p) => p.alive && Math.abs(Math.round(p.x) - x) + Math.abs(Math.round(p.y) - y) < 2)) continue
      free.push([x, y])
    }
  }
  if (!free.length) return
  const [x, y] = pick(free, s.rng)
  const kind = pick(FINAL_POOL, s.rng)
  s.powerups.push({ x, y, kind, revealed: true, taken: false, revealedAt: s.time, spawned: true })
  s.events.push({ type: 'itemSpawn', x, y, kind })
}

// morte súbita: a próxima casa da espiral vira parede (esmaga quem estiver nela)
function closeNext(s) {
  const c = s.closing
  const [x, y] = c.order[c.i++]
  setTile(s.level, x, y, WALL)
  s.burning = s.burning.filter((b) => b.x !== x || b.y !== y)
  s.flames = s.flames.filter((f) => f.x !== x || f.y !== y)
  s.bombs = s.bombs.filter((b) => b.x !== x || b.y !== y)
  for (const pu of s.powerups) if (pu.x === x && pu.y === y) pu.taken = true
  for (const p of s.players) if (p.alive && Math.round(p.x) === x && Math.round(p.y) === y) hurt(s, p, null, 'crushed', true)
  s.events.push({ type: 'closed', x, y })
}

function decide(s) {
  const alive = s.players.filter((p) => p.alive)
  let winner, tie = null
  if (alive.length === 1) winner = alive[0].id
  else {
    // todo mundo morreu: ganha quem morreu por último; se mais de um morreu no mesmo instante, sorteio
    const last = Math.max(...s.players.map((p) => p.diedAt ?? -1))
    const tied = s.players.filter((p) => p.diedAt === last).map((p) => p.id)
    winner = tied.length > 1 ? s.tiebreak(tied, s.rng) : tied[0]
    if (tied.length > 1) tie = tied
  }
  // colocação: o vencedor, depois quem morreu mais tarde (o último a morrer = 2º lugar, e assim por diante)
  const rest = [...s.deathOrder].reverse().filter((id) => id !== winner)
  s.winner = winner
  s.result = { winner, places: [winner, ...rest], tie }
  s.status = 'ending'
  s.phaseT = END_DELAY
  s.events.push({ type: 'winner', id: winner, tie })
}

export function step(s, inputs = {}) {
  const dt = STEP
  s.time += dt
  s.shake = Math.max(0, s.shake - dt * 1.5)
  if (s.status === 'over') return

  if (s.status === 'countdown') {
    for (const p of s.players) { const inp = inputs[p.id]; if (inp) { inp.bomb = false; inp.detonate = false } }
    s.phaseT -= dt
    if (s.phaseT <= 0) { s.status = 'playing'; s.phaseT = 0; s.events.push({ type: 'go' }) }
    return
  }

  const live = s.status === 'playing' || s.status === 'ending'

  // --- jogadores
  for (const p of s.players) {
    const inp = inputs[p.id] ?? {}
    p.moving = false
    if (p.alive && live) {
      const dir = inp.dir && DIRS[inp.dir] ? inp.dir : null
      if (dir) {
        const d = DIRS[dir]
        const bx = p.x, by = p.y
        if (!tryKick(s, p, d)) {
          if (d.dx) moveAxis(s, p, 'x', 'y', d.dx, p.speed * dt)
          else moveAxis(s, p, 'y', 'x', d.dy, p.speed * dt)
        }
        p.facing = dir
        if (dir === 'left') p.flip = true
        else if (dir === 'right') p.flip = false
        p.moving = p.x !== bx || p.y !== by
        if (p.moving) p.walkT += dt
      }
      if (inp.bomb) {
        const x = Math.round(p.x), y = Math.round(p.y)
        const mine = s.bombs.filter((b) => b.owner === p.id).length
        if (mine < p.maxBombs && !bombAt(s, x, y) && tileAt(s.level, x, y) === FLOOR) {
          const fuse = p.detonator ? DETONATOR_FUSE : FUSE_TIME
          // quem está em cima da casa na hora pode sair dela (depois ela vira obstáculo pra essa pessoa também)
          const passFor = s.players.filter((q) => q.alive && overlaps(q, x, y)).map((q) => q.id)
          s.bombs.push({ x, y, timer: fuse, fuse, range: p.range, owner: p.id, passFor, remote: p.detonator, slide: null })
          s.events.push({ type: 'bombPlaced', x, y, id: p.id })
        }
      }
      if (inp.detonate) {
        const b = s.bombs.find((q) => q.owner === p.id && q.remote && q.timer > 0)
        if (b) b.timer = 0
      }
    }
    inp.bomb = false
    inp.detonate = false
    p.invulnT = Math.max(0, p.invulnT - dt)
    if (!p.alive) p.deathT += dt
  }
  updateSlides(s, dt)

  // a bomba deixa de ser "atravessável" pra quem já saiu de cima dela
  for (const b of s.bombs) {
    if (b.passFor.length) b.passFor = b.passFor.filter((id) => { const q = s.players.find((p) => p.id === id); return q && q.alive && overlaps(q, b.x, b.y) })
  }

  // --- bombas (o while pega as que explodiram em cadeia no mesmo instante)
  for (const b of s.bombs) b.timer -= dt
  let due
  while ((due = s.bombs.find((b) => b.timer <= 0))) explode(s, due)

  // --- fogo e caixotes queimando (quando o caixote some, mostra o item que tinha embaixo)
  for (const f of s.flames) f.t -= dt
  s.flames = s.flames.filter((f) => f.t > 0)
  for (const b of s.burning) {
    b.t -= dt
    if (b.t <= 0) {
      setTile(s.level, b.x, b.y, FLOOR)
      for (const pu of s.powerups) if (pu.x === b.x && pu.y === b.y && !pu.revealed) { pu.revealed = true; pu.revealedAt = s.time }
    }
  }
  s.burning = s.burning.filter((b) => b.t > 0)

  // --- itens no chão: o fogo queima, e somem sozinhos depois de ITEM_LIFE
  for (const pu of s.powerups) {
    if (!pu.revealed || pu.taken) continue
    const age = s.time - pu.revealedAt
    const burned = age > ITEM_GRACE && flameAt(s, pu.x, pu.y)
    if (burned || age >= ITEM_LIFE) {
      pu.taken = true
      s.events.push({ type: 'powerupGone', x: pu.x, y: pu.y, kind: pu.kind, burned: !!burned })
    }
  }
  if (s.powerups.length > 60) s.powerups = s.powerups.filter((pu) => !pu.taken || !pu.revealed || s.time - pu.revealedAt < 1)

  // --- final: itens aparecendo
  if (s.final && s.status === 'playing') {
    s.nextItemT -= dt
    if (s.nextItemT <= 0) { s.nextItemT = FINAL_ITEM_EVERY; spawnFinalItem(s) }
  }

  // --- relógio e morte súbita
  if (s.status === 'playing') {
    s.clock = Math.max(0, s.clock - dt)
    if (s.clock <= 0 && !s.closing) {
      s.closing = { order: closingOrder(s.level), i: 0, t: -CLOSE_WARN }
      s.events.push({ type: 'suddenDeath' })
    }
  }
  if (s.closing && s.status === 'playing') {
    const c = s.closing
    c.t += dt
    while (c.t >= CLOSE_EVERY && c.i < c.order.length) { c.t -= CLOSE_EVERY; closeNext(s) }
    const ahead = Math.ceil(CLOSE_WARN / CLOSE_EVERY)
    s.closingWarn = c.order.slice(c.i, c.i + ahead)
  } else if (s.closingWarn.length && s.status !== 'playing') s.closingWarn = []

  // --- fogo machuca; pegar item
  for (const p of s.players) {
    if (!p.alive) continue
    const px = Math.round(p.x), py = Math.round(p.y)
    const f = flameAt(s, px, py)
    if (f) { hurt(s, p, f.owner, 'fire'); if (!p.alive) continue }
    for (const pu of s.powerups) {
      if (pu.revealed && !pu.taken && pu.x === px && pu.y === py) {
        pu.taken = true
        const changed = applyPowerup(p, pu.kind)
        s.events.push({ type: 'powerup', x: pu.x, y: pu.y, kind: pu.kind, max: !changed, id: p.id })
      }
    }
  }

  // --- alguém ganhou?
  if (s.status === 'playing' && s.players.filter((p) => p.alive).length <= 1) decide(s)
  else if (s.status === 'ending') {
    s.phaseT -= dt
    if (s.phaseT <= 0) { s.status = 'over'; s.phaseT = 0 }
  }
}

export const alivePlayers = (s) => s.players.filter((p) => p.alive)

// Só o ANDAR de um jogador, com as mesmas regras do servidor (o navegador usa pra prever o próprio boneco e ele
// responder na hora; quem decide de verdade continua sendo o servidor). s precisa de level e bombs (com passFor).
export function movePlayer(s, p, dir, dt) {
  const d = DIRS[dir]
  if (!d) return false
  const bx = p.x, by = p.y
  if (d.dx) moveAxis(s, p, 'x', 'y', d.dx, p.speed * dt)
  else moveAxis(s, p, 'y', 'x', d.dy, p.speed * dt)
  return p.x !== bx || p.y !== by
}
