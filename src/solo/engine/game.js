// Regras do modo Solo (sem React, sem desenho): andar, bomba, explosão em cruz,
// reação em cadeia, blocos quebrando, inimigos, power-ups, porta de saída, vidas e fases.
// Tudo fica num objeto `state` que o update() avança um passinho de tempo por vez.
//
// Posições: o jogador anda em "casas" com vírgula (x = 3.5 é meio caminho entre a casa 3 e a 4).
// O centro da casa (3, 5) é exatamente x = 3, y = 5.
import {
  FLOOR, BLOCK, WALL,
  PLAYER_SPEED, START_BOMBS, START_RANGE, START_LIVES,
  SPEED_STEP, MAX_SPEED, MAX_BOMBS, MAX_RANGE,
  SHIELD_INVULN, DETONATOR_FUSE, KICK_SPEED,
  FUSE_TIME, FLAME_TIME, BURN_TIME,
} from './constants.js'
import { makeLevel, makeArena, tileAt, setTile } from './level.js'
import { LEVELS } from './levels.js'
import { makeEnemy, updateEnemy, ENEMY_TYPES, BOMBHEAD } from './enemies.js'
import { makeBoss, updateBoss, bossTouchesPlayer, bossDangerous, jetAt, nearHole } from './boss.js'

const DIRS = {
  up: { dx: 0, dy: -1 },
  down: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
}

// Começa uma corrida nova (fase 1, vidas cheias, sem power-ups).
// startLevel serve só pra testar uma fase direto (ex.: /solo?level=4).
export function createGame(random = Math.random, startLevel = 0) {
  return loadLevel({
    levelIndex: Math.max(0, Math.min(LEVELS.length - 1, startLevel)),
    lives: START_LIVES,
    stats: { speed: PLAYER_SPEED, maxBombs: START_BOMBS, range: START_RANGE, shield: false, kick: false, detonator: false },
    runTime: 0,
    loot: 0, // prêmios (de mentira, por enquanto) somados na corrida
    ...freshLevel(),
  }, random)
}

// o que vale só dentro de uma fase (zera ao passar de fase):
// - items: itens da fase (garantidos + sorteados), sorteados uma vez só, na 1ª tentativa
// - kept: itens de bomba/fogo/bota que você pegou nesta fase (não voltam se você morrer)
// - chestOpened: o baú desta fase já foi aberto (morrer depois disso não dá outro sorteio)
const freshLevel = () => ({ items: null, kept: [], chestOpened: false })

// Próxima fase, mantendo vidas e power-ups
export function nextLevel(s, random = Math.random) {
  return loadLevel({ ...carry(s), levelIndex: s.levelIndex + 1, ...freshLevel() }, random)
}

// Morreu mas ainda tem vida: tenta a mesma fase de novo (mapa novo). Mantém bombas, fogo e
// velocidade; perde chute e detonador. Os itens que você manteve não aparecem de novo no mapa.
export function retryLevel(s, random = Math.random) {
  return loadLevel(carry(s, true), random)
}

export const isLastLevel = (s) => s.levelIndex >= LEVELS.length - 1
export const levelInfo = (s) => LEVELS[s.levelIndex]

// itens que você mantém quando morre (o resto é perdido e pode voltar a aparecer na fase)
const KEPT_ON_DEATH = ['bomb', 'fire', 'speed']

function carry(s, died = false) {
  const p = s.player
  return {
    levelIndex: s.levelIndex,
    lives: s.lives,
    stats: {
      speed: p.speed, maxBombs: p.maxBombs, range: p.range,
      shield: died ? false : p.shield, kick: died ? false : p.kick, detonator: died ? false : p.detonator,
    },
    runTime: s.runTime,
    loot: s.loot,
    items: s.items,
    kept: s.kept,
    chestOpened: s.chestOpened || s.chest?.state === 'opened',
  }
}

// sorteia `count` itens da lista `pool` (pode repetir)
function rollBonus(bonus, random) {
  if (!bonus) return []
  return Array.from({ length: bonus.count }, () => bonus.pool[Math.floor(random() * bonus.pool.length)])
}

