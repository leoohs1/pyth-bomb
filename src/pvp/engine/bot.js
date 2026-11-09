// Bot do PVP: foge das bombas, quebra caixotes, pega itens e caça os outros jogadores.
// Completa as salas do torneio (opção "Fill rooms with bots" do lobby) e serve pra testar sozinho.
// Ele só "aperta teclas" (devolve { dir, bomb, detonate }), igual a um jogador: não tem atalho nenhum na regra.
//
// Como ele pensa (cada passinho):
//  1. faz um mapa de PERIGO: em quanto tempo o fogo chega em cada casa (contando bombas que explodem em cadeia,
//     o fogo aceso e as casas da morte súbita que vão fechar);
//  2. se a casa dele está em perigo, corre pra casa segura mais perto, só passando por casas onde dá tempo;
//  3. se não, pensa em soltar bomba (do lado de caixote ou com alguém na linha), mas SÓ se depois ainda tiver
//     pra onde fugir a tempo;
//  4. e anda: item à vista > casa do lado de um caixote > perto de alguém.
import { FLOOR, BLOCK, WALL, FLAME_TIME, FUSE_TIME, CLOSE_EVERY } from './constants.js'
import { tileAt } from './maps.js'

const STEPS = [['up', 0, -1], ['down', 0, 1], ['left', -1, 0], ['right', 1, 0]]
const key = (x, y) => x + ',' + y
const MARGIN = 0.18 // folga (segundos) em toda conta de tempo: o bot nunca está bem no meio da casa

// casas que cada bomba pega (o fogo para em parede/caixote e numa outra bomba, que explode junto)
function blastCells(s, b, bombs) {
  const cells = [[b.x, b.y]]
  const hits = []
  for (const [, dx, dy] of STEPS) {
    for (let i = 1; i <= b.range; i++) {
      const x = b.x + dx * i, y = b.y + dy * i
      const tile = tileAt(s.level, x, y)
      if (tile === WALL || tile === BLOCK) break
      cells.push([x, y])
      const other = bombs.find((q) => q !== b && q.x === x && q.y === y)
      if (other) { hits.push(other); break }
    }
  }
  return { cells, hits }
}

// mapa de perigo: casa -> { t: segundos até o fogo chegar, end: até quando o fogo fica }
function dangerMap(s, extra = null) {
  const danger = new Map()
  const add = (x, y, t, end) => {
    const k = key(x, y)
    const d = danger.get(k)
    if (!d) danger.set(k, { t, end })
    else { d.t = Math.min(d.t, t); d.end = Math.max(d.end, end) }
  }
  for (const f of s.flames) if (!f.visual) add(f.x, f.y, 0, f.t)
  // morte súbita: as próximas casas da espiral vão virar parede (perigo pra sempre)
  if (s.closing?.order) {
    const c = s.closing
    for (let k = 0; k < 16 && c.i + k < c.order.length; k++) {
      const [x, y] = c.order[c.i + k]
      add(x, y, Math.max(0, (k + 1) * CLOSE_EVERY - c.t - CLOSE_EVERY), 1e9)
    }
  } else for (const [x, y] of s.closingWarn ?? []) add(x, y, 0, 1e9)

  const bombs = extra ? [...s.bombs, extra] : [...s.bombs]
  // tempo de cada bomba, contando a reação em cadeia (uma explode antes por causa da outra)
  const when = new Map(bombs.map((b) => [b, Math.max(0, b.remote ? Math.min(b.timer, 0.8) : b.timer)]))
  const blasts = new Map(bombs.map((b) => [b, blastCells(s, b, bombs)]))
  for (let changed = true, guard = 0; changed && guard < 20; guard++) {
    changed = false
    for (const b of bombs) {
      for (const o of blasts.get(b).hits) {
        if (when.get(o) > when.get(b)) { when.set(o, when.get(b)); changed = true }
      }
    }
  }
  for (const b of bombs) {
    const t = when.get(b)
    for (const [x, y] of blasts.get(b).cells) add(x, y, t, t + FLAME_TIME)
  }
  return danger
}

// a casa (x, y) está livre do fogo durante o tempo em que o bot fica nela? [chega, sai]
function safeDuring(d, arrive, leave) {
  if (!d) return true
  return leave + MARGIN < d.t || arrive > d.end + MARGIN
}

