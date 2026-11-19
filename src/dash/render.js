// Desenho do Pyth Dash no <canvas>. Blocos, moedas, bugs e bandeira são desenhados por código em pixel art
// (provisório: depois a arte de verdade entra no lugar). Os heróis são os pixels do Solo/PVP (vista de lado).
import { ROWS, FLOOR } from './levels.js'
import { P, ENEMY_SIZE, freshLeft, staleWarn, windState, BOSS } from './engine.js'

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
  const kinds = ['#', '^', 'b', '?', 'u', 'gL', 'gR', 'GL', 'GR', 'rL', 'rR', 'RL', 'RR', 'p']
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
    } else if (k === 'p') {
      // bloco aceso por um Price Relay: roxo claro com linhas de dados brilhando
      px(o, 0, 0, 32, 32, C.outline)
      px(o, 1, 1, 30, 30, '#7c3aed'); px(o, 1, 1, 30, 3, '#c4a6ff'); px(o, 1, 27, 30, 4, '#4c1d95')
      for (const yy of [9, 16, 22]) px(o, 4, yy, 24, 2, '#a78bfa')
      for (const [a, b] of [[6, 9], [18, 16], [11, 22], [24, 9]]) px(o, a, b, 3, 2, '#f5f3ff')
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

// ---- arte de verdade (public/dash/art, recortada por scripts/dash-art.py das folhas do ChatGPT).
// Enquanto uma imagem não carrega (ou se não existir), o jogo usa o desenho por código de antes.
const ART_NAMES = ['tile-grass', 'tile-soil', 'tile-brick', 'tile-oracle', 'tile-used', 'tile-powered', 'bug-walk1', 'bug-walk2', 'bug-squash',
  'publisher-off', 'publisher-on', 'relay-off', 'relay-on', 'beacon-off', 'beacon-on', 'chest-closed', 'chest-opening', 'chest-open',
  'checkpoint-off', 'checkpoint-on', 'gem', 'gem-sparkle', 'coin-1', 'coin-2', 'coin-3', 'coin-4', 'power-shield', 'power-lazer', 'bg-far', 'bg-near', 'bg2-far', 'bg2-near', 'harpy-1', 'harpy-2', 'harpy-dead', 'lift']
const HERO_SHEETS = ['pirb'] // heróis que já têm a folha de lado (parado, corrida 1-4, pulo, queda, dano, comemora)
const APX = 64 // pixels de arte por casa
const art = {}
export function loadArt() {
  for (const n of ART_NAMES) if (!art[n]) art[n] = img(`/dash/art/${n}.png`)
  for (const id of HERO_SHEETS) if (!art[`hero-${id}`]) art[`hero-${id}`] = img(`/dash/art/hero-${id}.png`)
}
const A = (n) => (ready(art[n]) ? art[n] : null)
const TILE_ART = { '^': 'tile-grass', '#': 'tile-soil', b: 'tile-brick', '?': 'tile-oracle', u: 'tile-used', p: 'tile-powered' }
// desenha a imagem com o meio de baixo em (cx, by) (em casas)
function sprite(ctx, im, cx, by, ppt, flip = false) {
  const w = (im.naturalWidth / APX) * ppt, h = (im.naturalHeight / APX) * ppt
  ctx.imageSmoothingEnabled = false
  if (!flip) { ctx.drawImage(im, Math.round(cx * ppt - w / 2), Math.round(by * ppt - h), Math.round(w), Math.round(h)); return }
  ctx.save(); ctx.translate(Math.round(cx * ppt), 0); ctx.scale(-1, 1)
  ctx.drawImage(im, Math.round(-w / 2), Math.round(by * ppt - h), Math.round(w), Math.round(h)); ctx.restore()
}

// ---- fundo: céu roxo + gráfico de velas ao longe (parallax) + linha de preço brilhando
function hash(n) { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s) }
function drawBackground(ctx, w, h, camX, ppt, theme) {
  // Grécia: céu bem longe + morros mais perto. Cada fase tem o seu par (fase 2 = bg2-*); sem ele, usa o de Delfos
  const pre = theme === 'parnassus' && A('bg2-far') ? 'bg2' : theme === 'styx' && A('bg3-far') ? 'bg3' : 'bg'
  const far = A(`${pre}-far`), near = A(`${pre}-near`)
  if (far) {
    const fw = far.naturalWidth * (h / far.naturalHeight)
    const off = (camX * ppt * 0.08) % fw
    for (let x = -off; x < w; x += fw) ctx.drawImage(far, Math.floor(x), 0, Math.ceil(fw) + 1, h)
    if (near) {
      const nh = ppt * 4.4, nw = near.naturalWidth * (nh / near.naturalHeight)
      const noff = (camX * ppt * 0.3) % nw
      ctx.imageSmoothingEnabled = false
      for (let x = -noff; x < w; x += nw) ctx.drawImage(near, Math.floor(x), Math.round(FLOOR * ppt - nh + ppt * 0.5), Math.ceil(nw) + 1, Math.round(nh))
    }
    return
  }
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
  const fr = A(`coin-${(Math.floor(t * 8 + phase * 3) % 4 + 4) % 4 + 1}`)
  if (fr) { sprite(ctx, fr, x + 0.5, y + 0.81 + Math.sin(t * 4 + phase) * 0.05, ppt); return }
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
  if (A('bug-walk1')) {
    if (!e.alive && e.squashT > 0.5) return
    const fr = !e.alive ? A('bug-squash') : A(Math.sin(t * 12 + e.x) > 0 ? 'bug-walk1' : 'bug-walk2')
    if (fr) { sprite(ctx, fr, e.x + w / 2, e.y + h + 0.04, ppt, e.vx > 0); return } // a arte olha pra esquerda
  }
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

// ---- Oracle Beacon (o fim da fase): torre com o cristal roxo. Acende quando o preço é entregue.
function drawBeacon(ctx, fx, t, ppt, won, wonT) {
  const x = (fx + 0.5) * ppt, baseY = FLOOR * ppt, topY = (FLOOR - 8) * ppt
  const bOff = A('beacon-off'), bOn = A('beacon-on')
  if (bOff && bOn) {
    const lit = won ? Math.min(1, wonT * 1.5) : 0
    const cy = (FLOOR - 8.6 + 0.9) * ppt
    if (lit > 0) {
      for (let i = 0; i < 3; i++) {
        ctx.strokeStyle = `rgba(196,166,255,${0.7 * lit})`; ctx.lineWidth = Math.max(2, ppt * 0.12)
        ctx.beginPath(); ctx.moveTo(x - ppt * (14 - i * 4), (1 + i * 1.5) * ppt); ctx.lineTo(x, cy); ctx.stroke()
      }
      ctx.strokeStyle = `rgba(167,123,255,${Math.max(0, 0.8 - wonT * 0.35)})`; ctx.lineWidth = ppt * 0.3
      ctx.beginPath(); ctx.arc(x, cy, wonT * ppt * 9, 0, Math.PI * 2); ctx.stroke()
    }
    sprite(ctx, lit > 0.5 ? bOn : bOff, fx + 0.5, FLOOR, ppt)
    return
  }
  // torre
  ctx.fillStyle = '#140a26'; ctx.fillRect(Math.round(x - ppt * 0.42), topY + ppt, Math.round(ppt * 0.84), baseY - topY - ppt)
  ctx.fillStyle = '#3b1a6e'; ctx.fillRect(Math.round(x - ppt * 0.32), topY + ppt, Math.round(ppt * 0.64), baseY - topY - ppt)
  ctx.fillStyle = '#5b34b0'
  for (let yy = topY + ppt * 1.6; yy < baseY - ppt * 0.5; yy += ppt * 0.9) ctx.fillRect(Math.round(x - ppt * 0.32), Math.round(yy), Math.round(ppt * 0.64), 3)
  // base
  ctx.fillStyle = '#140a26'; ctx.fillRect(Math.round(x - ppt * 0.9), baseY - ppt * 0.55, Math.round(ppt * 1.8), ppt * 0.55)
  ctx.fillStyle = '#5b34b0'; ctx.fillRect(Math.round(x - ppt * 0.8), baseY - ppt * 0.47, Math.round(ppt * 1.6), ppt * 0.47)
  // cristal
  const lit = won ? Math.min(1, wonT * 1.5) : 0
  const cy = topY + ppt * 0.4 + Math.sin(t * 2) * ppt * 0.08
  if (lit > 0) {
    // os 3 sinais dos Publishers chegando e a onda roxa saindo
    for (let i = 0; i < 3; i++) {
      ctx.strokeStyle = `rgba(196,166,255,${0.7 * lit})`; ctx.lineWidth = Math.max(2, ppt * 0.12)
      ctx.beginPath(); ctx.moveTo(x - ppt * (14 - i * 4), (1 + i * 1.5) * ppt); ctx.lineTo(x, cy); ctx.stroke()
    }
    const r = wonT * ppt * 9
    ctx.strokeStyle = `rgba(167,123,255,${Math.max(0, 0.8 - wonT * 0.35)})`; ctx.lineWidth = ppt * 0.3
    ctx.beginPath(); ctx.arc(x, cy, r, 0, Math.PI * 2); ctx.stroke()
    const glow = ctx.createRadialGradient(x, cy, 0, x, cy, ppt * 2.2)
    glow.addColorStop(0, `rgba(216,190,255,${0.85 * lit})`); glow.addColorStop(1, 'rgba(124,58,237,0)')
    ctx.fillStyle = glow; ctx.fillRect(x - ppt * 2.2, cy - ppt * 2.2, ppt * 4.4, ppt * 4.4)
  }
  const s = ppt * 0.7
  ctx.fillStyle = '#140a26'
  ctx.beginPath(); ctx.moveTo(x, cy - s - 3); ctx.lineTo(x + s * 0.7 + 3, cy); ctx.lineTo(x, cy + s + 3); ctx.lineTo(x - s * 0.7 - 3, cy); ctx.closePath(); ctx.fill()
  ctx.fillStyle = lit > 0 ? '#c4a6ff' : '#7c3aed'
  ctx.beginPath(); ctx.moveTo(x, cy - s); ctx.lineTo(x + s * 0.7, cy); ctx.lineTo(x, cy + s); ctx.lineTo(x - s * 0.7, cy); ctx.closePath(); ctx.fill()
  ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.round(ppt * 0.5)}px "Press Start 2P", monospace`
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText('P', x + 1, cy + 1)
}

// ---- Publisher: antena com prato. Apagada = cinza; ligada = roxa mandando sinal
function drawPublisher(ctx, pb, t, ppt) {
  const x = (pb.x + 0.5) * ppt, baseY = (pb.y ?? FLOOR) * ppt, h = ppt * 4.2
  const on = pb.on
  const pa = A(on ? 'publisher-on' : 'publisher-off')
  if (pa) {
    sprite(ctx, pa, pb.x + 0.5, pb.y ?? FLOOR, ppt)
    if (on && pb.t < 2.2) {
      ctx.globalAlpha = Math.max(0, 1 - pb.t / 2.2)
      ctx.fillStyle = '#f4c542'; ctx.font = `${Math.round(ppt * 0.32)}px "Press Start 2P", monospace`; ctx.textAlign = 'center'
      ctx.fillText('PUBLISHER ONLINE', x, baseY - ppt * (5.8 + pb.t * 0.5))
      ctx.globalAlpha = 1
    }
    return
  }
  ctx.fillStyle = '#140a26'; ctx.fillRect(Math.round(x - ppt * 0.16), baseY - h, Math.round(ppt * 0.32), h)
  ctx.fillStyle = on ? '#a78bfa' : '#5e5670'; ctx.fillRect(Math.round(x - ppt * 0.08), baseY - h, Math.round(ppt * 0.16), h)
  // pernas
  ctx.strokeStyle = '#140a26'; ctx.lineWidth = Math.max(2, ppt * 0.1)
  ctx.beginPath(); ctx.moveTo(x - ppt * 0.6, baseY); ctx.lineTo(x, baseY - h * 0.55); ctx.lineTo(x + ppt * 0.6, baseY); ctx.stroke()
  // prato
  const dy = baseY - h
  ctx.fillStyle = '#140a26'; ctx.beginPath(); ctx.ellipse(x, dy, ppt * 0.62, ppt * 0.3, -0.35, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = on ? '#7c3aed' : '#4a4458'; ctx.beginPath(); ctx.ellipse(x, dy, ppt * 0.52, ppt * 0.22, -0.35, 0, Math.PI * 2); ctx.fill()
  // luz na ponta
  ctx.fillStyle = on ? '#f5f3ff' : '#2b2733'; ctx.beginPath(); ctx.arc(x + ppt * 0.1, dy - ppt * 0.35, ppt * 0.13, 0, Math.PI * 2); ctx.fill()
  if (on) {
    // ondas de sinal
    for (let i = 0; i < 3; i++) {
      const k = ((t * 0.9 + i / 3) % 1)
      ctx.strokeStyle = `rgba(196,166,255,${1 - k})`; ctx.lineWidth = Math.max(1.5, ppt * 0.07)
      ctx.beginPath(); ctx.arc(x + ppt * 0.1, dy - ppt * 0.35, ppt * (0.3 + k * 1.6), -Math.PI * 0.85, -Math.PI * 0.15); ctx.stroke()
    }
    // "PUBLISHER ONLINE" sobe e some no começo
    if (pb.t < 2.2) {
      ctx.globalAlpha = Math.max(0, 1 - pb.t / 2.2)
      ctx.fillStyle = '#f4c542'; ctx.font = `${Math.round(ppt * 0.32)}px "Press Start 2P", monospace`; ctx.textAlign = 'center'
      ctx.fillText('PUBLISHER ONLINE', x, dy - ppt * (1.1 + pb.t * 0.5))
      ctx.globalAlpha = 1
    }
  }
}

// ---- Price Relay: postinho com a bolinha; apagado = cinza, aceso = roxo (com o anel do tempo se for "fresh")
function drawRelay(ctx, g, r, t, ppt) {
  const x = (r.x + 0.5) * ppt, baseY = r.y * ppt
  const ra = A(r.on ? 'relay-on' : 'relay-off')
  if (ra) {
    sprite(ctx, ra, r.x + 0.5, r.y, ppt)
    const oy = baseY - ppt * 1.75
    if (!r.on) {
      if (Math.sin(t * 5) > 0) { ctx.fillStyle = '#f4c542'; ctx.font = `${Math.round(ppt * 0.4)}px "Press Start 2P", monospace`; ctx.textAlign = 'center'; ctx.fillText('\u25BC', x, oy - ppt * 0.75) }
      return
    }
    const left = freshLeft(g, r.group)
    if (left != null) {
      ctx.strokeStyle = '#f4c542'; ctx.lineWidth = Math.max(2, ppt * 0.1)
      ctx.beginPath(); ctx.arc(x, oy, ppt * 0.55, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * left); ctx.stroke()
    }
    return
  }
  ctx.fillStyle = '#140a26'; ctx.fillRect(Math.round(x - ppt * 0.38), baseY - ppt * 0.3, Math.round(ppt * 0.76), ppt * 0.3)
  ctx.fillRect(Math.round(x - ppt * 0.12), baseY - ppt * 1.5, Math.round(ppt * 0.24), ppt * 1.3)
  ctx.fillStyle = r.on ? '#a78bfa' : '#6b6380'; ctx.fillRect(Math.round(x - ppt * 0.05), baseY - ppt * 1.5, Math.round(ppt * 0.1), ppt * 1.3)
  const oy = baseY - ppt * 1.75
  const pulse = r.on ? 1 + Math.sin(t * 8) * 0.08 : 1
  ctx.fillStyle = '#140a26'; ctx.beginPath(); ctx.arc(x, oy, ppt * 0.36 * pulse, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = r.on ? '#c4a6ff' : '#8a8299'; ctx.beginPath(); ctx.arc(x, oy, ppt * 0.28 * pulse, 0, Math.PI * 2); ctx.fill()
  if (!r.on) {
    // seta piscando: "encosta aqui"
    if (Math.sin(t * 5) > 0) { ctx.fillStyle = '#f4c542'; ctx.font = `${Math.round(ppt * 0.4)}px "Press Start 2P", monospace`; ctx.textAlign = 'center'; ctx.fillText('▼', x, oy - ppt * 0.6) }
    return
  }
  const left = freshLeft(g, r.group)
  if (left != null) {
    ctx.strokeStyle = '#f4c542'; ctx.lineWidth = Math.max(2, ppt * 0.1)
    ctx.beginPath(); ctx.arc(x, oy, ppt * 0.48, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * left); ctx.stroke()
  }
}

// ---- polia de mármore (plataforma que anda): laje lilás com friso dourado; as que sobem/descem têm cordas
function drawMover(ctx, g, m, t, ppt) {
  const x = m.x * ppt, y = m.y * ppt, w = m.w * ppt, h = ppt * 0.5
  const idle = m.group && !g.groupOn[m.group]
  if (m.dy) {
    ctx.strokeStyle = '#140a26'; ctx.lineWidth = Math.max(2, ppt * 0.07)
    for (const cx of [x + ppt * 0.35, x + w - ppt * 0.35]) { ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, y); ctx.stroke() }
    ctx.strokeStyle = '#c9a227'; ctx.lineWidth = Math.max(1, ppt * 0.03)
    for (const cx of [x + ppt * 0.35, x + w - ppt * 0.35]) { ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, y); ctx.stroke() }
  }
  const art = A('lift')
  if (art) { ctx.imageSmoothingEnabled = false; ctx.drawImage(art, Math.round(x), Math.round(y - ppt * 0.04), Math.round(w), Math.round(w * art.naturalHeight / art.naturalWidth)); if (idle) { ctx.fillStyle = 'rgba(60,50,80,0.45)'; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(w * art.naturalHeight / art.naturalWidth)) } }
  else {
    ctx.fillStyle = '#140a26'; ctx.fillRect(Math.round(x - 2), Math.round(y - 2), Math.round(w + 4), Math.round(h + 4))
    ctx.fillStyle = idle ? '#8a8299' : '#d9cdf2'; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h))
    ctx.fillStyle = idle ? '#6b6380' : '#a78bfa'; ctx.fillRect(Math.round(x), Math.round(y + h * 0.65), Math.round(w), Math.round(h * 0.35))
    ctx.fillStyle = '#f4c542'; ctx.fillRect(Math.round(x), Math.round(y + h * 0.5), Math.round(w), Math.max(2, Math.round(ppt * 0.06)))
    for (let i = 1; i < m.w; i++) { ctx.fillStyle = 'rgba(20,10,38,0.35)'; ctx.fillRect(Math.round(x + i * ppt), Math.round(y), 2, Math.round(h * 0.5)) }
  }
}

// ---- harpia: passarinho roxo de asas batendo (a arte entra no lugar quando existir)
function drawHarpy(ctx, e, t, ppt) {
  const { w, h } = ENEMY_SIZE
  if (!e.alive && e.squashT > 0.5) return
  const flap = Math.sin(t * 16 + e.x) > 0
  const art = A(!e.alive ? 'harpy-dead' : flap ? 'harpy-1' : 'harpy-2')
  if (art) { if (!e.alive) ctx.globalAlpha = Math.max(0, 1 - e.squashT * 2); sprite(ctx, art, e.x + w / 2, e.y + h + 0.15, ppt, e.vx > 0); ctx.globalAlpha = 1; return } // a arte olha pra esquerda
  const cx = (e.x + w / 2) * ppt, cy = (e.y + h / 2) * ppt, dir = e.vx > 0 ? 1 : -1
  ctx.save(); ctx.translate(cx, cy); ctx.scale(dir, 1)
  if (!e.alive) { ctx.globalAlpha = Math.max(0, 1 - e.squashT * 2); ctx.rotate(e.squashT * 6) }
  const wy = flap ? -ppt * 0.55 : ppt * 0.15
  ctx.fillStyle = '#140a26'
  ctx.beginPath(); ctx.moveTo(-ppt * 0.1, -ppt * 0.05); ctx.lineTo(-ppt * 0.75, wy - 3); ctx.lineTo(ppt * 0.15, ppt * 0.05); ctx.fill()
  ctx.fillStyle = '#7c3aed'
  ctx.beginPath(); ctx.moveTo(-ppt * 0.1, -ppt * 0.05); ctx.lineTo(-ppt * 0.7, wy); ctx.lineTo(ppt * 0.1, ppt * 0.05); ctx.fill()
  ctx.fillStyle = '#140a26'; ctx.beginPath(); ctx.ellipse(0, 0, ppt * 0.42, ppt * 0.32, 0, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#a855f7'; ctx.beginPath(); ctx.ellipse(0, 0, ppt * 0.37, ppt * 0.27, 0, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#f5d0fe'; ctx.beginPath(); ctx.arc(ppt * 0.24, -ppt * 0.12, ppt * 0.17, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#140a26'; ctx.beginPath(); ctx.arc(ppt * 0.29, -ppt * 0.14, ppt * 0.05, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#f4c542'; ctx.beginPath(); ctx.moveTo(ppt * 0.38, -ppt * 0.08); ctx.lineTo(ppt * 0.55, -ppt * 0.02); ctx.lineTo(ppt * 0.38, ppt * 0.03); ctx.fill()
  ctx.fillStyle = '#f4c542'; ctx.fillRect(-ppt * 0.08, ppt * 0.25, ppt * 0.06, ppt * 0.14); ctx.fillRect(ppt * 0.08, ppt * 0.25, ppt * 0.06, ppt * 0.14)
  ctx.restore()
}

// ---- vento dos deuses: risquinhos brancos correndo pra onde ele sopra; antes de soprar, aviso piscando
function drawWind(ctx, g, w, ppt, camX, viewW, h) {
  const st = windState(g, w)
  if (!st) return
  const x0 = Math.max(w.x0, camX - 1), x1 = Math.min(w.x1, camX + viewW + 1)
  if (x0 >= x1) return
  const dir = Math.sign(w.force) || -1
  ctx.save()
  if (st === 'warn') {
    if (Math.sin(g.time * 18) > 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.font = `${Math.round(ppt * 0.6)}px "Press Start 2P", monospace`; ctx.textAlign = 'center'
      for (let x = Math.ceil(x0 / 6) * 6; x < x1; x += 6) ctx.fillText(dir < 0 ? '\u00AB' : '\u00BB', x * ppt, ppt * 2)
    }
  } else {
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = Math.max(1.5, ppt * 0.05)
    for (let i = 0; i < 40; i++) {
      const len = (0.8 + hash(i * 7.1) * 1.6) * ppt
      const span = (x1 - x0) * ppt
      const xx = x0 * ppt + (((hash(i) * span + dir * g.time * ppt * 22) % span) + span) % span
      const yy = (1 + hash(i + 3.3) * 10) * ppt
      ctx.beginPath(); ctx.moveTo(xx, yy); ctx.lineTo(xx - dir * len, yy); ctx.stroke()
    }
  }
  ctx.restore()
}

// ---- fase 3: tocha (braseiro de pedra com chama violeta), sombra, Talos, portão e o escuro

function drawTorch(ctx, tc, t, ppt) {
  const art = A(Math.sin(t * 9 + tc.x) > 0 ? 'torch-1' : 'torch-2')
  if (art) { sprite(ctx, art, tc.x + 0.5, tc.y, ppt); return }
  const x = (tc.x + 0.5) * ppt, by = tc.y * ppt
  ctx.fillStyle = '#140a26'; ctx.fillRect(Math.round(x - ppt * 0.2), Math.round(by - ppt * 1.1), Math.round(ppt * 0.4), Math.round(ppt * 1.1))
  ctx.fillStyle = '#5e5670'; ctx.fillRect(Math.round(x - ppt * 0.13), Math.round(by - ppt * 1.05), Math.round(ppt * 0.26), Math.round(ppt * 1.0))
  ctx.fillStyle = '#140a26'; ctx.fillRect(Math.round(x - ppt * 0.38), Math.round(by - ppt * 1.3), Math.round(ppt * 0.76), Math.round(ppt * 0.25))
  ctx.fillStyle = '#c9a227'; ctx.fillRect(Math.round(x - ppt * 0.33), Math.round(by - ppt * 1.27), Math.round(ppt * 0.66), Math.round(ppt * 0.15))
  const fl = 1 + Math.sin(t * 13 + tc.x * 2) * 0.12
  for (const [r, c] of [[0.34, '#7c3aed'], [0.24, '#c084fc'], [0.12, '#f5d0fe']]) {
    ctx.fillStyle = c; ctx.beginPath()
    ctx.moveTo(x - ppt * r, by - ppt * 1.3); ctx.quadraticCurveTo(x, by - ppt * (1.3 + r * 3.2 * fl), x + ppt * r, by - ppt * 1.3); ctx.fill()
  }
}

// a sombra: o herói pintado de roxo-escuro e meio transparente
let tintCv = null
function echoFrameIndex(z) {
  if (!z.onGround) return z.vy < 0 ? 5 : 6
  if (Math.abs(z.vx) > 0.2) return 1 + (Math.floor(z.walkT * 11) % 4)
  return 0
}
function drawEcho(ctx, z, heroId, t, ppt) {
  const hs = A(`hero-${heroId}`)
  const fw = hs ? hs.naturalWidth / 9 : 0, fh = hs ? hs.naturalHeight : 0
  const feetX = (z.x + P.w / 2) * ppt, feetY = (z.y + P.h) * ppt
  ctx.save()
  const glow = ctx.createRadialGradient(feetX, feetY - ppt * 0.8, 0, feetX, feetY - ppt * 0.8, ppt * 1.4)
  glow.addColorStop(0, 'rgba(241,76,235,0.45)'); glow.addColorStop(1, 'rgba(241,76,235,0)')
  ctx.fillStyle = glow; ctx.fillRect(feetX - ppt * 1.5, feetY - ppt * 2.3, ppt * 3, ppt * 3)
  if (hs) {
    if (!tintCv) tintCv = document.createElement('canvas')
    tintCv.width = Math.ceil(fw); tintCv.height = Math.ceil(fh)
    const tx = tintCv.getContext('2d')
    tx.clearRect(0, 0, fw, fh); tx.imageSmoothingEnabled = false
    tx.drawImage(hs, echoFrameIndex(z) * fw, 0, fw, fh, 0, 0, fw, fh)
    tx.globalCompositeOperation = 'source-atop'; tx.fillStyle = 'rgba(90,30,150,0.85)'; tx.fillRect(0, 0, fw, fh); tx.globalCompositeOperation = 'source-over'
    const w = (fw / APX) * ppt, h = (fh / APX) * ppt
    ctx.globalAlpha = 0.72 + Math.sin(t * 10) * 0.08
    ctx.translate(Math.round(feetX), 0); if (z.facing < 0) ctx.scale(-1, 1)
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(tintCv, Math.round(-w / 2), Math.round(feetY - h), Math.round(w), Math.round(h))
  } else {
    ctx.globalAlpha = 0.7; ctx.fillStyle = '#2e105a'; ctx.fillRect(z.x * ppt, z.y * ppt, P.w * ppt, P.h * ppt)
  }
  ctx.restore()
}

// Talos: gigante de bronze com um olho magenta; martelo pra cima (aviso) e pra baixo (batida)
function drawBoss(ctx, b, t, ppt) {
  const W = BOSS.w * ppt, H = BOSS.h * ppt
  const x = b.x * ppt, y = b.y * ppt
  for (const w of b.waves) {
    const wx = w.x * ppt, wy = w.y * ppt
    ctx.fillStyle = 'rgba(241,76,235,0.85)'
    ctx.beginPath(); ctx.moveTo(wx - ppt * 0.45, wy); ctx.quadraticCurveTo(wx, wy - ppt * 0.9, wx + ppt * 0.45, wy); ctx.fill()
    ctx.fillStyle = 'rgba(255,214,251,0.9)'
    ctx.beginPath(); ctx.moveTo(wx - ppt * 0.25, wy); ctx.quadraticCurveTo(wx, wy - ppt * 0.5, wx + ppt * 0.25, wy); ctx.fill()
  }
  const art = A(!b.alive ? 'talos-down' : b.state === 'windup' ? 'talos-windup' : b.state === 'slam' ? 'talos-slam' : Math.sin(t * 6) > 0 ? 'talos-walk1' : 'talos-walk2')
  ctx.save()
  if (!b.alive) { ctx.globalAlpha = Math.max(0, 1 - b.deadT * 0.5) }
  if (b.inv > 0 && Math.sin(b.inv * 40) > 0) ctx.globalAlpha = 0.45
  if (art) { sprite(ctx, art, b.x + BOSS.w / 2, b.y + BOSS.h, ppt, b.facing > 0); ctx.restore(); return }
  ctx.translate(x + W / 2, y + H); ctx.scale(b.facing > 0 ? 1 : -1, 1)
  if (!b.alive) ctx.rotate(-Math.min(1.4, b.deadT * 2))
  const o = '#140a26', br = '#b7791f', brHi = '#f6c453', brDk = '#7c4a12'
  const box = (bx, by, bw, bh, c) => { ctx.fillStyle = o; ctx.fillRect(bx - 2, by - 2, bw + 4, bh + 4); ctx.fillStyle = c; ctx.fillRect(bx, by, bw, bh) }
  const step = b.state === 'walk' && Math.sin(t * 8) > 0 ? ppt * 0.08 : 0
  box(-W * 0.38, -H * 0.38 - step, W * 0.26, H * 0.38, brDk); box(W * 0.12, -H * 0.38 + step, W * 0.26, H * 0.38, brDk)
  box(-W * 0.45, -H * 0.82, W * 0.9, H * 0.46, br)
  ctx.fillStyle = brHi; ctx.fillRect(-W * 0.42, -H * 0.8, W * 0.84, H * 0.06)
  ctx.fillStyle = '#f14ceb'; ctx.beginPath(); ctx.arc(0, -H * 0.6, W * 0.12, 0, Math.PI * 2); ctx.fill()
  box(-W * 0.24, -H, W * 0.48, H * 0.2, br)
  ctx.fillStyle = '#f14ceb'; ctx.fillRect(W * 0.02, -H * 0.93, W * 0.16, H * 0.05)
  const up = b.state === 'windup', down = b.state === 'slam'
  ctx.save(); ctx.translate(W * 0.45, -H * 0.72); ctx.rotate(up ? -2.4 : down ? 0.5 : -0.4)
  box(-W * 0.07, 0, W * 0.14, H * 0.42, brDk)
  box(-W * 0.22, H * 0.38, W * 0.44, H * 0.18, '#6b6380')
  ctx.restore()
  ctx.restore()
}

function drawGate(ctx, tx, ty, ppt, t) {
  const x = Math.floor(tx * ppt), y = Math.floor(ty * ppt), sz = Math.ceil(ppt)
  ctx.fillStyle = '#140a26'; ctx.fillRect(x, y, sz, sz)
  ctx.fillStyle = '#7c4a12'; ctx.fillRect(x + 2, y, sz - 4, sz)
  ctx.fillStyle = '#b7791f'; for (let i = 0; i < 3; i++) ctx.fillRect(Math.round(x + sz * (0.18 + i * 0.3)), y, Math.max(2, Math.round(sz * 0.12)), sz)
  ctx.fillStyle = `rgba(241,76,235,${0.6 + Math.sin(t * 4) * 0.3})`; ctx.fillRect(x, Math.round(y + sz * 0.45), sz, Math.max(2, Math.round(sz * 0.08)))
}

// o escuro do submundo: tela quase preta com "furos" de luz no herói, nas tochas, nos publishers acesos e nas gems
let darkCv = null
function drawDarkness(ctx, g, w, h, ppt, camX) {
  if (!darkCv) darkCv = document.createElement('canvas')
  if (darkCv.width !== w || darkCv.height !== h) { darkCv.width = w; darkCv.height = h }
  const d = darkCv.getContext('2d')
  d.globalCompositeOperation = 'source-over'
  d.clearRect(0, 0, w, h)
  d.fillStyle = 'rgba(6,2,16,0.8)'; d.fillRect(0, 0, w, h)
  d.globalCompositeOperation = 'destination-out'
  const hole = (wx, wy, r) => {
    const sx = (wx - camX) * ppt, sy = wy * ppt, R = r * ppt
    if (sx < -R || sx > w + R) return
    const gr = d.createRadialGradient(sx, sy, R * 0.15, sx, sy, R)
    gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.6, 'rgba(0,0,0,0.75)'); gr.addColorStop(1, 'rgba(0,0,0,0)')
    d.fillStyle = gr; d.fillRect(sx - R, sy - R, R * 2, R * 2)
  }
  const p = g.player
  hole(p.x + P.w / 2, p.y + P.h * 0.5, 5)
  for (const tc of g.level.torches ?? []) hole(tc.x + 0.5, tc.y - 1.4, 3.6 + Math.sin(g.time * 7 + tc.x) * 0.2)
  for (const pb of g.publishers) if (pb.on) hole(pb.x + 0.5, (pb.y ?? FLOOR) - 3, 4.5)
  for (const r of g.relays) if (r.on) hole(r.x + 0.5, r.y - 1.6, 2.4)
  for (const gm of g.gems) if (!gm.taken) hole(gm.x + 0.5, gm.y + 0.5, 1.4)
  if (g.boss?.alive && g.boss.state !== 'sleep') hole(g.boss.x + BOSS.w / 2, g.boss.y + 0.5, 2.2)
  hole(g.level.flag + 0.5, FLOOR - 7.5, g.status === 'won' ? 12 : 3)
  if (g.status === 'won') { d.fillStyle = `rgba(0,0,0,${Math.min(1, g.statusT * 0.6)})`; d.fillRect(0, 0, w, h) }
  ctx.drawImage(darkCv, 0, 0)
}

// barra de vida do chefe no topo da tela
function drawBossBar(ctx, g, w, ppt) {
  const b = g.boss
  if (!b || !b.alive || b.state === 'sleep') return
  const size = Math.max(10, Math.round(ppt * 0.38))
  ctx.font = `${size}px "Press Start 2P", monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  const y = ppt * 0.7
  ctx.fillStyle = '#140a26'; ctx.fillText('TALOS', w / 2 + 2, y + 2)
  ctx.fillStyle = '#f6c453'; ctx.fillText('TALOS', w / 2, y)
  for (let i = 0; i < BOSS.hp; i++) {
    const x = w / 2 + (i - 1) * size * 1.6
    ctx.fillStyle = '#140a26'; ctx.fillRect(Math.round(x - size * 0.55), Math.round(y + size), Math.round(size * 1.1), Math.round(size * 0.7))
    ctx.fillStyle = i < b.hp ? '#f14ceb' : '#3e3350'; ctx.fillRect(Math.round(x - size * 0.45), Math.round(y + size * 1.1), Math.round(size * 0.9), Math.round(size * 0.5))
  }
}

