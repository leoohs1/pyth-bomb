// Como a partida viaja pela internet: o servidor transforma o estado da sala em mensagens pequenas e o navegador
// monta de volta um estado que o desenho (render.js) entende.
// - init: o que não muda na partida (mapa, semente, quem está em cada canto). Vai uma vez.
// - snap: o que muda, 20 vezes por segundo. Itens AINDA ESCONDIDOS nos caixotes nunca vão (ninguém consegue espiar).

const r3 = (n) => Math.round(n * 1000) / 1000

export function matchInit(s, roomId) {
  return {
    roomId,
    map: s.map,
    mapName: s.mapName,
    final: s.final,
    seed: s.seed,
    cols: s.level.cols,
    rows: s.level.rows,
    hole: s.level.hole ?? null,
    tiles: tilesToString(s.level.tiles),
    players: s.players.map((p) => ({ id: p.id, name: p.name, hero: p.hero, corner: p.corner, bot: p.bot })),
  }
}

export const tilesToString = (tiles) => Array.from(tiles, (t) => t).join('')
export const tilesFromString = (str) => Uint8Array.from(str, (c) => c.charCodeAt(0) - 48)

export function matchSnap(s) {
  return {
    tm: r3(s.time), // (não pode ser 't': esse campo é o tipo da mensagem)
    st: s.status,
    ph: r3(s.phaseT),
    ck: r3(s.clock),
    cl: !!s.closing,
    cw: s.closingWarn,
    sh: r3(s.shake),
    tiles: tilesToString(s.level.tiles),
    p: s.players.map((p) => ({
      id: p.id, x: r3(p.x), y: r3(p.y), a: p.alive ? 1 : 0, d: p.diedAt == null ? null : r3(p.diedAt),
      f: p.facing, fl: p.flip ? 1 : 0, m: p.moving ? 1 : 0, w: r3(p.walkT), iv: r3(p.invulnT), c: p.connected ? 1 : 0,
      mb: p.maxBombs, rg: p.range, sp: r3(p.speed), sd: p.shield ? 1 : 0, k: p.kick ? 1 : 0, dt: p.detonator ? 1 : 0,
      by: p.killedBy, cs: p.cause,
    })),
    b: s.bombs.map((b) => ({ x: b.x, y: b.y, timer: r3(b.timer), fuse: b.fuse, range: b.range, remote: b.remote, owner: b.owner, slide: b.slide ? { dx: b.slide.dx, dy: b.slide.dy, p: r3(b.slide.p) } : null })),
    f: s.flames.map((f) => ({ x: f.x, y: f.y, t: r3(f.t), kind: f.kind, sides: f.sides, visual: !!f.visual })),
    bu: s.burning.map((b) => ({ x: b.x, y: b.y, t: r3(b.t) })),
    pu: s.powerups.filter((pu) => pu.revealed && !pu.taken).map((pu) => ({ x: pu.x, y: pu.y, kind: pu.kind, revealed: true, taken: false, revealedAt: r3(pu.revealedAt) })),
    ev: s.events,
    w: s.winner,
    res: s.result,
  }
}

// ---- lado do navegador

// estado inicial "vazio" a partir do init (antes do primeiro snap)
export function stateFromInit(init) {
  return {
    map: init.map, mapName: init.mapName, final: init.final, seed: init.seed,
    level: { cols: init.cols, rows: init.rows, tiles: tilesFromString(init.tiles), hole: init.hole },
    players: init.players.map((p) => ({
      ...p, x: 0, y: 0, alive: true, deathT: 0, diedAt: null, facing: 'down', flip: false, moving: false, walkT: 0,
      invulnT: 0, connected: true, maxBombs: 1, range: 2, speed: 3.4, shield: false, kick: false, detonator: false,
    })),
    bombs: [], flames: [], burning: [], powerups: [], status: 'countdown', phaseT: 3, clock: 120,
    closing: false, closingWarn: [], time: 0, shake: 0, events: [], winner: null, result: null,
  }
}

// aplica um snap no estado. `a` (snap anterior) e k (0 a 1) servem pra deslizar os jogadores entre dois snaps
// (o servidor manda 20 por segundo; a tela desenha 60). meId: o próprio jogador usa sempre a posição mais nova.
export function applySnap(s, snap, a = null, k = 1, meId = null, time = snap.tm) {
  if (s.level.tiles.length !== snap.tiles.length || s._tiles !== snap.tiles) { s.level.tiles = tilesFromString(snap.tiles); s._tiles = snap.tiles }
  s.status = snap.st
  s.phaseT = snap.ph
  s.clock = snap.ck
  s.closing = snap.cl
  s.closingWarn = snap.cw
  s.shake = snap.sh
  s.bombs = snap.b
  s.flames = snap.f
  s.burning = snap.bu
  s.powerups = snap.pu
  s.winner = snap.w
  s.result = snap.res
  s.time = time
  for (const p of s.players) {
    const q = snap.p.find((x) => x.id === p.id)
    if (!q) continue
    const o = a && p.id !== meId ? a.p.find((x) => x.id === p.id) : null
    const near = o && Math.abs(o.x - q.x) + Math.abs(o.y - q.y) < 1.5 // pulo grande (não devia acontecer): sem deslizar
    p.x = near ? o.x + (q.x - o.x) * k : q.x
    p.y = near ? o.y + (q.y - o.y) * k : q.y
    p.alive = !!q.a
    p.diedAt = q.d
    p.deathT = q.a ? 0 : Math.max(0, time - (q.d ?? time))
    p.facing = q.f
    p.flip = !!q.fl
    p.moving = !!q.m
    p.walkT = q.w
    p.invulnT = q.iv
    p.connected = !!q.c
    p.maxBombs = q.mb
    p.range = q.rg
    p.speed = q.sp
    p.shield = !!q.sd
    p.kick = !!q.k
    p.detonator = !!q.dt
    p.killedBy = q.by
    p.cause = q.cs
  }
  return s
}
