// Efeitos visuais do modo Solo ("game feel"): partículas, luzes e fumaça nas bordas, flash.
// Só visual — não muda nenhuma regra. O jogo avisa os momentos importantes em `state.events`
// (game.js) e aqui eles viram efeito. Tudo em casas (1 = uma casa), como no render.js.
import { WALL } from './constants.js'
import { tileAt } from './level.js'
import { decoSprite } from './sprites.js'

const parts = []        // partículas soltas
const scorch = []       // marcas de queimado no chão (somem devagar)
let flash = 0           // clarão da tela inteira (quando o jogador é atingido)
let ambient = null      // decoração das bordas da fase atual
let ambientLevel = null

const rand = (a, b) => a + Math.random() * (b - a)

function add(p) {
  if (parts.length < 400) parts.push({ age: 0, z: 0, vz: 0, rot: 0, vr: 0, ...p })
}

// ---- reação aos avisos do jogo
export function consumeEvents(s) {
  for (const ev of s.events) {
    const cx = ev.x + 0.5, cy = ev.y + 0.5
    if (ev.type === 'bombPlaced') {
      add({ kind: 'ring', x: cx, y: cy + 0.3, life: 0.35, color: '200, 140, 255' })
    } else if (ev.type === 'explode') {
      // faíscas douradas correndo pelos braços da cruz
      for (let i = 0; i < 16; i++) {
        const dir = [[1, 0], [-1, 0], [0, 1], [0, -1]][i % 4]
        const sp = rand(2.5, 3 + ev.range * 1.6)
        add({
          kind: 'spark', x: cx, y: cy, life: rand(0.25, 0.5),
          vx: dir[0] * sp + rand(-0.6, 0.6), vy: dir[1] * sp + rand(-0.6, 0.6),
          color: Math.random() < 0.7 ? '255, 214, 102' : '255, 255, 255',
        })
      }
      add({ kind: 'ring', x: cx, y: cy, life: 0.3, color: '255, 255, 255', big: true })
      add({ kind: 'burst', x: cx, y: cy, life: 0.14 }) // clarão branco no centro
      // fumaça subindo e marca de queimado em cada casa que pegou fogo agora
      for (const f of s.flames) {
        if (f.t < 0.4) continue // só as chamas novas desta explosão
        if (!scorch.some((m) => m.x === f.x && m.y === f.y)) scorch.push({ x: f.x, y: f.y, t: 0, r: rand(0.32, 0.42) })
        else scorch.find((m) => m.x === f.x && m.y === f.y).t = 0
        if (Math.random() < 0.6) add({ kind: 'smoke', x: f.x + 0.5 + rand(-0.2, 0.2), y: f.y + 0.5, life: rand(0.7, 1.1), vx: rand(-0.15, 0.15), vy: -rand(0.3, 0.6), size: rand(0.16, 0.26) })
      }
    } else if (ev.type === 'powerup') {
      add({ kind: 'ring', x: cx, y: cy, life: 0.4, color: '255, 230, 150', big: true })
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2
        add({ kind: 'spark', x: cx, y: cy, life: rand(0.3, 0.5), vx: Math.cos(a) * 2.2, vy: Math.sin(a) * 2.2, color: '255, 240, 180' })
      }
    } else if (ev.type === 'blockBroken') {
      // pedaços voando + poeira + faísca
      for (let i = 0; i < 5; i++) {
        const a = rand(0, Math.PI * 2), sp = rand(1, 2.4)
        add({
          kind: 'chunk', x: cx, y: cy, life: rand(0.45, 0.7), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.6,
          vz: rand(2, 3.5), rot: rand(0, 6), vr: rand(-12, 12), size: rand(0.1, 0.17),
          color: s.tileset === 'military' ? '#6f6a32' : '#a5582b',
        })
      }
      for (let i = 0; i < 4; i++) add({ kind: 'dust', x: cx + rand(-0.25, 0.25), y: cy + rand(-0.1, 0.3), life: rand(0.4, 0.6), size: rand(0.15, 0.25) })
      add({ kind: 'spark', x: cx, y: cy, life: 0.2, vx: rand(-1, 1), vy: rand(-2, -1), color: '255, 230, 150' })
    } else if (ev.type === 'enemyHit') {
      for (let i = 0; i < (ev.killed ? 10 : 5); i++) {
        const a = rand(0, Math.PI * 2), sp = rand(1.5, 3)
        add({ kind: 'spark', x: cx, y: cy - 0.2, life: rand(0.2, 0.4), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, color: '255, 255, 255' })
      }
      if (ev.killed) add({ kind: 'ring', x: cx, y: cy, life: 0.35, color: '140, 190, 255', big: true })
    } else if (ev.type === 'playerHit') {
      flash = 0.18
    }
  }
  s.events.length = 0
}

