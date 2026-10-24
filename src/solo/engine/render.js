// Desenha o estado do jogo num <canvas>, por enquanto só com formas simples (sem arte).
// Tudo é desenhado em "casas": 1 unidade = 1 casa da grade; a escala vem de fora.
import { FLOOR, WALL, BLOCK, FLAME_TIME, BURN_TIME, FUSE_TIME } from './constants.js'
import { doorOpen, chestNear } from './game.js'
import { BOSS } from './boss.js'
import { hullWallOf } from './wallmix.js'
import { sprite, tileSprite, tinted, hueShifted, floorTile, wallVariants, leakFrames, bossFrames, holeFrames, warnFrames, jetFrames, walkFrames, playerCanFlip, isPixel, PX_TILE, RIGS } from './sprites.js'
import { drawAmbient, drawParticles } from './fx.js'

let pxScale = 1 // pixels de tela por casa (pra brilhos que são medidos em pixels)

// Tamanho (em casas) de uma imagem: arte pixel usa o tamanho nativo (1 pixel da arte =
// 1/PX_TILE de casa); arte pintada usa a altura (ou largura) pedida, mantendo a proporção.
function sizeByH(img, wantH) {
  if (isPixel(img)) return [img.naturalWidth / PX_TILE, img.naturalHeight / PX_TILE]
  return [wantH * img.naturalWidth / img.naturalHeight, wantH]
}
function sizeByW(img, wantW) {
  if (isPixel(img)) return [img.naturalWidth / PX_TILE, img.naturalHeight / PX_TILE]
  return [wantW, wantW * img.naturalHeight / img.naturalWidth]
}
// desenha a imagem; arte pixel sai sem suavizar (pixels quadrados)
function blit(ctx, img, x, y, w, h) {
  if (!isPixel(img)) return ctx.drawImage(img, x, y, w, h)
  const smooth = ctx.imageSmoothingEnabled
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(img, x, y, w, h)
  ctx.imageSmoothingEnabled = smooth
}

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

// cor dos caixotes quebráveis (levels.js `crateTone`): lista de passos pra tinted() em sprites.js, um depois do outro
// 'wood' = madeira num tom padrão (marrom médio, como pinho/carvalho): troca o verde-oliva por marrom
const CRATE_TONES = {
  wood: [['rgb(168, 112, 58)', 0.92]],
}

// climas (levels.js `mood`): [cor, força] das paredes, pra tinted() em sprites.js
const MOODS = {
  bear: { wall: ['rgb(215, 50, 65)', 0.3] },
}

// Poça de ÁGUA ENTRANDO NO NAVIO (fase 2: o convés está vazando). A água brota por uma fissura na fresta entre
// as tábuas:
//   - a madeira em volta fica escura e molhada;
//   - a poça sobe e desce devagar (a maré), com a fresta das tábuas aparecendo por baixo da água;
//   - bolhas sobem da fissura e estouram na superfície; de vez em quando sai um esguicho baixinho;
//   - ondinhas abrem devagar, e a água escorre pela fresta pros dois lados (um riozinho com brilhos andando).
// Pixel grosso: tudo numa grade de 24x24 "quadradões" (cada um 2x2 pixels da arte, 1/24 de casa), com contorno
// azul nas bolhas e no esguicho. Só enfeite: não muda nada no jogo.
const WATER = {
  rim: 'rgb(30, 92, 158)', fill: 'rgb(46, 132, 200)', deep: 'rgb(36, 108, 178)', seam: 'rgb(26, 80, 146)', hole: 'rgb(16, 44, 86)',
  edge: 'rgb(52, 158, 224)', cyan: 'rgb(112, 238, 255)', white: 'rgb(226, 255, 255)', wet: 'rgb(18, 9, 4)',
}
const noise2 = (x, y, s) => { const v = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453; return v - Math.floor(v) }
const WQ = 2 // tamanho do quadradão da água, em pixels da arte
const WG = PX_TILE / WQ // grade da casa: 24x24 quadradões
const PUD_CX = 12, PUD_CY = 16 // centro da poça na grade; a linha 16 (pixels 32 e 33) é a fresta entre as tábuas do piso
const wbuf = new Uint8Array(WG * WG) // bolhas e esguicho: 0 vazio, 1 água, 2 brilho, 3 contorno
const wput = (x, y) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && x < WG && y >= 0 && y < WG) wbuf[y * WG + x] = 1 }

// Vazamento da fase 2 com a ARTE em 3 quadros (rachadura + fio d'água caindo numa poça): toca os quadros em
// sequência (6 por segundo, cada vazamento começando num ponto diferente do ciclo), com a madeira escura e
// molhada em volta. Se a arte ainda não carregou (ou no estilo pintado), usa o vazamento desenhado pelo código.
function drawPuddle(ctx, p, time, scale) {
  if (p.kind === 'tap') return drawTapPuddle(ctx, p, time, scale)
  const v = p.variant === 1 ? 'b' : 'a'
  const frames = p.set ? (leakFrames(`${p.set}_${v}`) ?? leakFrames(`${p.set}_a`)) : leakFrames(v) // p.set: conjunto próprio da fase (ex.: 'ale' = cerveja da taverna)
  if (!frames) return drawPuddleProcedural(ctx, p, time, scale)
  const u = 1 / PX_TILE
  const q = WQ * u + 1 / scale
  const img = frames[(((Math.floor(time * 6 + p.seed) % 3) + 3) % 3)]
  const [w, h] = [img.naturalWidth, img.naturalHeight]
  ctx.save()
  // madeira molhada: mancha escura e irregular em volta da poça (que fica no pé do desenho)
  const hx = 12, hy = 19 // centro da mancha, na grade de quadradões
  for (let iy = -5; iy <= 5; iy++) {
    for (let ix = -9; ix <= 9; ix++) {
      const e = (ix * ix) / 81 + (iy * iy) / 20 + (noise2(ix + 40, iy, p.seed) - 0.5) * 0.35
      if (e > 1) continue
      ctx.globalAlpha = 0.34 * (1 - e)
      ctx.fillStyle = WATER.wet
      ctx.fillRect(p.x + (hx + ix) * WQ * u, p.y + (hy + iy) * WQ * u, q, q)
    }
  }
  ctx.globalAlpha = 1
  ctx.imageSmoothingEnabled = false
  const dx = p.x + (PX_TILE - w) / 2 * u, dy = p.y + (44 - h) * u
  if (p.flip) { // espelhado (o mesmo desenho em outro vazamento)
    ctx.translate(dx * 2 + w * u, 0)
    ctx.scale(-1, 1)
  }
  ctx.drawImage(img, dx, dy, w * u, h * u)
  ctx.restore()
}

// Poça de cerveja que ESCORRE DA TORNEIRA de um bloco de barril da parede (a casa de cima de p): o fio sai da torneira
// (no pé do bloco) e cai na poça, no chão logo abaixo, com a madeira molhada em volta.
const TAP_X = 24 / PX_TILE, TAP_Y = 40 / PX_TILE // onde a cerveja sai, dentro do bloco de barril (em casas)
const TAP_ANCHOR = 17.3 // coluna (em pixels) do fio dentro do desenho
function drawTapPuddle(ctx, p, time, scale) {
  const v = p.variant === 1 ? 'b' : 'a'
  const frames = leakFrames(`${p.set}_tap_${v}`) ?? leakFrames(`${p.set}_tap_a`)
  if (!frames) return
  const u = 1 / PX_TILE
  const img = frames[(((Math.floor(time * 6 + p.seed) % 3) + 3) % 3)]
  const w = img.naturalWidth, h = img.naturalHeight
  const left = Math.round((p.x + TAP_X - TAP_ANCHOR * u) * PX_TILE) / PX_TILE
  const top = Math.round((p.y - 1 + TAP_Y) * PX_TILE) / PX_TILE
  const q = WQ * u + 1 / scale
  ctx.save()
  // madeira molhada em volta da poça (o centro dela fica uns 26 pixels abaixo da saída da torneira)
  const hx = (left - p.x) / u + 18, hy = (top - p.y) / u + 26 // em pixels, relativo à casa
  for (let iy = -5; iy <= 5; iy++) {
    for (let ix = -9; ix <= 9; ix++) {
      const e = (ix * ix) / 81 + (iy * iy) / 20 + (noise2(ix + 40, iy, p.seed) - 0.5) * 0.35
      if (e > 1) continue
      ctx.globalAlpha = 0.34 * (1 - e)
      ctx.fillStyle = WATER.wet
      ctx.fillRect(p.x + (hx / WQ + ix) * WQ * u, p.y + (hy / WQ + iy) * WQ * u, q, q)
    }
  }
  ctx.globalAlpha = 1
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(img, left, top, w * u, h * u)
  ctx.restore()
}