// bloco apagado de um grupo (contorno tracejado cinza)
function drawGhost(ctx, tx, ty, ppt, t) {
  const x = Math.floor(tx * ppt), y = Math.floor(ty * ppt), s = Math.ceil(ppt)
  ctx.fillStyle = 'rgba(120,110,140,0.18)'; ctx.fillRect(x + 2, y + 2, s - 4, s - 4)
  ctx.strokeStyle = `rgba(170,160,190,${0.5 + Math.sin(t * 3 + tx) * 0.15})`; ctx.lineWidth = 2
  ctx.setLineDash([Math.max(3, s * 0.15), Math.max(3, s * 0.12)]); ctx.strokeRect(x + 3, y + 3, s - 6, s - 6); ctx.setLineDash([])
}

// ---- Confidence Gem: diamante magenta com borda dourada, brilhando
function drawGem(ctx, gm, t, ppt) {
  const cx = (gm.x + 0.5) * ppt, cy = (gm.y + 0.5 + Math.sin(t * 3 + gm.x) * 0.08) * ppt, s = ppt * 0.42
  const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, ppt * 0.9)
  glow.addColorStop(0, 'rgba(241,76,235,0.45)'); glow.addColorStop(1, 'rgba(241,76,235,0)')
  ctx.fillStyle = glow; ctx.fillRect(cx - ppt, cy - ppt, ppt * 2, ppt * 2)
  const ga = A(Math.sin(t * 4 + gm.x * 3) > 0.6 ? 'gem-sparkle' : 'gem')
  if (ga) { sprite(ctx, ga, gm.x + 0.5, gm.y + 0.95 + Math.sin(t * 3 + gm.x) * 0.08, ppt); return }
  const dia = (k, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(cx, cy - s * k); ctx.lineTo(cx + s * 0.8 * k, cy - s * 0.2 * k); ctx.lineTo(cx, cy + s * k); ctx.lineTo(cx - s * 0.8 * k, cy - s * 0.2 * k); ctx.closePath(); ctx.fill() }
  dia(1.25, '#140a26'); dia(1.1, '#f4c542'); dia(0.9, '#f14ceb')
  ctx.fillStyle = '#ffd6fb'; ctx.beginPath(); ctx.moveTo(cx - s * 0.15, cy - s * 0.75); ctx.lineTo(cx + s * 0.25, cy - s * 0.2); ctx.lineTo(cx - s * 0.45, cy - s * 0.2); ctx.closePath(); ctx.fill()
  if (Math.sin(t * 4 + gm.x * 3) > 0.85) { ctx.fillStyle = '#fff'; ctx.fillRect(Math.round(cx + s * 0.5), Math.round(cy - s * 0.9), 3, 3) }
}