function loadLevel(run, random) {
  const cfg = LEVELS[run.levelIndex]
  if (cfg.boss) return loadBossLevel(run, random)
  const level = makeLevel(random, cfg.blockChance)
  const { start } = level
  const far = (x, y) => Math.abs(x - start.x) + Math.abs(y - start.y)

  // itens da fase: sorteados na 1ª tentativa; numa nova tentativa, sem os que você manteve
  const items = run.items ?? shuffle([...cfg.powerups, ...rollBonus(cfg.bonus, random)], random)
  const toPlace = [...items]
  for (const k of run.kept) {
    const i = toPlace.indexOf(k)
    if (i >= 0) toPlace.splice(i, 1)
  }

  // porta e power-ups ficam escondidos debaixo de blocos (a porta, longe do início)
  const blocks = shuffle(cellsOf(level, BLOCK), random)
  const doorCell = blocks.find(([x, y]) => far(x, y) >= 8) ?? blocks[0]
  const hidden = blocks.filter((c) => c !== doorCell)
  // pelo menos 1 item fica entre as 8 caixas mais perto do início (quem começa quebrando caixa já ganha algo)
  if (toPlace.length && hidden.length > 8) {
    const nearest = hidden.map((c, i) => [far(c[0], c[1]), i]).sort((p, q) => p[0] - q[0]).slice(0, 8)
    const pick = nearest[Math.floor(random() * nearest.length)][1]
    ;[hidden[0], hidden[pick]] = [hidden[pick], hidden[0]] // o 1º item da lista vai pra ela
  }
  const powerups = toPlace.slice(0, hidden.length).map((kind, i) => ({
    x: hidden[i][0], y: hidden[i][1], kind, revealed: false, taken: false,
  }))

  // inimigos nascem em chão livre, longe do jogador e ESPALHADOS (cada um numa região diferente do mapa)
  const spots = cellsOf(level, FLOOR).filter(([x, y]) => far(x, y) >= 6)
  const taken = [[start.x, start.y]] // casas já "ocupadas": o início, e depois cada bicho e poça colocados
  const enemies = []
  for (const [type, n] of Object.entries(cfg.enemies)) {
    for (let i = 0; i < n; i++) {
      let spot = spreadPick(spots, taken, random, [5, 4, 3, 0])
      if (spot) spots.splice(spots.indexOf(spot), 1)
      if (!spot) {
        // mapa muito cheio: abre espaço num bloco qualquer longe do início
        const b = hidden.find(([x, y]) => far(x, y) >= 6 && tileAt(level, x, y) === BLOCK &&
          !powerups.some((p) => p.x === x && p.y === y))
        if (!b) break
        setTile(level, b[0], b[1], FLOOR)
        spot = b
      }
      taken.push([spot[0], spot[1]])
      enemies.push(makeEnemy(type, spot[0], spot[1]))
    }
  }

  // poças d'água (só enfeite, levels.js `puddles: N`) com uma RACHADURA ao lado de cada uma (por onde a água entra,
  // levels.js `puddleCracks`). Sempre bem distribuídas: uma em cada região do mapa (em cima à direita, embaixo à
  // esquerda e no meio/baixo à direita), em casa livre desde o começo (nunca escondida debaixo de caixa), longe
  // do início e dos bichos
  const puddles = []
  const cracks = []
  if (cfg.puddles) {
    const { cols, rows } = level
    const regions = [
      ([x, y]) => x >= Math.ceil(cols * 0.62) && y <= Math.floor(rows * 0.42), // em cima à direita
      ([x, y]) => x <= Math.floor(cols * 0.4) && y >= Math.ceil(rows * 0.5), // embaixo à esquerda
      ([x, y]) => x >= Math.floor(cols * 0.42) && x <= Math.ceil(cols * 0.8) && y >= Math.ceil(rows * 0.55), // meio/baixo
    ]
    const free = cellsOf(level, FLOOR).filter(([cx, cy]) => far(cx, cy) >= 4)
    for (let i = 0; i < cfg.puddles; i++) {
      const inRegion = free.filter(regions[i % regions.length])
      const spot = spreadPick(inRegion, taken, random, [4, 3, 2, 0]) ?? spreadPick(free, taken, random, [4, 3, 2, 0])
      if (!spot) break
      free.splice(free.indexOf(spot), 1)
      taken.push([spot[0], spot[1]])
      puddles.push({ x: spot[0], y: spot[1], seed: random() * 100, variant: i % 2, flip: i === 2 }) // desenhos a/b da arte; o 3º espelhado
      if (cfg.puddleCracks) cracks.push(makeCrack(spot[0], spot[1], random))
    }
  }

  return {
    ...run,
    items,
    level,
    player: {
      x: start.x, y: start.y,
      alive: true, deathT: 0,
      ...run.stats,
      facing: 'down', moving: false, walkT: 0,
    },
    enemies,
    puddles,
    cracks,
    boss: null,
    chest: null, // aparece quando a porta abre: { x, y, state: 'closed'|'opening'|'opened', result, dismissed }
    door: { x: doorCell[0], y: doorCell[1], revealed: false },
    powerups,
    bombs: [],    // { x, y, timer, range, passable }
    flames: [],   // { x, y, t, kind: 'center' | 'h' | 'v' }
    burning: [],  // blocos queimando: { x, y, t }
    jets: [],     // jatos d'água do chefe: { x, y, tiles, state: 'warn' | 'erupt', t }
    status: 'playing', // 'playing' | 'dead' | 'gameover' | 'cleared' | 'won'
    tileset: cfg.tileset ?? 'temple', // cenário da fase (sprites.js TILESETS)
    mood: cfg.mood ?? null, // clima por cima do cenário (levels.js)
    wallMix: !!cfg.wallMix, // blocos fixos em várias cores (levels.js)
    crateTone: cfg.crateTone ?? null, // cor dos caixotes quebráveis (levels.js)
    floor: cfg.floor ?? null, // chão próprio da fase (levels.js)
    wall: cfg.wall ?? null, // blocos fixos próprios da fase (levels.js)
    decor: cfg.decor ?? null, // decoração da borda própria da fase (levels.js)
    doorSet: cfg.door ?? null, // porta própria da fase (levels.js): 'hull' = escotilha
    time: 0,
    shake: 0,
    events: [], // avisos pros efeitos visuais (fx.js): explosão, caixa quebrando, inimigo atingido...
  }
}

