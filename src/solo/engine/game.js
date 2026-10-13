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
  FUSE_TIME, FLAME_TIME, BURN_TIME,
} from './constants.js'
import { makeLevel, makeArena, tileAt, setTile } from './level.js'
import { LEVELS } from './levels.js'
import { makeEnemy, updateEnemy } from './enemies.js'
import { makeBoss, updateBoss, bossTouchesPlayer } from './boss.js'

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
    stats: { speed: PLAYER_SPEED, maxBombs: START_BOMBS, range: START_RANGE },
    runTime: 0,
    loot: 0, // prêmios (de mentira, por enquanto) somados na corrida
  }, random)
}

// Próxima fase, mantendo vidas e power-ups
export function nextLevel(s, random = Math.random) {
  return loadLevel({ ...carry(s), levelIndex: s.levelIndex + 1 }, random)
}

// Morreu mas ainda tem vida: tenta a mesma fase de novo (mapa novo), mantendo os power-ups
export function retryLevel(s, random = Math.random) {
  return loadLevel(carry(s), random)
}

export const isLastLevel = (s) => s.levelIndex >= LEVELS.length - 1
export const levelInfo = (s) => LEVELS[s.levelIndex]

function carry(s) {
  const p = s.player
  return {
    levelIndex: s.levelIndex,
    lives: s.lives,
    stats: { speed: p.speed, maxBombs: p.maxBombs, range: p.range },
    runTime: s.runTime,
    loot: s.loot,
  }
}

function loadLevel(run, random) {
  const cfg = LEVELS[run.levelIndex]
  if (cfg.boss) return loadBossLevel(run)
  const level = makeLevel(random, cfg.blockChance)
  const { start } = level
  const far = (x, y) => Math.abs(x - start.x) + Math.abs(y - start.y)

  // porta e power-ups ficam escondidos debaixo de blocos (a porta, longe do início)
  const blocks = shuffle(cellsOf(level, BLOCK), random)
  const doorCell = blocks.find(([x, y]) => far(x, y) >= 8) ?? blocks[0]
  const hidden = blocks.filter((c) => c !== doorCell)
  const powerups = cfg.powerups.slice(0, hidden.length).map((kind, i) => ({
    x: hidden[i][0], y: hidden[i][1], kind, revealed: false, taken: false,
  }))

  // inimigos nascem em chão livre, longe do jogador
  let spots = shuffle(cellsOf(level, FLOOR).filter(([x, y]) => far(x, y) >= 6), random)
  const enemies = []
  for (const [type, n] of Object.entries(cfg.enemies)) {
    for (let i = 0; i < n; i++) {
      let spot = spots.shift()
      if (!spot) {
        // mapa muito cheio: abre espaço num bloco qualquer longe do início
        const b = hidden.find(([x, y]) => far(x, y) >= 6 && tileAt(level, x, y) === BLOCK &&
          !powerups.some((p) => p.x === x && p.y === y))
        if (!b) break
        setTile(level, b[0], b[1], FLOOR)
        spot = b
      }
      enemies.push(makeEnemy(type, spot[0], spot[1]))
    }
  }

  return {
    ...run,
    level,
    player: {
      x: start.x, y: start.y,
      alive: true, deathT: 0,
      ...run.stats,
      facing: 'down', moving: false, walkT: 0,
    },
    enemies,
    boss: null,
    chest: null, // aparece quando a porta abre: { x, y, state: 'closed'|'opening'|'opened', result, dismissed }
    door: { x: doorCell[0], y: doorCell[1], revealed: false },
    powerups,
    bombs: [],    // { x, y, timer, range, passable }
    flames: [],   // { x, y, t, kind: 'center' | 'h' | 'v' }
    burning: [],  // blocos queimando: { x, y, t }
    status: 'playing', // 'playing' | 'dead' | 'gameover' | 'cleared' | 'won'
    tileset: cfg.tileset ?? 'temple', // cenário da fase (sprites.js TILESETS)
    time: 0,
    shake: 0,
    events: [], // avisos pros efeitos visuais (fx.js): explosão, caixa quebrando, inimigo atingido...
  }
}

// fase de chefe: arena aberta, sem blocos; a porta aparece quando o chefe morre
function loadBossLevel(run) {
  const level = makeArena()
  return {
    ...run,
    level,
    player: {
      x: level.start.x, y: level.start.y,
      alive: true, deathT: 0,
      ...run.stats,
      facing: 'down', moving: false, walkT: 0,
    },
    enemies: [],
    boss: makeBoss((level.cols - 1) / 2, (level.rows - 1) / 2),
    tileset: LEVELS[run.levelIndex].tileset ?? 'temple',
    chest: null,
    door: { x: -1, y: -1, revealed: false },
    powerups: [],
    bombs: [],
    flames: [],
    burning: [],
    status: 'playing',
    time: 0,
    shake: 0,
    events: [], // avisos pros efeitos visuais (fx.js): explosão, caixa quebrando, inimigo atingido...
  }
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

function addFlame(s, x, y, kind) {
  const f = s.flames.find((q) => q.x === x && q.y === y)
  if (f) {
    f.t = FLAME_TIME
    if (f.kind !== kind) f.kind = 'center' // cruzamento de duas explosões
  } else {
    s.flames.push({ x, y, t: FLAME_TIME, kind })
  }
}

function explode(s, bomb) {
  s.bombs.splice(s.bombs.indexOf(bomb), 1)
  addFlame(s, bomb.x, bomb.y, 'center')
  for (const d of Object.values(DIRS)) {
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
        break
      }
      const other = bombAt(s, x, y)
      if (other) { other.timer = 0; addFlame(s, x, y, 'center'); break } // reação em cadeia
      addFlame(s, x, y, d.dx ? 'h' : 'v')
    }
  }
  s.shake = Math.min(0.25, s.shake + 0.15)
  s.events.push({ type: 'explode', x: bomb.x, y: bomb.y, range: bomb.range })
}

