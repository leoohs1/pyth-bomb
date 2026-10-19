// Prepara os trechos do Guess the Song. As músicas NÃO vão pro GitHub (as pastas estão no .gitignore).
//
// 1) Coloque os trechos em  musicas/  com o nome "Artista - Música.mp3"
//    (pode ter o ano no fim: "Queen - Bohemian Rhapsody (1975).mp3"; também aceita .m4a .wav .ogg)
// 2) Rode:  node scripts/song-prep.mjs
// 3) Sai em  musicas-prontas/ :
//    - os trechos prontos, com nome aleatório (até 20 s, volume igualado, sem as etiquetas escondidas
//      de artista/título, entrada e saída suaves) -> arraste TODOS pro Supabase: Storage > songs > Upload
//    - S02_lista_de_musicas.sql -> rode no SQL Editor (artista, música e respostas aceitas)
// Rodar de novo é seguro: música já preparada mantém o mesmo nome aleatório (mapa.json).
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { join, extname, basename } from 'node:path'
import { artistAnswers, titleAnswers, sqlArray as arr, esc } from './song-answers.mjs'

const root = process.cwd()
const IN = join(root, 'musicas')
const OUT = join(root, 'musicas-prontas')
const MAP = join(OUT, 'mapa.json')
const MAX_SECS = 20

if (!existsSync(IN)) { mkdirSync(IN); console.log('Criei a pasta "musicas". Coloque os trechos lá ("Artista - Música.mp3") e rode de novo.'); process.exit(0) }
mkdirSync(OUT, { recursive: true })
const map = existsSync(MAP) ? JSON.parse(readFileSync(MAP, 'utf8')) : {}

const rows = []
const problems = []

for (const name of readdirSync(IN).sort()) {
  const ext = extname(name).toLowerCase()
  if (!['.mp3', '.m4a', '.wav', '.ogg', '.aac', '.flac'].includes(ext)) continue
  const base = basename(name, ext)
  const m = base.match(/^(.+?)\s+-\s+(.+?)(?:\s*\((\d{4})\))?$/)
  if (!m) { problems.push(`${name}: o nome precisa ser "Artista - Música"`); continue }
  const [, artist, rawTitle, year] = m
  // na revelação aparece o nome limpo (sem "(Remastered)", "[Live]"...); o original também vale como resposta
  const title = rawTitle.replace(/\s*[([].*?[)\]]\s*/g, ' ').trim() || rawTitle

  const file = map[name] ?? `${randomBytes(8).toString('hex')}.mp3`
  const dest = join(OUT, file)
  if (!existsSync(dest)) {
    try {
      const dur = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', join(IN, name)]).toString().trim())
      const len = Math.min(MAX_SECS, dur || MAX_SECS)
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', join(IN, name), '-t', String(len),
        '-map', '0:a:0', '-map_metadata', '-1', '-vn',
        '-af', `afade=t=in:st=0:d=0.3,afade=t=out:st=${Math.max(0, len - 0.8).toFixed(2)}:d=0.8,loudnorm=I=-16:TP=-1.5:LRA=11`,
        '-ac', '2', '-ar', '44100', '-b:a', '128k', dest])
    } catch (e) {
      problems.push(`${name}: não consegui preparar (${String(e.message).split('\n')[0]})`)
      continue
    }
  }
  map[name] = file
  rows.push(`  ('${file}', '${esc(artist)}', '${esc(title)}', ${arr(artistAnswers(artist))}, ${arr([...new Set([rawTitle, ...titleAnswers(rawTitle)])].filter((t) => t !== title))}, ${year ?? 'null'})`)
}

writeFileSync(MAP, JSON.stringify(map, null, 2))
const sql = `-- PYTH BOMB · GUESS THE SONG — step S02: the list of songs (${rows.length})
-- Made by scripts/song-prep.mjs. BEFORE running: upload all the .mp3 files of this folder to
-- Supabase Storage > songs. Safe to run more than once (songs already there are skipped).
insert into public.song_bank (file, artist, title, artist_answers, title_answers, year) values
${rows.join(',\n')}
on conflict do nothing;

select count(*) filter (where active) as songs_in_play from public.song_bank;
`
if (rows.length) writeFileSync(join(OUT, 'S02_lista_de_musicas.sql'), sql)
console.log(`Prontas: ${rows.length} músicas em musicas-prontas/`)
if (problems.length) console.log('Problemas:\n- ' + problems.join('\n- '))
