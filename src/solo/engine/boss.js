// Chefe do modo Solo: CHOP, o tubarão agiota (The Loan Shark: cobra a dívida em explosões). Antes era a Whale (baleia).
// A luta, em fases (b.mode):
//   'intro'    o buraco do meio borbulha e o CHOP salta pra fora (inofensivo e sem levar dano enquanto sai);
//   'surface'  ele luta: anda atrás do jogador (bombas e o buraco não o seguram; paredes e caixas sim) e leva
//              BOSS.hp explosões, piscando um pouco sem levar dano depois de cada uma;
//   aos 70% da vida: começa o FRENESI (veja abaixo); aos 40%: 'toHole' (foge correndo pro buraco) -> 'sinking' (mergulha, splash) -> 'under'
//              (embaixo d'água: invencível e inofensivo; aparecem os COBRADORES, 1 caranguejo e 1 esqueleto) ->
//              'rising' (volta furioso, mais rápido) -> 'surface' de novo.
// FRENESI: de tempos em tempos ele PARA e treme (aviso: faixa vermelha no chão e "FRENZY!"), dispara em linha reta
// bem rápido na direção do jogador (mata quem estiver no caminho) e, ao bater numa parede ou caixa, fica TONTO por
// uns segundos (inofensivo e parado: a hora de acertar ele com bombas). Se bater numa caixa, ela quebra.
// CAIXAS: ele é largo e as caixas o travam; quando não consegue andar, contorna pelo caminho mais curto até o jogador
// (planPath) e, se não existe caminho (preso entre caixas), dá o frenesi pra quebrar a caixa.
// JATOS D'ÁGUA (só depois do mergulho): a cada tantos segundos o chão borbulha em 3 pontos (um deles debaixo do jogador),
// 1 s depois estoura um jato em cruz (a casa e as 4 vizinhas) que mata quem estiver ali (só o jogador: não machuca o chefe).
// A cada dano que ele leva cai um item útil na arena.
import { FLOOR, BLOCK, HOLE, MAX_BOMBS, MAX_RANGE, MAX_SPEED, BURN_TIME } from './constants.js'
import { tileAt } from './level.js'
import { makeEnemy } from './enemies.js'

export const BOSS = {
  name: 'CHOP', // o tubarão agiota (The Loan Shark)
  hp: 8,
  frenzyAt: 0.7,      // começa a usar o frenesi quando a vida chega a essa fração (30% perdidos)
  diveAt: 0.4,         // foge pro buraco quando a vida chega a essa fração
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
  // frenesi (a versão furiosa é mais rápida e dá menos aviso)
  frenzyFirst: 3,      // 1º frenesi: tantos segundos depois que ele passa dos 70% da vida
  frenzyEvery: 9,      // depois, de tantos em tantos segundos
  frenzyEveryAngry: 6,
  windTime: 0.9,       // aviso antes de disparar
  windTimeAngry: 0.65,
  dashSpeed: 10,       // casas por segundo na investida
  dashSpeedAngry: 12.5,
  stunTime: 2.2,       // tontura depois de bater
  stunTimeAngry: 1.6,
  detourTime: 1.5,     // quando uma caixa barra o caminho, contorna seguindo o caminho mais curto por tanto tempo
  jetFirst: 3.5,       // 1º jato: tantos segundos depois que ele volta do mergulho
  jetEvery: 8,         // depois, de tantos em tantos segundos
  jetCount: 3,         // quantos jatos por vez
  jetWarn: 1.1,        // aviso (poça borbulhando) antes de estourar
  jetTime: 0.7,        // quanto tempo o jato fica de pé
  jamFrenzy: 2.2,      // se não consegue andar nem contornando (preso entre caixas), dá o frenesi e quebra a caixa
}

export function makeBoss(x, y) {
  return {
    x, y, hp: BOSS.hp, alive: true, deathT: 0,
    hurtT: 0, pauseT: 0, walkT: 0, enrageT: 0,
    mode: 'intro', introT: 0, sinkT: 0, riseT: 0, underT: 0, holeT: 0, dived: false,
    frenzyOn: false, frenzyT: BOSS.frenzyFirst, windT: 0, stunT: 0, dash: null, lane: null,
    stuckT: 0, jamT: 0, pathT: 0, replanT: 0, path: null, approach: false, waitT: 0, jetT: null,
  }
}

