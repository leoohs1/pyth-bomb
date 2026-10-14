// Transforma uma pixel art "ampliada" (ex.: 24x32 entregue como 384x512, fundo verde)
// de volta pros pixels de verdade, pronta pro jogo.
//
// Uso:  node scripts/pixel-reduce.mjs <entrada> <saida.png> [largura altura] [--trim]
// Ex.:  node scripts/pixel-reduce.mjs pirb-pixel.webp public/solo/pixel/pirb.png 24 32
//       node scripts/pixel-reduce.mjs pirb-pixel.webp public/solo/pixel/pirb.png --trim
// Sem largura/altura: descobre sozinho o tamanho do "quadradinho" da arte.
// --trim: corta as bordas vazias (o personagem fica encostado nas bordas da imagem).
//
// O que faz:
// - acha a área desenhada (ignora o fundo verde em volta) e divide em largura x altura blocos;
// - cada bloco vira 1 pixel com a cor que mais aparece nele (some o borrado das bordas);
// - verde do fundo vira transparente;
// - mostra quantas cores o resultado tem (o alvo é uns 24).
// Precisa do ffmpeg instalado (já está nesse PC).
import { execFileSync } from 'node:child_process'

const args = process.argv.slice(2)
const TRIM = args.includes('--trim')
const [input, output, wArg, hArg] = args.filter((a) => a !== '--trim')
if (!input || !output) {
  console.error('Uso: node scripts/pixel-reduce.mjs <entrada> <saida.png> [largura altura] [--trim]')
  process.exit(1)
}

const probe = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', input]).toString().trim()
const [W, H] = probe.split(',').map(Number)
const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', input, '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'], { maxBuffer: 1 << 28 })

const isGreen = (r, g, b) => g > 150 && r < 120 && b < 120 && g - Math.max(r, b) > 80

// Tamanho e posição da grade, num eixo: junta onde a cor muda (bordas) e testa vários
// tamanhos de quadradinho; o certo é o que deixa as bordas mais "em fase" (todas caindo no
// mesmo ponto do quadradinho). Devolve { size, offset }.
function detectAxis(horizontal) {
  const same = (i, j) => Math.abs(raw[i] - raw[j]) + Math.abs(raw[i + 1] - raw[j + 1]) + Math.abs(raw[i + 2] - raw[j + 2]) < 40
  const edges = []
  const runs = new Map()
  const A = horizontal ? W : H, B = horizontal ? H : W
  for (let b = 0; b < B; b += 3) {
    let run = 1
    for (let a = 1; a < A; a++) {
      const i = horizontal ? (b * W + a) * 4 : (a * W + b) * 4
      const j = horizontal ? i - 4 : i - W * 4
      if (same(i, j)) { run++; continue }
      edges.push(a)
      if (run >= 4 && run < A / 8) runs.set(run, (runs.get(run) ?? 0) + 1)
      run = 1
    }
  }
  // estimativa inicial: comprimento de trecho mais comum
  let guess = 0, top = 0
  for (const [k, c] of runs) { const sc = (runs.get(k - 1) ?? 0) + c + (runs.get(k + 1) ?? 0); if (sc > top) { top = sc; guess = k } }
  let best = { size: guess, offset: 0, r: -1 }
  for (let size = guess * 0.8; size <= guess * 1.2; size += 0.05) {
    let cs = 0, sn = 0
    for (const e of edges) { const a = (2 * Math.PI * e) / size; cs += Math.cos(a); sn += Math.sin(a) }
    const r = Math.hypot(cs, sn) / edges.length
    if (r > best.r) {
      let off = ((Math.atan2(sn, cs) / (2 * Math.PI)) * size) % size
      if (off < 0) off += size
      best = { size, offset: off, r }
    }
  }
  return best
}

// área desenhada (tudo que não é verde)
let x0 = W, y0 = H, x1 = -1, y1 = -1
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4
    if (raw[i + 3] < 20 || isGreen(raw[i], raw[i + 1], raw[i + 2])) continue
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y
  }
}
if (x1 < 0) { console.error('Não achei nada desenhado (só verde?)'); process.exit(1) }

// o desenho ocupa a imagem inteira (escala fixa) ou só o meio? usa a escala da imagem toda,
// centralizando o recorte, pra não esticar o personagem
let TW = Number(wArg), TH = Number(hArg)
let scaleX, scaleY, left, top
if (TW && TH) {
  scaleX = scaleY = Math.min(W / TW, H / TH)
  const cx = (x0 + x1 + 1) / 2, cy = (y0 + y1 + 1) / 2
  left = cx - (TW * scaleX) / 2; top = cy - (TH * scaleY) / 2
} else {
  const gx = detectAxis(true), gy = detectAxis(false)
  scaleX = gx.size; scaleY = gy.size
  // primeira linha/coluna da grade que encosta na área desenhada
  left = gx.offset + Math.floor((x0 - gx.offset) / scaleX) * scaleX
  top = gy.offset + Math.floor((y0 - gy.offset) / scaleY) * scaleY
  TW = Math.ceil((x1 + 1 - left) / scaleX)
  TH = Math.ceil((y1 + 1 - top) / scaleY)
}
const scale = (scaleX + scaleY) / 2

const out = Buffer.alloc(TW * TH * 4)
const colors = new Set()
for (let ty = 0; ty < TH; ty++) {
  for (let tx = 0; tx < TW; tx++) {
    // cor mais frequente no miolo do bloco (ignora as bordas, onde fica o borrado)
    const counts = new Map()
    const m = Math.max(1, Math.floor(scale * 0.2))
    for (let y = Math.floor(top + ty * scaleY) + m; y < Math.floor(top + (ty + 1) * scaleY) - m; y++) {
      for (let x = Math.floor(left + tx * scaleX) + m; x < Math.floor(left + (tx + 1) * scaleX) - m; x++) {
        if (x < 0 || y < 0 || x >= W || y >= H) continue
        const i = (y * W + x) * 4
        const r = raw[i], g = raw[i + 1], b = raw[i + 2], a = raw[i + 3]
        const key = a < 20 || isGreen(r, g, b) ? 'none' : `${r >> 3},${g >> 3},${b >> 3}`
        const c = counts.get(key) ?? { n: 0, r: 0, g: 0, b: 0 }
        c.n++; c.r += r; c.g += g; c.b += b
        counts.set(key, c)
      }
    }
    let best = null, bestKey = 'none'
    for (const [k, c] of counts) if (!best || c.n > best.n) { best = c; bestKey = k }
    const o = (ty * TW + tx) * 4
    if (!best || bestKey === 'none') continue
    out[o] = Math.round(best.r / best.n); out[o + 1] = Math.round(best.g / best.n); out[o + 2] = Math.round(best.b / best.n); out[o + 3] = 255
    colors.add(bestKey)
  }
}

let OW = TW, OH = TH, final = out
if (TRIM) {
  let a = TW, b = TH, c = -1, d = -1
  for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) {
    if (!out[(y * TW + x) * 4 + 3]) continue
    if (x < a) a = x; if (x > c) c = x; if (y < b) b = y; if (y > d) d = y
  }
  OW = c - a + 1; OH = d - b + 1
  final = Buffer.alloc(OW * OH * 4)
  for (let y = 0; y < OH; y++) out.copy(final, y * OW * 4, ((y + b) * TW + a) * 4, ((y + b) * TW + a + OW) * 4)
}
execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${OW}x${OH}`, '-i', '-', output], { input: final })
console.log(`ok: ${output} (${OW}x${OH}), grade ${TW}x${TH}, quadradinho ~${scale.toFixed(1)} px, ${colors.size} cores`)