export const RARITY = { common: '#cbd5e1', uncommon: '#86efac', rare: '#a78bfa', legendary: '#f4c542' }
export const lootLabel = (l) => (l.kind === 'coins' ? `+${l.amount} price updates` : l.kind === 'shield' ? 'Confidence Shield' : l.kind === 'lazer' ? 'Lazer Boots' : l.kind)

// ---- baú (o prêmio vem do Pyth Entropy): fechado, abrindo (dado girando) e aberto (mostra o prêmio)
function drawChest(ctx, c, t, ppt) {
  const x = c.x * ppt, by = c.y * ppt, w = ppt * 0.96, h = ppt * 0.72
  const lx = x + ppt * 0.02
  const shake = c.state === 'opening' ? Math.sin(t * 40) * 2 : 0
  const ca = A(c.state === 'closed' ? 'chest-closed' : c.state === 'opening' ? 'chest-opening' : 'chest-open')
  if (ca) sprite(ctx, ca, c.x + 0.5 + shake / ppt, c.y, ppt)
  else {
  ctx.fillStyle = '#140a26'; ctx.fillRect(Math.round(lx - 2 + shake), Math.round(by - h - 2), Math.round(w + 4), Math.round(h + 2))
  ctx.fillStyle = '#7c3aed'; ctx.fillRect(Math.round(lx + shake), Math.round(by - h * 0.62), Math.round(w), Math.round(h * 0.62))
  const lidUp = c.state === 'open' ? Math.min(1, c.t * 5) : 0
  ctx.fillStyle = '#5b21b6'; ctx.fillRect(Math.round(lx + shake), Math.round(by - h - lidUp * ppt * 0.3), Math.round(w), Math.round(h * 0.4))
  ctx.fillStyle = '#f4c542'
  ctx.fillRect(Math.round(lx + shake), Math.round(by - h * 0.62), Math.round(w), 3)
  ctx.fillRect(Math.round(lx + w / 2 - ppt * 0.1 + shake), Math.round(by - h * 0.7), Math.round(ppt * 0.2), Math.round(ppt * 0.24))
  }
  if (c.state === 'opening') {
    // dado do Entropy girando em cima enquanto o sorteio chega
    ctx.save(); ctx.translate(x + ppt * 0.5, by - ppt * 1.4); ctx.rotate(t * 8)
    ctx.fillStyle = '#140a26'; ctx.fillRect(-ppt * 0.28, -ppt * 0.28, ppt * 0.56, ppt * 0.56)
    ctx.fillStyle = '#fff'; ctx.fillRect(-ppt * 0.23, -ppt * 0.23, ppt * 0.46, ppt * 0.46)
    ctx.fillStyle = '#7c3aed'; for (const [a, b] of [[-0.1, -0.1], [0.1, 0.1], [0, 0]]) ctx.fillRect(a * ppt - 2, b * ppt - 2, 4, 4)
    ctx.restore()
  }
  if (c.state === 'open' && c.loot && c.t < 3) {
    ctx.globalAlpha = Math.max(0, Math.min(1, 3 - c.t))
    const label = lootLabel(c.loot)
    const size = Math.round(ppt * 0.3)
    ctx.font = `${size}px "Press Start 2P", monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    const ty = by - ppt * (1.6 + c.t * 0.35)
    ctx.fillStyle = '#140a26'; ctx.fillText(c.loot.rarity.toUpperCase(), x + ppt * 0.5 + 2, ty - size * 1.4 + 2); ctx.fillText(label, x + ppt * 0.5 + 2, ty + 2)
    ctx.fillStyle = RARITY[c.loot.rarity] ?? '#fff'; ctx.fillText(c.loot.rarity.toUpperCase(), x + ppt * 0.5, ty - size * 1.4)
    ctx.fillStyle = '#fff'; ctx.fillText(label, x + ppt * 0.5, ty)
    ctx.globalAlpha = 1
  }
}

// ---- poderes soltos: escudo (bolha roxa com P) e Lazer Boots (bota com raio)
function drawItem(ctx, it, t, ppt) {
  const cx = (it.x + 0.5) * ppt, cy = (it.y + 0.5 + (it.rise > 0 ? 0 : Math.sin(t * 4) * 0.07)) * ppt
  const ia = A(it.kind === 'shield' ? 'power-shield' : 'power-lazer')
  if (ia) { sprite(ctx, ia, it.x + 0.5, it.y + 0.9 + (it.rise > 0 ? 0 : Math.sin(t * 4) * 0.07), ppt); return }
  if (it.kind === 'shield') {
    ctx.fillStyle = '#140a26'; ctx.beginPath(); ctx.arc(cx, cy, ppt * 0.42, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#8b5cf6'; ctx.beginPath(); ctx.arc(cx, cy, ppt * 0.36, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#ddd6fe'; ctx.beginPath(); ctx.arc(cx - ppt * 0.12, cy - ppt * 0.13, ppt * 0.09, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.round(ppt * 0.36)}px "Press Start 2P", monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText('P', cx + 1, cy + 2)
  } else {
    ctx.fillStyle = '#140a26'; ctx.fillRect(Math.round(cx - ppt * 0.3), Math.round(cy - ppt * 0.38), Math.round(ppt * 0.36), Math.round(ppt * 0.62)); ctx.fillRect(Math.round(cx - ppt * 0.3), Math.round(cy + ppt * 0.08), Math.round(ppt * 0.66), Math.round(ppt * 0.3))
    ctx.fillStyle = '#f14ceb'; ctx.fillRect(Math.round(cx - ppt * 0.25), Math.round(cy - ppt * 0.33), Math.round(ppt * 0.26), Math.round(ppt * 0.52)); ctx.fillRect(Math.round(cx - ppt * 0.25), Math.round(cy + ppt * 0.12), Math.round(ppt * 0.56), Math.round(ppt * 0.2))
    ctx.fillStyle = '#f4c542'; ctx.beginPath(); ctx.moveTo(cx + ppt * 0.2, cy - ppt * 0.45); ctx.lineTo(cx + ppt * 0.05, cy - ppt * 0.1); ctx.lineTo(cx + ppt * 0.18, cy - ppt * 0.1); ctx.lineTo(cx + ppt * 0.04, cy + ppt * 0.15); ctx.lineTo(cx + ppt * 0.32, cy - ppt * 0.18); ctx.lineTo(cx + ppt * 0.2, cy - ppt * 0.18); ctx.closePath(); ctx.fill()
  }
}

function drawCheckpoint(ctx, cp, reached, t, ppt) {
  const fa = A(reached ? 'checkpoint-on' : 'checkpoint-off')
  if (fa) { sprite(ctx, fa, cp.x + 0.75, cp.y ?? FLOOR, ppt); return }
  const x = (cp.x + 0.5) * ppt, baseY = (cp.y ?? FLOOR) * ppt
  ctx.fillStyle = '#140a26'; ctx.fillRect(Math.round(x - 2), baseY - ppt * 2.2, 4, ppt * 2.2)
  ctx.fillStyle = reached ? '#22c55e' : '#6b5a7e'
  const y = baseY - ppt * 2.2
  ctx.beginPath(); ctx.moveTo(x + 2, y); ctx.lineTo(x + 2 + ppt * 0.8, y + ppt * 0.3 + Math.sin(t * 5) * 2); ctx.lineTo(x + 2, y + ppt * 0.6); ctx.closePath(); ctx.fill()
}

function heroFrame(g, heroId) {
  const p = g.player
  const art = loadHero(heroId)
  const side = p.facing >= 0 ? art.right : art.left
  let frame = side[0]
  if (!p.onGround) frame = side[1]
  else if (Math.abs(p.vx) > 0.2) frame = side[Math.floor(p.walkT * 9) % 2]
  if (!ready(frame)) frame = art.front
  return frame
}

// quadro da folha de lado: 0 parado, 1-4 corrida, 5 pulo, 6 queda, 7 dano, 8 comemora
function sheetFrame(g) {
  const p = g.player
  if (g.status === 'dying' || p.invuln > P.invuln - 0.35) return 7
  if (g.status === 'won' && p.onGround && Math.abs(p.vx) < 0.1) return 8
  if (!p.onGround) return p.vy < 0 ? 5 : 6
  if (Math.abs(p.vx) > 0.2) return 1 + (Math.floor(p.walkT * 11) % 4)
  return 0
}

function drawHero(ctx, g, heroId, ppt) {
  const p = g.player
  const hs = A(`hero-${heroId}`)
  if (hs) {
    const fw = hs.naturalWidth / 9, fh = hs.naturalHeight
    const w = (fw / APX) * ppt, h = (fh / APX) * ppt
    const feetX = (p.x + P.w / 2) * ppt, feetY = (p.y + P.h) * ppt
    const fi = sheetFrame(g)
    const draw = (dx) => {
      ctx.save(); ctx.translate(Math.round(feetX + dx), 0); if (p.facing < 0) ctx.scale(-1, 1)
      ctx.drawImage(hs, fi * fw, 0, fw, fh, Math.round(-w / 2), Math.round(feetY - h), Math.round(w), Math.round(h)); ctx.restore()
    }
    ctx.save(); ctx.imageSmoothingEnabled = false
    if (p.onGround) { ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(feetX, feetY, ppt * 0.35, ppt * 0.08, 0, 0, Math.PI * 2); ctx.fill() }
    if (p.lazer > 0 && Math.abs(p.vx) > 1) for (let i = 3; i >= 1; i--) { ctx.globalAlpha = 0.12 * (4 - i) * (p.lazer < 2 ? p.lazer / 2 : 1); draw(-Math.sign(p.vx) * i * ppt * 0.35) }
    ctx.globalAlpha = 1
    if (g.status === 'dying') ctx.globalAlpha = Math.sin(g.statusT * 30) > 0 ? 1 : 0.6
    if (p.invuln > 0 && Math.sin(p.invuln * 40) > 0) ctx.globalAlpha = 0.35
    draw(0)
    ctx.globalAlpha = 1
    if (p.shield) {
      const cy = feetY - ppt * 0.85, r = ppt * 1.05
      ctx.strokeStyle = `rgba(196,166,255,${0.75 + Math.sin(g.time * 6) * 0.15})`; ctx.lineWidth = Math.max(2, ppt * 0.08)
      ctx.beginPath(); ctx.arc(feetX, cy, r, 0, Math.PI * 2); ctx.stroke()
      ctx.fillStyle = 'rgba(139,92,246,0.14)'; ctx.beginPath(); ctx.arc(feetX, cy, r, 0, Math.PI * 2); ctx.fill()
    }
    ctx.restore()
    return
  }
  const frame = heroFrame(g, heroId)
  const feetX = (p.x + P.w / 2) * ppt, feetY = (p.y + P.h) * ppt
  ctx.save()
  if (p.onGround) { ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(feetX, feetY, ppt * 0.35, ppt * 0.08, 0, 0, Math.PI * 2); ctx.fill() }
  const ok = ready(frame)
  const w = ok ? (frame.naturalWidth / ART) * ppt : P.w * ppt, h = ok ? (frame.naturalHeight / ART) * ppt : P.h * ppt
  ctx.imageSmoothingEnabled = false
  // Lazer Boots: rastro de luz atrás do herói
  if (p.lazer > 0 && ok && Math.abs(p.vx) > 1) {
    for (let i = 3; i >= 1; i--) {
      ctx.globalAlpha = 0.12 * (4 - i) * (p.lazer < 2 ? p.lazer / 2 : 1)
      ctx.drawImage(frame, Math.round(feetX - w / 2 - Math.sign(p.vx) * i * ppt * 0.35), Math.round(feetY - h), Math.round(w), Math.round(h))
    }
    ctx.globalAlpha = 1
  }
  if (g.status === 'dying') ctx.globalAlpha = Math.sin(g.statusT * 30) > 0 ? 1 : 0.6
  if (p.invuln > 0 && Math.sin(p.invuln * 40) > 0) ctx.globalAlpha = 0.35
  if (ok) ctx.drawImage(frame, Math.round(feetX - w / 2), Math.round(feetY - h), Math.round(w), Math.round(h))
  else { ctx.fillStyle = '#a77bff'; ctx.fillRect(p.x * ppt, p.y * ppt, P.w * ppt, P.h * ppt) }
  ctx.globalAlpha = 1
  // Confidence Shield: bolha roxa em volta
  if (p.shield) {
    const cy = feetY - h * 0.5, r = Math.max(w, h) * 0.58
    ctx.strokeStyle = `rgba(196,166,255,${0.75 + Math.sin(g.time * 6) * 0.15})`; ctx.lineWidth = Math.max(2, ppt * 0.08)
    ctx.beginPath(); ctx.arc(feetX, cy, r, 0, Math.PI * 2); ctx.stroke()
    ctx.fillStyle = 'rgba(139,92,246,0.14)'; ctx.beginPath(); ctx.arc(feetX, cy, r, 0, Math.PI * 2); ctx.fill()
  }
  ctx.restore()
}

// câmera: segue o herói um pouco à frente; as pontas da fase seguram
export function cameraX(g, viewW) {
  const p = g.player
  const want = p.x + P.w / 2 - viewW * 0.4
  return Math.max(0, Math.min(g.cols - viewW, want))
}

// o mundo à direita da onda de cor fica cinza ("preço velho"); a beirada da onda brilha
function drawStale(ctx, g, ppt, camX, viewW, h) {
  const edge = g.restoreX
  const x0 = Math.max(edge, camX - 1), x1 = camX + viewW + 1
  if (x0 >= x1) return
  const soft = 2.5 // casas de degradê na beirada
  ctx.save()
  ctx.globalCompositeOperation = 'saturation'
  const grad = ctx.createLinearGradient(edge * ppt, 0, (edge + soft) * ppt, 0)
  grad.addColorStop(0, 'rgba(128,128,128,0)'); grad.addColorStop(1, 'rgba(128,128,128,0.92)')
  ctx.fillStyle = grad
  ctx.fillRect(Math.floor(x0 * ppt), 0, Math.ceil((x1 - x0) * ppt), h)
  ctx.globalCompositeOperation = 'source-over'
  const dark = ctx.createLinearGradient(edge * ppt, 0, (edge + soft) * ppt, 0)
  dark.addColorStop(0, 'rgba(14,10,24,0)'); dark.addColorStop(1, 'rgba(14,10,24,0.28)')
  ctx.fillStyle = dark
  ctx.fillRect(Math.floor(x0 * ppt), 0, Math.ceil((x1 - x0) * ppt), h)
  // brilho roxo na frente da onda enquanto ela anda
  if (g.restoreX < g.restoreTo && edge > camX - 2 && edge < camX + viewW + 2) {
    const glow = ctx.createLinearGradient((edge - 1.5) * ppt, 0, (edge + 0.5) * ppt, 0)
    glow.addColorStop(0, 'rgba(167,123,255,0)'); glow.addColorStop(1, 'rgba(196,166,255,0.5)')
    ctx.fillStyle = glow; ctx.fillRect(Math.floor((edge - 1.5) * ppt), 0, Math.ceil(2 * ppt), h)
  }
  ctx.restore()
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
  drawBackground(ctx, w, h, camX, ppt, g.level.theme)

  ctx.save()
  ctx.translate(-Math.round(camX * ppt), 0)
  const x0 = Math.max(0, Math.floor(camX) - 1), x1 = Math.min(g.cols - 1, Math.ceil(camX + viewW) + 1)
  const near = (x, m = 3) => x >= x0 - m && x <= x1 + m

  // atrás dos blocos: checkpoint, publishers, beacon
  if (g.level.checkpoint) drawCheckpoint(ctx, g.level.checkpoint, !!g.checkpoint, g.time, ppt)
  for (const pb of g.publishers) if (near(pb.x)) drawPublisher(ctx, pb, g.time, ppt)
  drawBeacon(ctx, g.level.flag, g.time, ppt, g.status === 'won', g.statusT)

  // blocos
  const size = Math.ceil(ppt)
  for (let ty = 0; ty < ROWS; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      let k = g.tiles[ty][tx]
      if (k === '.' || k === 'f') continue
      if (k === 'x') { drawGate(ctx, tx, ty, ppt, g.time); continue }
      if (k >= '1' && k <= '9') {
        // bloco de grupo: aceso (roxo) ou apagado (contorno); piscando quando o sinal está envelhecendo
        if (!g.groupOn[k]) { drawGhost(ctx, tx, ty, ppt, g.time); continue }
        if (staleWarn(g, Number(k)) && Math.sin(g.time * 22) > 0) { drawGhost(ctx, tx, ty, ppt, g.time); continue }
        k = 'p'
      }
      if (k === '!') k = '?'
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
      const ta = TILE_ART[k] && A(TILE_ART[k])
      if (ta) ctx.drawImage(ta, Math.floor(tx * ppt), Math.floor(ty * ppt + dy), size, size)
      else ctx.drawImage(sheet.cv, sheet.index[k] * ART, 0, ART, ART, Math.floor(tx * ppt), Math.floor(ty * ppt + dy), size, size)
    }
  }
  for (const r of g.relays) if (near(r.x)) drawRelay(ctx, g, r, g.time, ppt)
  for (const m of g.movers ?? []) if (near(m.x, m.w + 6)) drawMover(ctx, g, m, g.time, ppt)
  for (const tc of g.level.torches ?? []) if (near(tc.x)) drawTorch(ctx, tc, g.time, ppt)

  // o que ainda está "stale" fica cinza (moedas, gems, baús, inimigos e o herói ficam por cima, coloridos)
  drawStale(ctx, g, ppt, camX, viewW, h)

  for (const c of g.chests) if (near(c.x)) drawChest(ctx, c, g.time, ppt)
  for (const c of g.coins) if (!c.taken && near(c.x, 1)) drawCoin(ctx, c.x, c.y, g.time, ppt, c.x * 0.7)
  for (const gm of g.gems) if (!gm.taken && near(gm.x, 1)) drawGem(ctx, gm, g.time, ppt)
  for (const c of g.popped) {
    if (c.t < 0) continue
    ctx.globalAlpha = Math.max(0, 1 - c.t / 0.6)
    drawCoin(ctx, c.x, c.y - Math.sin((c.t / 0.6) * Math.PI) * 1.5, c.t * 4, ppt)
    ctx.globalAlpha = 1
  }
  for (const it of g.items) if (near(it.x)) drawItem(ctx, it, g.time, ppt)
  for (const e of g.enemies) if (near(e.x, 2)) (e.type === 'harpy' ? drawHarpy : drawEnemy)(ctx, e, g.time, ppt)
  if (g.boss) drawBoss(ctx, g.boss, g.time, ppt)
  drawHero(ctx, g, heroId, ppt)
  for (const w of g.level.winds ?? []) drawWind(ctx, g, w, ppt, camX, viewW, h)
  // paredes falsas: desenhadas por cima do herói (escondem a salinha); ficam meio transparentes com ele lá dentro
  const pl = g.player
  const inside = g.tiles[Math.floor(pl.y + P.h / 2)]?.[Math.floor(pl.x + P.w / 2)] === 'f'
  for (let ty = 0; ty < ROWS; ty++) for (let tx = x0; tx <= x1; tx++) {
    if (g.tiles[ty][tx] !== 'f') continue
    ctx.globalAlpha = inside ? 0.45 : 1
    const top = ty === 0 || !['#', 'f'].includes(g.tiles[ty - 1][tx])
    const ta = A(top ? 'tile-grass' : 'tile-soil')
    if (ta) ctx.drawImage(ta, Math.floor(tx * ppt), Math.floor(ty * ppt), size, size)
    else ctx.drawImage(sheet.cv, sheet.index[top ? '^' : '#'] * ART, 0, ART, ART, Math.floor(tx * ppt), Math.floor(ty * ppt), size, size)
    ctx.globalAlpha = 1
  }
  ctx.restore()
  if (g.level.dark) drawDarkness(ctx, g, w, h, ppt, camX)
  // a sombra vem por cima do escuro (senão some na caverna)
  if (g.echoes?.some((z) => z.visible)) {
    ctx.save(); ctx.translate(-Math.round(camX * ppt), 0)
    for (const z of g.echoes) if (z.visible) drawEcho(ctx, z, heroId, g.time, ppt)
    ctx.restore()
  }
  drawBossBar(ctx, g, w, ppt)
}
