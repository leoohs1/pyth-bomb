// Transforma uma pixel art "ampliada" (ex.: 24x32 entregue como 384x512, fundo verde)
// de volta pros pixels de verdade, pronta pro jogo.
//
// Uso:  node scripts/pixel-reduce.mjs <entrada> <saida.png> <largura> <altura>
// Ex.:  node scripts/pixel-reduce.mjs pirb-pixel.webp public/solo/pixel/pirb.png 24 32
//
// O que faz:
// - acha a área desenhada (ignora o fundo verde em volta) e divide em largura x altura blocos;
// - cada bloco vira 1 pixel com a cor que mais aparece nele (some o borrado das bordas);
// - verde do fundo vira transparente;
// - mostra quantas cores o resultado tem (o alvo é uns 24).
// Precisa do ffmpeg instalado (já está nesse PC).
import { execFileSync } from 'node:child_process'

const [, , input, output, wArg, hArg] = process.argv
if (!input || !output || !wArg || !hArg) {
  console.error('Uso: node scripts/pixel-reduce.mjs <entrada> <saida.png> <largura> <altura>')
  process.exit(1)
}
const TW = Number(wArg), TH = Number(hArg)

const probe = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', input]).toString().trim()
const [W, H] = probe.split(',').map(Number)
const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', input, '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'], { maxBuffer: 1 << 28 })

const isGreen = (r, g, b) => g > 150 && r < 120 && b < 120 && g - Math.max(r, b) > 80

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
const scale = Math.min(W / TW, H / TH)
const cx = (x0 + x1 + 1) / 2, cy = (y0 + y1 + 1) / 2
const left = Math.round(cx - (TW * scale) / 2), top = Math.round(cy - (TH * scale) / 2)

const out = Buffer.alloc(TW * TH * 4)
const colors = new Set()
for (let ty = 0; ty < TH; ty++) {
  for (let tx = 0; tx < TW; tx++) {
    // cor mais frequente no miolo do bloco (ignora as bordas, onde fica o borrado)
    const counts = new Map()
    const m = Math.max(1, Math.floor(scale * 0.2))
    for (let y = Math.floor(top + ty * scale) + m; y < Math.floor(top + (ty + 1) * scale) - m; y++) {
      for (let x = Math.floor(left + tx * scale) + m; x < Math.floor(left + (tx + 1) * scale) - m; x++) {
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

execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${TW}x${TH}`, '-i', '-', output], { input: out })
console.log(`ok: ${output} (${TW}x${TH}), escala detectada ~${scale.toFixed(1)}x, ${colors.size} cores`)
