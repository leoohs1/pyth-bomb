// Desenha o estado do jogo num <canvas>, por enquanto só com formas simples (sem arte).
// Tudo é desenhado em "casas": 1 unidade = 1 casa da grade; a escala vem de fora.
import { WALL, BLOCK, FLAME_TIME, BURN_TIME, FUSE_TIME } from './constants.js'
import { doorOpen, chestNear } from './game.js'
import { BOSS } from './boss.js'
import { sprite, tileSprite, walkFrames, playerCanFlip } from './sprites.js'
import { drawAmbient, drawParticles } from './fx.js'

let pxScale = 1 // pixels de tela por casa (pra brilhos que são medidos em pixels)

const C = {
  floorA: '#2b2440', floorB: '#2f2846',
  wallDark: '#3a3155', wallMid: '#5f5381', wallLight: '#8a7cb0',
  blockDark: '#6b4423', blockMid: '#a26c39', blockLight: '#c99257',
  bomb: '#17131f', bombHot: '#7a1d1d',
  flameOut: '#ff7a1a', flameIn: '#ffe066',
  // explosão roxa com miolo branco, nas cores da bomba do logo
  blastGlow: 'rgba(150, 60, 255, 0.35)', blastOut: '#8b2cf5', blastMid: '#c77dff', blastIn: '#ffffff',
  player: '#47c2ff', playerDark: '#1d6f99', eye: '#0d0b14',
}

export function draw(ctx, s, tilePx, dpr) {
  const { level } = s
  const scale = tilePx * dpr
  pxScale = scale
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)

  // tremidinha da tela nas explosões
  let ox = 0, oy = 0
  if (s.shake > 0) {
    ox = (Math.random() - 0.5) * s.shake * 0.25
    oy = (Math.random() - 0.5) * s.shake * 0.25
  }
  ctx.setTransform(scale, 0, 0, scale, ox * scale, oy * scale)

  // chão e paredes
  const floorImg = tileSprite(s.tileset, 'floor')
  const wallImg = tileSprite(s.tileset, 'wall')
  const seam = 1 / scale
  for (let y = 0; y < level.rows; y++) {
    for (let x = 0; x < level.cols; x++) {
      const t = level.tiles[y * level.cols + x]
      if (t === WALL) {
        if (wallImg) ctx.drawImage(wallImg, x, y, 1 + seam, 1 + seam)
        else drawWall(ctx, x, y)
        // a borda da arena fica mais escura: emoldura o jogo e cansa menos a vista
        if (x === 0 || y === 0 || x === level.cols - 1 || y === level.rows - 1) {
          ctx.fillStyle = 'rgba(0, 0, 0, 0.3)'
          ctx.fillRect(x, y, 1 + seam, 1 + seam)
        }
      }
      else {
        if (floorImg) {
          // um tiquinho maior que a casa, pra não aparecer risquinho entre uma e outra
          ctx.drawImage(floorImg, x, y, 1 + seam, 1 + seam)
        } else {
          ctx.fillStyle = (x + y) % 2 ? C.floorA : C.floorB
          ctx.fillRect(x, y, 1, 1)
        }
        // sombrinha de quem está em cima e à esquerda (luz vem do alto): dá volume aos blocos
        const above = level.tiles[(y - 1) * level.cols + x]
        if (above === WALL || above === BLOCK) {
          const g = ctx.createLinearGradient(0, y, 0, y + 0.34)
          g.addColorStop(0, 'rgba(0, 0, 0, 0.45)')
          g.addColorStop(1, 'rgba(0, 0, 0, 0)')
          ctx.fillStyle = g
          ctx.fillRect(x, y, 1 + seam, 0.34)
        }
        const left = level.tiles[y * level.cols + x - 1]
        if (left === WALL || left === BLOCK) {
          const g = ctx.createLinearGradient(x, 0, x + 0.18, 0)
          g.addColorStop(0, 'rgba(0, 0, 0, 0.28)')
          g.addColorStop(1, 'rgba(0, 0, 0, 0)')
          ctx.fillStyle = g
          ctx.fillRect(x, y, 0.18, 1 + seam)
        }
        if (t === BLOCK) {
          const burn = s.burning.find((b) => b.x === x && b.y === y)
          // variação do caixote sorteada pela posição (a comum aparece mais)
          const variant = [0, 0, 0, 1, 2][(x * 7 + y * 11) % 5]
          drawBlock(ctx, x, y, burn ? 1 - burn.t / BURN_TIME : 0, tileSprite(s.tileset, 'block', variant))
        }
      }
    }
  }

  // vinheta: escurece de leve os cantos, puxando o olho pro meio da arena
  const vg = ctx.createRadialGradient(level.cols / 2, level.rows / 2, level.rows * 0.32,
    level.cols / 2, level.rows / 2, Math.hypot(level.cols, level.rows) * 0.55)
  vg.addColorStop(0, 'rgba(0, 0, 0, 0)')
  vg.addColorStop(1, 'rgba(0, 0, 0, 0.32)')
  ctx.fillStyle = vg
  ctx.fillRect(0, 0, level.cols, level.rows)
  drawAmbient(ctx, s.time)

  if (s.door.revealed) drawDoor(ctx, s.door, doorOpen(s), s.time)
  for (const pu of s.powerups) if (pu.revealed && !pu.taken) drawPowerup(ctx, pu, s.time)
  if (s.chest) drawChest(ctx, s.chest, s.time, chestNear(s))
  for (const b of s.bombs) drawBomb(ctx, b, s.time)
  for (const e of s.enemies) drawEnemy(ctx, e, s.time)
  if (s.boss) drawWhale(ctx, s.boss, s.time)
  for (const f of s.flames) drawFlame(ctx, f)
  drawPlayer(ctx, s.player, s.time)
  drawParticles(ctx, level.cols, level.rows)
}