// fase de chefe: arena aberta, sem blocos; a porta aparece quando o chefe morre
function loadBossLevel(run, random = Math.random) {
  const level = makeArena()
  const cfg = LEVELS[run.levelIndex]
  // Chega só com o que já tinha (no começo: 1 bomba, alcance 1) e GANHA UM ESCUDO. As melhorias (bombas, fogo, bota)
  // ficam escondidas em caixas espalhadas pela arena: quebrando elas dá pra se preparar antes do CHOP sair.
  const st = run.stats
  const stats = { ...st, shield: true }
  const supplies = !st.shield
  // caixas da arena (longe do buraco e do canto onde você nasce), com os itens da fase escondidos em algumas
  const mx = (level.cols - 1) / 2, my = (level.rows - 1) / 2
  const crates = shuffle([
    [mx - 2, 2], [mx + 2, 2], [mx - 2, level.rows - 3], [mx + 2, level.rows - 3],
    [2, my - 2], [2, my + 2], [level.cols - 3, my - 2], [level.cols - 3, my + 2],
    [mx - 3, my], [mx + 3, my],
  ], random)
  for (const [x, y] of crates) setTile(level, x, y, BLOCK)
  const items = run.items ?? shuffle([...cfg.powerups], random)
  const toPlace = [...items]
  for (const k of run.kept) {
    const i = toPlace.indexOf(k)
    if (i >= 0) toPlace.splice(i, 1)
  }
  const powerups = toPlace.slice(0, crates.length).map((kind, i) => ({ x: crates[i][0], y: crates[i][1], kind, revealed: false, taken: false }))
  return {
    ...run,
    level,
    items,
    supplies, // true = ganhou o escudo ao chegar (o aviso aparece quando a luta começa)
    player: {
      x: level.start.x, y: level.start.y,
      alive: true, deathT: 0,
      ...stats,
      facing: 'down', moving: false, walkT: 0,
    },
    enemies: [],
    boss: makeBoss((level.cols - 1) / 2, (level.rows - 1) / 2),
    tileset: cfg.tileset ?? 'temple',
    mood: cfg.mood ?? null,
    floor: cfg.floor ?? null, // visual próprio da arena do chefe (levels.js)
    wall: cfg.wall ?? null,
    decor: cfg.decor ?? null,
    doorSet: cfg.door ?? null,
    crateTone: cfg.crateTone ?? null,
    chest: null,
    door: { x: -1, y: -1, revealed: false },
    powerups,
    bombs: [],
    flames: [],
    burning: [],
    jets: [],     // jatos d'água do chefe: { x, y, tiles, state: 'warn' | 'erupt', t }
    status: 'playing',
    time: 0,
    shake: 0,
    events: [], // avisos pros efeitos visuais (fx.js): explosão, caixa quebrando, inimigo atingido...
  }
}