function drawPuddleProcedural(ctx, p, time, scale) {
  const u = 1 / PX_TILE
  const q = WQ * u + 1 / scale // um quadradão (um tiquinho maior, pra não aparecer risco entre eles)
  const cx = PUD_CX, cy = PUD_CY
  const cell = (gx, gy, color) => { ctx.fillStyle = color; ctx.fillRect(p.x + gx * WQ * u, p.y + gy * WQ * u, q, q) }
  const tide = 1 + 0.13 * Math.sin(time * 0.9 + p.seed) // a água sobe e desce devagar
  const rx = 7.2 * tide, ry = 3.0 * tide
  const inPool = (ix, iy, slack = 0) => (ix * ix) / (rx * rx) + (iy * iy) / (ry * ry) <= 1 + slack

  ctx.save()
  // 1) madeira molhada em volta da poça (mais escura perto da água)
  for (let iy = -6; iy <= 6; iy++) {
    for (let ix = -12; ix <= 11; ix++) {
      const e = (ix * ix) / 121 + (iy * iy) / 25 + (noise2(ix + 40, iy, p.seed) - 0.5) * 0.3
      if (e > 1 || inPool(ix, iy, 0.05)) continue
      ctx.globalAlpha = 0.36 * (1 - e)
      cell(cx + ix, cy + iy, WATER.wet)
    }
  }
  // 2) riozinho: a água escorre pela fresta pros dois lados e some nas pontas, com brilhos que andam
  for (let x = 0; x < WG; x++) {
    const d = Math.abs(x - cx)
    if (d <= rx) continue
    const a = 1 - (d - rx) / (WG / 2 - rx)
    if (a < 0.15) continue
    ctx.globalAlpha = 0.85 * a
    cell(x, cy, WATER.deep)
  }
  for (let k = 0; k < 3; k++) {
    const ph = (time * 0.55 + k / 3 + p.seed * 0.1) % 1
    const d = rx + ph * (WG / 2 - 0.5 - rx)
    ctx.globalAlpha = 1 - ph
    for (const side of [-1, 1]) cell(Math.round(cx + side * d), cy, WATER.cyan)
  }
  // 3) a poça (e a fresta das tábuas aparecendo por baixo da água, e a fissura escura de onde a água sai)
  ctx.globalAlpha = 0.96
  for (let iy = -5; iy <= 5; iy++) {
    for (let ix = -10; ix <= 10; ix++) {
      const e = (ix * ix) / (rx * rx) + (iy * iy) / (ry * ry) + (noise2(ix, iy, p.seed) - 0.5) * 0.25 // contorno irregular
      if (e > 1) continue
      let color = e > 0.72 ? WATER.rim : e > 0.3 ? WATER.deep : WATER.fill
      if (iy === 0 && e <= 0.72) color = WATER.seam
      cell(cx + ix, cy + iy, color)
    }
  }
  const crackDy = [0, 0, 1, 0, -1, 0, 0]
  crackDy.forEach((dy, i) => cell(cx - 3 + i, cy + dy, WATER.hole))
  // 4) ondinhas lentas, abrindo da fissura
  ctx.globalAlpha = 0.85
  for (const off of [0, 0.5]) {
    const age = (time * 0.4 + p.seed * 0.13 + off) % 1
    const r = 1.5 + age * (rx - 1.4), rr = r * 0.4
    for (let ph = 0; ph < Math.PI * 2; ph += 0.2) {
      if (age > 0.7 && Math.round(ph * 5) % 2) continue // no fim, a ondinha vai ficando tracejada
      cell(Math.round(cx + Math.cos(ph) * r), Math.round(cy + Math.sin(ph) * rr), WATER.cyan)
    }
  }
  ctx.globalAlpha = 1
  // brilhos que piscam na água
  for (let k = 0; k < 4; k++) {
    if (Math.sin(time * 2.2 + p.seed * 3 + k * 1.9) < 0.86) continue
    const gx = Math.round((noise2(k, 5, p.seed) - 0.5) * 10), gy = Math.round((noise2(k, 6, p.seed) - 0.5) * 3.5)
    if (inPool(gx, gy, -0.35)) cell(cx + gx, cy + gy, WATER.white)
  }

  // 5) bolhas subindo da fissura (estouram na superfície) e, de vez em quando, um esguicho baixinho
  wbuf.fill(0)
  for (let k = 0; k < 4; k++) {
    const P = 1.9 + k * 0.37
    const ph = ((time + p.seed + k * 0.9) % P) / P
    const bx = cx - 3 + k * 2 + Math.round((noise2(k, 1, p.seed) - 0.5) * 2)
    if (ph < 0.86) wput(bx, cy - ph * 3)
    else { wput(bx, cy - 3); wput(bx - 1, cy - 3.8); wput(bx + 1, cy - 3.8) } // estourou: gotinhas
  }
  const sp = (time + p.seed * 1.3) % 4.6
  if (sp < 0.8) {
    const h = 3.2 * Math.sin((sp / 0.8) * Math.PI)
    for (let j = 0; j < h; j++) wput(cx, cy - 1 - j)
    if (h > 2) { wput(cx - 1, cy - 1 - h - 0.5); wput(cx + 1, cy - 1 - h - 0.5) }
  }
  for (let y = 0; y < WG; y++) { // brilho nos quadradões de cima/esquerda e contorno azul em volta
    for (let x = 0; x < WG; x++) {
      if (wbuf[y * WG + x] !== 1) continue
      const upEmpty = y === 0 || wbuf[(y - 1) * WG + x] === 0, leftEmpty = x === 0 || wbuf[y * WG + x - 1] === 0
      if ((upEmpty || leftEmpty) && noise2(x, y, p.seed) > 0.7) wbuf[y * WG + x] = 2
    }
  }
  for (let y = 0; y < WG; y++) {
    for (let x = 0; x < WG; x++) {
      if (wbuf[y * WG + x] !== 0) continue
      const near = (xx, yy) => xx >= 0 && xx < WG && yy >= 0 && yy < WG && (wbuf[yy * WG + xx] === 1 || wbuf[yy * WG + xx] === 2)
      if (near(x - 1, y) || near(x + 1, y) || near(x, y - 1) || near(x, y + 1)) wbuf[y * WG + x] = 3
    }
  }
  for (let y = 0; y < WG; y++) {
    for (let x = 0; x < WG; x++) {
      const v = wbuf[y * WG + x]
      if (v) cell(x, y, v === 3 ? WATER.edge : v === 2 ? WATER.white : WATER.cyan)
    }
  }
  ctx.restore()
}

// Rachadura grande no chão (por onde a água entra): linha escura de 2 pixels com uma beirada clara em cima,
// desenhada pixel a pixel só onde o chão está livre (some debaixo de caixas e paredes e aparece quando a caixa
// queima). Os pontos vêm de game.js (makeCrack), em pixels do mapa.
function drawCrack(ctx, crack, level, scale) {
  const u = 1 / PX_TILE
  const size = u + 1 / scale
  const pts = crack.pts
  ctx.save()
  for (let i = 0; i < pts.length; i += 2) {
    const gx = pts[i], gy = pts[i + 1]
    const tx = Math.floor(gx / PX_TILE), ty = Math.floor(gy / PX_TILE)
    if (tx < 0 || ty < 0 || tx >= level.cols || ty >= level.rows || level.tiles[ty * level.cols + tx] !== FLOOR) continue
    ctx.fillStyle = 'rgba(190, 130, 80, 0.5)'
    ctx.fillRect(gx * u, (gy - 1) * u, size, size)
    ctx.fillStyle = 'rgb(16, 8, 5)'
    ctx.fillRect(gx * u, gy * u, size, size)
    ctx.fillRect(gx * u, (gy + 1) * u, size, size)
  }
  ctx.restore()
}