// o chefe machuca quem encosta nele? (não machuca quando está tonto, embaixo d'água ou saindo da água)
export const bossDangerous = (b) => b.mode === 'surface' || b.mode === 'frenzyWind' || b.mode === 'frenzyDash'

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

const angry = (b) => b.dived // furioso = já mergulhou e voltou

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

// a casa está colada no buraco (dentro de 1 casa do aro)? A escotilha e o baú não ficam ali: pareciam grudados no redemoinho
export function nearHole(level, x, y) {
  const h = level.hole
  return !!h && x >= h.x - 1 && x <= h.x + h.w && y >= h.y - 1 && y <= h.y + h.h
}

// casa de chão livre mais perto de (x, y): a porta aparece ali quando o chefe cai. Não pode ser dentro do buraco nem
// colada nele, e tem que sobrar uma casa vizinha de chão (também longe do buraco) pro baú.
function nearestFloor(s, x, y) {
  const level = s.level
  const ok = (tx, ty) => tileAt(level, tx, ty) === FLOOR && !nearHole(level, tx, ty)
  let best = null, bestD = Infinity
  for (let ty = 1; ty < level.rows - 1; ty++) {
    for (let tx = 1; tx < level.cols - 1; tx++) {
      if (!ok(tx, ty)) continue
      if (![[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => ok(tx + dx, ty + dy))) continue
      const d = Math.abs(tx - x) + Math.abs(ty - y)
      if (d < bestD) { bestD = d; best = [tx, ty] }
    }
  }
  return best ?? [1, 1]
}

// até onde ele vai em linha reta nessa direção (onde a investida bate)
function laneEnd(s, b, d) {
  let x = b.x, y = b.y
  for (let i = 0; i < 400 && fits(s, x + d.dx * 0.1, y + d.dy * 0.1); i++) { x += d.dx * 0.1; y += d.dy * 0.1 }
  return { x, y }
}

// FRENESI: escolhe a direção (a do jogador, no eixo em que ele está mais longe), acha até onde dá pra ir em linha
// reta (a faixa vermelha do aviso) e para pra tremer antes de disparar.
// forced = sem caminho até o jogador (o chefe é largo e as caixas o prendem): escolhe a direção que bate numa CAIXA
// (a mais perto da direção do jogador), porque caixa quebra e parede não.
function startFrenzy(s, b, forced = false) {
  const p = s.player
  const dx = p.x - b.x, dy = p.y - b.y
  const horiz = Math.abs(dx) >= Math.abs(dy)
  b.dash = horiz ? { dx: Math.sign(dx) || 1, dy: 0 } : { dx: 0, dy: Math.sign(dy) || 1 }
  if (forced) {
    let best = -Infinity
    for (const d of [{ dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 }]) {
      const e = laneEnd(s, b, d)
      const hitsCrate = tilesUnder(e.x + d.dx * 0.7, e.y + d.dy * 0.7).some(([tx, ty]) => tileAt(s.level, tx, ty) === BLOCK)
      const score = (hitsCrate ? 10 : 0) + (d.dx * dx + d.dy * dy) / (Math.hypot(dx, dy) || 1)
      if (score > best) { best = score; b.dash = d }
    }
  }
  const end = laneEnd(s, b, b.dash), x = end.x, y = end.y
  b.lane = { x0: b.x, y0: b.y, x1: x, y1: y }
  if (b.dash.dx) b.face = b.dash.dx
  b.mode = 'frenzyWind'
  b.jamT = 0; b.stuckT = 0; b.pathT = 0; b.path = null
  b.windT = angry(b) ? BOSS.windTimeAngry : BOSS.windTime
  s.shake = Math.min(0.3, s.shake + 0.15)
  s.events.push({ type: 'frenzy', x: b.x, y: b.y })
}

// a investida: anda rápido em linha reta; ao bater, quebra as caixas da frente (parede não quebra) e fica tonto
function dashStep(s, b, dt) {
  const speed = angry(b) ? BOSS.dashSpeedAngry : BOSS.dashSpeed
  const total = speed * dt
  let moved = 0, crashed = false
  while (moved < total) {
    const d = Math.min(0.05, total - moved)
    const nx = b.x + b.dash.dx * d, ny = b.y + b.dash.dy * d
    if (!fits(s, nx, ny)) { crashed = true; break }
    b.x = nx; b.y = ny; moved += d
  }
  if (!crashed) return
  for (const [tx, ty] of tilesUnder(b.x + b.dash.dx * 0.7, b.y + b.dash.dy * 0.7)) {
    if (tileAt(s.level, tx, ty) === BLOCK && !s.burning.some((q) => q.x === tx && q.y === ty)) {
      s.burning.push({ x: tx, y: ty, t: BURN_TIME })
      s.events.push({ type: 'blockBroken', x: tx, y: ty })
    }
  }
  b.mode = 'frenzyStun'
  b.stunT = angry(b) ? BOSS.stunTimeAngry : BOSS.stunTime
  b.hurtT = 0
  s.shake = Math.min(0.6, s.shake + 0.5)
  s.events.push({ type: 'bossCrash', x: b.x + b.dash.dx * 0.9, y: b.y + b.dash.dy * 0.9 })
}

// JATOS: onde cada um estoura (a casa do meio e as vizinhas que são chão), o jogador só morre quando já estourou
const JET_CROSS = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]
function spawnJets(s, random) {
  const p = s.player, spots = []
  for (let y = 1; y < s.level.rows - 1; y++) for (let x = 1; x < s.level.cols - 1; x++) if (tileAt(s.level, x, y) === FLOOR) spots.push([x, y])
  const centers = []
  const px = Math.round(p.x), py = Math.round(p.y)
  if (tileAt(s.level, px, py) === FLOOR) centers.push([px, py]) // um jato debaixo do jogador: obriga a se mexer
  for (let guard = 0; centers.length < BOSS.jetCount && guard < 80; guard++) {
    const c = spots[Math.floor(random() * spots.length)]
    if (centers.every(([x, y]) => Math.abs(x - c[0]) + Math.abs(y - c[1]) >= 3)) centers.push(c)
  }
  for (const [x, y] of centers) {
    const tiles = JET_CROSS.map(([dx, dy]) => [x + dx, y + dy]).filter(([tx, ty]) => tileAt(s.level, tx, ty) === FLOOR)
    s.jets.push({ x, y, tiles, state: 'warn', t: 0 })
    s.events.push({ type: 'jetWarn', x, y })
  }
}

