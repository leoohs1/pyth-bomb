// Desenho do Pyth Dash no <canvas>. Blocos, moedas, bugs e bandeira são desenhados por código em pixel art
// (provisório: depois a arte de verdade entra no lugar). Os heróis são os pixels do Solo/PVP (vista de lado).
import { ROWS, FLOOR } from './levels.js'
import { P, ENEMY_SIZE } from './engine.js'

export const ART = 32 // pixels de arte por casa (o herói tem ~53 px de altura: ~1,65 casa)

// ---- folha de blocos desenhada uma vez (32x32 cada)
const C = {
  turf: '#a77bff', turfHi: '#d2b8ff', turfDk: '#6b3fc4', dirt: '#2b1752', dirtDot: '#3d2370', dirtBit: '#5a3a9a',
  brick: '#5b34b0', brickHi: '#7d55d6', mortar: '#2a1660',
  gold: '#f4c542', goldHi: '#ffe58a', goldDk: '#b8860b', gem: '#9b4dff', gemHi: '#e0c2ff',
  used: '#6b5a7e', usedDk: '#3e3350',
  green: '#22c55e', greenHi: '#86efac', greenDk: '#15803d', red: '#ef4444', redHi: '#fca5a5', redDk: '#b91c1c',
  outline: '#140a26',
}
let sheet = null
function makeSheet() {
  // velas: 2 casas de largura, então cada uma tem a metade esquerda (L) e a direita (R)
  const kinds = ['#', '^', 'b', '?', 'u', 'gL', 'gR', 'GL', 'GR', 'rL', 'rR', 'RL', 'RR']
  const cv = document.createElement('canvas')
  cv.width = ART * kinds.length; cv.height = ART
  const x = cv.getContext('2d')
  const px = (ox, a, b, w, h, c) => { x.fillStyle = c; x.fillRect(ox + a, b, w, h) }
  kinds.forEach((k, i) => {
    const o = i * ART
    if (k === '#' || k === '^') {
      // chão: terra escura com "bits" (0/1) + grama roxa por cima ('^' = chão com grama, '#' = só terra)
      px(o, 0, 0, 32, 32, C.dirt)
      for (let yy = 4; yy < 32; yy += 7) for (let xx = (yy * 3) % 8; xx < 32; xx += 9) px(o, xx, yy, 2, 2, (xx + yy) % 3 ? C.dirtDot : C.dirtBit)
      if (k === '^') {
        px(o, 0, 0, 32, 7, C.turf); px(o, 0, 0, 32, 2, C.turfHi); px(o, 0, 7, 32, 2, C.turfDk)
        for (let xx = 2; xx < 32; xx += 6) px(o, xx, 9, 2, 2, C.turfDk)
      }
    } else if (k === 'b') {
      // bloco de dados: tijolo roxo
      px(o, 0, 0, 32, 32, C.mortar)
      const rows = [[0, 0, 15], [16, 0, 16], [-8, 9, 15], [8, 9, 15], [24, 9, 8], [0, 18, 15], [16, 18, 16], [-8, 27, 15], [8, 27, 15], [24, 27, 8]]
      for (const [bx, by, bw] of rows) {
        const sx = Math.max(0, bx), ex = Math.min(32, bx + bw)
        px(o, sx, by + 1, ex - sx, 7, C.brick); px(o, sx, by + 1, ex - sx, 2, C.brickHi)
      }
    } else if (k === '?' || k === 'u') {
      // bloco oráculo: dourado com a pedra roxa (usado: apagado)
      const used = k === 'u'
      px(o, 0, 0, 32, 32, C.outline)
      px(o, 1, 1, 30, 30, used ? C.usedDk : C.goldDk)
      px(o, 2, 2, 28, 27, used ? C.used : C.gold)
      if (!used) { px(o, 2, 2, 28, 3, C.goldHi); px(o, 2, 2, 3, 27, C.goldHi) }
      for (const [a, b] of [[4, 4], [26, 4], [4, 25], [26, 25]]) px(o, a, b, 2, 2, used ? C.usedDk : C.goldDk)
      if (!used) {
        // pedra (losango) no meio
        for (let r = 0; r < 12; r++) { const w = r < 6 ? 2 + r * 2 : 2 + (11 - r) * 2; px(o, 16 - w / 2, 10 + r, w, 1, C.gem) }
        px(o, 13, 12, 3, 3, C.gemHi)
      }
    } else {
      // velas do gráfico de preço (verde = subiu, vermelha = caiu); maiúscula = topo com borda
      const up = k[0] === 'g' || k[0] === 'G', top = k[0] === 'G' || k[0] === 'R', left = k[1] === 'L'
      const base = up ? C.green : C.red, hi = up ? C.greenHi : C.redHi, dk = up ? C.greenDk : C.redDk
      px(o, 0, 0, 32, 32, base)
      if (left) { px(o, 0, 0, 3, 32, C.outline); px(o, 6, 0, 6, 32, hi) } else { px(o, 29, 0, 3, 32, C.outline); px(o, 18, 0, 8, 32, dk) }
      if (top) { px(o, 0, 0, 32, 3, C.outline); px(o, left ? 3 : 0, 3, left ? 29 : 29, 3, hi) }
    }
  })
  const index = Object.fromEntries(kinds.map((k, i) => [k, i]))
  return { cv, index }
}