// ---- decoração viva das bordas (canos, luzes piscando, ventilação soltando fumaça, placas
// e a energia roxa da "invasão Pyth"). Por enquanto só no quartel (tileset 'military').
function setupAmbient(level, tileset) {
  if (tileset !== 'military') return []
  const { cols, rows } = level
  const deco = []
  const used = new Set()
  // canos: trechos de 3 casas na parede de cima e na de baixo (um desenho só por trecho)
  for (const y of [0, rows - 1]) {
    for (let x = 1; x < cols - 1; x++) {
      if ((x + (y ? 4 : 0)) % 7 !== 1 || x + 3 > cols - 1) continue
      deco.push({ type: 'pipes', x, y, len: 3 })
      for (let i = 0; i < 3; i++) used.add(x + i + ',' + y)
    }
  }
  const spots = []
  for (let x = 1; x < cols - 1; x++) spots.push([x, 0], [x, rows - 1])
  for (let y = 1; y < rows - 1; y++) spots.push([0, y], [cols - 1, y])
  spots.forEach(([x, y], i) => {
    if (tileAt(level, x, y) !== WALL || used.has(x + ',' + y)) return
    const k = (x * 7 + y * 13) % 9 // sorteio fixo pela posição: o mesmo mapa fica sempre igual
    if (k === 0) deco.push({ type: 'lamp', x, y, phase: i * 1.7 })
    else if (k === 2) deco.push({ type: 'sign', x, y })
    else if (k === 4) deco.push({ type: 'vent', x, y, next: rand(0.5, 3) })
    else if (k === 7 && deco.filter((d) => d.type === 'crack').length < 2) deco.push({ type: 'crack', x, y, next: rand(0.2, 1) })
  })
  // canos primeiro (ficam por trás do resto)
  return deco.sort((a, b) => (a.type === 'pipes' ? -1 : 0) - (b.type === 'pipes' ? -1 : 0))
}

export function update(s, dt) {
  if (ambientLevel !== s.level) { ambient = setupAmbient(s.level, s.tileset); ambientLevel = s.level }
  flash = Math.max(0, flash - dt)
  for (const m of scorch) m.t += dt
  for (let i = scorch.length - 1; i >= 0; i--) if (scorch[i].t > SCORCH_TIME) scorch.splice(i, 1)

  for (const d of ambient) {
    if (d.type === 'vent' && (d.next -= dt) <= 0) {
      d.next = rand(1.2, 3.2)
      for (let i = 0; i < 3; i++) add({ kind: 'steam', x: d.x + 0.5 + rand(-0.15, 0.15), y: d.y + 0.35, life: rand(0.9, 1.4), vx: rand(-0.1, 0.1), vy: -rand(0.25, 0.45), size: rand(0.12, 0.2) })
    }
    if (d.type === 'crack' && (d.next -= dt) <= 0) {
      d.next = rand(0.25, 0.7)
      add({ kind: 'mote', x: d.x + 0.5 + rand(-0.2, 0.2), y: d.y + 0.5, life: rand(0.8, 1.3), vx: rand(-0.15, 0.15), vy: -rand(0.3, 0.6), size: rand(0.03, 0.06) })
    }
    if (d.type === 'lamp' && Math.random() < dt * 0.15) {
      for (let i = 0; i < 4; i++) add({ kind: 'spark', x: d.x + 0.5, y: d.y + 0.4, life: rand(0.2, 0.4), vx: rand(-1.2, 1.2), vy: rand(-0.4, 1.4), color: '255, 220, 120' })
    }
  }

  for (const p of parts) {
    p.age += dt
    p.x += (p.vx ?? 0) * dt
    p.y += (p.vy ?? 0) * dt
    p.rot += p.vr * dt
    if (p.kind === 'chunk') { p.vz -= 9 * dt; p.z = Math.max(0, p.z + p.vz * dt); p.vx *= 0.96; p.vy *= 0.96 }
    if (p.kind === 'spark') { p.vx *= 0.9; p.vy *= 0.9 }
  }
  for (let i = parts.length - 1; i >= 0; i--) if (parts[i].age >= parts[i].life) parts.splice(i, 1)
}

