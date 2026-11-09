// Desenho da sala do PVP no <canvas>.
// O CENÁRIO (chão, paredes, caixotes, bombas, fogo, itens, redemoinho) é o desenho do Solo, importado sem mudar nada:
// montamos um objeto "parecido com o jogo do Solo" (sem jogador, sem inimigos, sem porta) e passamos pro draw() dele.
// Por cima, este arquivo desenha os 2 a 4 heróis (cada um com o anel colorido do canto e o nome embaixo dos pés)
// e as casas piscando da morte súbita.
import { draw as drawSoloScene } from '../solo/engine/render.js'
import { LEVELS } from '../solo/engine/levels.js'
import { PX_TILE } from '../solo/engine/sprites.js'
import { CORNERS } from './heroes.js'
import { makeDecor } from './decor.js'

// visual de cada mapa do PVP = o de uma fase do Solo
const LOOK = { tavern: LEVELS[0], hull: LEVELS[1], chop: LEVELS[2] }

// ---- imagens dos heróis (pixel): parado + 2 passos por direção
const HERO_IDS = ['pirb', 'derrpu', 'boryso', 'plancky']
const heroImgs = {}
function img(src) { const i = new Image(); i.src = src; return i }
export function loadHeroes() {
  for (const id of HERO_IDS) {
    if (heroImgs[id]) continue
    const f = (n) => img(`/solo/pixel/${id}${n}.png`)
    heroImgs[id] = { idle: f(''), down: [f('-down1'), f('-down2')], up: [f('-up1'), f('-up2')], left: [f('-left1'), f('-left2')], right: [f('-right1'), f('-right2')] }
  }
}
const ready = (i) => i && i.complete && i.naturalWidth > 0

export const cornerColor = (corner) => CORNERS.find((c) => c.id === corner)?.color ?? '#ffffff'

// Objeto no formato que o draw() do Solo espera. Fica o MESMO objeto entre um quadro e outro
// (o som do Solo compara o objeto pra saber se é a mesma partida), só os campos mudam.
export function makeView(s) {
  const look = LOOK[s.map] ?? LOOK.tavern
  return {
    tileset: look.tileset ?? 'temple', mood: look.mood ?? null, floor: look.floor ?? null, wall: look.wall ?? null,
    wallBorder: look.wallBorder ?? null, decor: look.decor ?? null, doorSet: look.door ?? null, crateTone: look.crateTone ?? null,
    wallMix: !!look.wallMix,
    level: s.level, ...makeDecor(s.map, s.level, s.seed), boss: null, jets: [], enemies: [], chest: null,
    door: { x: -1, y: -1, revealed: false },
    player: { alive: false, deathT: 99 }, // sem o jogador do Solo: os heróis do PVP são desenhados aqui
    powerups: [], bombs: [], flames: [], burning: [], events: [], status: 'playing', time: 0, shake: 0,
  }
}
export function syncView(v, s) {
  v.level = s.level
  v.powerups = s.powerups
  v.bombs = s.bombs
  v.flames = s.flames
  v.burning = s.burning
  v.events = s.events
  v.time = s.time
  v.shake = s.shake
  return v
}

const snap = (n) => Math.round(n * PX_TILE) / PX_TILE