// cor do bloco fixo na casa (x, y): 0 = azul, 1 = amarelo, 2 = vermelho (sorteio fixo pela posição)
function wallColorOf(x, y) {
  const h = (((x * 73856093) ^ (y * 19349663)) >>> 0) % 10
  return h < 4 ? 0 : h < 7 ? 1 : 2
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
  // clima Bear Market: paredes puxadas pro vinho, caixotes marrons e o chão um tom mais claro; troca só a cor
  const mood = MOODS[s.mood]
  const crateSteps = CRATE_TONES[s.crateTone] ?? null // passos de cor dos caixotes quebráveis
  const floorImg = tileSprite(s.tileset, 'floor')
  const wallImg = mood ? tinted(tileSprite(s.tileset, 'wall'), ...mood.wall) : tileSprite(s.tileset, 'wall')
  // fase 1: os contêineres (blocos fixos de dentro do mapa) em cores misturadas: ~40% azul, ~30% amarelo,
  // ~30% vermelho, sorteados pela posição (o mesmo lugar sempre tem a mesma cor). A borda fica azul.
  // Todas as cores bem menos vivas (pela metade), com cara de desgastado.
  const wallColors = s.wallMix && wallImg
    ? [hueShifted(wallImg, 0, -0.04, 0.45), hueShifted(wallImg, 188, -0.02, 0.45), hueShifted(wallImg, 135, -0.03, 0.48)]
    : null
  const hullWalls = s.wall ? wallVariants(s.wall) : null // blocos fixos próprios da fase (casco de navio)
  const seam = 1 / scale
  for (let y = 0; y < level.rows; y++) {
    for (let x = 0; x < level.cols; x++) {
      const t = level.tiles[y * level.cols + x]
      if (t === WALL) {
        const inner = x > 0 && y > 0 && x < level.cols - 1 && y < level.rows - 1
        const wallHere = hullWalls ? hullWalls[hullWallOf(x, y)] // fase 2: blocos do casco misturados por posição
          : wallColors ? wallColors[inner ? wallColorOf(x, y) : 0] : wallImg // fase 1: borda no azul gasto
        if (hullWalls && floorImg) blit(ctx, (s.floor && floorTile(s.floor, x, y, 0.12)) || floorImg, x, y, 1 + seam, 1 + seam) // cantos transparentes do bloco: o chão aparece
        if (wallHere) blit(ctx, wallHere, x, y, 1 + seam, 1 + seam)
        else drawWall(ctx, x, y)
        // a borda da arena fica só um tiquinho mais escura, pra fechar a arena
        if (x === 0 || y === 0 || x === level.cols - 1 || y === level.rows - 1) {
          ctx.fillStyle = 'rgba(0, 0, 0, 0.08)'
          ctx.fillRect(x, y, 1 + seam, 1 + seam)
        }
      }
      else {
        const floorHere = (s.floor && floorTile(s.floor, x, y, 0.12)) || floorImg // chão próprio da fase (convés): montado por posição, ~12% rachado
        if (floorHere) {
          // um tiquinho maior que a casa, pra não aparecer risquinho entre uma e outra
          blit(ctx, floorHere, x, y, 1 + seam, 1 + seam)
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
          const variant = [0, 0, 0, 1, 2, 3][(x * 7 + y * 11) % 6]
          const blockImg = tileSprite(s.tileset, 'block', variant)
          drawBlock(ctx, x, y, burn ? 1 - burn.t / BURN_TIME : 0, crateSteps ? crateSteps.reduce((img, step) => tinted(img, ...step), blockImg) : blockImg)
        }
      }
    }
  }

  if (level.hole) drawHole(ctx, level.hole, s)
  for (const c of s.cracks ?? []) drawCrack(ctx, c, level, scale)
  for (const p of s.puddles ?? []) drawPuddle(ctx, p, s.time, scale)

  // vinheta: escurece de leve os cantos, puxando o olho pro meio da arena
  const vg = ctx.createRadialGradient(level.cols / 2, level.rows / 2, level.rows * 0.32,
    level.cols / 2, level.rows / 2, Math.hypot(level.cols, level.rows) * 0.55)
  vg.addColorStop(0, 'rgba(0, 0, 0, 0)')
  vg.addColorStop(1, 'rgba(0, 0, 0, 0.32)')
  ctx.fillStyle = vg
  ctx.fillRect(0, 0, level.cols, level.rows)
  drawWarmLight(ctx, level.cols, level.rows)
  drawAmbient(ctx, s.time, s.mood)

  if (s.boss) drawFrenzyLane(ctx, s.boss, s.time)
  drawJetWarnings(ctx, s)
  if (s.door.revealed) drawDoor(ctx, s.door, doorOpen(s), s.time, s.doorSet ?? s.tileset)
  for (const pu of s.powerups) if (pu.revealed && !pu.taken) drawPowerup(ctx, pu, s.time)
  if (s.chest) drawChest(ctx, s.chest, s.time, chestNear(s))
  for (const b of s.bombs) {
    const v = b.slide ? { ...b, x: b.x + b.slide.dx * b.slide.p, y: b.y + b.slide.dy * b.slide.p } : b
    drawBomb(ctx, v, s.time)
  }
  for (const e of s.enemies) drawEnemy(ctx, e, s.time)
  if (s.boss) drawWhale(ctx, s.boss, s.time)
  for (const f of s.flames) drawFlame(ctx, f)
  drawPlayer(ctx, s.player, s.time)
  drawJets(ctx, s)
  drawParticles(ctx, level.cols, level.rows)
}

// O BURACO no meio da arena do chefe (provisório, em código até chegar a arte em pixel): água escura girando num
// redemoinho, com espuma na borda; antes do CHOP sair ele borbulha.
function drawHole(ctx, h, s) {
  const cx = h.x + h.w / 2, cy = h.y + h.h / 2, t = s.time
  const frames = holeFrames()
  const bm = s.boss?.mode
  const intro = bm === 'intro' ? s.boss.introT : bm === 'under' || bm === 'sinking' || bm === 'rising' ? 0 : 99
  ctx.save()
  if (frames) { // a ARTE: redemoinho de 3 quadros (6 por segundo) com o aro de tábuas quebradas
    blit(ctx, frames[Math.floor(t * 6) % 3], h.x, h.y, h.w, h.h)
    if (intro < BOSS.introSplashAt + 0.4) { // borbulhando: bolhas por cima
      ctx.fillStyle = 'rgba(210, 240, 255, 0.9)'
      for (let i = 0; i < 9; i++) {
        const ph = (t * 2.2 + i * 0.37) % 1
        ctx.fillRect(cx + Math.sin(i * 2.3) * 0.9 - 0.04, cy + Math.cos(i * 1.7) * 0.7 - ph * 0.5 - 0.04, 0.08, 0.08)
      }
    }
    ctx.restore()
    return
  }
  ctx.fillStyle = '#150c06'
  ctx.beginPath(); ctx.ellipse(cx, cy, 1.55, 1.5, 0, 0, Math.PI * 2); ctx.fill() // aro escuro (tábuas quebradas)
  const g = ctx.createRadialGradient(cx, cy, 0.1, cx, cy, 1.45)
  g.addColorStop(0, '#06162b'); g.addColorStop(0.55, '#0d3a63'); g.addColorStop(1, '#1b6a8f')
  ctx.fillStyle = g
  ctx.beginPath(); ctx.ellipse(cx, cy, 1.45, 1.4, 0, 0, Math.PI * 2); ctx.fill()
  ctx.lineWidth = 0.06
  ctx.strokeStyle = 'rgba(160, 220, 240, 0.55)'
  for (let i = 0; i < 4; i++) { // redemoinho: arcos claros girando
    const a0 = t * 1.4 + (i * Math.PI) / 2, r = 0.45 + (i % 2) * 0.35
    ctx.beginPath(); ctx.arc(cx, cy, r, a0, a0 + 1.5); ctx.stroke()
  }
  ctx.fillStyle = 'rgba(235, 250, 255, 0.85)'
  for (let i = 0; i < 22; i++) { // espuma na borda
    const a = (i / 22) * Math.PI * 2 + Math.sin(t * 0.9 + i) * 0.08, r = 1.38 + Math.sin(t * 2 + i * 1.7) * 0.05
    ctx.fillRect(cx + Math.cos(a) * r - 0.03, cy + Math.sin(a) * r * 0.97 - 0.03, 0.06, 0.06)
  }
  if (intro < BOSS.introSplashAt + 0.4) { // borbulhando: bolhas subindo e estourando
    ctx.fillStyle = 'rgba(210, 240, 255, 0.9)'
    for (let i = 0; i < 9; i++) {
      const ph = (t * 2.2 + i * 0.37) % 1
      ctx.fillRect(cx + Math.sin(i * 2.3) * 1.0 - 0.04, cy + Math.cos(i * 1.7) * 0.8 - ph * 0.5 - 0.04, 0.08, 0.08)
    }
  }
  ctx.restore()
}