// busca em largura: distância e 1º passo até cada casa onde dá pra chegar sem se queimar no caminho
function explore(s, me, sx, sy, danger, bombs = s.bombs) {
  const per = 1 / me.speed // segundos por casa
  const seen = new Map([[key(sx, sy), { d: 0, first: null }]])
  const queue = [[sx, sy]]
  for (let i = 0; i < queue.length; i++) {
    const [x, y] = queue[i]
    const cur = seen.get(key(x, y))
    for (const [dir, dx, dy] of STEPS) {
      const nx = x + dx, ny = y + dy, k = key(nx, ny)
      if (seen.has(k) || tileAt(s.level, nx, ny) !== FLOOR) continue
      const b = bombs.find((q) => q.x === nx && q.y === ny)
      if (b && !b.passFor.includes(me.id)) continue
      const arrive = (cur.d + 0.5) * per, leave = (cur.d + 1.6) * per
      if (!safeDuring(danger.get(k), arrive, leave)) continue
      seen.set(k, { d: cur.d + 1, first: cur.first ?? dir })
      queue.push([nx, ny])
    }
  }
  return seen
}

// a casa mais perto (no caminho) que passa no teste
function nearest(seen, test) {
  let best = null
  for (const [k, v] of seen) {
    if (!v.first) continue
    const [x, y] = k.split(',').map(Number)
    if ((!best || v.d < best.d) && test(x, y)) best = { ...v, x, y }
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
      if (s.players.some((p) => p.alive && p.id !== me.id && Math.abs(p.x - cx) < 0.6 && Math.abs(p.y - cy) < 0.6)) return true
    }
  }
  return false
}