// The Whale: baleia azul gigante (2x2). Pisca branco quando leva dano, fica vermelha quando brava.
function drawWhale(ctx, b, time) {
  if (!b.alive && b.deathT > 1.2) return
  const dying = b.alive ? 0 : b.deathT / 1.2
  const angry = b.hp <= BOSS.hp / 2
  const flash = b.hurtT > 0 && Math.sin(time * 40) > 0
  const bob = Math.sin(b.walkT * 4) * 0.05

  ctx.save()
  ctx.translate(b.x + 0.5, b.y + 0.5 + bob)
  ctx.globalAlpha = 1 - dying
  ctx.rotate(dying * 1.5)
  ctx.scale(1 - dying * 0.5, 1 - dying * 0.5)

  // sombra
  ctx.fillStyle = 'rgba(0,0,0,0.3)'
  ctx.beginPath(); ctx.ellipse(0, 0.85, 0.85, 0.14, 0, 0, Math.PI * 2); ctx.fill()

  const body = flash ? '#ffffff' : angry ? '#5b2a6e' : '#2b4f8f'
  const belly = flash ? '#ffffff' : angry ? '#d7a3e0' : '#a9c6ee'

  // rabo
  ctx.fillStyle = body
  ctx.beginPath()
  ctx.moveTo(0.7, 0.1)
  ctx.quadraticCurveTo(1.0, -0.2, 1.0, -0.55)
  ctx.quadraticCurveTo(0.85, -0.3, 0.7, -0.35)
  ctx.closePath(); ctx.fill()
  // corpo
  ctx.beginPath(); ctx.ellipse(0, 0.1, 0.9, 0.7, 0, 0, Math.PI * 2); ctx.fill()
  // barriga
  ctx.fillStyle = belly
  ctx.beginPath(); ctx.ellipse(-0.05, 0.38, 0.62, 0.32, 0, 0, Math.PI); ctx.fill()

  // jato d'água (quando para pra soltar FUD)
  if (b.pauseT > 0 && b.alive) {
    ctx.fillStyle = '#7fd3ff'
    const h = 0.5 + Math.sin(time * 30) * 0.08
    ctx.fillRect(-0.06, -0.6 - h, 0.12, h)
    ctx.beginPath(); ctx.arc(-0.15, -0.65 - h, 0.12, 0, Math.PI * 2); ctx.arc(0.15, -0.65 - h, 0.12, 0, Math.PI * 2); ctx.fill()
  }

  // coroa dourada
  ctx.fillStyle = '#e6c25a'
  ctx.beginPath()
  ctx.moveTo(-0.3, -0.5); ctx.lineTo(-0.3, -0.8); ctx.lineTo(-0.15, -0.65); ctx.lineTo(0, -0.88)
  ctx.lineTo(0.15, -0.65); ctx.lineTo(0.3, -0.8); ctx.lineTo(0.3, -0.5)
  ctx.closePath(); ctx.fill()

  // olhos bravos
  if (!dying) {
    for (const ex of [-0.38, 0.12]) {
      ctx.fillStyle = '#fff'
      ctx.beginPath(); ctx.arc(ex, -0.05, 0.13, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = angry ? '#c4314b' : C.eye
      ctx.beginPath(); ctx.arc(ex + 0.02, -0.03, 0.07, 0, Math.PI * 2); ctx.fill()
    }
    ctx.strokeStyle = C.eye
    ctx.lineWidth = 0.06
    ctx.beginPath()
    ctx.moveTo(-0.55, -0.25); ctx.lineTo(-0.28, -0.15)
    ctx.moveTo(0.29, -0.25); ctx.lineTo(0.02, -0.15)
    ctx.stroke()
  }
  ctx.restore()
}

function drawDoor(ctx, d, open, time) {
  const { x, y } = d
  ctx.fillStyle = '#7a5c1c'
  ctx.beginPath(); ctx.roundRect(x + 0.12, y + 0.08, 0.76, 0.86, [0.38, 0.38, 0.04, 0.04]); ctx.fill()
  if (open) {
    const glow = 0.75 + 0.25 * Math.sin(time * 5)
    ctx.fillStyle = `rgba(255, 224, 120, ${glow})`
  } else {
    ctx.fillStyle = '#120e1c'
  }
  ctx.beginPath(); ctx.roundRect(x + 0.22, y + 0.18, 0.56, 0.76, [0.28, 0.28, 0, 0]); ctx.fill()
  if (!open) {
    // grades fechadas enquanto ainda tem inimigo
    ctx.strokeStyle = '#c9a24a'
    ctx.lineWidth = 0.05
    ctx.beginPath()
    for (const gx of [0.36, 0.5, 0.64]) { ctx.moveTo(x + gx, y + 0.22); ctx.lineTo(x + gx, y + 0.94) }
    ctx.stroke()
  }
}

// Baú: fechado (brilha quando o jogador chega perto), tremendo enquanto abre, aberto depois.
function drawChest(ctx, c, time, near) {
  const { x, y } = c
  const opening = c.state === 'opening'
  const opened = c.state === 'opened'
  const shakeX = opening ? Math.sin(time * 45) * 0.05 : 0
  const pop = c.state === 'closed' ? Math.abs(Math.sin(time * 3)) * 0.04 : 0
  ctx.save()
  ctx.translate(x + 0.5 + shakeX, y + 0.5 - pop)

  // brilho em volta: chamando o jogador
  if (c.state === 'closed' || opening) {
    const a = near ? 0.55 + 0.25 * Math.sin(time * 8) : 0.25 + 0.15 * Math.sin(time * 4)
    ctx.fillStyle = `rgba(255, 214, 102, ${a})`
    ctx.beginPath(); ctx.arc(0, 0.05, 0.55, 0, Math.PI * 2); ctx.fill()
  }
  if (opened && c.result?.win) {
    ctx.fillStyle = `rgba(255, 230, 120, ${0.5 + 0.2 * Math.sin(time * 6)})`
    ctx.beginPath(); ctx.arc(0, -0.05, 0.5, 0, Math.PI * 2); ctx.fill()
  }

  ctx.fillStyle = 'rgba(0,0,0,0.3)'
  ctx.beginPath(); ctx.ellipse(0, 0.38, 0.36, 0.08, 0, 0, Math.PI * 2); ctx.fill()

  // caixa
  ctx.fillStyle = '#7a4a1f'
  ctx.beginPath(); ctx.roundRect(-0.36, -0.05, 0.72, 0.42, 0.06); ctx.fill()
  ctx.fillStyle = '#a5672c'
  ctx.fillRect(-0.32, 0, 0.64, 0.32)
  // tampa (fechada ou aberta pra trás)
  if (opened) {
    ctx.fillStyle = '#2a1a0c'
    ctx.fillRect(-0.32, -0.08, 0.64, 0.1)
    ctx.fillStyle = '#7a4a1f'
    ctx.beginPath(); ctx.roundRect(-0.36, -0.42, 0.72, 0.3, 0.1); ctx.fill()
  } else {
    ctx.fillStyle = '#8c5524'
    ctx.beginPath(); ctx.roundRect(-0.38, -0.32, 0.76, 0.3, [0.16, 0.16, 0.03, 0.03]); ctx.fill()
  }
  // faixas e fechadura douradas
  ctx.fillStyle = '#e6c25a'
  ctx.fillRect(-0.24, opened ? -0.42 : -0.32, 0.07, opened ? 0.3 : 0.69)
  ctx.fillRect(0.17, opened ? -0.42 : -0.32, 0.07, opened ? 0.3 : 0.69)
  if (opened) { ctx.fillRect(-0.24, -0.05, 0.07, 0.42); ctx.fillRect(0.17, -0.05, 0.07, 0.42) }
  if (!opened) {
    ctx.beginPath(); ctx.roundRect(-0.08, -0.1, 0.16, 0.18, 0.03); ctx.fill()
    ctx.fillStyle = '#2a1a0c'
    ctx.fillRect(-0.02, -0.05, 0.04, 0.08)
  }
  ctx.restore()
}

function drawPowerup(ctx, pu, time) {
  const { x, y } = pu
  const lift = Math.sin(time * 4 + x) * 0.03
  ctx.fillStyle = { bomb: '#3b6fd8', fire: '#d8572b', speed: '#2fae6a' }[pu.kind]
  ctx.strokeStyle = '#f3e3b0'
  ctx.lineWidth = 0.06
  ctx.beginPath(); ctx.roundRect(x + 0.14, y + 0.14 + lift, 0.72, 0.72, 0.12); ctx.fill(); ctx.stroke()
  const cx = x + 0.5, cy = y + 0.5 + lift
  if (pu.kind === 'bomb') {
    ctx.fillStyle = C.bomb
    ctx.beginPath(); ctx.arc(cx, cy + 0.04, 0.2, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = C.flameIn
    ctx.beginPath(); ctx.arc(cx + 0.13, cy - 0.17, 0.05, 0, Math.PI * 2); ctx.fill()
  } else if (pu.kind === 'fire') {
    ctx.fillStyle = C.flameIn
    ctx.beginPath()
    ctx.moveTo(cx, cy - 0.26)
    ctx.quadraticCurveTo(cx + 0.24, cy, cx + 0.14, cy + 0.2)
    ctx.quadraticCurveTo(cx, cy + 0.27, cx - 0.14, cy + 0.2)
    ctx.quadraticCurveTo(cx - 0.24, cy, cx, cy - 0.26)
    ctx.fill()
  } else {
    // botinha = duas setinhas pra direita
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 0.08
    ctx.beginPath()
    for (const ox of [-0.12, 0.06]) {
      ctx.moveTo(cx + ox - 0.06, cy - 0.16); ctx.lineTo(cx + ox + 0.08, cy); ctx.lineTo(cx + ox - 0.06, cy + 0.16)
    }
    ctx.stroke()
  }
}

// FUD = fantasminha cinza; Bear = urso marrom; Rug Pull = tapete vermelho com franja
// Inimigo com arte: marchinha (pulinho duro + balanço), espelha quando anda pra esquerda,
// e ao morrer pisca branco, achata e some.
const ENEMY_H = { marine: 1.15, sarge: 1.25 } // o sargento é maior

function drawEnemySprite(ctx, e, time, img) {
  const dying = e.alive ? 0 : Math.min(1, e.deathT / 0.6)
  const h = ENEMY_H[e.type] ?? 1.15
  const w = h * (img.naturalWidth / img.naturalHeight)
  const feetY = e.y + 0.92
  const heavy = e.type === 'sarge' // o sargento anda pesado: passo lento, pisa forte e "respira"
  const phase = e.walkT * (heavy ? (e.angry ? 9 : 6) : (e.angry ? 13 : 9))
  const k = Math.abs(Math.sin(phase))
  const hop = e.alive ? k * (heavy ? 0.04 : 0.06) : 0
  const tilt = e.alive ? Math.sin(phase) * (heavy ? 0.09 : 0.06) : 0
  const breathe = heavy && e.alive ? 1 + Math.sin(e.walkT * 2.5) * 0.04 : 1
  const stomp = heavy && e.alive ? 0.92 + k * 0.08 : 1 // amassa ao pisar
  const flip = e.dir === 'left' ? -1 : 1

  ctx.save()
  ctx.fillStyle = 'rgba(0,0,0,0.3)'
  ctx.beginPath(); ctx.ellipse(e.x + 0.5, feetY, 0.28 * (1 - dying), 0.07, 0, 0, Math.PI * 2); ctx.fill()
  ctx.translate(e.x + 0.5, feetY - hop)
  ctx.rotate(tilt)
  ctx.scale(flip * (1 + dying * 0.3) * breathe / Math.sqrt(stomp), (1 - dying * 0.7) * stomp)
  const blink = Math.sin(time * 40) > 0 ? 1 : 0.35
  ctx.globalAlpha = dying ? (1 - dying) * blink : e.hurtT > 0 ? blink : 1
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, -w / 2, -h, w, h)
  ctx.restore()

  // bravo: sinalzinho vermelho de raiva em cima da cabeça
  if (e.angry && e.alive) {
    const ax = e.x + 0.5 + w * 0.32, ay = feetY - hop - h * 0.95
    const pulse = 1 + Math.sin(time * 10) * 0.12
    ctx.save()
    ctx.translate(ax, ay)
    ctx.scale(pulse, pulse)
    ctx.strokeStyle = '#e8303f'
    ctx.lineWidth = 0.045
    ctx.lineCap = 'round'
    ctx.beginPath()
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      ctx.moveTo(sx * 0.03, sy * 0.1); ctx.quadraticCurveTo(sx * 0.03, sy * 0.03, sx * 0.1, sy * 0.03)
    }
    ctx.stroke()
    ctx.restore()
  }
}