// Escolhe uma casa entre as candidatas, bem LONGE das já ocupadas (taken): sorteia entre as 20% mais afastadas, pra
// espalhar bichos e poças em vez de amontoar. minDist: distância mínima (em casas) das ocupadas; null se não sobra nenhuma.
function spreadPick(cells, taken, random, minDist = 0) {
  if (Array.isArray(minDist)) { // lista de distâncias: tenta a maior primeiro e vai afrouxando até achar alguma
    for (const d of minDist) { const c = spreadPick(cells, taken, random, d); if (c) return c }
    return null
  }
  const scored = cells
    .map((c) => [c, taken.reduce((m, t) => Math.min(m, Math.abs(t[0] - c[0]) + Math.abs(t[1] - c[1])), 99)])
    .filter(([, d]) => d >= minDist)
    .sort((a, b) => b[1] - a[1])
  if (!scored.length) return null
  const top = scored.slice(0, Math.max(1, Math.ceil(scored.length * 0.2)))
  return top[Math.floor(random() * top.length)][0]
}

// Rachadura grande no chão, passando pela poça da casa (tx, ty): caminho de pixels do mapa (1 pixel = 1/48 de
// casa), saindo dos dois lados da poça pela fresta entre as tábuas, torta, com um ou dois galhinhos.
// Devolve { pts: [x, y, x, y, ...] }. Só enfeite (render.js desenha só onde o chão está livre).
function makeCrack(tx, ty, random) {
  const pts = []
  const x0 = tx * 48 + 24, y0 = ty * 48 + 8 // sai da rachadura de cima do vazamento (o fio d'água cai dali)
  const dir0 = random() < 0.5 ? -1 : 1
  for (const [dir, len] of [[dir0, 70 + Math.floor(random() * 50)], [-dir0, 34 + Math.floor(random() * 30)]]) {
    let yf = y0, slope = (random() - 0.5) * 0.5, next = 8 + Math.floor(random() * 8)
    const branchAt = Math.floor(len * (0.35 + random() * 0.3))
    for (let i = 0; i < len; i++) {
      if (i === next) { slope = (random() - 0.5) * 0.7; next += 8 + Math.floor(random() * 10) }
      yf += slope + (random() - 0.5) * 0.7
      yf = Math.max(y0 - 11, Math.min(y0 + 11, yf))
      pts.push(x0 + dir * (i + 3), Math.round(yf))
      if (i === branchAt && dir === dir0) { // galhinho: sai torto pra cima ou pra baixo
        const bs = (random() < 0.5 ? -1 : 1) * (0.7 + random() * 0.5), bl = 9 + Math.floor(random() * 9)
        let bx = x0 + dir * (i + 3), by = yf
        for (let j = 0; j < bl; j++) { bx += dir; by += bs + (random() - 0.5) * 0.4; pts.push(Math.round(bx), Math.round(by)) }
      }
    }
  }
  return { pts }
}

function cellsOf(level, type) {
  const out = []
  for (let y = 0; y < level.rows; y++) {
    for (let x = 0; x < level.cols; x++) if (tileAt(level, x, y) === type) out.push([x, y])
  }
  return out
}

function shuffle(a, random) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

const bombAt = (s, x, y) => s.bombs.find((b) => b.x === x && b.y === y)

// a casa deixa o jogador entrar? (a bomba que ele acabou de soltar não trava, até ele sair dela)
function walkable(s, x, y) {
  if (tileAt(s.level, x, y) !== FLOOR) return false
  const b = bombAt(s, x, y)
  return !b || b.passable
}