// aviso -> estoura -> some
function updateJets(s, dt) {
  for (const j of s.jets) {
    j.t += dt
    if (j.state === 'warn' && j.t >= BOSS.jetWarn) {
      j.state = 'erupt'; j.t = 0
      s.shake = Math.min(0.3, s.shake + 0.12)
      s.events.push({ type: 'jetBurst', x: j.x, y: j.y })
    }
  }
  s.jets = s.jets.filter((j) => j.state === 'warn' || j.t < BOSS.jetTime)
}

// tem um jato de pé nessa casa? (mata o jogador)
export const jetAt = (s, x, y) => s.jets.some((j) => j.state === 'erupt' && j.tiles.some(([tx, ty]) => tx === x && ty === y))

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

// O chefe é largo (1,8 casa) e as caixas e pilares da arena fecham "corredores" onde ele não passa em linha reta.
// Quando trava, procura o caminho mais curto até encostar no jogador numa grade de 0.25 casa que parte da posição
// dele (só passos retos, só onde ele cabe). Devolve { path, reached }: os pontos a seguir até encostar no jogador
// ([] se já está encostando) ou, se o jogador está num lugar que ele não alcança, o caminho até o ponto mais perto dele.
const PATH_STEP = 0.25
function planPath(s, b) {
  const p = s.player, S = PATH_STEP
  const touching = (x, y) => Math.abs(x - p.x) < BOSS.half + 0.1 && Math.abs(y - p.y) < BOSS.half + 0.1
  const key = (i, j) => (i + 128) * 256 + (j + 128)
  const prev = new Map([[key(0, 0), null]])
  const queue = [[0, 0]]
  const pathTo = (i, j) => {
    const out = []
    for (let cur = [i, j]; cur[0] !== 0 || cur[1] !== 0; cur = prev.get(key(cur[0], cur[1]))) out.push({ x: b.x + cur[0] * S, y: b.y + cur[1] * S })
    return out.reverse()
  }
  let near = [0, 0], nearD = Infinity // o ponto alcançável mais perto do jogador
  for (let q = 0; q < queue.length; q++) {
    const [i, j] = queue[q]
    if (touching(b.x + i * S, b.y + j * S)) return { path: pathTo(i, j), reached: true }
    const d = Math.hypot(b.x + i * S - p.x, b.y + j * S - p.y)
    if (d < nearD - 1e-9) { nearD = d; near = [i, j] }
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di, nj = j + dj
      if (Math.abs(ni) > 100 || Math.abs(nj) > 100 || prev.has(key(ni, nj))) continue
      if (!fits(s, b.x + ni * S, b.y + nj * S)) continue
      prev.set(key(ni, nj), [i, j])
      queue.push([ni, nj])
    }
  }
  return { path: pathTo(near[0], near[1]), reached: false }
}