// CHOP, o chefe, com a ARTE em pixel: 3 poses no tamanho nativo (normal, boca aberta quando solta reforço, furioso
// quando fica com metade da vida). Olha pro lado em que o jogador está (espelha), pisca branco quando leva dano,
// treme e cresce na transformação. O nome dele aparece numa plaquinha de ouro pendurada no colar.
const TAG_FONT = { // letras 3x5
  C: ['111', '100', '100', '100', '111'],
  H: ['101', '101', '111', '101', '101'],
  O: ['111', '101', '101', '101', '111'],
  P: ['111', '101', '111', '100', '100'],
}
const TAG_AT = [[24, 64], [21, 66], [24, 64]] // onde a plaquinha fica no colar de cada pose (pixels do desenho)
function drawChopTag(ctx, pose, face, w, h) {
  const u = 1 / PX_TILE
  const [sx, sy] = TAG_AT[pose]
  const tw = 19, th = 9
  const left = face === 1 ? -w / 2 + sx * u : w / 2 - (sx + tw) * u // espelhado: o texto nunca fica de trás pra frente
  const top = 0.9 - h + sy * u
  const px = (ix, iy, color) => { ctx.fillStyle = color; ctx.fillRect(left + ix * u, top + iy * u, u + 0.004, u + 0.004) }
  for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) px(x, y, x === 0 || y === 0 || x === tw - 1 || y === th - 1 ? '#6b4300' : '#e8b923')
  px(1, 1, '#fff2a6'); px(2, 1, '#fff2a6') // brilho
  'CHOP'.split('').forEach((ch, i) => TAG_FONT[ch].forEach((row, y) => row.split('').forEach((on, x) => { if (on === '1') px(2 + i * 4 + x, 2 + y, '#3a1f00') })))
}
// o chefe está escondido (debaixo d'água)? E quanto dele já saiu da água (0 a 1, suavizado)?
const bossHidden = (b) => b.mode === 'under' || (b.mode === 'intro' && b.introT < BOSS.introSplashAt)
function bossRise(b) {
  const k = b.mode === 'intro' ? (b.introT - BOSS.introSplashAt) / 0.9
    : b.mode === 'rising' ? b.riseT / BOSS.riseTime
    : b.mode === 'sinking' ? 1 - b.sinkT / BOSS.sinkTime : 1
  const c = Math.max(0, Math.min(1, k))
  return c * (2 - c)
}
function drawBossSprite(ctx, b, time, [normal, open, fury]) {
  if (!b.alive && b.deathT > 1.2) return
  if (bossHidden(b)) return // ainda não saiu (ou já mergulhou): só o buraco, borbulhando
  const rise = bossRise(b) // 0 = no fundo, 1 = fora
  const dying = b.alive ? 0 : b.deathT / 1.2
  const enraging = b.enrageT > 0 ? 1 - b.enrageT / BOSS.enrageTime : 0
  const angry = b.enrageT > 0 ? Math.sin(time * 28) > 0.6 - enraging * 1.6 : b.dived
  const flash = b.hurtT > 0 && !b.enrageT && Math.sin(time * 40) > 0
  const frenzy = b.alive && (b.mode === 'frenzyWind' || b.mode === 'frenzyDash') // frenesi: rosnando, boca aberta
  const stunned = b.alive && b.mode === 'frenzyStun'
  const summoning = b.alive && (b.mode === 'sinking' || b.mode === 'rising' || frenzy) // rugindo ao mergulhar, ao voltar e no frenesi: boca aberta
  let pose = angry ? (summoning ? 1 : 2) : (summoning ? 1 : 0)
  let img = angry && summoning ? hueShifted(open, 140, -0.12, 1.15) :[normal, open, fury][pose] // boca aberta e furioso: a pose aberta vira vermelha
  if (flash) img = tinted(img, 'rgb(255, 255, 255)', 0.9, 'screen')
  const w = img.naturalWidth / PX_TILE, h = img.naturalHeight / PX_TILE
  const bob = Math.sin(b.walkT * 4) * 0.04
  const tremble = b.enrageT > 0 ? Math.sin(time * 70) * 0.07 : b.mode === 'frenzyWind' ? Math.sin(time * 90) * 0.06 : 0
  const grow = b.enrageT > 0 ? 1 + 0.1 * Math.sin(enraging * Math.PI) : 1
  const face = (b.face ?? -1) < 0 ? 1 : -1 // as poses olham pra ESQUERDA
  const sway = stunned ? Math.sin(time * 7) * 0.08 : 0 // tonto: balançando

  // linhas de velocidade atrás dele na investida (e 2 "fantasmas" do desenho ficando pra trás)
  if (b.mode === 'frenzyDash' && b.dash) {
    const u = 1 / PX_TILE, { dx, dy } = b.dash
    ctx.save()
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)'
    for (let i = 0; i < 7; i++) {
      const v = (i - 3) * 0.26 + Math.sin(i * 5.1) * 0.05, len = 1.2 + ((i * 7) % 5) * 0.35, off = 0.9 + ((time * 9 + i * 0.37) % 1) * 0.6
      const lx = dx ? b.x + 0.5 - dx * (off + len) : b.x + 0.5 + v
      const ly = dx ? b.y + 0.5 + v : b.y + 0.5 - dy * (off + len)
      ctx.fillRect(Math.round(lx / u) * u, Math.round(ly / u) * u, dx ? len : 2 * u, dx ? 2 * u : len)
    }
    ctx.restore()
  }
  const paint = (ox, oy, alpha, withTag) => {
    ctx.save()
    if (rise < 1) { // saindo da água: só aparece o que está acima da linha d'água do buraco
      ctx.beginPath(); ctx.rect(b.x - 3, b.y - 4, 7, 4.65); ctx.clip()
    }
    ctx.translate(b.x + 0.5 + tremble + ox, b.y + 0.5 + bob + oy + (1 - rise) * 1.9)
    ctx.scale(grow, grow)
    ctx.globalAlpha = alpha * (1 - dying)
    ctx.rotate(dying * 1.5 + sway)
    ctx.scale(1 - dying * 0.5, 1 - dying * 0.5)
    ctx.fillStyle = 'rgba(0,0,0,0.3)'
    ctx.beginPath(); ctx.ellipse(0, 0.86, 0.85, 0.14, 0, 0, Math.PI * 2); ctx.fill()
    ctx.save()
    ctx.scale(face, 1)
    blit(ctx, img, -w / 2, 0.9 - h, w, h)
    ctx.restore()
    if (withTag && !flash) drawChopTag(ctx, pose, face, w, h)
    ctx.restore()
  }
  if (b.mode === 'frenzyDash' && b.dash) { paint(-b.dash.dx * 1.1, -b.dash.dy * 1.1, 0.14, false); paint(-b.dash.dx * 0.55, -b.dash.dy * 0.55, 0.26, false) }
  paint(0, 0, 1, true)
  if (stunned) { // tonto: estrelinhas girando em volta da cabeça
    const u = 1 / PX_TILE, hy = b.y + 0.5 + 0.9 - h + 0.15
    for (let i = 0; i < 3; i++) {
      const a = time * 5 + (i * Math.PI * 2) / 3
      const sx = Math.round((b.x + 0.5 + Math.cos(a) * 0.7) / u) * u, sy = Math.round((hy + Math.sin(a) * 0.2) / u) * u
      ctx.fillStyle = '#4a2a00' // contorno escuro (aparece sobre o fundo claro de madeira)
      ctx.fillRect(sx - 5 * u, sy - 2 * u, 10 * u, 4 * u); ctx.fillRect(sx - 2 * u, sy - 5 * u, 4 * u, 10 * u)
      ctx.fillStyle = '#ffe27a' // estrelinha em cruz com o miolo branco
      ctx.fillRect(sx - 4 * u, sy - u, 8 * u, 2 * u); ctx.fillRect(sx - u, sy - 4 * u, 2 * u, 8 * u)
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(sx - u, sy - u, 2 * u, 2 * u)
    }
  }
}