function drawHero(ctx, p, time) {
  if (!p.alive && p.deathT > 0.9) return
  const art = heroImgs[p.hero] ?? heroImgs.pirb
  let frame = art?.idle
  let hop = 0
  if (p.moving && art) {
    const phase = p.walkT * 10
    const pair = art[p.facing] ?? art.down
    const cand = pair[Math.floor(phase / Math.PI) % 2]
    if (ready(cand)) frame = cand
    hop = snap(Math.abs(Math.sin(phase)) * 0.07)
  } else if (art && p.facing !== 'down' && ready(art[p.facing]?.[0])) {
    frame = art[p.facing][0] // parado olhando pro lado em que andou
  }
  const dying = !p.alive ? Math.min(1, p.deathT / 0.8) : 0
  const feetY = p.y + 0.92
  const cx = p.x + 0.5
  const color = cornerColor(p.corner)

  ctx.save()
  // anel colorido do canto, no chão
  if (!dying) {
    ctx.globalAlpha = 0.28
    ctx.fillStyle = color
    ctx.beginPath(); ctx.ellipse(cx, feetY, 0.42, 0.17, 0, 0, Math.PI * 2); ctx.fill()
    ctx.globalAlpha = 1
    ctx.strokeStyle = color
    ctx.lineWidth = 0.065
    ctx.beginPath(); ctx.ellipse(cx, feetY, 0.42, 0.17, 0, 0, Math.PI * 2); ctx.stroke()
  }
  ctx.fillStyle = 'rgba(0,0,0,0.3)'
  ctx.beginPath(); ctx.ellipse(cx, feetY, 0.28 * (1 - dying), 0.08 * (1 - dying), 0, 0, Math.PI * 2); ctx.fill()

  if (p.invulnT > 0 && Math.sin(time * 30) > 0) ctx.globalAlpha = 0.35
  if (!p.connected && p.alive) ctx.globalAlpha = 0.55 // caiu da internet: fica meio transparente, parado
  if (ready(frame)) {
    const w = frame.naturalWidth / PX_TILE, h = frame.naturalHeight / PX_TILE
    ctx.translate(snap(cx), snap(feetY - hop))
    if (dying) {
      ctx.rotate(dying * Math.PI * 2)
      ctx.scale(1 - dying, 1 - dying)
      if (Math.sin(time * 40) > 0) ctx.globalAlpha = 0.5
    }
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(frame, -w / 2, -h, w, h)
  } else {
    // imagem ainda carregando: bolinha na cor do canto
    ctx.fillStyle = color
    ctx.beginPath(); ctx.arc(cx, p.y + 0.5, 0.32 * (1 - dying), 0, Math.PI * 2); ctx.fill()
  }
  ctx.restore()

  // bolha do escudo
  if (p.shield && p.alive) {
    const sx = cx, sy = p.y + 0.3, r = 0.66 + Math.sin(time * 4) * 0.03
    ctx.save()
    const g = ctx.createRadialGradient(sx, sy, r * 0.55, sx, sy, r)
    g.addColorStop(0, 'rgba(120, 220, 255, 0)')
    g.addColorStop(1, 'rgba(120, 220, 255, 0.35)')
    ctx.fillStyle = g
    ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = 'rgba(190, 240, 255, 0.85)'
    ctx.lineWidth = 0.04
    ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.stroke()
    ctx.restore()
  }
}

// nome embaixo dos pés (em pixels de tela, pra letra ficar nítida)
function drawName(ctx, p, scale, me) {
  if (!p.alive && p.deathT > 0.9) return
  const color = cornerColor(p.corner)
  const x = (p.x + 0.5) * scale, y = (p.y + 0.92 + 0.36) * scale
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  const size = Math.max(9, Math.round(scale * 0.2))
  ctx.font = `${size}px "Press Start 2P", monospace`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const label = (me ? '▼ ' : '') + p.name
  ctx.lineJoin = 'round'
  ctx.lineWidth = Math.max(3, size * 0.45)
  ctx.strokeStyle = 'rgba(10, 6, 20, 0.92)'
  ctx.strokeText(label, x, y)
  ctx.fillStyle = color
  ctx.fillText(label, x, y)
  ctx.restore()
}

// casas que vão fechar (morte súbita): vermelho piscando
function drawClosingWarn(ctx, s) {
  if (!s.closingWarn?.length) return
  const blink = 0.35 + 0.3 * Math.abs(Math.sin(s.time * 12))
  ctx.save()
  ctx.fillStyle = `rgba(255, 40, 60, ${blink})`
  for (const [x, y] of s.closingWarn) ctx.fillRect(x, y, 1, 1)
  ctx.strokeStyle = 'rgba(255, 220, 220, 0.8)'
  ctx.lineWidth = 0.05
  for (const [x, y] of s.closingWarn) ctx.strokeRect(x + 0.06, y + 0.06, 0.88, 0.88)
  ctx.restore()
}

// desenha tudo. scale = pixels do canvas por casa (no pixel art, PX_TILE)
export function drawMatch(ctx, s, view, scale, meId = null) {
  drawSoloScene(ctx, syncView(view, s), scale, 1)
  // o draw do Solo deixa a escala em "casas" (com a tremidinha da explosão): desenhamos por cima na mesma escala
  drawClosingWarn(ctx, s)
  const order = [...s.players].sort((a, b) => a.y - b.y)
  for (const p of order) drawHero(ctx, p, s.time)
  for (const p of order) drawName(ctx, p, scale, p.id === meId)
}
