// Bot simples do PVP: foge das bombas, quebra caixotes, pega itens e vai atrás dos outros.
// Por enquanto serve pra TESTAR a sala sozinho; na fase 2 os bots completam salas de verdade (no servidor).
// Ele só "aperta teclas" (devolve { dir, bomb, detonate }), igual a um jogador: não tem atalho nenhum na regra.
import { FLOOR, BLOCK, WALL } from './constants.js'
import { tileAt } from './maps.js'

const STEPS = [['up', 0, -1], ['down', 0, 1], ['left', -1, 0], ['right', 1, 0]]
const key = (x, y) => x + ',' + y

// casas que o fogo vai pegar: das bombas no chão (mais a bomba de mentira `extra`, pra testar uma ideia) e o fogo aceso
function dangerMap(s, extra) {
  const danger = new Map() // casa -> segundos até o fogo chegar (0 = já está pegando fogo)
  const add = (x, y, t) => { const k = key(x, y); if (!danger.has(k) || danger.get(k) > t) danger.set(k, t) }
  for (const f of s.flames) if (!f.visual) add(f.x, f.y, 0)
  for (const [x, y] of s.closingWarn) add(x, y, 0)
  const bombs = extra ? [...s.bombs, extra] : s.bombs
  for (const b of bombs) {
    const t = Math.max(0, b.remote ? Math.min(b.timer, 1) : b.timer)
    add(b.x, b.y, t)
    for (const [, dx, dy] of STEPS) {
      for (let i = 1; i <= b.range; i++) {
        const x = b.x + dx * i, y = b.y + dy * i
        const tile = tileAt(s.level, x, y)
        if (tile === WALL || tile === BLOCK) break
        add(x, y, t)
      }
    }
  }
  return danger
}

// busca em largura pelas casas onde o bot pode andar; devolve a distância e o 1º passo até cada casa
function explore(s, me, sx, sy, danger, avoidDanger) {
  const seen = new Map([[key(sx, sy), { d: 0, first: null }]])
  const queue = [[sx, sy]]
  for (let i = 0; i < queue.length; i++) {
    const [x, y] = queue[i]
    const cur = seen.get(key(x, y))
    for (const [dir, dx, dy] of STEPS) {
      const nx = x + dx, ny = y + dy, k = key(nx, ny)
      if (seen.has(k)) continue
      const t = tileAt(s.level, nx, ny)
      if (t !== FLOOR) continue
      const b = s.bombs.find((q) => q.x === nx && q.y === ny)
      if (b && !b.passFor.includes(me.id)) continue
      const dz = danger.get(k)
      if (dz === 0) continue // fogo aceso: nunca
      if (avoidDanger && dz !== undefined) continue
      // fugindo: não entra numa casa que vai explodir antes de dar tempo de passar por ela
      if (dz !== undefined && dz < (cur.d + 1) / me.speed + 0.25) continue
      seen.set(k, { d: cur.d + 1, first: cur.first ?? dir })
      queue.push([nx, ny])
    }
  }
  return seen
}

function nearest(seen, test) {
  let best = null
  for (const [k, v] of seen) {
    if (!v.first) continue
    const [x, y] = k.split(',').map(Number)
    if (test(x, y) && (!best || v.d < best.d)) best = { ...v, x, y }
  }
  return best
}

// tem um jogador vivo em linha reta, dentro do alcance, sem parede no meio?
function enemyInLine(s, me, x, y) {
  for (const [, dx, dy] of STEPS) {
    for (let i = 1; i <= me.range; i++) {
      const cx = x + dx * i, cy = y + dy * i
      const t = tileAt(s.level, cx, cy)
      if (t === WALL || t === BLOCK) break
      if (s.players.some((p) => p.alive && p.id !== me.id && Math.round(p.x) === cx && Math.round(p.y) === cy)) return true
    }
  }
  return false
}