// JATOS D'ÁGUA do chefe. Aviso: a poça borbulhando estourando as tábuas em cada casa da cruz (pisca mais rápido perto de estourar).
function drawJetWarnings(ctx, s) {
  if (!s.jets?.length) return
  const frames = warnFrames()
  for (const j of s.jets) {
    if (j.state !== 'warn') continue
    const k = j.t / BOSS.jetWarn
    const blink = k > 0.7 ? 0.75 + 0.25 * Math.sin(s.time * 40) : 1
    for (const [tx, ty] of j.tiles) {
      const a = Math.min(1, 0.35 + k * 1.2) * blink
      ctx.save()
      ctx.globalAlpha = a
      if (frames) {
        const img = frames[Math.floor(s.time * 8 + tx + ty) % 3], w = img.naturalWidth / PX_TILE, h = img.naturalHeight / PX_TILE
        blit(ctx, img, tx + 0.5 - w / 2, ty + 0.5 - h / 2, w, h)
      } else {
        ctx.fillStyle = 'rgba(80, 170, 255, 0.7)'
        ctx.beginPath(); ctx.ellipse(tx + 0.5, ty + 0.5, 0.45, 0.38, 0, 0, Math.PI * 2); ctx.fill()
      }
      ctx.restore()
    }
  }
}
// O jato de pé: a coluna d'água subindo em cada casa da cruz (arte em 3 quadros; sem ela, um jato provisório em código)
function drawJets(ctx, s) {
  if (!s.jets?.length) return
  const frames = jetFrames(), warn = warnFrames()
  const u = 1 / PX_TILE
  for (const j of s.jets) {
    if (j.state !== 'erupt') continue
    const k = j.t / BOSS.jetTime
    const rise = Math.min(1, j.t / 0.12), fade = k > 0.8 ? (1 - k) / 0.2 : 1
    for (const [tx, ty] of j.tiles) {
      const base = ty + 0.5 + 0.42 // o pé do jato (parte de baixo da casa)
      ctx.save()
      ctx.globalAlpha = fade
      if (warn && !frames) { // sem a arte do jato: splash no chão (o aviso, mais fraco)
        const img = warn[Math.floor(s.time * 12 + tx) % 3], w = img.naturalWidth / PX_TILE, h = img.naturalHeight / PX_TILE
        ctx.globalAlpha = fade * 0.8
        blit(ctx, img, tx + 0.5 - w / 2, ty + 0.5 - h / 2, w, h)
        ctx.globalAlpha = fade
      }
      if (frames) {
        const img = frames[Math.floor(s.time * 10 + tx + ty) % 3], w = img.naturalWidth / PX_TILE, h = img.naturalHeight / PX_TILE
        ctx.beginPath(); ctx.rect(tx - 1, base - h * rise, 3, h * rise + 0.1); ctx.clip() // sobe do chão
        blit(ctx, img, tx + 0.5 - w / 2, base - h, w, h)
      } else {
        const cw = 0.56, ch = 1.45 * rise
        const x0 = Math.round((tx + 0.5 - cw / 2) / u) * u, top = Math.round((base - ch) / u) * u
        ctx.fillStyle = '#0b2a5c'; ctx.fillRect(x0 - 2 * u, top, cw + 4 * u, base - top) // contorno
        ctx.fillStyle = '#4fb4ff'; ctx.fillRect(x0, top, cw, base - top)
        ctx.fillStyle = '#bfe6ff'
        for (let i = 0; i < 4; i++) { // brilhos subindo pela coluna
          const ph = (s.time * 5 + i * 0.27 + tx * 0.13) % 1
          ctx.fillRect(x0 + (i % 2 ? 0.34 : 0.1), Math.round((base - ph * ch) / u) * u, 0.1, 0.22)
        }
        ctx.fillStyle = '#ffffff' // espuma no topo
        for (let i = 0; i < 6; i++) ctx.fillRect(Math.round((x0 - 0.1 + i * 0.13) / u) * u, top - ((i * 5) % 3) * 2 * u - 2 * u, 0.14, 0.12)
      }
      ctx.restore()
    }
  }
}

// FRENESI: a faixa vermelha no chão por onde o CHOP vai passar (pisca durante o aviso; setas correm na direção da investida)
function drawFrenzyLane(ctx, b, time) {
  if ((b.mode !== 'frenzyWind' && b.mode !== 'frenzyDash') || !b.lane || !b.dash) return
  const u = 1 / PX_TILE, { dx, dy } = b.dash, { x0, y0, x1, y1 } = b.lane
  const wind = b.mode === 'frenzyWind'
  const alpha = wind ? 0.2 + 0.13 * Math.sin(time * 26) : 0.14
  const lx0 = Math.min(x0, x1) + 0.5 - BOSS.half, lx1 = Math.max(x0, x1) + 0.5 + BOSS.half
  const ly0 = Math.min(y0, y1) + 0.5 - BOSS.half, ly1 = Math.max(y0, y1) + 0.5 + BOSS.half
  ctx.save()
  ctx.fillStyle = `rgba(255, 50, 50, ${alpha})`
  ctx.fillRect(lx0, ly0, lx1 - lx0, ly1 - ly0)
  ctx.fillStyle = `rgba(255, 120, 120, ${wind ? 0.6 : 0.3})` // bordas da faixa
  if (dx) { ctx.fillRect(lx0, ly0, lx1 - lx0, 2 * u); ctx.fillRect(lx0, ly1 - 2 * u, lx1 - lx0, 2 * u) }
  else { ctx.fillRect(lx0, ly0, 2 * u, ly1 - ly0); ctx.fillRect(lx1 - 2 * u, ly0, 2 * u, ly1 - ly0) }
  // setas (>) correndo pela faixa
  const ox = x0 + 0.5, oy = y0 + 0.5, len = Math.abs(x1 - x0) + Math.abs(y1 - y0) + BOSS.half
  ctx.fillStyle = `rgba(255, 200, 200, ${wind ? 0.55 : 0.3})`
  for (let t = ((time * 5) % 1.4) + 0.4; t < len; t += 1.4) {
    for (let i = -4; i <= 4; i++) {
      const v = i * 0.1, a = t - Math.abs(v) * 0.9
      const wx = dx ? ox + dx * a : ox + v * -dy, wy = dx ? oy + v * dx : oy + dy * a
      ctx.fillRect(Math.round(wx / u) * u - u, Math.round(wy / u) * u - u, 3 * u, 3 * u)
    }
  }
  ctx.restore()
}