// Anda num eixo com o "deslize de quina" do Bomberman: se você está um pouco fora do corredor
// e o caminho à frente está livre, o personagem se ajeita sozinho pra dentro dele.
function moveAxis(s, p, main, cross, sign, step) {
  const lane = Math.round(p[cross])
  const off = p[cross] - lane
  const cur = Math.round(p[main])
  const free = (m, c) => (main === 'x' ? walkable(s, m, c) : walkable(s, c, m))

  if (Math.abs(off) > 1e-6) {
    if (free(cur + sign, lane)) {
      // ajeita pro meio do corredor; o que sobrar do passo vira andar pra frente
      const k = Math.min(step, Math.abs(off))
      p[cross] = k === Math.abs(off) ? lane : p[cross] - Math.sign(off) * k
      step -= k
    } else if (Math.abs(off) >= 0.2 && free(cur + sign, lane + Math.sign(off))) {
      // bem perto do outro corredor e ele está livre: escorrega pra lá
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
    // à frente bloqueado: dá pra ir no máximo até o meio da casa atual
    next = sign > 0 ? Math.min(next, Math.max(p[main], cur)) : Math.max(next, Math.min(p[main], cur))
  }
  p[main] = next
}

// Lados de uma casa de fogo que encostam em outro fogo (pro desenho: lado sem fogo vizinho
// ganha ponta arredondada, em vez de terminar seco na borda da casa)
const SIDE = { left: 1, right: 2, up: 4, down: 8 }
const BACK = { left: 2, right: 1, up: 8, down: 4 }
const ALL_SIDES = 15

function addFlame(s, x, y, kind, sides) {
  const f = s.flames.find((q) => q.x === x && q.y === y && !q.visual)
  if (f) {
    f.t = FLAME_TIME
    if (f.kind !== kind) { f.kind = 'center'; f.sides = ALL_SIDES } // cruzamento de duas explosões
    else f.sides |= sides
    return f
  }
  const nf = { x, y, t: FLAME_TIME, kind, sides }
  s.flames.push(nf)
  return nf
}

function explode(s, bomb) {
  s.bombs.splice(s.bombs.indexOf(bomb), 1)
  const center = addFlame(s, bomb.x, bomb.y, 'center', ALL_SIDES)
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
        // só desenho: a ponta do fogo entra um pouco na caixa (não machuca ninguém)
        prev.sides |= SIDE[name]
        s.flames.push({ x, y, t: FLAME_TIME, kind, sides: BACK[name], visual: true })
        break
      }
      prev.sides |= SIDE[name]
      const other = bombAt(s, x, y)
      if (other) { other.timer = 0; addFlame(s, x, y, 'center', ALL_SIDES); break } // reação em cadeia
      prev = addFlame(s, x, y, kind, BACK[name])
    }
  }
  s.shake = Math.min(0.25, s.shake + 0.15)
  s.events.push({ type: 'explode', x: bomb.x, y: bomb.y, range: bomb.range })
}

// fogo de verdade nessa casa? (a pontinha desenhada dentro da caixa não conta)
const flameAt = (s, x, y) => s.flames.some((f) => f.x === x && f.y === y && !f.visual)

// cause: 'fire' (a própria bomba), o tipo do inimigo que encostou, ou 'boss'
function killPlayer(s, cause) {
  const p = s.player
  if (!p.alive || p.invulnT > 0) return
  if (p.shield) {
    // o escudo segura a batida: quebra e o jogador fica piscando um tempinho
    p.shield = false
    p.invulnT = SHIELD_INVULN
    s.shake = Math.min(0.35, s.shake + 0.2)
    s.events.push({ type: 'shieldBreak', x: p.x, y: p.y })
    return
  }
  p.alive = false
  s.shake = Math.min(0.4, s.shake + 0.3)
  s.events.push({ type: 'playerHit', x: p.x, y: p.y })
  p.moving = false
  s.deathCause = cause
  s.deathRoll = Math.random() // sorteia a frase da tela de morte (fica fixa até a próxima)
  if (s.status === 'playing') {
    s.lives--
    s.status = s.lives > 0 ? 'dead' : 'gameover'
  }
}

// aplica o item; devolve false se não mudou nada (já estava no máximo)
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

