// Prepara as imagens do Guess the Person. As imagens NÃO vão pro GitHub (as pastas estão no .gitignore).
//
// 1) Coloque as imagens em  pessoas/  com o nome da pessoa no arquivo ("mersault.png", "SkyZ.jpg"...;
//    aceita .jpg .jpeg .png .webp). O nome do arquivo é o nome que aparece na revelação.
// 2) (opcional) Outras respostas aceitas: pessoas/respostas.txt, uma pessoa por linha:
//        Ricardinho | ricardo, ricardinho
//        SkyZ | sky z, sky
//    O nome da esquerda é o do arquivo (sem a extensão; maiúsculas não importam).
//    Maiúsculas, acentos e pontuação já são ignorados na hora de conferir; aqui entram só apelidos e outras formas.
// 3) Rode:  node scripts/person-prep.mjs
// 4) Sai em  pessoas-prontas/ :
//    - as imagens prontas (quadradas, 640 x 640, nome aleatório) -> arraste TODAS pro Supabase: Storage > people > Upload
//    - W02_lista_de_pessoas.sql -> rode no SQL Editor (nome e respostas aceitas de cada pessoa)
// Rodar de novo é seguro: imagem já preparada mantém o mesmo nome aleatório (mapa.json) e o SQL não duplica ninguém.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { join, extname, basename } from 'node:path'
import { sqlArray as arr, esc } from './song-answers.mjs'

const root = process.cwd()
const IN = join(root, 'pessoas')
const OUT = join(root, 'pessoas-prontas')
const MAP = join(OUT, 'mapa.json')
const SIZE = 640

if (!existsSync(IN)) { mkdirSync(IN); console.log('Criei a pasta "pessoas". Coloque as imagens lá ("Nome.png") e rode de novo.'); process.exit(0) }
mkdirSync(OUT, { recursive: true })
const map = existsSync(MAP) ? JSON.parse(readFileSync(MAP, 'utf8')) : {}

// respostas.txt: "Nome | resposta1, resposta2"
const extra = new Map()
const answersFile = join(IN, 'respostas.txt')
if (existsSync(answersFile)) {
  for (const line of readFileSync(answersFile, 'utf8').split(/\r?\n/)) {
    const [left, right] = line.split('|')
    if (!left?.trim() || !right?.trim()) continue
    extra.set(left.trim().toLowerCase(), right.split(',').map((s) => s.trim()).filter(Boolean))
  }
}

const rows = []
const problems = []
const seen = new Set()

for (const fileName of readdirSync(IN).sort()) {
  const ext = extname(fileName).toLowerCase()
  if (!['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) continue
  const name = basename(fileName, ext).trim()
  if (!name) continue
  if (seen.has(name.toLowerCase())) { problems.push(`${fileName}: já existe outra imagem com o nome "${name}"`); continue }
  seen.add(name.toLowerCase())

  const file = map[fileName] ?? `${randomBytes(8).toString('hex')}.jpg`
  const dest = join(OUT, file)
  if (!existsSync(dest)) {
    try {
      // corta um quadrado (um pouco puxado pra cima: o rosto costuma ficar lá) e reduz; sem metadados
      const crop = `crop='min(iw,ih)':'min(iw,ih)':'(iw-min(iw,ih))/2':'(ih-min(iw,ih))*0.2'`
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', join(IN, fileName),
        '-vf', `${crop},scale=${SIZE}:${SIZE}:flags=lanczos`, '-map_metadata', '-1', '-frames:v', '1', '-q:v', '3', dest])
    } catch (e) {
      problems.push(`${fileName}: não consegui preparar (${String(e.message).split('\n')[0]})`)
      continue
    }
  }
  map[fileName] = file
  const others = [...new Set((extra.get(name.toLowerCase()) ?? []).filter((a) => a.toLowerCase() !== name.toLowerCase()))]
  rows.push(`  ('${file}', '${esc(name)}', ${arr(others)}, 'community')`)
}

writeFileSync(MAP, JSON.stringify(map, null, 2))
const sql = `-- PYTH BOMB · GUESS THE PERSON — step W02: the list of people (${rows.length})
-- Run in Supabase SQL Editor AFTER W01, and upload the images to Storage > people. Safe to run more than once
-- (a person that is already there is skipped).
insert into public.person_bank (file, name, answers, category)
values
${rows.join(',\n')}
on conflict do nothing;

-- check: how many people are ready
select count(*) as people_ready from public.person_bank where active;
`
writeFileSync(join(OUT, 'W02_lista_de_pessoas.sql'), sql)

console.log(`${rows.length} pessoas preparadas em pessoas-prontas/`)
if (problems.length) { console.log('\nAtenção:'); problems.forEach((p) => console.log(' - ' + p)) }
console.log('\nPróximo passo: arraste as imagens (os .jpg com nome estranho) pra Supabase > Storage > people e rode o W02_lista_de_pessoas.sql.')