// The Loan Shark (provisório, desenhado em código até chegar a arte em pixel): tubarão grande (2x2 casas) de lado,
// virado pro lado em que o jogador está. Pisca branco quando leva dano e fica vermelho-escuro quando brava.
// Na transformação (enrageT), treme, cresce um pouco e pisca cinza/vermelho antes de ficar vermelho de vez.
function drawWhale(ctx, b, time) {
  if (bossHidden(b)) return
  const art = bossFrames()
  if (art) return drawBossSprite(ctx, b, time, art)
  if (!b.alive && b.deathT > 1.2) return
  const dying = b.alive ? 0 : b.deathT / 1.2
  const enraging = b.enrageT > 0 ? 1 - b.enrageT / BOSS.enrageTime : 0 // 0 -> 1 durante a transformação
  const angry = b.enrageT > 0 ? Math.sin(time * 28) > 0.6 - enraging * 1.6 : b.dived
  const flash = b.hurtT > 0 && !b.enrageT && Math.sin(time * 40) > 0
  const bob = Math.sin(b.walkT * 4) * 0.05
  const tremble = b.enrageT > 0 ? Math.sin(time * 70) * 0.07 : 0
  const grow = b.enrageT > 0 ? 1 + 0.12 * Math.sin(enraging * Math.PI) : 1
  const face = (b.face ?? -1) < 0 ? 1 : -1 // desenhado olhando pra ESQUERDA; vira quando o jogador está à direita

  ctx.save()
  ctx.translate(b.x + 0.5 + tremble, b.y + 0.5 + bob)
  ctx.scale(grow * face, grow)
  if (b.enrageT > 0) {
    // ondas de raiva saindo do focinho
    ctx.strokeStyle = `rgba(255, 120, 130, ${0.8 * (1 - enraging * 0.6)})`
    ctx.lineWidth = 0.07
    for (let i = 0; i < 3; i++) {
      const r = 0.95 + ((time * 2.2 + i / 3) % 1) * 0.7
      ctx.beginPath(); ctx.arc(0, 0, r, Math.PI * 0.8, Math.PI * 1.2); ctx.stroke()
    }
  }
  ctx.globalAlpha = 1 - dying
  ctx.rotate(dying * 1.5)
  ctx.scale(1 - dying * 0.5, 1 - dying * 0.5)

  // sombra
  ctx.fillStyle = 'rgba(0,0,0,0.3)'
  ctx.beginPath(); ctx.ellipse(0, 0.82, 0.9, 0.13, 0, 0, Math.PI * 2); ctx.fill()

  const body = flash ? '#ffffff' : angry ? '#6b2a3c' : '#5b7388'
  const dark = flash ? '#e8e8e8' : angry ? '#45192a' : '#3c4f60'
  const belly = flash ? '#ffffff' : angry ? '#e0a8b0' : '#dfe9f0'

  // cauda (bifurcada, à direita)
  ctx.fillStyle = body
  ctx.beginPath()
  ctx.moveTo(0.6, 0.05)
  ctx.lineTo(1.05, -0.45); ctx.lineTo(0.95, 0.0); ctx.lineTo(1.05, 0.5)
  ctx.closePath(); ctx.fill()
  // corpo (focinho pontudo à esquerda)
  ctx.beginPath()
  ctx.moveTo(-1.0, 0.12)
  ctx.quadraticCurveTo(-0.5, -0.62, 0.35, -0.38)
  ctx.quadraticCurveTo(0.8, -0.2, 0.7, 0.05)
  ctx.quadraticCurveTo(0.5, 0.55, -0.3, 0.5)
  ctx.quadraticCurveTo(-0.8, 0.45, -1.0, 0.12)
  ctx.closePath(); ctx.fill()
  // barriga
  ctx.fillStyle = belly
  ctx.beginPath()
  ctx.moveTo(-0.95, 0.16)
  ctx.quadraticCurveTo(-0.5, 0.42, 0.4, 0.38)
  ctx.quadraticCurveTo(0.1, 0.55, -0.35, 0.5)
  ctx.quadraticCurveTo(-0.8, 0.45, -0.95, 0.16)
  ctx.closePath(); ctx.fill()
  // barbatana de cima
  ctx.fillStyle = dark
  ctx.beginPath()
  ctx.moveTo(-0.1, -0.5); ctx.lineTo(0.2, -0.98); ctx.lineTo(0.38, -0.4)
  ctx.closePath(); ctx.fill()
  // barbatana de baixo
  ctx.beginPath()
  ctx.moveTo(-0.1, 0.4); ctx.lineTo(0.12, 0.8); ctx.lineTo(0.3, 0.4)
  ctx.closePath(); ctx.fill()
  // guelras
  ctx.strokeStyle = dark
  ctx.lineWidth = 0.045
  ctx.beginPath()
  for (const gx of [-0.02, 0.1, 0.22]) { ctx.moveTo(gx, -0.12); ctx.lineTo(gx - 0.03, 0.1) }
  ctx.stroke()

  // boca com dentes (quando para pra soltar FUD, abre mais)
  const open = b.pauseT > 0 && b.alive ? 0.12 + Math.abs(Math.sin(time * 30)) * 0.05 : 0.05
  ctx.fillStyle = '#2a0f18'
  ctx.beginPath()
  ctx.moveTo(-0.98, 0.14); ctx.quadraticCurveTo(-0.55, 0.3 + open, -0.15, 0.2); ctx.lineTo(-0.2, 0.15)
  ctx.quadraticCurveTo(-0.55, 0.18, -0.98, 0.14)
  ctx.closePath(); ctx.fill()
  ctx.fillStyle = '#ffffff'
  for (let i = 0; i < 6; i++) {
    const tx = -0.9 + i * 0.12
    ctx.beginPath(); ctx.moveTo(tx, 0.17 + (i % 2) * 0.01); ctx.lineTo(tx + 0.05, 0.27 + open * 0.5); ctx.lineTo(tx + 0.1, 0.17); ctx.closePath(); ctx.fill()
  }

  // olho bravo
  if (!dying) {
    ctx.fillStyle = '#fff'
    ctx.beginPath(); ctx.arc(-0.55, -0.08, 0.12, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = angry ? '#e8303f' : C.eye
    ctx.beginPath(); ctx.arc(-0.57, -0.06, 0.065, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = C.eye
    ctx.lineWidth = 0.06
    ctx.beginPath(); ctx.moveTo(-0.72, -0.24); ctx.lineTo(-0.42, -0.13); ctx.stroke()
  }
  ctx.restore()
}

function drawDoor(ctx, d, open, time, tileset) {
  const art = sprite(`door_${tileset}_${open ? 'open' : 'closed'}`)
  if (art) return drawDoorSprite(ctx, d, open, time, art, tileset === 'hull' || tileset === 'tavern' ? '90, 230, 220' : '255, 210, 120')
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

// Porta com arte: fechada ou aberta (aberta, a luz de dentro pulsa e brilha no chão)
function drawDoorSprite(ctx, d, open, time, img, glow = '255, 210, 120') {
  const [w, h] = sizeByW(img, 1.0)
  const cx = d.x + 0.5, bottom = d.y + 0.98
  if (open) {
    const a = 0.4 + 0.15 * Math.sin(time * 5)
    const g = ctx.createRadialGradient(cx, bottom - 0.3, 0, cx, bottom - 0.3, 1)
    g.addColorStop(0, `rgba(${glow}, ${a})`)
    g.addColorStop(1, `rgba(${glow}, 0)`)
    ctx.fillStyle = g
    ctx.fillRect(cx - 1, bottom - 1.3, 2, 2)
  }
  blit(ctx, img, cx - w / 2, bottom - h, w, h)
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

  const art = sprite(opened ? 'chest_open' : 'chest_closed')
  if (art) {
    const [w, h] = sizeByW(art, 0.94)
    blit(ctx, art, -w / 2, 0.42 - h, w, h)
    ctx.restore()
    return
  }

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

const PU_COLOR = {
  bomb: '59, 111, 216', fire: '216, 87, 43', speed: '47, 174, 106',
  shield: '80, 200, 230', kick: '230, 150, 40', detonator: '220, 50, 70',
}

// Power-up: ao aparecer dá um "pop" (cresce passando do tamanho e volta), depois flutua com
// um brilho da cor dele e uma estrelinha piscando no canto.
function drawPowerup(ctx, pu, time) {
  const { x, y } = pu
  const age = time - (pu.revealedAt ?? -9)
  const t = Math.min(1, age / 0.35)
  const pop = t >= 1 ? 1 : 1 + 2.7 * Math.pow(t - 1, 3) + 1.7 * Math.pow(t - 1, 2) // vai até ~1.1 e volta
  const lift = Math.sin(time * 4 + x) * 0.04
  const col = PU_COLOR[pu.kind]
  const g = ctx.createRadialGradient(x + 0.5, y + 0.5, 0, x + 0.5, y + 0.5, 0.62)
  g.addColorStop(0, `rgba(${col}, ${0.45 + 0.15 * Math.sin(time * 5)})`)
  g.addColorStop(1, `rgba(${col}, 0)`)
  ctx.fillStyle = g
  ctx.fillRect(x - 0.15, y - 0.15, 1.3, 1.3)
  ctx.save()
  ctx.translate(x + 0.5, y + 0.5)
  ctx.scale(pop, pop)
  ctx.translate(-(x + 0.5), -(y + 0.5))
  const token = sprite(`pu_${pu.kind}`)
  if (token) {
    // ficha flutuando: sombrinha no chão + leve giro de moeda (estreita e volta)
    const spin = 0.82 + 0.18 * Math.abs(Math.cos(time * 2.2 + x))
    const [w, h] = sizeByW(token, 0.86)
    ctx.fillStyle = 'rgba(0,0,0,0.3)'
    ctx.beginPath(); ctx.ellipse(x + 0.5, y + 0.9, 0.26, 0.06, 0, 0, Math.PI * 2); ctx.fill()
    blit(ctx, token, x + 0.5 - (w * spin) / 2, y + 0.5 - h / 2 + lift - 0.04, w * spin, h)
  } else {
    drawPowerupBox(ctx, pu, time, lift)
  }
  ctx.restore()
  // estrelinha piscando
  const tw = Math.max(0, Math.sin(time * 3 + x * 2))
  if (tw > 0.6) {
    const sx = x + 0.78, sy = y + 0.2 + lift, r = 0.09 * (tw - 0.6) / 0.4
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)'
    ctx.beginPath()
    ctx.moveTo(sx, sy - r); ctx.lineTo(sx + r * 0.3, sy - r * 0.3); ctx.lineTo(sx + r, sy); ctx.lineTo(sx + r * 0.3, sy + r * 0.3)
    ctx.lineTo(sx, sy + r); ctx.lineTo(sx - r * 0.3, sy + r * 0.3); ctx.lineTo(sx - r, sy); ctx.lineTo(sx - r * 0.3, sy - r * 0.3)
    ctx.closePath(); ctx.fill()
  }
}

function drawPowerupBox(ctx, pu, time, lift) {
  const { x, y } = pu
  ctx.fillStyle = { bomb: '#3b6fd8', fire: '#d8572b', speed: '#2fae6a', shield: '#2b8fb0', kick: '#c47a1c', detonator: '#b0283c' }[pu.kind]
  ctx.strokeStyle = '#f3e3b0'
  ctx.lineWidth = 0.06
  ctx.beginPath(); ctx.roundRect(x + 0.14, y + 0.14 + lift, 0.72, 0.72, 0.12); ctx.fill(); ctx.stroke()
  const cx = x + 0.5, cy = y + 0.5 + lift
  const bombImg = pu.kind === 'bomb' && sprite('bomb')
  if (bombImg) {
    const h = 0.56, w = h * bombImg.naturalWidth / bombImg.naturalHeight
    ctx.drawImage(bombImg, cx - w / 2, cy - h / 2 - 0.02, w, h)
  } else if (pu.kind === 'bomb') {
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
  } else if (pu.kind === 'shield') {
    // escudo
    ctx.fillStyle = '#e8f6ff'
    ctx.beginPath()
    ctx.moveTo(cx, cy - 0.24); ctx.lineTo(cx + 0.2, cy - 0.16); ctx.lineTo(cx + 0.17, cy + 0.06)
    ctx.quadraticCurveTo(cx + 0.1, cy + 0.2, cx, cy + 0.26)
    ctx.quadraticCurveTo(cx - 0.1, cy + 0.2, cx - 0.17, cy + 0.06)
    ctx.lineTo(cx - 0.2, cy - 0.16); ctx.closePath(); ctx.fill()
  } else if (pu.kind === 'kick') {
    // botinha chutando + linhas de movimento
    ctx.fillStyle = '#fff'
    ctx.beginPath(); ctx.roundRect(cx - 0.06, cy - 0.22, 0.12, 0.26, 0.03); ctx.fill()
    ctx.beginPath(); ctx.roundRect(cx - 0.06, cy - 0.02, 0.26, 0.12, 0.05); ctx.fill()
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 0.04
    ctx.beginPath()
    for (const oy of [-0.14, -0.04, 0.06]) { ctx.moveTo(cx - 0.24, cy + oy); ctx.lineTo(cx - 0.12, cy + oy) }
    ctx.stroke()
  } else if (pu.kind === 'detonator') {
    // controle com botão vermelho
    ctx.fillStyle = '#2a2a30'
    ctx.beginPath(); ctx.roundRect(cx - 0.16, cy - 0.1, 0.32, 0.3, 0.05); ctx.fill()
    ctx.fillStyle = '#ff4057'
    ctx.beginPath(); ctx.arc(cx, cy - 0.1, 0.11, Math.PI, 0); ctx.fill()
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 0.035
    ctx.beginPath(); ctx.moveTo(cx + 0.1, cy - 0.12); ctx.lineTo(cx + 0.18, cy - 0.26); ctx.stroke()
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

// desenha o inimigo em partes, cada uma no quadro certo da caminhada (só deslocamentos de pixel inteiro)
function drawRigged(ctx, img, rig, e, w, h) {
  if (e.bombT != null) return drawLoneHead(ctx, img, e, w, h)
  const moving = e.alive && (e.x !== e.tx || e.y !== e.ty)
  const n = rig.parts[0].off.length
  const f = moving ? Math.floor(e.walkT * rig.fps) % n : rig.idle
  const dirx = e.dir === 'right' ? 1 : e.dir === 'left' ? -1 : 0
  const smooth = ctx.imageSmoothingEnabled
  ctx.imageSmoothingEnabled = false
  for (const { src: [sx, sy, sw, sh], off } of rig.parts) {
    const [step, dy] = off[f]
    ctx.drawImage(img, sx, sy, sw, sh, -w / 2 + (sx + step * dirx) / PX_TILE, -h + (sy + dy) / PX_TILE, sw / PX_TILE, sh / PX_TILE)
  }
  ctx.imageSmoothingEnabled = smooth
}

// O esqueleto derrotado: o CORPO some e sobra só a CABEÇA (idêntica à dele, com o quepe), pulando atrás do jogador.
// Ninguém sabe que é uma bomba até ela explodir (por isso nada de pavio nem de piscar). Só pulinhos de pixel inteiro.
function drawLoneHead(ctx, img, e, w, h) {
  const smooth = ctx.imageSmoothingEnabled
  ctx.imageSmoothingEnabled = false
  const hop = Math.round(Math.abs(Math.sin(e.walkT * 9)) * 6) // pulinho, de pixel em pixel
  const wob = Math.round(Math.sin(e.walkT * 9 + 1)) // e um balanço de 1 pixel pro lado
  ctx.drawImage(img, 0, 0, 31, 17, -w / 2 + wob / PX_TILE, -h + (47 - 17 - hop) / PX_TILE, 31 / PX_TILE, 17 / PX_TILE)
  ctx.imageSmoothingEnabled = smooth
}

function drawEnemySprite(ctx, e, time, img) {
  const dying = e.alive ? 0 : Math.min(1, e.deathT / 0.6)
  const [w, h] = sizeByH(img, ENEMY_H[e.type] ?? 1.15)
  const feetY = e.y + 0.92
  const heavy = e.type === 'sarge' // o sargento anda pesado: passo lento, pisa forte e "respira"
  // inimigo com "rig" (esqueleto, caranguejo): anda com partes de pixel (sprites.js RIGS), sem girar, esticar
  // nem espelhar; sempre de frente (o caranguejo anda de LADO como caranguejo de verdade)
  const rig = isPixel(img) ? RIGS[e.type] : null
  const phase = e.walkT * (heavy ? (e.angry ? 9 : 6) : (e.angry ? 13 : 9))
  const k = Math.abs(Math.sin(phase))
  const hop = e.alive && !rig ? k * (heavy ? 0.04 : 0.06) : 0
  const tilt = e.alive && !rig ? Math.sin(phase) * (heavy ? 0.09 : 0.06) : 0
  const breathe = heavy && e.alive ? 1 + Math.sin(e.walkT * 2.5) * 0.04 : 1
  const stomp = heavy && e.alive ? 0.92 + k * 0.08 : 1 // amassa ao pisar
  const flip = !rig && e.dir === 'left' ? -1 : 1

  ctx.save()
  ctx.fillStyle = 'rgba(0,0,0,0.3)'
  ctx.beginPath(); ctx.ellipse(e.x + 0.5, feetY, 0.28 * (1 - dying), 0.07, 0, 0, Math.PI * 2); ctx.fill()
  ctx.translate(e.x + 0.5, feetY - hop)
  ctx.rotate(tilt)
  ctx.scale(flip * (1 + dying * 0.3) * breathe / Math.sqrt(stomp), (1 - dying * 0.7) * stomp)
  const blink = Math.sin(time * 40) > 0 ? 1 : 0.35
  ctx.globalAlpha = dying ? (1 - dying) * blink : e.hurtT > 0 ? blink : 1
  ctx.imageSmoothingQuality = 'high'
  if (rig) drawRigged(ctx, img, rig, e, w, h)
  else blit(ctx, img, -w / 2, -h, w, h)
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
  } else if (e.type === 'fud' || e.type === 'skeleton') { // (estilo pintado: o esqueleto usa o fantasminha provisório)
    ctx.fillStyle = dying ? '#fff' : '#9a93b8'
    ctx.beginPath()
    ctx.arc(0, -0.06, 0.3, Math.PI, 0)
    ctx.lineTo(0.3, 0.3)
    for (let i = 0; i < 4; i++) {
      const wx = 0.3 - (i + 0.5) * 0.15
      ctx.quadraticCurveTo(wx, 0.3 - 0.12 * (i % 2 ? -1 : 1) + Math.sin(time * 8 + i) * 0.03, 0.3 - (i + 1) * 0.15, 0.3)
    }
    ctx.closePath(); ctx.fill()
  } else if (e.type === 'bear' || e.type === 'crab') { // (estilo pintado: o caranguejo usa o urso provisório)
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

// Luz quente só nos quatro cantos (onde ficam as lâmpadas da moldura): o resto do chão
// continua escuro e frio, pra a luz amarela chamar atenção.
function drawWarmLight(ctx, cols, rows) {
  ctx.save()
  ctx.globalCompositeOperation = 'screen'
  for (const [x, y] of [[0.4, 0.4], [cols - 0.4, 0.4], [0.4, rows - 0.4], [cols - 0.4, rows - 0.4]]) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, 2.4)
    g.addColorStop(0, 'rgba(255, 180, 90, 0.22)')
    g.addColorStop(1, 'rgba(255, 180, 90, 0)')
    ctx.fillStyle = g
    ctx.fillRect(x - 2.4, y - 2.4, 4.8, 4.8)
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
  const [bw, bh] = sizeByW(img, 0.94)
  const w = bw * (1 - burn * 0.5)
  const h = bh * (1 - burn * 0.5)
  const left = x + 0.5 - w / 2
  const top = y + 0.97 - h - burn * 0.1
  ctx.save()
  ctx.fillStyle = 'rgba(0,0,0,0.25)'
  ctx.beginPath(); ctx.ellipse(x + 0.5, y + 0.95, w * 0.48, 0.06, 0, 0, Math.PI * 2); ctx.fill()
  ctx.globalAlpha = 1 - burn * 0.8
  blit(ctx, img, left, top, w, h)
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
  const left = Math.min(1, b.timer / FUSE_TIME)
  const rate = 6 + (1 - left) * 18
  const pulse = 1 + 0.07 * Math.sin(time * rate)
  // ao cair no chão: amassa e quica (primeiro 0,3 s)
  const age = (b.fuse ?? FUSE_TIME) - b.timer
  const drop = age < 0.3 ? Math.sin((age / 0.3) * Math.PI) * (1 - age / 0.3) : 0
  const [bw, bh] = sizeByH(img, BOMB_H)
  const h = bh * pulse * (1 - drop * 0.3)
  const w = bw * pulse * (1 + drop * 0.25)
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
  blit(ctx, img, cx - w / 2, bottom - h, w, h)
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
  const left = Math.min(1, b.timer / FUSE_TIME)
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

// Fogo de uma casa. `sides` diz pra que lados ele continua (1 esquerda, 2 direita, 4 cima,
// 8 baixo): lado que continua vai até a borda da casa; lado que não continua termina numa
// ponta arredondada antes da borda (a explosão não fica "cortada" no fim do braço).
// A pontinha desenhada dentro da caixa (visual) entra só um pouco na casa.
function drawFlame(ctx, f) {
  const k = f.t / FLAME_TIME           // 1 = acabou de explodir, 0 = sumindo
  const w = 0.35 + 0.45 * Math.min(1, k * 1.6)
  const { x, y } = f
  const sides = f.sides ?? 15
  const inset = f.visual ? 0.55 : 0.1
  const bar = (ww, horizontal) => {
    const r = ww / 2
    ctx.beginPath()
    if (horizontal) {
      const a = sides & 1 ? x : x + inset, b = sides & 2 ? x + 1 : x + 1 - inset
      const L = sides & 1 ? 0 : r, R = sides & 2 ? 0 : r
      ctx.roundRect(a, y + 0.5 - r, b - a, ww, [L, R, R, L])
    } else {
      const a = sides & 4 ? y : y + inset, b = sides & 8 ? y + 1 : y + 1 - inset
      const T = sides & 4 ? 0 : r, B = sides & 8 ? 0 : r
      ctx.roundRect(x + 0.5 - r, a, ww, b - a, [T, T, B, B])
    }
    ctx.fill()
  }
  const layer = (color, ww) => {
    ctx.fillStyle = color
    if (f.kind !== 'v') bar(ww, true)
    if (f.kind !== 'h') bar(ww, false)
  }
  layer(C.blastGlow, Math.min(1, w * 1.35))
  layer(C.blastOut, w)
  layer(C.blastMid, w * 0.62)
  layer(C.blastIn, w * 0.3)
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
  // PIXEL ART: nada de escala quebrada, rotação nem giro de papel: isso reamostra a arte a cada quadro e os pixels
  // "tremem" (parado ele parecia ser repintado o tempo todo). Em pixel ele vira na hora, anda com o pulinho em
  // pixels inteiros e fica parado de verdade quando está parado. (Na arte pintada continua tudo suave.)
  const crisp = isPixel(img)
  if (crisp) v.turn = turnTo
  else v.turn += Math.sign(turnTo - v.turn) * Math.min(Math.abs(turnTo - v.turn), dt * 9)
  // inclinação suave na direção do movimento
  const leanAmt = crisp ? 0 : ownArt ? 0.04 : 0.12 // a arte de lado já vem inclinada
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
    if (crisp) hop = Math.round(hop * PX_TILE) / PX_TILE // pulinho em pixels inteiros
    sy = crisp ? 1 : frames ? 0.94 + k * 0.08 : 0.9 + k * 0.14 // amassa no chão, estica no ar
    const vertical = p.facing === 'up' || p.facing === 'down'
    wobble = crisp ? 0 : Math.sin(phase) * (frames ? (vertical ? 0.05 : 0.03) : (vertical ? 0.09 : 0.04))
    // poeirinha cada vez que pisa
    if (step !== v.lastStep) {
      v.lastStep = step
      const back = p.facing === 'left' ? 0.25 : p.facing === 'right' ? -0.25 : (step % 2 ? 0.2 : -0.2)
      v.dust.push({ x: p.x + 0.5 + back, y: feetY - 0.02, t: 0 })
    }
  } else if (p.alive && !crisp) {
    sy = 1 + Math.sin(time * 3) * 0.02        // respirando
    wobble = Math.sin(time * 1.6) * 0.025
  }
  const sx = 1 / Math.sqrt(sy)                 // amassou embaixo = engorda dos lados
  const [w, h] = sizeByH(img, PLAYER_H)

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

  // em pixel, o pé cai sempre numa linha/coluna de pixel da arte (sem meio pixel: é o que faz a arte tremer)
  const snap = (n) => crisp ? Math.round(n * PX_TILE) / PX_TILE : n
  ctx.translate(snap(p.x + 0.5), snap(feetY - hop))
  ctx.rotate(v.lean + wobble + dying * Math.PI * 2)
  ctx.scale(v.turn * sx * (1 - dying), sy * (1 - dying))
  if (dying) ctx.globalAlpha = Math.sin(time * 40) > 0 ? 0.5 : 1
  ctx.imageSmoothingQuality = 'high'
  // contorno roxo bem sutil em volta do personagem
  ctx.shadowColor = 'rgba(180, 110, 255, 0.85)'
  ctx.shadowBlur = Math.max(2, 0.09 * pxScale)
  blit(ctx, img, -w / 2, -h, w, h)
  ctx.restore()
}

// Jogador + itens: piscando depois que o escudo quebra, e a bolha do escudo quando tem
function drawPlayer(ctx, p, time) {
  if (!p.alive && p.deathT > 0.8) return
  ctx.save()
  if (p.invulnT > 0 && Math.sin(time * 30) > 0) ctx.globalAlpha = 0.35
  drawPlayerBody(ctx, p, time)
  ctx.restore()
  if (p.shield && p.alive) {
    const cx = p.x + 0.5, cy = p.y + 0.38, r = 0.66 + Math.sin(time * 4) * 0.03
    const g = ctx.createRadialGradient(cx, cy, r * 0.55, cx, cy, r)
    g.addColorStop(0, 'rgba(120, 220, 255, 0)')
    g.addColorStop(1, 'rgba(120, 220, 255, 0.35)')
    ctx.fillStyle = g
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = 'rgba(190, 240, 255, 0.85)'
    ctx.lineWidth = 0.04
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke()
    // brilhinho girando na bolha
    const a = time * 2.5
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'
    ctx.beginPath(); ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 0.05, 0, Math.PI * 2); ctx.fill()
  }
}

function drawPlayerBody(ctx, p, time) {
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
