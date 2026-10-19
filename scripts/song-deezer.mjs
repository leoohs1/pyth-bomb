// Monta a lista de músicas do Guess the Song usando as prévias oficiais de 30 s do Deezer
// (nada de baixar música: o jogo toca a prévia direto do Deezer, supabase/song/S01b).
//
// 1) Escreva a lista em  musicas/lista.txt  (uma por linha: "Artista - Música"; o ano é opcional:
//    "Queen - Bohemian Rhapsody (1975)". O ano do Deezer costuma ser de coletânea/remaster, por isso não uso)
// 2) Rode:  node scripts/song-deezer.mjs
// 3) Sai em  musicas-prontas/ :
//    - conferir-lista.txt  -> o que foi achado no Deezer (confira se é a música certa!)
//    - S02_lista_deezer.sql -> rode no SQL Editor do Supabase
// Busca na API pública do Deezer (sem chave). Rodar de novo é seguro (não duplica).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { artistAnswers, titleAnswers, cleanTitle, sqlArray, esc } from './song-answers.mjs'

const root = process.cwd()
const LIST = join(root, process.argv[2] ?? 'musicas/lista.txt')
const OUT = join(root, 'musicas-prontas')
if (!existsSync(LIST)) {
  mkdirSync(join(root, 'musicas'), { recursive: true })
  console.log(`Não achei ${LIST}. Crie esse arquivo com uma música por linha ("Artista - Música") e rode de novo.`)
  process.exit(0)
}
mkdirSync(OUT, { recursive: true })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/^the\s+/, '').replace(/['’]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
const close = (a, b) => { a = norm(a); b = norm(b); return a === b || a.includes(b) || b.includes(a) }

async function api(path) {
  for (let i = 0; i < 3; i++) {
    const r = await fetch('https://api.deezer.com' + path)
    const j = await r.json().catch(() => null)
    if (j && !j.error) return j
    await sleep(1200) // limite do Deezer (50 pedidos a cada 5 s): espera e tenta de novo
  }
  return null
}

// escolhe a melhor faixa: artista certo, nome certo, com prévia; desempata pela mais ouvida
async function find(artist, title) {
  const tries = [
    `/search?q=${encodeURIComponent(`artist:"${artist}" track:"${title}"`)}&limit=15`,
    `/search?q=${encodeURIComponent(`${artist} ${title}`)}&limit=15`,
  ]
  for (const path of tries) {
    const res = await api(path)
    await sleep(150)
    const list = (res?.data ?? []).filter((t) => t.preview)
    const good = list.filter((t) => close(t.artist?.name, artist) && close(cleanTitle(t.title), cleanTitle(title)))
    // prefere a versão de estúdio: ao vivo, remix, acústico, karaokê... só se não tiver outra
    const odd = (t) => (/\b(live|remix|acoustic|karaoke|instrumental|cover|tribute|demo|sped up|slowed)\b/i
      .test(`${t.title} ${t.album?.title ?? ''}`) && !/\b(live|remix|acoustic)\b/i.test(title)) ? 1 : 0
    const pick = (good.length ? good : []).sort((a, b) => odd(a) - odd(b) || (b.rank ?? 0) - (a.rank ?? 0))[0]
    if (pick) return { track: pick, exact: true }
    if (list.length && path === tries[1]) return { track: list[0], exact: false }
  }
  return null
}

const lines = readFileSync(LIST, 'utf8').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
const rows = []
let report = 'LISTA DO GUESS THE SONG — o que achei no Deezer\n(confira se cada uma é a música certa; as marcadas com ⚠ precisam de atenção)\n\n'
let n = 0, bad = 0

for (const line of lines) {
  // "#12345" no fim da linha: usa exatamente essa faixa do Deezer (quando a busca escolhe a versão errada)
  const forced = line.match(/\s+#(\d+)\s*$/)
  const m = (forced ? line.slice(0, forced.index) : line).match(/^(.+?)\s+[-–—]\s+(.+)$/)
  n++
  if (!m) { report += `${n}. ⚠ "${line}": escreva no formato "Artista - Música"\n`; bad++; continue }
  const [, artist, rawTitle] = m
  const yearMatch = rawTitle.match(/\s*\((\d{4})\)\s*$/)
  const title = yearMatch ? rawTitle.slice(0, yearMatch.index).trim() : rawTitle
  const year = yearMatch ? yearMatch[1] : ''
  let found = null
  if (forced) {
    const t = await api(`/track/${forced[1]}`)
    await sleep(150)
    if (t?.id && t.preview) found = { track: t, exact: true }
  } else {
    found = await find(artist, title)
  }
  if (!found) { report += `${n}. ⚠ ${artist} - ${title}: NÃO ACHEI no Deezer (confira a escrita)\n`; bad++; continue }
  const t = found.track
  const mark = found.exact ? '✓' : '⚠ CONFIRA (achei algo parecido)'
  if (!found.exact) bad++
  report += `${n}. ${mark} ${artist} - ${title}${year ? ` (${year})` : ''}  →  Deezer: ${t.artist.name} - ${t.title}\n`
  // no jogo aparece o nome como você escreveu; o nome do Deezer também vale como resposta
  const artistAlts = [...new Set([...artistAnswers(artist), t.artist.name, ...artistAnswers(t.artist.name)])].filter((a) => a !== artist)
  const titleAlts = [...new Set([...titleAnswers(title), cleanTitle(t.title), ...titleAnswers(t.title)])].filter((x) => x !== title)
  rows.push(`  (${t.id}, '${esc(artist)}', '${esc(title)}', ${sqlArray(artistAlts)}, ${sqlArray(titleAlts)}, ${year && /^\d{4}$/.test(year) ? year : 'null'})`)
}

const sql = `-- PYTH BOMB · GUESS THE SONG — step S02: the list of songs (${rows.length}), with Deezer previews
-- Made by scripts/song-deezer.mjs. Run AFTER S01 and S01b. Safe to run more than once
-- (songs already there are skipped).
insert into public.song_bank (deezer_id, artist, title, artist_answers, title_answers, year) values
${rows.join(',\n')}
on conflict do nothing;

select count(*) filter (where active) as songs_in_play from public.song_bank;
`
if (rows.length) writeFileSync(join(OUT, 'S02_lista_deezer.sql'), sql)
writeFileSync(join(OUT, 'conferir-lista.txt'), report + `\n${rows.length} prontas, ${bad} com ⚠\n`)
console.log(report + `\n${rows.length} prontas, ${bad} com ⚠ -> musicas-prontas/conferir-lista.txt e S02_lista_deezer.sql`)