const flameAt = (s, x, y) => s.flames.some((f) => f.x === x && f.y === y)

function killPlayer(s) {
  const p = s.player
  if (!p.alive) return
  p.alive = false
  s.shake = Math.min(0.4, s.shake + 0.3)
  s.events.push({ type: 'playerHit', x: p.x, y: p.y })
  p.moving = false
  if (s.status === 'playing') {
    s.lives--
    s.status = s.lives > 0 ? 'dead' : 'gameover'
  }
}

function applyPowerup(p, kind) {
  if (kind === 'bomb') p.maxBombs = Math.min(MAX_BOMBS, p.maxBombs + 1)
  else if (kind === 'fire') p.range = Math.min(MAX_RANGE, p.range + 1)
  else if (kind === 'speed') p.speed = Math.min(MAX_SPEED, p.speed + SPEED_STEP)
}

export const enemiesLeft = (s) => s.enemies.filter((e) => e.alive).length
export const doorOpen = (s) => s.door.revealed && enemiesLeft(s) === 0 && !s.boss?.alive

// ---- baú (o sorteio em si fica fora do motor, em src/solo/chest/)
export const chestDone = (s) => s.chest?.state === 'opened' && s.chest.dismissed
export const chestNear = (s) => !!s.chest && s.player.alive &&
  Math.abs(s.player.x - s.chest.x) <= 1.2 && Math.abs(s.player.y - s.chest.y) <= 1.2
// o jogo para enquanto o baú abre e enquanto o resultado está na tela
export const isPaused = (s) => s.chest?.state === 'opening' || (s.chest?.state === 'opened' && !s.chest.dismissed)

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
  const seen = new Set([door.x + ',' + door.y])
  const queue = [[door.x, door.y]]
  while (queue.length) {
    const [x, y] = queue.shift()
    for (const d of Object.values(DIRS)) {
      const nx = x + d.dx, ny = y + d.dy
      const k = nx + ',' + ny
      if (seen.has(k) || tileAt(level, nx, ny) !== FLOOR) continue
      seen.add(k)
      if (!bombAt(s, nx, ny)) return { x: nx, y: ny, state: 'closed', result: null, dismissed: false }
      queue.push([nx, ny])
    }
  }
  return { x: door.x, y: door.y, state: 'closed', result: null, dismissed: false }
}

export function update(s, controls, dt) {
  s.time += dt
  if (isPaused(s)) { controls.takeBomb(); return } // baú abrindo: o mundo espera
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
      if (d.dx) moveAxis(s, p, 'x', 'y', d.dx, p.speed * dt)
      else moveAxis(s, p, 'y', 'x', d.dy, p.speed * dt)
      p.facing = dir
      if (dir === 'left') p.flip = true // a arte fica espelhada indo pra esquerda
      else if (dir === 'right') p.flip = false
      p.moving = p.x !== bx || p.y !== by
      if (p.moving) p.walkT += dt
    }
    if (controls.takeBomb()) {
      const x = Math.round(p.x), y = Math.round(p.y)
      if (s.bombs.length < p.maxBombs && !bombAt(s, x, y) && tileAt(s.level, x, y) === FLOOR) {
        s.bombs.push({ x, y, timer: FUSE_TIME, range: p.range, passable: true })
        s.events.push({ type: 'bombPlaced', x, y })
      }
    }
  } else {
    controls.takeBomb() // ignora bomba apertada depois de morrer
  }

  // a bomba solta embaixo do jogador vira obstáculo assim que ele sai de cima dela
  for (const b of s.bombs) {
    if (b.passable && (Math.abs(p.x - b.x) >= 1 || Math.abs(p.y - b.y) >= 1)) b.passable = false
  }

  // --- inimigos
  for (const e of s.enemies) updateEnemy(s, e, dt)

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
      for (const pu of s.powerups) if (pu.x === b.x && pu.y === b.y) pu.revealed = true
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
    e.hp--
    s.events.push({ type: 'enemyHit', x: e.x, y: e.y, killed: e.hp <= 0 })
    if (e.hp <= 0) e.alive = false
    else { e.hurtT = 1; e.angry = true } // pisca um segundo sem levar dano e fica bravo
  }

  if (p.alive) {
    const px = Math.round(p.x), py = Math.round(p.y)
    // fogo ou encostar num inimigo = morte
    if (flameAt(s, px, py)) killPlayer(s)
    else if (s.enemies.some((e) => e.alive && Math.abs(e.x - p.x) < 0.6 && Math.abs(e.y - p.y) < 0.6)) killPlayer(s)
    else if (s.boss?.alive && bossTouchesPlayer(s.boss, p)) killPlayer(s)

    // pega power-up
    for (const pu of s.powerups) {
      if (p.alive && pu.revealed && !pu.taken && pu.x === px && pu.y === py) {
        pu.taken = true
        applyPowerup(p, pu.kind)
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