// ---- heróis (vista de lado: os 2 passos pra direita/esquerda do Solo em pixel)
const heroes = {}
function img(src) { const i = new Image(); i.src = src; return i }
export function loadHero(id) {
  if (heroes[id]) return heroes[id]
  const f = (n) => img(`/solo/pixel/${id}${n}.png`)
  heroes[id] = { right: [f('-right1'), f('-right2')], left: [f('-left1'), f('-left2')], front: f('') }
  return heroes[id]
}
const ready = (i) => i && i.complete && i.naturalWidth > 0

// ---- fundo: céu roxo + gráfico de velas ao longe (parallax) + linha de preço brilhando
function hash(n) { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s) }
function drawBackground(ctx, w, h, camX, ppt) {
  const g = ctx.createLinearGradient(0, 0, 0, h)
  g.addColorStop(0, '#120726'); g.addColorStop(0.55, '#2a1157'); g.addColorStop(1, '#3b1a6e')
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h)
  // estrelinhas
  ctx.fillStyle = 'rgba(255,255,255,0.55)'
  for (let i = 0; i < 70; i++) {
    const sx = ((hash(i) * 2000 - camX * ppt * 0.05) % w + w) % w, sy = hash(i + 99) * h * 0.55
    ctx.fillRect(Math.round(sx), Math.round(sy), hash(i + 7) > 0.8 ? 2 : 1, hash(i + 7) > 0.8 ? 2 : 1)
  }
  // duas camadas de velas
  for (const [par, alpha, scale] of [[0.15, 0.22, 0.8], [0.35, 0.35, 1.1]]) {
    const cw = ppt * 0.9 * scale
    const off = camX * ppt * par
    const first = Math.floor(off / (cw * 1.6)) - 1
    let level = 0
    for (let i = first; i < first + Math.ceil(w / (cw * 1.6)) + 3; i++) {
      level = Math.sin(i * 0.37) * 2.2 + Math.sin(i * 0.11) * 3
      const bodyH = (0.8 + hash(i * 3.3) * 2.2) * ppt * scale
      const up = hash(i * 1.7) > 0.45
      const x = i * cw * 1.6 - off
      const y = h * 0.62 - level * ppt * 0.35 * scale - bodyH
      ctx.globalAlpha = alpha
      ctx.fillStyle = up ? '#22c55e' : '#ef4444'
      ctx.fillRect(Math.round(x + cw / 2 - 1), Math.round(y - bodyH * 0.35), 2, Math.round(bodyH * 1.7)) // pavio
      ctx.fillRect(Math.round(x), Math.round(y), Math.round(cw), Math.round(bodyH))
    }
    ctx.globalAlpha = 1
  }
}