// dá pra ir reto até o jogador? (a caixa do chefe cabe em todos os pontos da linha, até chegar encostando nele)
function clearLine(s, b, p) {
  const dx = p.x - b.x, dy = p.y - b.y, len = Math.hypot(dx, dy)
  const n = Math.ceil(Math.max(0, len - BOSS.half - 0.1) / 0.25)
  for (let i = 1; i <= n; i++) if (!fits(s, b.x + (dx * i * 0.25) / len, b.y + (dy * i * 0.25) / len)) return false
  return true
}

// CABEÇADA: antes do frenesi, se o jogador está onde ele não alcança, o CHOP vai até o ponto mais perto e bate a cabeça
// na caixa que está no caminho (ela quebra, com poeira e barulho). Quebra só a caixa mais perto da direção do jogador.
function bumpCrate(s, b) {
  const p = s.player
  const sx = Math.sign(p.x - b.x) || 1, sy = Math.sign(p.y - b.y) || 1
  const dirs = Math.abs(p.x - b.x) >= Math.abs(p.y - b.y) ? [[sx, 0], [0, sy], [-sx, 0], [0, -sy]] : [[0, sy], [sx, 0], [0, -sy], [-sx, 0]]
  for (const [dx, dy] of dirs) {
    const crates = tilesUnder(b.x + dx * 0.6, b.y + dy * 0.6)
      .filter(([x, y]) => tileAt(s.level, x, y) === BLOCK && !s.burning.some((q) => q.x === x && q.y === y))
      .sort((a, c) => Math.hypot(a[0] - b.x - dx, a[1] - b.y - dy) - Math.hypot(c[0] - b.x - dx, c[1] - b.y - dy))
    if (!crates.length) continue
    const [x, y] = crates[0]
    s.burning.push({ x, y, t: BURN_TIME })
    s.events.push({ type: 'blockBroken', x, y }, { type: 'bossCrash', x: b.x + dx * 0.9, y: b.y + dy * 0.9 })
    s.shake = Math.min(0.4, s.shake + 0.3)
    if (dx) b.face = dx
    return true
  }
  return false
}

// anda `step` casas pelos pontos do caminho
function followPath(b, step) {
  let left = step
  while (left > 1e-9 && b.path.length) {
    const t = b.path[0]
    const dx = t.x - b.x, dy = t.y - b.y, d = Math.hypot(dx, dy)
    if (d <= left) { b.x = t.x; b.y = t.y; left -= d; b.path.shift() } else { b.x += (dx / d) * left; b.y += (dy / d) * left; left = 0 }
  }
}