const SCORCH_TIME = 2.5

// luzes e rachaduras desenhadas nas paredes da borda (fica embaixo dos personagens),
// e as marcas de queimado no chão
export function drawAmbient(ctx, time) {
  for (const m of scorch) {
    const a = 0.45 * (1 - m.t / SCORCH_TIME)
    const g = ctx.createRadialGradient(m.x + 0.5, m.y + 0.5, 0, m.x + 0.5, m.y + 0.5, m.r)
    g.addColorStop(0, `rgba(20, 10, 30, ${a})`)
    g.addColorStop(1, 'rgba(20, 10, 30, 0)')
    ctx.fillStyle = g
    ctx.fillRect(m.x, m.y, 1, 1)
  }
  if (!ambient) return
  for (const d of ambient) {
    const cx = d.x + 0.5, cy = d.y + 0.5
    if (d.type === 'lamp') {
      // luz de alerta amarela que pisca; de vez em quando uma pisca roxo (a Pyth chegando)
      const purple = d.phase % 5 < 1
      const on = Math.sin(time * 3 + d.phase) > -0.2
      const col = purple ? '190, 110, 255' : '255, 196, 60'
      if (on) {
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 0.7)
        g.addColorStop(0, `rgba(${col}, 0.45)`)
        g.addColorStop(1, `rgba(${col}, 0)`)
        ctx.fillStyle = g
        ctx.fillRect(cx - 0.7, cy - 0.7, 1.4, 1.4)
      }
      ctx.fillStyle = '#2a2a30'
      ctx.beginPath(); ctx.roundRect(cx - 0.13, cy - 0.13, 0.26, 0.26, 0.06); ctx.fill()
      ctx.fillStyle = on ? `rgb(${col})` : '#5a4a2a'
      ctx.beginPath(); ctx.arc(cx, cy, 0.085, 0, Math.PI * 2); ctx.fill()
    } else if (d.type === 'pipes') {
      // o trecho inteiro em 2 pedaços longos (menos emendas que um por casa)
      const img = decoSprite('pipes')
      if (img) {
        const seg = d.len / 2, h = 0.36
        for (let i = 0; i < 2; i++) ctx.drawImage(img, d.x + i * seg, cy - h / 2 - 0.06, seg + 0.01, h)
      }
    } else if (d.type === 'sign') {
      const img = decoSprite('sign')
      if (img) { const w = 0.56, h = w * img.naturalHeight / img.naturalWidth; ctx.drawImage(img, cx - w / 2, cy - h / 2 - 0.06, w, h) }
    } else if (d.type === 'vent' && decoSprite('vent')) {
      const img = decoSprite('vent'), w = 0.64, h = w * img.naturalHeight / img.naturalWidth
      ctx.drawImage(img, cx - w / 2, cy - h / 2 - 0.06, w, h)
    } else if (d.type === 'vent') {
      ctx.fillStyle = '#1d2128'
      ctx.beginPath(); ctx.roundRect(cx - 0.22, cy - 0.15, 0.44, 0.3, 0.05); ctx.fill()
      ctx.strokeStyle = '#4a5260'
      ctx.lineWidth = 0.035
      ctx.beginPath()
      for (let i = 0; i < 4; i++) { const yy = cy - 0.1 + i * 0.065; ctx.moveTo(cx - 0.17, yy); ctx.lineTo(cx + 0.17, yy) }
      ctx.stroke()
    } else if (d.type === 'crack') {
      // rachadura soltando energia roxa
      const glow = 0.5 + 0.3 * Math.sin(time * 4 + d.x)
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 0.6)
      g.addColorStop(0, `rgba(170, 90, 255, ${0.55 * glow})`)
      g.addColorStop(1, 'rgba(170, 90, 255, 0)')
      ctx.fillStyle = g
      ctx.fillRect(cx - 0.6, cy - 0.6, 1.2, 1.2)
      const img = decoSprite('crack')
      if (img) {
        const w = 0.6, h = w * img.naturalHeight / img.naturalWidth
        ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h)
        continue
      }
      ctx.strokeStyle = `rgba(230, 200, 255, ${0.6 + 0.4 * glow})`
      ctx.lineWidth = 0.04
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(cx - 0.25, cy - 0.2); ctx.lineTo(cx - 0.05, cy - 0.02); ctx.lineTo(cx - 0.12, cy + 0.12)
      ctx.lineTo(cx + 0.08, cy + 0.25)
      ctx.moveTo(cx - 0.05, cy - 0.02); ctx.lineTo(cx + 0.2, cy - 0.12)
      ctx.stroke()
    }
  }
}

