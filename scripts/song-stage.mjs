// Coloca no Guess the Song os personagens "em pé cantando" feitos no ChatGPT
// (kit em para-o-chatgpt/11-microfone, pedido em PEDIDO-TODOS.txt).
//
// 1) Salve cada imagem pronta em  para-o-chatgpt/11-microfone/prontos/  com o nome do personagem
//    no jogo: Hepa.png, Mis.png, Herms.png... (png, webp ou jpg; o fundo tem que ser transparente)
// 2) Rode:  node scripts/song-stage.mjs
// Cada imagem é recortada (tira a sobra transparente), fica com 600 px de largura e vai pra
// public/song/stage/<nome>-sing.webp; a lista SONG_STAGE_ART (src/song/seats.js) é refeita com
// todos os que existem. Quem não tem a arte continua sentado no centro do palco.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, extname, join } from 'node:path'

const root = process.cwd()
const IN = join(root, 'para-o-chatgpt/11-microfone/prontos')
const OUT = join(root, 'public/song/stage')
const SEATS = join(root, 'src/song/seats.js')
const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')
const chars = [...readFileSync(join(root, 'src/characters.js'), 'utf8').matchAll(/\{ file: '([^']+)', name: '([^']+)' \}/g)]
  .map((m) => ({ file: m[1], name: m[2] }))
mkdirSync(OUT, { recursive: true })

const probe = (f) => execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height',
  '-of', 'csv=p=0', f]).toString().trim().split(',').map(Number)
// transparência de cada pixel (0 = transparente); sem canal de transparência, tudo vira 255
const alphaOf = (f) => execFileSync('ffmpeg', ['-v', 'error', '-i', f, '-vf', 'format=rgba,alphaextract', '-f', 'rawvideo',
  '-pix_fmt', 'gray', '-'], { maxBuffer: 1e9 })

let done = 0
for (const file of existsSync(IN) ? readdirSync(IN) : []) {
  const ext = extname(file).toLowerCase()
  if (!['.png', '.webp', '.jpg', '.jpeg'].includes(ext)) continue
  const c = chars.find((x) => slug(x.name) === slug(basename(file, ext)))
  if (!c) { console.log(`⚠ ${file}: não achei esse personagem. Use o nome do jogo: ${chars.map((x) => x.name).join(', ')}`); continue }
  const src = join(IN, file)
  const [W, H] = probe(src)
  const a = alphaOf(src)
  const corners = [0, W - 1, (H - 1) * W, H * W - 1].map((i) => a[i])
  if (corners.some((v) => v > 200)) { console.log(`⚠ ${file}: o fundo não está transparente — peça de novo ("transparent background")`); continue }
  let x0 = W, y0 = H, x1 = 0, y1 = 0
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (a[y * W + x] > 24) {
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y
  }
  const pad = 10
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(W - 1, x1 + pad); y1 = Math.min(H - 1, y1 + pad)
  const out = join(OUT, `${slug(c.name)}-sing.webp`)
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', src, '-vf',
    `crop=${x1 - x0 + 1}:${y1 - y0 + 1}:${x0}:${y0},scale=600:-1:flags=lanczos,format=yuva420p`,
    '-c:v', 'libwebp', '-q:v', '90', '-map_metadata', '-1', out])
  console.log(`✓ ${c.name}: ${file} -> public/song/stage/${slug(c.name)}-sing.webp`)
  done++
}

// lista do jogo: todo personagem que tem a arte em pé
const art = chars.filter((c) => existsSync(join(OUT, `${slug(c.name)}-sing.webp`)))
const block = `export const SONG_STAGE_ART = {\n${art.map((c) => `  '${c.file}': '/song/stage/${slug(c.name)}-sing.webp', // ${c.name}`).join('\n')}\n}`
const seats = readFileSync(SEATS, 'utf8')
if (!/export const SONG_STAGE_ART = \{[\s\S]*?\n\}/.test(seats)) throw new Error('não achei SONG_STAGE_ART em src/song/seats.js')
writeFileSync(SEATS, seats.replace(/export const SONG_STAGE_ART = \{[\s\S]*?\n\}/, block))
console.log(`\n${done} imagem(ns) preparada(s). Em pé no palco agora: ${art.map((c) => c.name).join(', ') || 'ninguém'} (${art.length}/${chars.length})`)