// explicação curta dos itens especiais (aparece no aviso embaixo do placar)
const ITEM_NOTES = {
  shield: 'SHIELD! It blocks 1 hit',
  kick: 'KICK! Walk into a bomb to send it sliding',
  detonator: `DETONATOR! Press E to blow your bombs (or wait ${DETONATOR_FUSE} s)`,
}

// Chute: andando contra uma bomba (com o item), ela sai deslizando até bater em algo
// Devolve true se chutou. Na direção do chute o jogador precisa estar quase no centro da casa (encostado na
// bomba); de lado pode estar meio torto: vale a casa mais próxima. (Antes exigia estar centrado nos dois
// sentidos, e quem chegava um pouco torto, encostado na bomba, ficava parado sem conseguir chutar.)
function tryKick(s, p, d) {
  if (!p.kick) return false
  const px = Math.round(p.x), py = Math.round(p.y)
  if ((d.dx ? Math.abs(p.x - px) : Math.abs(p.y - py)) > 0.2) return false
  const b = bombAt(s, px + d.dx, py + d.dy)
  if (!b || b.passable || b.slide) return false
  if (!slideFree(s, b, d.dx, d.dy)) return false
  b.slide = { dx: d.dx, dy: d.dy, p: 0 }
  s.events.push({ type: 'kick', x: b.x, y: b.y })
  return true
}

// a próxima casa no caminho da bomba chutada está livre?
function slideFree(s, b, dx, dy) {
  const x = b.x + dx, y = b.y + dy
  if (tileAt(s.level, x, y) !== FLOOR || bombAt(s, x, y)) return false
  if (s.enemies.some((e) => e.alive && Math.round(e.x) === x && Math.round(e.y) === y)) return false
  if (s.boss?.alive && Math.abs(s.boss.x - x) < 1.4 && Math.abs(s.boss.y - y) < 1.4) return false
  const p = s.player
  return !(p.alive && Math.round(p.x) === x && Math.round(p.y) === y)
}

function updateSlides(s, dt) {
  for (const b of s.bombs) {
    if (!b.slide) continue
    b.slide.p += KICK_SPEED * dt
    while (b.slide && b.slide.p >= 1) {
      b.x += b.slide.dx
      b.y += b.slide.dy
      b.slide.p -= 1
      // deslizou pra dentro do fogo: explode na hora (como no Bomberman)
      if (flameAt(s, b.x, b.y)) { b.slide = null; b.timer = 0; break }
      if (!slideFree(s, b, b.slide.dx, b.slide.dy)) b.slide = null // bateu: para na casa atual
    }
  }
}

export const enemiesLeft = (s) => s.enemies.filter((e) => e.alive).length
export const doorOpen = (s) => s.door.revealed && enemiesLeft(s) === 0 && !s.boss?.alive

// ---- baú (o sorteio em si fica fora do motor, em src/solo/chest/)
export const chestDone = (s) => s.chest?.state === 'opened' && s.chest.dismissed
export const chestNear = (s) => !!s.chest && s.player.alive &&
  Math.abs(s.player.x - s.chest.x) <= 1.2 && Math.abs(s.player.y - s.chest.y) <= 1.2
// o jogo para enquanto o baú abre e enquanto o resultado está na tela
export const isPaused = (s) => s.chest?.state === 'opening' || (s.chest?.state === 'opened' && !s.chest.dismissed)

// ATALHO DE TESTE (/solo?chest=1): sem inimigos, porta à mostra e o baú numa casa livre ao lado do jogador
export function placeTestChest(s) {
  s.enemies = []
  setTile(s.level, s.door.x, s.door.y, FLOOR)
  s.door.revealed = true
  const px = Math.round(s.player.x), py = Math.round(s.player.y)
  for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
    const x = px + dx, y = py + dy
    if (tileAt(s.level, x, y) === FLOOR) { s.chest = { x, y, state: 'closed', result: null, dismissed: false }; return }
  }
  const x = px + 1, y = py
  setTile(s.level, x, y, FLOOR)
  s.chest = { x, y, state: 'closed', result: null, dismissed: false }
}

// tenta abrir: só se o jogador estiver do lado e o baú ainda fechado
export function beginChest(s) {
  if (s.status !== 'playing' || !chestNear(s) || s.chest.state !== 'closed') return false
  s.chest.state = 'opening'
  return true
}
export function finishChest(s, result) {
  s.chest.state = 'opened'
  s.chest.result = result
  if (result.win) s.loot += result.amount
}
export function dismissChest(s) {
  if (s.chest?.state === 'opened') s.chest.dismissed = true
}