function drawCoin(ctx, x, y, t, ppt, phase = 0) {
  const s = Math.abs(Math.cos(t * 3 + phase)) // gira como moeda
  const cx = (x + 0.5) * ppt, cy = (y + 0.5 + Math.sin(t * 4 + phase) * 0.05) * ppt
  const r = ppt * 0.3
  ctx.fillStyle = '#140a26'
  ctx.beginPath(); ctx.ellipse(cx, cy, Math.max(1.5, r * s) + 1.5, r + 1.5, 0, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#f4c542'
  ctx.beginPath(); ctx.ellipse(cx, cy, Math.max(1, r * s), r, 0, 0, Math.PI * 2); ctx.fill()
  if (s > 0.35) {
    ctx.fillStyle = '#9b4dff'
    ctx.fillRect(Math.round(cx - r * s * 0.25), Math.round(cy - r * 0.5), Math.max(1, Math.round(r * s * 0.5)), Math.round(r))
  }
}

// lag bug: bolinha escura com ampulheta, olhos brancos (achatado quando pisam)
function drawEnemy(ctx, e, t, ppt) {
  const { w, h } = ENEMY_SIZE
  const squash = !e.alive ? Math.min(1, e.squashT * 6) : 0
  if (!e.alive && e.squashT > 0.5) return
  const cx = (e.x + w / 2) * ppt, by = (e.y + h) * ppt
  const bw = w * ppt * (1 + squash * 0.25), bh = h * ppt * (1 - squash * 0.7)
  const wob = e.alive ? Math.sin(t * 12 + e.x) * ppt * 0.03 : 0
  ctx.save()
  ctx.fillStyle = 'rgba(0,0,0,0.3)'
  ctx.beginPath(); ctx.ellipse(cx, by, bw * 0.45, ppt * 0.07, 0, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#140a26'
  ctx.beginPath(); ctx.ellipse(cx, by - bh / 2 + wob, bw / 2 + 2, bh / 2 + 2, 0, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#e04a7a'
  ctx.beginPath(); ctx.ellipse(cx, by - bh / 2 + wob, bw / 2, bh / 2, 0, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#ff8fb5'
  ctx.beginPath(); ctx.ellipse(cx - bw * 0.15, by - bh * 0.7 + wob, bw * 0.18, bh * 0.12, 0, 0, Math.PI * 2); ctx.fill()
  if (squash < 0.5) {
    // olhos (olham pra onde anda)
    const look = Math.sign(e.vx) * bw * 0.06
    for (const dx of [-0.17, 0.17]) {
      ctx.fillStyle = '#fff'
      ctx.beginPath(); ctx.arc(cx + dx * bw + look, by - bh * 0.6 + wob, bw * 0.12, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#140a26'
      ctx.beginPath(); ctx.arc(cx + dx * bw + look * 2, by - bh * 0.6 + wob, bw * 0.06, 0, Math.PI * 2); ctx.fill()
    }
    // ampulheta (o "lag") na barriga
    ctx.fillStyle = '#ffe58a'
    const hx = cx, hy = by - bh * 0.28 + wob, s = bw * 0.1
    ctx.beginPath(); ctx.moveTo(hx - s, hy - s); ctx.lineTo(hx + s, hy - s); ctx.lineTo(hx - s, hy + s); ctx.lineTo(hx + s, hy + s); ctx.closePath(); ctx.fill()
  }
  // pezinhos
  if (e.alive) {
    const step = Math.sin(t * 14 + e.x) > 0 ? 1 : -1
    ctx.fillStyle = '#140a26'
    ctx.fillRect(Math.round(cx - bw * 0.3), Math.round(by - ppt * 0.08 + step), Math.round(bw * 0.2), Math.round(ppt * 0.08))
    ctx.fillRect(Math.round(cx + bw * 0.1), Math.round(by - ppt * 0.08 - step), Math.round(bw * 0.2), Math.round(ppt * 0.08))
  }
  ctx.restore()
}

function drawFlag(ctx, fx, t, ppt, won) {
  const x = (fx + 0.5) * ppt
  const topY = (FLOOR - 9) * ppt, baseY = FLOOR * ppt
  ctx.fillStyle = '#140a26'; ctx.fillRect(Math.round(x - 3), topY, 6, baseY - topY)
  ctx.fillStyle = '#e8e0ff'; ctx.fillRect(Math.round(x - 1.5), topY, 3, baseY - topY)
  ctx.fillStyle = '#f4c542'; ctx.beginPath(); ctx.arc(x, topY, ppt * 0.2, 0, Math.PI * 2); ctx.fill()
  // bandeira roxa tremulando (desce quando chega)
  const fy = topY + ppt * 0.3 + (won ? Math.min(1, t) * ppt * 6.5 : 0)
  ctx.fillStyle = '#7c3aed'
  ctx.beginPath(); ctx.moveTo(x + 2, fy)
  for (let i = 0; i <= 8; i++) ctx.lineTo(x + 2 + i * ppt * 0.2, fy + Math.sin(t * 6 + i * 0.8) * ppt * 0.06)
  ctx.lineTo(x + 2, fy + ppt * 1.1); ctx.closePath(); ctx.fill()
  ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.round(ppt * 0.6)}px "Press Start 2P", monospace`
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText('P', x + ppt * 0.75, fy + ppt * 0.55)
  // base de pedra
  ctx.fillStyle = '#5b34b0'; ctx.fillRect(Math.round(x - ppt * 0.5), baseY - ppt * 0.4, ppt, ppt * 0.4)
}

function drawCheckpoint(ctx, cp, reached, t, ppt) {
  const x = (cp.x + 0.5) * ppt, baseY = FLOOR * ppt
  ctx.fillStyle = '#140a26'; ctx.fillRect(Math.round(x - 2), baseY - ppt * 2.2, 4, ppt * 2.2)
  ctx.fillStyle = reached ? '#22c55e' : '#6b5a7e'
  const y = baseY - ppt * 2.2
  ctx.beginPath(); ctx.moveTo(x + 2, y); ctx.lineTo(x + 2 + ppt * 0.8, y + ppt * 0.3 + Math.sin(t * 5) * 2); ctx.lineTo(x + 2, y + ppt * 0.6); ctx.closePath(); ctx.fill()
}

function drawHero(ctx, g, heroId, ppt) {
  const p = g.player
  const art = loadHero(heroId)
  const side = p.facing >= 0 ? art.right : art.left
  let frame = side[0]
  if (!p.onGround) frame = side[1]
  else if (Math.abs(p.vx) > 0.2) frame = side[Math.floor(p.walkT * 9) % 2]
  if (!ready(frame)) frame = art.front
  const feetX = (p.x + P.w / 2) * ppt, feetY = (p.y + P.h) * ppt
  ctx.save()
  // sombra no chão
  if (p.onGround) { ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(feetX, feetY, ppt * 0.35, ppt * 0.08, 0, 0, Math.PI * 2); ctx.fill() }
  if (g.status === 'dying') ctx.globalAlpha = Math.sin(g.statusT * 30) > 0 ? 1 : 0.6
  if (ready(frame)) {
    const w = (frame.naturalWidth / ART) * ppt, h = (frame.naturalHeight / ART) * ppt
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(frame, Math.round(feetX - w / 2), Math.round(feetY - h), Math.round(w), Math.round(h))
  } else {
    ctx.fillStyle = '#a77bff'; ctx.fillRect(p.x * ppt, p.y * ppt, P.w * ppt, P.h * ppt)
  }
  ctx.restore()
}

// câmera: segue o herói um pouco à frente; as pontas da fase seguram
export function cameraX(g, viewW) {
  const p = g.player
  const want = p.x + P.w / 2 - viewW * 0.4
  return Math.max(0, Math.min(g.cols - viewW, want))
}

// desenha tudo. w/h = tamanho do canvas em pixels; heroId = herói escolhido; cam = estado da câmera (suavizada)
export function drawGame(ctx, g, w, h, heroId, cam) {
  if (!sheet) sheet = makeSheet()
  const ppt = h / ROWS // pixels por casa (a fase sempre cabe na altura)
  const viewW = w / ppt
  const target = cameraX(g, viewW)
  cam.x = cam.x == null ? target : cam.x + (target - cam.x) * 0.2
  const camX = Math.max(0, Math.min(g.cols - viewW, cam.x))
  ctx.imageSmoothingEnabled = false
  drawBackground(ctx, w, h, camX, ppt)

  ctx.save()
  ctx.translate(-Math.round(camX * ppt), 0)
  const x0 = Math.max(0, Math.floor(camX) - 1), x1 = Math.min(g.cols - 1, Math.ceil(camX + viewW) + 1)

  // checkpoint e bandeira atrás dos blocos
  if (g.level.checkpoint) drawCheckpoint(ctx, g.level.checkpoint, !!g.checkpoint, g.time, ppt)
  drawFlag(ctx, g.level.flag, g.status === 'won' ? g.statusT : g.time, ppt, g.status === 'won')

  // blocos
  const size = Math.ceil(ppt)
  for (let ty = 0; ty < ROWS; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      let k = g.tiles[ty][tx]
      if (k === '.') continue
      if (k === '#' && (ty === 0 || g.tiles[ty - 1][tx] !== '#')) k = '^' // chão com grama em cima
      if ('gGrR'.includes(k)) {
        // metade esquerda ou direita da vela (a vela começa onde o vizinho da esquerda não é vela da mesma cor)
        const fam = k.toLowerCase(), prev = (g.tiles[ty][tx - 1] ?? '.').toLowerCase()
        let run = 0; for (let i = tx - 1; i >= 0 && (g.tiles[ty][i] ?? '.').toLowerCase() === fam; i--) run++
        k += run % 2 === 0 ? 'L' : 'R'
        if (prev !== fam && k.endsWith('R')) k = k.slice(0, 1) + 'L'
        // pavio em cima do topo
        if ((k[0] === 'G' || k[0] === 'R') && k[1] === 'L') {
          ctx.fillStyle = '#140a26'; ctx.fillRect(Math.floor((tx + 1) * ppt - ppt * 0.08), Math.floor((ty - 0.7) * ppt), Math.ceil(ppt * 0.16), Math.ceil(ppt * 0.7))
          ctx.fillStyle = k[0] === 'G' ? C.greenHi : C.redHi; ctx.fillRect(Math.floor((tx + 1) * ppt - ppt * 0.04), Math.floor((ty - 0.65) * ppt), Math.ceil(ppt * 0.08), Math.ceil(ppt * 0.65))
        }
      }
      const bump = g.bumps.find((b) => b.x === tx && b.y === ty)
      const dy = bump ? -Math.sin((bump.t / 0.2) * Math.PI) * ppt * 0.25 : 0
      ctx.drawImage(sheet.cv, sheet.index[k] * ART, 0, ART, ART, Math.floor(tx * ppt), Math.floor(ty * ppt + dy), size, size)
    }
  }

  // moedas (as soltas e as que saem dos oráculos)
  for (const c of g.coins) if (!c.taken && c.x >= x0 - 1 && c.x <= x1 + 1) drawCoin(ctx, c.x, c.y, g.time, ppt, c.x * 0.7)
  for (const c of g.popped) {
    ctx.globalAlpha = 1 - c.t / 0.6
    drawCoin(ctx, c.x, c.y - Math.sin((c.t / 0.6) * Math.PI) * 1.5, c.t * 4, ppt)
    ctx.globalAlpha = 1
  }
  for (const e of g.enemies) if (e.x >= x0 - 2 && e.x <= x1 + 2) drawEnemy(ctx, e, g.time, ppt)
  drawHero(ctx, g, heroId, ppt)
  ctx.restore()
}