export function createBot(id, rng = Math.random) {
  let goal = null      // casa pra onde está indo agora
  let cooldown = 0     // pausa entre bombas
  let lastPos = null, stuckT = 0, wanderDir = null, wanderT = 0

  return function think(s) {
    const me = s.players.find((p) => p.id === id)
    const out = { dir: null, bomb: false, detonate: false }
    if (!me || !me.alive || s.status !== 'playing') return out
    const dt = 1 / 60
    cooldown -= dt
    const x = Math.round(me.x), y = Math.round(me.y)
    const danger = dangerMap(s)
    const myBombs = s.bombs.filter((b) => b.owner === id)

    // detonador: explode a bomba remota quando já saiu da linha do fogo dela
    if (me.detonator && myBombs.some((b) => b.remote) && !danger.has(key(x, y))) out.detonate = true

    // anda até o centro de uma casa vizinha
    const go = (gx, gy) => {
      if (gx > me.x + 0.05) return 'right'
      if (gx < me.x - 0.05) return 'left'
      if (gy > me.y + 0.05) return 'down'
      if (gy < me.y - 0.05) return 'up'
      return null
    }
    const head = (first) => { const st = STEPS.find((q) => q[0] === first); return [x + st[1], y + st[2]] }

    // preso no lugar? anda pra um lado qualquer um pouquinho
    if (lastPos && Math.abs(lastPos[0] - me.x) + Math.abs(lastPos[1] - me.y) < 0.002) stuckT += dt
    else stuckT = 0
    lastPos = [me.x, me.y]
    if (wanderT > 0) { wanderT -= dt; out.dir = wanderDir; return out }
    if (stuckT > 0.6) { stuckT = 0; wanderDir = STEPS[Math.floor(rng() * 4)][0]; wanderT = 0.3; goal = null; out.dir = wanderDir; return out }

    // 1) em perigo: corre pra casa segura mais perto
    if (danger.has(key(x, y))) {
      const seen = explore(s, me, x, y, danger, false)
      const safe = nearest(seen, (cx, cy) => !danger.has(key(cx, cy)))
      if (safe) { const [hx, hy] = head(safe.first); out.dir = go(hx, hy) }
      else out.dir = null
      goal = null
      return out
    }

    // terminando de chegar no centro da casa escolhida
    if (goal && (Math.abs(me.x - goal[0]) > 0.06 || Math.abs(me.y - goal[1]) > 0.06) && !danger.has(key(goal[0], goal[1]))) {
      out.dir = go(goal[0], goal[1])
      if (out.dir) return out
    }
    goal = null

    // 2) bomba aqui? (perto de caixote ou de alguém) só se depois der pra fugir
    const nextToBlock = STEPS.some(([, dx, dy]) => tileAt(s.level, x + dx, y + dy) === BLOCK)
    const wantBomb = (nextToBlock && rng() < 0.5) || enemyInLine(s, me, x, y)
    if (wantBomb && cooldown <= 0 && myBombs.length < me.maxBombs && !s.bombs.some((b) => b.x === x && b.y === y)) {
      const fake = { x, y, timer: 2.4, range: me.range, owner: id, passFor: [id] }
      const after = dangerMap(s, fake)
      const seen = explore({ ...s, bombs: [...s.bombs, fake] }, me, x, y, after, false)
      const escape = nearest(seen, (cx, cy) => !after.has(key(cx, cy)))
      if (escape && escape.d <= 4) { out.bomb = true; cooldown = 0.5 + rng() * 0.6 }
    }

    // 3) pra onde ir: item à vista > casa do lado de um caixote > perto de alguém
    const seen = explore(s, me, x, y, danger, true)
    const items = new Set(s.powerups.filter((pu) => pu.revealed && !pu.taken).map((pu) => key(pu.x, pu.y)))
    let target = nearest(seen, (cx, cy) => items.has(key(cx, cy)))
    if (!target) target = nearest(seen, (cx, cy) => STEPS.some(([, dx, dy]) => tileAt(s.level, cx + dx, cy + dy) === BLOCK) && rng() < 0.9)
    if (!target) {
      const foes = s.players.filter((p) => p.alive && p.id !== id)
      target = nearest(seen, (cx, cy) => foes.some((p) => Math.abs(Math.round(p.x) - cx) + Math.abs(Math.round(p.y) - cy) <= 2))
    }
    if (target) {
      goal = head(target.first)
      out.dir = go(goal[0], goal[1])
    } else if (rng() < 0.02) {
      wanderDir = STEPS[Math.floor(rng() * 4)][0]; wanderT = 0.25
    }
    return out
  }
}