// o baú aparece numa casa livre do lado da porta (busca em largura a partir dela)
function spawnChest(s) {
  const { door, level } = s
  // morreu depois de já ter aberto o baú desta fase: ele volta aberto e vazio (sem novo sorteio)
  const fresh = s.chestOpened
    ? { state: 'opened', result: { win: false, amount: 0, reopened: true }, dismissed: true }
    : { state: 'closed', result: null, dismissed: false }
  const seen = new Set([door.x + ',' + door.y])
  const queue = [[door.x, door.y]]
  while (queue.length) {
    const [x, y] = queue.shift()
    for (const d of Object.values(DIRS)) {
      const nx = x + d.dx, ny = y + d.dy
      const k = nx + ',' + ny
      if (seen.has(k) || tileAt(level, nx, ny) !== FLOOR) continue
      seen.add(k)
      if (nearHole(level, nx, ny)) continue // arena do chefe: o baú não fica colado no buraco
      if (!bombAt(s, nx, ny)) return { x: nx, y: ny, ...fresh }
      queue.push([nx, ny])
    }
  }
  return { x: door.x, y: door.y, ...fresh }
}

export function update(s, controls, dt) {
  s.time += dt
  if (isPaused(s)) { controls.takeBomb(); controls.takeDetonate(); return } // baú abrindo: o mundo espera
  if (s.status === 'playing') s.runTime += dt
  s.shake = Math.max(0, s.shake - dt * 1.5)
  const p = s.player

  // --- jogador
  if (p.alive && s.status === 'playing') {
    const dir = controls.direction()
    p.moving = false
    if (dir) {
      const d = DIRS[dir]
      const bx = p.x, by = p.y
      // com o item de chute, bomba na frente (e livre pra deslizar) = chuta, em vez de escorregar pra o lado dela
      const kicked = tryKick(s, p, d)
      if (!kicked) {
        if (d.dx) moveAxis(s, p, 'x', 'y', d.dx, p.speed * dt)
        else moveAxis(s, p, 'y', 'x', d.dy, p.speed * dt)
      }
      p.facing = dir
      if (dir === 'left') p.flip = true // a arte fica espelhada indo pra esquerda
      else if (dir === 'right') p.flip = false
      p.moving = p.x !== bx || p.y !== by
      if (p.moving) p.walkT += dt
    }
    if (controls.takeBomb()) {
      const x = Math.round(p.x), y = Math.round(p.y)
      if (s.bombs.length < p.maxBombs && !bombAt(s, x, y) && tileAt(s.level, x, y) === FLOOR) {
        const fuse = p.detonator ? DETONATOR_FUSE : FUSE_TIME
        s.bombs.push({ x, y, timer: fuse, fuse, range: p.range, passable: true, remote: p.detonator })
        s.events.push({ type: 'bombPlaced', x, y })
      }
    }
    // detonador: a tecla E explode a bomba mais antiga
    if (controls.takeDetonate()) {
      const b = s.bombs.find((q) => q.remote && q.timer > 0)
      if (b) b.timer = 0
    }
  } else {
    controls.takeBomb() // ignora bomba apertada depois de morrer
    controls.takeDetonate()
  }
  p.invulnT = Math.max(0, (p.invulnT ?? 0) - dt)
  updateSlides(s, dt)

  // a bomba solta embaixo do jogador vira obstáculo assim que ele sai de cima dela
  for (const b of s.bombs) {
    if (b.passable && (Math.abs(p.x - b.x) >= 1 || Math.abs(p.y - b.y) >= 1)) b.passable = false
  }

  // --- inimigos
  for (const e of s.enemies) updateEnemy(s, e, dt)
  // cabeça-bomba do esqueleto que chegou a zero: explode como uma bomba (e o esqueleto some)
  for (const e of s.enemies) {
    if (!e.alive || e.bombT == null || e.bombT > 0) continue
    e.alive = false
    e.deathT = 0
    const bx = Math.round(e.x), by = Math.round(e.y)
    const there = bombAt(s, bx, by)
    if (there) there.timer = 0
    else s.bombs.push({ x: bx, y: by, timer: 0, fuse: 0.01, range: BOMBHEAD.range, passable: false, remote: false })
    s.events.push({ type: 'enemyHit', x: e.x, y: e.y, killed: true })
  }

  // --- bombas (o while pega as que explodiram em cadeia no mesmo instante)
  for (const b of s.bombs) b.timer -= dt
  let due
  while ((due = s.bombs.find((b) => b.timer <= 0))) explode(s, due)

  // --- fogo e blocos queimando (quando o bloco some, mostra o que tinha embaixo)
  for (const f of s.flames) f.t -= dt
  s.flames = s.flames.filter((f) => f.t > 0)
  for (const b of s.burning) {
    b.t -= dt
    if (b.t <= 0) {
      setTile(s.level, b.x, b.y, FLOOR)
      if (s.door.x === b.x && s.door.y === b.y) s.door.revealed = true
      for (const pu of s.powerups) if (pu.x === b.x && pu.y === b.y) { pu.revealed = true; pu.revealedAt = s.time }
    }
  }
  s.burning = s.burning.filter((b) => b.t > 0)

  // --- chefe
  if (s.boss) updateBoss(s, dt)

  // --- porta aberta: aparece o baú
  if (!s.chest && doorOpen(s)) s.chest = spawnChest(s)

  // --- fogo machuca inimigos (a maioria morre na hora; o Chain Sarge aguenta 2)
  for (const e of s.enemies) {
    if (!e.alive || e.hurtT > 0 || !flameAt(s, Math.round(e.x), Math.round(e.y))) continue
    if (e.bombT != null) { e.bombT = 0; continue } // fogo na cabeça-bomba: explode na hora
    e.hp--
    if (e.hp <= 0 && ENEMY_TYPES[e.type].bombhead) {
      // o esqueleto "morre", mas a cabeça vira uma bomba: ele segue em pé perseguindo o jogador até ela explodir
      // (fica sem levar dano enquanto o próprio fogo que o derrubou ainda está aceso)
      e.hp = 1
      e.bombT = BOMBHEAD.time
      e.hurtT = FLAME_TIME + 0.15
      s.events.push({ type: 'enemyHit', x: e.x, y: e.y, killed: false }, { type: 'bombhead', x: e.x, y: e.y })
      continue
    }
    s.events.push({ type: 'enemyHit', x: e.x, y: e.y, killed: e.hp <= 0 })
    if (e.hp <= 0) e.alive = false
    else { e.hurtT = 1; e.angry = true } // pisca um segundo sem levar dano e fica bravo
  }

  if (p.alive) {
    const px = Math.round(p.x), py = Math.round(p.y)
    // fogo ou encostar num inimigo = morte
    const touching = s.enemies.find((e) => e.alive && Math.abs(e.x - p.x) < 0.6 && Math.abs(e.y - p.y) < 0.6)
    if (flameAt(s, px, py)) killPlayer(s, 'fire')
    else if (jetAt(s, px, py)) killPlayer(s, 'water')
    else if (touching) { if (touching.bombT != null) touching.bombT = 0; else killPlayer(s, touching.type) } // cabeça-bomba encostou: explode
    else if (s.boss?.alive && bossDangerous(s.boss) && bossTouchesPlayer(s.boss, p)) killPlayer(s, 'boss')

    // pega power-up
    for (const pu of s.powerups) {
      if (p.alive && pu.revealed && !pu.taken && pu.x === px && pu.y === py) {
        pu.taken = true
        const changed = applyPowerup(p, pu.kind)
        if (KEPT_ON_DEATH.includes(pu.kind)) s.kept.push(pu.kind)
        s.events.push({ type: 'powerup', x: pu.x, y: pu.y, kind: pu.kind, max: !changed })
        if (ITEM_NOTES[pu.kind]) { s.note = ITEM_NOTES[pu.kind]; s.noteUntil = s.time + 4 }
      }
    }

    // porta aberta (sem inimigos) + baú já aberto + jogador em cima = fase concluída
    if (p.alive && s.status === 'playing' && doorOpen(s) && chestDone(s) && s.door.x === px && s.door.y === py) {
      s.status = isLastLevel(s) ? 'won' : 'cleared'
    }
  } else {
    p.deathT += dt
  }
}
