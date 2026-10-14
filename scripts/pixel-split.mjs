// Separa uma folha de poses (já em pixels de verdade, fundo transparente) em quadros soltos.
//
// Uso:  node scripts/pixel-split.mjs <folha.png> <prefixo-saida>
// Ex.:  node scripts/pixel-split.mjs pirb-frente.png public/solo/pixel/pirb-down
//       -> public/solo/pixel/pirb-down1.png, pirb-down2.png
//
// - corta onde há colunas totalmente vazias entre as poses;
// - todos os quadros saem com a mesma altura, com os pés na linha de baixo;
// - cada quadro fica centralizado pela CABEÇA (não pelo corpo), pra a cabeça não "tremer"
//   quando o jogo troca de passo (pernas abertas deixam o corpo mais largo de um lado).
// Precisa do ffmpeg.
import { execFileSync } from 'node:child_process'

const [input, prefix] = process.argv.slice(2)
if (!input || !prefix) {
  console.error('Uso: node scripts/pixel-split.mjs <folha.png> <prefixo-saida>')
  process.exit(1)
}
const [W, H] = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', input])
  .toString().trim().split(',').map(Number)
const px = execFileSync('ffmpeg', ['-v', 'error', '-i', input, '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'], { maxBuffer: 1 << 26 })
const solid = (x, y) => px[(y * W + x) * 4 + 3] > 0

// colunas com algo desenhado -> trechos (poses)
const used = Array.from({ length: W }, (_, x) => { for (let y = 0; y < H; y++) if (solid(x, y)) return true; return false })
const parts = []
for (let x = 0; x < W; x++) {
  if (!used[x]) continue
  const start = x
  while (x < W && (used[x] || used[x + 1])) x++ // junta buracos de 1 coluna
  parts.push([start, x - 1])
}
const frames = parts.filter(([a, b]) => b - a >= 4).map(([a, b]) => {
  let top = H, bottom = 0
  for (let y = 0; y < H; y++) for (let x = a; x <= b; x++) if (solid(x, y)) { top = Math.min(top, y); bottom = Math.max(bottom, y) }
  // centro da cabeça: média das colunas desenhadas no terço de cima
  const headRows = Math.max(1, Math.round((bottom - top + 1) * 0.33))
  let sx = 0, n = 0
  for (let y = top; y < top + headRows; y++) for (let x = a; x <= b; x++) if (solid(x, y)) { sx += x; n++ }
  return { a, b, top, bottom, head: sx / n }
})
if (!frames.length) { console.error('Nenhuma pose encontrada'); process.exit(1) }

const height = Math.max(...frames.map((f) => f.bottom - f.top + 1))
// largura comum: a metade maior (cabeça -> borda) de qualquer quadro, dos dois lados
const half = Math.ceil(Math.max(...frames.map((f) => Math.max(f.head - f.a, f.b - f.head)))) + 1
const width = half * 2
frames.forEach((f, i) => {
  const out = Buffer.alloc(width * height * 4)
  const dx = Math.round(half - f.head) // desloca pra cabeça ficar no meio
  const dy = height - 1 - f.bottom // pés na última linha
  for (let y = f.top; y <= f.bottom; y++) {
    for (let x = f.a; x <= f.b; x++) {
      if (!solid(x, y)) continue
      const ox = x + dx, oy = y + dy
      if (ox < 0 || ox >= width || oy < 0 || oy >= height) continue
      px.copy(out, (oy * width + ox) * 4, (y * W + x) * 4, (y * W + x) * 4 + 4)
    }
  }
  const file = `${prefix}${i + 1}.png`
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${width}x${height}`, '-i', '-', file], { input: out })
  console.log(`ok: ${file} (${width}x${height})`)
})