export function updateBoss(s, dt, random = Math.random) {
  const b = s.boss
  if (!b.alive) { b.deathT += dt; s.jets.length = 0; return }
  updateJets(s, dt)
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
    if (b.riseT >= BOSS.riseTime) { b.mode = 'surface'; b.hurtT = 0.6; b.frenzyOn = true; b.frenzyT = 3; b.jetT = BOSS.jetFirst }
    return
  }

  // jatos d'água (só depois do mergulho): o relógio corre na superfície e no frenesi
  if (b.jetT != null) {
    b.jetT -= dt
    if (b.jetT <= 0 && s.player.alive) { spawnJets(s, random); b.jetT = BOSS.jetEvery }
  }

  // levou explosão? (a pontinha de fogo desenhada dentro das caixas não conta)
  const canHurt = b.mode === 'surface' || b.mode === 'frenzyWind' || b.mode === 'frenzyStun' // (na investida ele passa direto)
  if (canHurt && b.hurtT === 0 && s.flames.some((f) => !f.visual && bossTouchesTile(b, f.x, f.y))) {
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
    if (!b.frenzyOn && b.hp <= BOSS.hp * BOSS.frenzyAt) { // 30% da vida perdidos: começa o frenesi
      b.frenzyOn = true
      b.frenzyT = BOSS.frenzyFirst
      s.note = 'CHOP is losing it! Watch out for his charge'
      s.noteUntil = s.time + 3
    }
    if (!b.dived && b.hp <= BOSS.hp * BOSS.diveAt) { // 40% da vida: ele foge pro buraco (fica invencível a partir daqui)
      b.dived = true
      b.mode = 'toHole'
      b.holeT = 0
      b.hurtT = BOSS.invulnerable
      s.note = 'CHOP is hurt! He runs back to the water...'
      s.noteUntil = s.time + 3
    }
    return
  }

  if (b.mode === 'frenzyWind') { b.windT -= dt; if (b.windT <= 0) b.mode = 'frenzyDash'; return }
  if (b.mode === 'frenzyDash') { dashStep(s, b, dt); return }
  if (b.mode === 'frenzyStun') {
    b.stunT -= dt
    if (b.stunT <= 0) { b.mode = 'surface'; b.frenzyT = angry(b) ? BOSS.frenzyEveryAngry : BOSS.frenzyEvery }
    return
  }

  // anda na direção do jogador (um eixo de cada vez, pra deslizar nas paredes)
  const p = s.player
  const dx = p.x - b.x, dy = p.y - b.y
  if (Math.abs(dx) > 0.25) b.face = Math.sign(dx) // o tubarão olha pro lado em que o jogador está
  const len = Math.hypot(dx, dy)
  if (b.frenzyOn) { // o frenesi só começa depois dos 30% de vida perdidos
    b.frenzyT -= dt
    if (b.frenzyT <= 0 && p.alive && len > 2.5) { startFrenzy(s, b); return }
  }
  if (b.frenzyOn && b.jamT > BOSS.jamFrenzy && p.alive) { startFrenzy(s, b, true); return } // sem caminho (preso entre caixas): parte pra cima e quebra
  if (len < 0.05) return
  const speed = angry(b) ? BOSS.angrySpeed : BOSS.speed
  const step = speed * dt

  // contornando: segue o caminho mais curto até o jogador (refeito de tempos em tempos) por um tempinho
  if (b.pathT > 0) {
    b.pathT -= dt
    b.replanT -= dt
    if (b.replanT <= 0 || !b.path?.length) {
      const plan = planPath(s, b)
      b.path = plan.path
      b.replanT = 0.3
      b.approach = !plan.reached
      if (!plan.reached) {
        // o jogador está onde ele não alcança (caixas e pilares fecham a passagem pra um corpo largo)
        if (b.frenzyOn) { b.pathT = 0; b.jamT = BOSS.jamFrenzy + 1; return } // com o frenesi liberado: parte pra cima e quebra a caixa
        b.pathT = BOSS.detourTime // sem frenesi ainda: vai até o ponto mais perto que dá e espera ali
      } else if (!plan.path.length || clearLine(s, b, p)) { b.pathT = 0; b.path = null; b.jamT = 0; return } // chegou ou a linha reta está livre: volta a ir reto
      else b.pathT = BOSS.detourTime // enquanto a linha reta estiver barrada, segue contornando
    }
    followPath(b, step)
    b.jamT = Math.max(0, b.jamT - dt) // contornando direito não é estar preso
    if (b.approach && !b.path.length) { // chegou no ponto mais perto e o jogador continua fora de alcance: bate a cabeça numa caixa
      b.waitT += dt
      if (b.waitT >= 0.8) { bumpCrate(s, b); b.waitT = -2.2 }
    } else if (b.waitT > 0) b.waitT = 0
    return
  }

  // normalmente vai reto no jogador; se uma caixa barra o caminho, passa a contornar
  const ox = b.x, oy = b.y
  const nx = b.x + (dx / len) * step
  if (fits(s, nx, b.y)) b.x = nx
  const ny = b.y + (dy / len) * step
  if (fits(s, b.x, ny)) b.y = ny
  // andou de verdade, ou já está encostado no jogador (chegou: não é estar preso)
  if (Math.hypot(b.x - ox, b.y - oy) >= step * 0.5 || bossTouchesPlayer(b, p)) { b.jamT = Math.max(0, b.jamT - dt); b.stuckT = 0; return }
  b.jamT += dt
  b.stuckT += dt
  if (b.stuckT >= 0.25) { b.pathT = BOSS.detourTime; b.replanT = 0; b.stuckT = 0 }
}