function drawEnemy(ctx, e, time) {
  if (!e.alive && e.deathT > 0.6) return
  const art = sprite(`enemy_${e.type}`)
  if (art) return drawEnemySprite(ctx, e, time, art)
  const dying = e.alive ? 0 : e.deathT / 0.6
  const bob = Math.sin(e.walkT * 8) * 0.04
  const cx = e.x + 0.5, cy = e.y + 0.52 + bob
  ctx.save()
  ctx.globalAlpha = 1 - dying
  ctx.translate(cx, cy)
  ctx.scale(1 + dying * 0.4, 1 - dying * 0.6)

  if (e.type === 'marine') {
    // Blue Marine (provisório): ovinho azul com quepe branco de marinheiro
    ctx.fillStyle = dying ? '#fff' : '#2f5fd0'
    ctx.beginPath(); ctx.ellipse(0, 0.04, 0.28, 0.3, 0, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#f2f4fa'
    ctx.beginPath(); ctx.ellipse(0, -0.26, 0.2, 0.07, 0, 0, Math.PI * 2); ctx.fill()
    ctx.fillRect(-0.15, -0.36, 0.3, 0.1)
    ctx.fillStyle = '#1b2f6b'
    ctx.fillRect(-0.15, -0.29, 0.3, 0.04)
  } else if (e.type === 'fud') {
    ctx.fillStyle = dying ? '#fff' : '#9a93b8'
    ctx.beginPath()
    ctx.arc(0, -0.06, 0.3, Math.PI, 0)
    ctx.lineTo(0.3, 0.3)
    for (let i = 0; i < 4; i++) {
      const wx = 0.3 - (i + 0.5) * 0.15
      ctx.quadraticCurveTo(wx, 0.3 - 0.12 * (i % 2 ? -1 : 1) + Math.sin(time * 8 + i) * 0.03, 0.3 - (i + 1) * 0.15, 0.3)
    }
    ctx.closePath(); ctx.fill()
  } else if (e.type === 'bear') {
    ctx.fillStyle = dying ? '#fff' : '#8a5a33'
    ctx.beginPath(); ctx.arc(-0.22, -0.24, 0.1, 0, Math.PI * 2); ctx.arc(0.22, -0.24, 0.1, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.roundRect(-0.32, -0.28, 0.64, 0.6, 0.2); ctx.fill()
    ctx.fillStyle = '#d9b48a'
    ctx.beginPath(); ctx.ellipse(0, 0.12, 0.13, 0.09, 0, 0, Math.PI * 2); ctx.fill()
  } else {
    ctx.rotate(Math.sin(e.walkT * 10) * 0.12)
    ctx.fillStyle = dying ? '#fff' : '#c4314b'
    ctx.fillRect(-0.32, -0.26, 0.64, 0.52)
    ctx.fillStyle = '#f3e3b0'
    ctx.fillRect(-0.24, -0.18, 0.48, 0.06)
    ctx.fillRect(-0.24, 0.12, 0.48, 0.06)
    ctx.strokeStyle = '#f3e3b0'
    ctx.lineWidth = 0.03
    ctx.beginPath()
    for (let i = 0; i < 6; i++) { const fx = -0.3 + i * 0.12; ctx.moveTo(fx, 0.26); ctx.lineTo(fx, 0.34) }
    ctx.stroke()
  }

  // olhos bravos
  if (!dying) {
    ctx.fillStyle = '#fff'
    for (const ex of [-0.1, 0.1]) { ctx.beginPath(); ctx.arc(ex, -0.04, 0.065, 0, Math.PI * 2); ctx.fill() }
    ctx.fillStyle = C.eye
    for (const ex of [-0.1, 0.1]) { ctx.beginPath(); ctx.arc(ex, -0.03, 0.035, 0, Math.PI * 2); ctx.fill() }
    ctx.strokeStyle = C.eye
    ctx.lineWidth = 0.035
    ctx.beginPath()
    ctx.moveTo(-0.17, -0.15); ctx.lineTo(-0.04, -0.1)
    ctx.moveTo(0.17, -0.15); ctx.lineTo(0.04, -0.1)
    ctx.stroke()
  }
  ctx.restore()
}

function drawWall(ctx, x, y) {
  ctx.fillStyle = C.wallDark
  ctx.fillRect(x, y, 1, 1)
  ctx.fillStyle = C.wallMid
  ctx.fillRect(x + 0.04, y + 0.04, 0.92, 0.78)
  ctx.fillStyle = C.wallLight
  ctx.fillRect(x + 0.04, y + 0.04, 0.92, 0.1)
}

// Bloco com arte: o vaso de barro. Queimando, ele encolhe, fica alaranjado e some.
function drawBlockSprite(ctx, x, y, burn, img) {
  const w = 0.94 * (1 - burn * 0.5)
  const h = w * (img.naturalHeight / img.naturalWidth)
  const left = x + 0.5 - w / 2
  const top = y + 0.97 - h - burn * 0.1
  ctx.save()
  ctx.fillStyle = 'rgba(0,0,0,0.25)'
  ctx.beginPath(); ctx.ellipse(x + 0.5, y + 0.95, w * 0.48, 0.06, 0, 0, Math.PI * 2); ctx.fill()
  ctx.globalAlpha = 1 - burn * 0.8
  ctx.drawImage(img, left, top, w, h)
  if (burn > 0) {
    ctx.globalAlpha = burn * 0.7
    ctx.fillStyle = C.blastOut
    ctx.beginPath(); ctx.roundRect(left, top, w, h, 0.1); ctx.fill()
  }
  ctx.restore()
}

function drawBlock(ctx, x, y, burn, img) {
  if (img) return drawBlockSprite(ctx, x, y, burn, img)
  // burn: 0 = inteiro, 1 = sumiu
  const shrink = burn * 0.35
  const s = 1 - shrink * 2
  ctx.save()
  ctx.globalAlpha = 1 - burn * 0.7
  ctx.fillStyle = burn > 0 ? C.flameOut : C.blockDark
  ctx.fillRect(x + 0.05 + shrink, y + 0.05 + shrink, 0.9 * s, 0.9 * s)
  ctx.fillStyle = burn > 0 ? C.flameIn : C.blockMid
  ctx.fillRect(x + 0.1 + shrink, y + 0.1 + shrink, 0.8 * s, 0.72 * s)
  if (!burn) {
    ctx.fillStyle = C.blockLight
    ctx.fillRect(x + 0.1, y + 0.1, 0.8, 0.08)
    ctx.strokeStyle = C.blockDark
    ctx.lineWidth = 0.05
    ctx.beginPath()
    ctx.moveTo(x + 0.1, y + 0.46); ctx.lineTo(x + 0.9, y + 0.46)
    ctx.moveTo(x + 0.5, y + 0.1); ctx.lineTo(x + 0.5, y + 0.46)
    ctx.moveTo(x + 0.3, y + 0.46); ctx.lineTo(x + 0.3, y + 0.82)
    ctx.moveTo(x + 0.7, y + 0.46); ctx.lineTo(x + 0.7, y + 0.82)
    ctx.stroke()
  }
  ctx.restore()
}

// Bomba com arte: a mesma bomba do logo do Pyth Bomb (esfera roxa com redemoinho + chamas).
// Pulsa cada vez mais rápido e, no finzinho, pisca clarão branco.
const BOMB_H = 1.0          // altura do desenho em casas (as chamas passam um pouco da casa)
const BOMB_SPHERE_Y = 0.70  // centro da esfera, a partir do topo da imagem (fração da altura)
const BOMB_SPHERE_R = 0.30  // raio da esfera (fração da altura)

function drawBombSprite(ctx, b, time, img) {
  const left = b.timer / FUSE_TIME
  const rate = 6 + (1 - left) * 18
  const pulse = 1 + 0.07 * Math.sin(time * rate)
  // ao cair no chão: amassa e quica (primeiro 0,3 s)
  const age = FUSE_TIME - b.timer
  const drop = age < 0.3 ? Math.sin((age / 0.3) * Math.PI) * (1 - age / 0.3) : 0
  const h = BOMB_H * pulse * (1 - drop * 0.3)
  const w = (BOMB_H * pulse * (img.naturalWidth / img.naturalHeight)) * (1 + drop * 0.25)
  const bottom = b.y + 0.95
  const cx = b.x + 0.5
  const sphereY = bottom - h + h * BOMB_SPHERE_Y, sphereR = h * BOMB_SPHERE_R
  ctx.save()
  ctx.fillStyle = 'rgba(0,0,0,0.3)'
  ctx.beginPath(); ctx.ellipse(cx, b.y + 0.9, 0.27, 0.07, 0, 0, Math.PI * 2); ctx.fill()
  // brilho em volta que cresce conforme o pavio queima
  const heat = 1 - left
  const hg = ctx.createRadialGradient(cx, sphereY, 0, cx, sphereY, sphereR * (1.6 + heat))
  hg.addColorStop(0, `rgba(${heat > 0.6 ? '255, 90, 220' : '160, 80, 255'}, ${0.15 + heat * 0.35})`)
  hg.addColorStop(1, 'rgba(160, 80, 255, 0)')
  ctx.fillStyle = hg
  ctx.fillRect(cx - 1, sphereY - 1, 2, 2)
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, cx - w / 2, bottom - h, w, h)
  // roxo -> magenta conforme vai chegando a hora
  if (heat > 0.35) {
    ctx.fillStyle = `rgba(255, 60, 200, ${Math.min(0.4, (heat - 0.35) * 0.7)})`
    ctx.beginPath(); ctx.arc(cx, sphereY, sphereR, 0, Math.PI * 2); ctx.fill()
  }
  if (b.timer < 0.6 && Math.sin(time * 40) > 0) {
    ctx.fillStyle = 'rgba(255, 240, 255, 0.45)'
    ctx.beginPath(); ctx.arc(cx, bottom - h + h * BOMB_SPHERE_Y, h * BOMB_SPHERE_R, 0, Math.PI * 2); ctx.fill()
  }
  ctx.restore()
}

function drawBomb(ctx, b, time) {
  const img = sprite('bomb')
  if (img) return drawBombSprite(ctx, b, time, img)
  // pulsa mais rápido e fica vermelha perto de explodir
  const left = b.timer / FUSE_TIME
  const rate = 6 + (1 - left) * 18
  const r = 0.32 * (1 + 0.07 * Math.sin(time * rate))
  const cx = b.x + 0.5, cy = b.y + 0.55
  ctx.fillStyle = 'rgba(0,0,0,0.3)'
  ctx.beginPath(); ctx.ellipse(cx, b.y + 0.88, 0.28, 0.08, 0, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = b.timer < 0.6 && Math.sin(time * 40) > 0 ? C.bombHot : C.bomb
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.25)'
  ctx.beginPath(); ctx.arc(cx - r * 0.35, cy - r * 0.35, r * 0.25, 0, Math.PI * 2); ctx.fill()
  // faísca do pavio
  ctx.fillStyle = Math.sin(time * 50) > 0 ? C.flameIn : C.flameOut
  ctx.beginPath(); ctx.arc(cx + r * 0.6, cy - r * 0.95, 0.07, 0, Math.PI * 2); ctx.fill()
}

function drawFlame(ctx, f) {
  const k = f.t / FLAME_TIME           // 1 = acabou de explodir, 0 = sumindo
  const w = 0.35 + 0.45 * Math.min(1, k * 1.6)
  const { x, y } = f
  const rect = (color, ww) => {
    ctx.fillStyle = color
    if (f.kind === 'h') ctx.fillRect(x, y + 0.5 - ww / 2, 1, ww)
    else if (f.kind === 'v') ctx.fillRect(x + 0.5 - ww / 2, y, ww, 1)
    else {
      ctx.fillRect(x, y + 0.5 - ww / 2, 1, ww)
      ctx.fillRect(x + 0.5 - ww / 2, y, ww, 1)
    }
  }
  rect(C.blastGlow, Math.min(1, w * 1.35))
  rect(C.blastOut, w)
  rect(C.blastMid, w * 0.62)
  rect(C.blastIn, w * 0.3)
}

// Personagem com arte: uma imagem só, de frente. A "vida" vem daqui:
// - cada passo é um pulinho que ESTICA no ar e AMASSA ao pisar (squash & stretch);
// - inclina o corpo pro lado em que está andando e rebola de leve subindo/descendo;
// - ao virar de lado, gira como papel (fica fininha e abre do outro lado);
// - solta poeirinha a cada passo; parada, respira e balança bem de leve.
const PLAYER_H = 1.3 // altura do desenho em casas (a cabeça passa um pouco da casa de cima)
const STEP_RATE = 10 // velocidade do ciclo de passos

// estado só visual (não muda o jogo): giro de papel, inclinação suave, poeira
const looks = new WeakMap()

function drawPlayerSprite(ctx, p, time, img) {
  let v = looks.get(p)
  if (!v) { v = { t: time, turn: p.flip && playerCanFlip ? -1 : 1, lean: 0, lastStep: 0, dust: [] }; looks.set(p, v) }
  const dt = Math.min(0.1, Math.max(0, time - v.t))
  v.t = time

  // giro de papel: vai de 1 até -1 passando por 0
  // tem arte própria pra direção (ex.: Pirb de lado)? então não espelha nem gira
  const ownArt = p.moving && p.facing !== 'down' && !!walkFrames(p.facing)
  const turnTo = p.flip && playerCanFlip && !ownArt ? -1 : 1
  v.turn += Math.sign(turnTo - v.turn) * Math.min(Math.abs(turnTo - v.turn), dt * 9)
  // inclinação suave na direção do movimento
  const leanAmt = ownArt ? 0.04 : 0.12 // a arte de lado já vem inclinada
  const leanTo = !p.moving ? 0 : p.facing === 'left' ? -leanAmt : p.facing === 'right' ? leanAmt : 0
  v.lean += (leanTo - v.lean) * Math.min(1, dt * 12)

  const dying = !p.alive ? Math.min(1, p.deathT / 0.8) : 0
  const feetY = p.y + 0.92

  let hop = 0, sy = 1, wobble = 0
  if (p.moving) {
    const phase = p.walkT * STEP_RATE
    const k = Math.abs(Math.sin(phase))       // 0 = pé no chão, 1 = no alto
    const step = Math.floor(phase / Math.PI)
    // com as 2 imagens de passo, alterna uma por passo (as pernas mexem de verdade)
    // sem as imagens de passo, o pulinho e o rebolado são mais fortes pra compensar
    const pair = walkFrames(p.facing) ?? walkFrames('down')
    const frames = !!pair
    if (frames) img = pair[step % 2]
    hop = k * (frames ? 0.07 : 0.1)
    sy = frames ? 0.94 + k * 0.08 : 0.9 + k * 0.14 // amassa no chão, estica no ar
    const vertical = p.facing === 'up' || p.facing === 'down'
    wobble = Math.sin(phase) * (frames ? (vertical ? 0.05 : 0.03) : (vertical ? 0.09 : 0.04))
    // poeirinha cada vez que pisa
    if (step !== v.lastStep) {
      v.lastStep = step
      const back = p.facing === 'left' ? 0.25 : p.facing === 'right' ? -0.25 : (step % 2 ? 0.2 : -0.2)
      v.dust.push({ x: p.x + 0.5 + back, y: feetY - 0.02, t: 0 })
    }
  } else if (p.alive) {
    sy = 1 + Math.sin(time * 3) * 0.02        // respirando
    wobble = Math.sin(time * 1.6) * 0.025
  }
  const sx = 1 / Math.sqrt(sy)                 // amassou embaixo = engorda dos lados
  const h = PLAYER_H
  const w = h * (img.naturalWidth / img.naturalHeight)

  // poeira
  v.dust = v.dust.filter((d) => (d.t += dt) < 0.35)
  for (const d of v.dust) {
    const k = d.t / 0.35
    ctx.fillStyle = `rgba(210, 200, 230, ${0.45 * (1 - k)})`
    ctx.beginPath(); ctx.arc(d.x, d.y - k * 0.08, 0.06 + k * 0.08, 0, Math.PI * 2); ctx.fill()
  }

  ctx.save()
  // luzinha roxa no chão: o jogador sempre se destaca no meio da bagunça
  if (!dying) {
    const glow = 0.3 + 0.08 * Math.sin(time * 3)
    const lg = ctx.createRadialGradient(p.x + 0.5, feetY, 0, p.x + 0.5, feetY, 0.6)
    lg.addColorStop(0, `rgba(170, 100, 255, ${glow})`)
    lg.addColorStop(1, 'rgba(170, 100, 255, 0)')
    ctx.fillStyle = lg
    ctx.beginPath(); ctx.ellipse(p.x + 0.5, feetY, 0.6, 0.26, 0, 0, Math.PI * 2); ctx.fill()
  }
  ctx.fillStyle = 'rgba(0,0,0,0.3)'
  const shadow = (1 - dying) * (1 - hop * 1.5)
  ctx.beginPath(); ctx.ellipse(p.x + 0.5, feetY, 0.3 * shadow, 0.08 * shadow, 0, 0, Math.PI * 2); ctx.fill()

  ctx.translate(p.x + 0.5, feetY - hop)
  ctx.rotate(v.lean + wobble + dying * Math.PI * 2)
  ctx.scale(v.turn * sx * (1 - dying), sy * (1 - dying))
  if (dying) ctx.globalAlpha = Math.sin(time * 40) > 0 ? 0.5 : 1
  ctx.imageSmoothingQuality = 'high'
  // contorno roxo bem sutil em volta do personagem
  ctx.shadowColor = 'rgba(180, 110, 255, 0.85)'
  ctx.shadowBlur = Math.max(2, 0.09 * pxScale)
  ctx.drawImage(img, -w / 2, -h, w, h)
  ctx.restore()
}

function drawPlayer(ctx, p, time) {
  if (!p.alive && p.deathT > 0.8) return
  const img = sprite('player')
  if (img) return drawPlayerSprite(ctx, p, time, img)
  const bob = p.moving ? Math.abs(Math.sin(p.walkT * 12)) * 0.07 : 0
  const dying = !p.alive ? Math.min(1, p.deathT / 0.8) : 0
  const size = 0.7 * (1 - dying)
  const cx = p.x + 0.5, cy = p.y + 0.5 - bob

  ctx.save()
  ctx.fillStyle = 'rgba(0,0,0,0.3)'
  ctx.beginPath(); ctx.ellipse(p.x + 0.5, p.y + 0.88, 0.28 * (1 - dying), 0.08, 0, 0, Math.PI * 2); ctx.fill()
  ctx.translate(cx, cy)
  ctx.rotate(dying * Math.PI * 2)
  ctx.fillStyle = dying ? (Math.sin(time * 40) > 0 ? '#ff4d4d' : C.player) : C.player
  ctx.strokeStyle = C.playerDark
  ctx.lineWidth = 0.06
  ctx.beginPath()
  ctx.roundRect(-size / 2, -size / 2, size, size, 0.14)
  ctx.fill(); ctx.stroke()

  // olhinhos mostram pra onde ele está virado
  if (!dying) {
    const look = { up: [0, -0.1], down: [0, 0.08], left: [-0.1, 0], right: [0.1, 0] }[p.facing]
    ctx.fillStyle = C.eye
    if (p.facing !== 'up') {
      for (const ex of [-0.12, 0.12]) {
        ctx.beginPath(); ctx.arc(ex + look[0], -0.05 + look[1], 0.06, 0, Math.PI * 2); ctx.fill()
      }
    }
  }
  ctx.restore()
}