// partículas e clarão (ficam por cima de tudo)
export function drawParticles(ctx, cols, rows) {
  for (const p of parts) {
    const k = p.age / p.life // 0 = nasceu, 1 = sumindo
    if (p.kind === 'spark') {
      ctx.fillStyle = `rgba(${p.color}, ${1 - k})`
      ctx.beginPath(); ctx.arc(p.x, p.y, 0.045 * (1 - k * 0.5), 0, Math.PI * 2); ctx.fill()
    } else if (p.kind === 'chunk') {
      ctx.save()
      ctx.translate(p.x, p.y - p.z)
      ctx.rotate(p.rot)
      ctx.globalAlpha = 1 - Math.max(0, k - 0.6) / 0.4
      ctx.fillStyle = p.color
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2)
      ctx.restore()
    } else if (p.kind === 'dust') {
      ctx.fillStyle = `rgba(200, 190, 170, ${0.4 * (1 - k)})`
      ctx.beginPath(); ctx.arc(p.x, p.y - k * 0.15, p.size * (0.6 + k), 0, Math.PI * 2); ctx.fill()
    } else if (p.kind === 'steam') {
      ctx.fillStyle = `rgba(210, 215, 225, ${0.35 * (1 - k)})`
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.6 + k * 1.2), 0, Math.PI * 2); ctx.fill()
    } else if (p.kind === 'smoke') {
      ctx.fillStyle = `rgba(120, 100, 140, ${0.4 * (1 - k)})`
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.7 + k * 1.3), 0, Math.PI * 2); ctx.fill()
    } else if (p.kind === 'burst') {
      ctx.fillStyle = `rgba(255, 255, 255, ${0.85 * (1 - k)})`
      ctx.beginPath(); ctx.arc(p.x, p.y, 0.45 + k * 0.5, 0, Math.PI * 2); ctx.fill()
    } else if (p.kind === 'mote') {
      ctx.fillStyle = `rgba(200, 140, 255, ${1 - k})`
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill()
    } else if (p.kind === 'ring') {
      const r = (p.big ? 0.9 : 0.45) * (0.3 + k)
      ctx.strokeStyle = `rgba(${p.color}, ${0.7 * (1 - k)})`
      ctx.lineWidth = 0.06 * (1 - k) + 0.01
      ctx.beginPath(); ctx.ellipse(p.x, p.y, r, r * (p.big ? 1 : 0.45), 0, 0, Math.PI * 2); ctx.stroke()
    }
  }
  if (flash > 0) {
    ctx.fillStyle = `rgba(255, 235, 245, ${Math.min(0.6, flash * 3.5)})`
    ctx.fillRect(0, 0, cols, rows)
  }
}

// nova corrida/fase: limpa o que estava voando
export function reset() {
  parts.length = 0
  scorch.length = 0
  flash = 0
}