export function createBot(id, rng = Math.random) {
  let goal = null      // casa vizinha pra onde está indo agora
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
    const here = danger.get(key(x, y))
    const myBombs = s.bombs.filter((b) => b.owner === id)

    // anda até o centro de uma casa vizinha
    const go = (gx, gy) => {
      if (gx > me.x + 0.04) return 'right'
      if (gx < me.x - 0.04) return 'left'
      if (gy > me.y + 0.04) return 'down'
      if (gy < me.y - 0.04) return 'up'
      return null
    }
    const head = (first) => { const st = STEPS.find((q) => q[0] === first); return [x + st[1], y + st[2]] }
    const safeNow = (cx, cy) => !danger.has(key(cx, cy))

    // detonador: explode a bomba remota quando ele mesmo está fora do fogo dela
    if (me.detonator && myBombs.some((b) => b.remote) && !here) out.detonate = true

    // preso no lugar (ex.: encostado num canto)? dá um passinho pra uma casa vizinha SEGURA
    if (lastPos && Math.abs(lastPos[0] - me.x) + Math.abs(lastPos[1] - me.y) < 0.002) stuckT += dt
    else stuckT = 0
    lastPos = [me.x, me.y]
    if (wanderT > 0) { wanderT -= dt; out.dir = wanderDir; return out }
    if (stuckT > 0.7) {
      stuckT = 0
      goal = null
      const ok = STEPS.filter(([, dx, dy]) => tileAt(s.level, x + dx, y + dy) === FLOOR && safeNow(x + dx, y + dy))
      if (ok.length) { wanderDir = ok[Math.floor(rng() * ok.length)][0]; wanderT = 0.25; out.dir = wanderDir; return out }
    }

    // 1) em perigo: corre pra casa segura mais perto; sem saída, vai pra casa que demora mais a pegar fogo
    if (here) {
      goal = null
      const seen = explore(s, me, x, y, danger)
      const safe = nearest(seen, (cx, cy) => safeNow(cx, cy))
      if (safe) { const [hx, hy] = head(safe.first); out.dir = go(hx, hy) ?? go(x, y); return out }
      let best = null
      for (const [k, v] of seen) {
        if (!v.first) continue
        const d = danger.get(k)
        const score = d ? d.t : 99
        if (!best || score > best.score) best = { ...v, score }
      }
      if (best && best.score > here.t) { const [hx, hy] = head(best.first); out.dir = go(hx, hy) }
      else out.dir = go(x, y) // fica no meio da casa (talvez o fogo nem pegue de raspão)
      return out
    }

    // terminando de chegar no centro da casa escolhida (se ela continua segura)
    if (goal && safeNow(goal[0], goal[1]) && (Math.abs(me.x - goal[0]) > 0.05 || Math.abs(me.y - goal[1]) > 0.05)) {
      out.dir = go(goal[0], goal[1])
      if (out.dir) return out
    }
    goal = null

    // 2) bomba aqui? (perto de caixote ou com alguém na linha) só se der pra fugir a tempo, contando a cadeia
    const centered = Math.abs(me.x - x) < 0.25 && Math.abs(me.y - y) < 0.25
    const nextToBlock = STEPS.some(([, dx, dy]) => tileAt(s.level, x + dx, y + dy) === BLOCK)
    const foe = enemyInLine(s, me, x, y) || s.players.some((p) => p.alive && p.id !== id && Math.abs(p.x - me.x) + Math.abs(p.y - me.y) < 1.6)
    if (centered && (nextToBlock || foe) && cooldown <= 0 && myBombs.length < me.maxBombs && !s.bombs.some((b) => b.x === x && b.y === y)) {
      const fuse = me.detonator ? 0.8 : FUSE_TIME
      const fake = { x, y, timer: fuse, range: me.range, owner: id, passFor: [id], remote: false }
      const after = dangerMap(s, fake)
      const bombs = [...s.bombs, fake]
      const seen = explore(s, me, x, y, after, bombs)
      const escape = nearest(seen, (cx, cy) => !after.has(key(cx, cy)))
      // só solta se a fuga é curta e chega bem antes do fogo
      if (escape && (escape.d + 0.5) / me.speed + 0.45 < (after.get(key(x, y))?.t ?? fuse)) {
        out.bomb = true
        cooldown = foe ? 0.3 : 0.4 + rng() * 0.5
        const [hx, hy] = head(escape.first)
        goal = [hx, hy]
        out.dir = go(hx, hy)
        return out
      }
    }

    // 3) pra onde ir (só por casas sem perigo nenhum): item à vista > do lado de um caixote > perto de alguém
    const seen = explore(s, me, x, y, danger)
    const okStep = (v) => v && safeNow(...head(v.first))
    const items = new Set(s.powerups.filter((pu) => pu.revealed && !pu.taken).map((pu) => key(pu.x, pu.y)))
    const foes = s.players.filter((p) => p.alive && p.id !== id)
    const nearFoe = (cx, cy) => foes.some((p) => Math.abs(Math.round(p.x) - cx) + Math.abs(Math.round(p.y) - cy) <= 2)
    const nearBlock = (cx, cy) => STEPS.some(([, dx, dy]) => tileAt(s.level, cx + dx, cy + dy) === BLOCK)
    // depois de uns 40 s de luta (ou na final, que quase não tem caixote) ele vira CAÇADOR: vai atrás dos outros
    const hunting = s.final || s.clock < 80 || me.maxBombs + me.range >= 6
    let target = null
    if (s.closing) {
      // as paredes estão fechando: vai pro meio da sala (a última parte a fechar)
      const cx0 = (s.level.cols - 1) / 2, cy0 = (s.level.rows - 1) / 2
      const far = (cx, cy) => Math.abs(cx - cx0) + Math.abs(cy - cy0)
      if (far(x, y) > 3) {
        let best = null
        for (const [k, v] of seen) {
          if (!v.first) continue
          const [cx, cy] = k.split(',').map(Number)
          if (safeNow(cx, cy) && (!best || far(cx, cy) < best.f)) best = { ...v, f: far(cx, cy) }
        }
        target = best
      }
    }
    if (!target) target = nearest(seen, (cx, cy) => items.has(key(cx, cy)) && safeNow(cx, cy))
    if (!target && hunting) target = nearest(seen, (cx, cy) => safeNow(cx, cy) && (enemyInLine(s, me, cx, cy) || nearFoe(cx, cy)))
    if (!target) target = nearest(seen, (cx, cy) => safeNow(cx, cy) && nearBlock(cx, cy))
    if (!target) target = nearest(seen, (cx, cy) => safeNow(cx, cy) && nearFoe(cx, cy))
    if (target && okStep(target)) {
      goal = head(target.first)
      out.dir = go(goal[0], goal[1])
    } else {
      out.dir = go(x, y) // espera no meio da casa
    }
    return out
  }
}
