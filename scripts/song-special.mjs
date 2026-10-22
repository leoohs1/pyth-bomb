// Monta o SQL das MÚSICAS ESPECIAIS do Guess the Song: elas tocam PRIMEIRO (uma vez cada), depois o rodízio normal.
//
// 1) Escreva as músicas em  musicas/especiais.txt  (uma por linha: "Artista - Música"; pode ter " #idDoDeezer" no fim)
// 2) Rode:  node scripts/song-special.mjs
// 3) Sai:   supabase/song/S08_special_songs.sql  (rode no SQL Editor do Supabase)
//           musicas-prontas/especiais/conferir-lista.txt  (confira se cada uma é a música certa)
// O SQL: cria a coluna "special", troca a regra de sorteio (especiais ainda não tocadas vêm antes de todas),
// acrescenta as que ainda não estão no jogo e marca as 20. Pra voltar ao normal: update song_bank set special = false;
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const LIST = 'musicas/especiais.txt'
const OUT_DIR = 'musicas-prontas/especiais'
if (!existsSync(join(root, LIST))) { console.log(`Crie ${LIST} (uma música por linha: "Artista - Música") e rode de novo.`); process.exit(0) }

// 1) busca no Deezer (mesma busca do resto: prefere a versão de estúdio)
execFileSync('node', ['scripts/song-deezer.mjs', LIST, OUT_DIR], { cwd: root, stdio: 'inherit' })

// 2) lê as linhas que o script gerou: (id, 'artista', 'título', array[...], array[...], ano)
const gen = readFileSync(join(root, OUT_DIR, 'S02_lista_deezer.sql'), 'utf8')
const rowRe = /^\s*\((\d+), '((?:[^']|'')*)', '((?:[^']|'')*)', (array\[.*?\]::text\[\]), (array\[.*?\]::text\[\]), (null|\d+)\)/gm
const songs = [...gen.matchAll(rowRe)].map((m) => ({ id: m[1], artist: m[2], title: m[3], aa: m[4], ta: m[5], year: m[6] }))
if (!songs.length) throw new Error('nenhuma música encontrada no resultado do Deezer')

// 3) a função de sorteio vem do S05 (a versão atual), só com a regra nova
const s05 = readFileSync(join(root, 'supabase/song/S05_no_countdown_between_songs.sql'), 'utf8')
const a = s05.indexOf('create or replace function public.song_next_round')
const endTok = 'revoke execute on function public.song_next_round(uuid) from public, anon, authenticated;'
let fn = s05.slice(a, s05.indexOf(endTok) + endTok.length)
const KEY = 'case when special and times_dealt = 0 then -1 else times_dealt end'
const oldPick = `    select min(times_dealt) into v_min from song_bank where active;
    select * into v_s from song_bank
    where active and times_dealt = v_min
    order by random() limit 1
    for update skip locked;
    if v_s.id is null then
      select * into v_s from song_bank where active order by times_dealt, random() limit 1;
    end if;`
if (!fn.includes(oldPick)) throw new Error('não achei o trecho do sorteio no S05')
fn = fn.replace(oldPick, () => `    -- special songs that were never dealt count as "-1", so they come before every other song (once each)
    select min(${KEY}) into v_min from song_bank where active;
    select * into v_s from song_bank
    where active and (${KEY}) = v_min
    order by random() limit 1
    for update skip locked;
    if v_s.id is null then
      select * into v_s from song_bank where active order by (${KEY}), random() limit 1;
    end if;`)

// "mesma música": mesmo id do Deezer OU mesmo artista + título (ignora maiúsculas, acento e pontuação)
const same = (s) => `(deezer_id = ${s.id} or (public.normalize_answer(artist) = public.normalize_answer('${s.artist}') and public.normalize_answer(title) = public.normalize_answer('${s.title}')))`
const inserts = songs.map((s) => `insert into public.song_bank (deezer_id, artist, title, artist_answers, title_answers, year)
select ${s.id}, '${s.artist}', '${s.title}', ${s.aa}, ${s.ta}, ${s.year}
where not exists (select 1 from public.song_bank where ${same(s)});`).join('\n')
const marks = songs.map((s) => `update public.song_bank set special = true, active = true, times_dealt = 0 where ${same(s)}; -- ${s.artist.replace(/''/g, "'")} - ${s.title.replace(/''/g, "'")}`).join('\n')

const sql = `-- PYTH BOMB · GUESS THE SONG — step S08: ${songs.length} SPECIAL songs that play first
-- Run in Supabase SQL Editor AFTER S07. Safe to run more than once.
-- The special songs are dealt FIRST, once each, before any other song. After that the normal rotation goes on.
-- (So in a game of 10 songs, the first 2 games are made only of special songs.)
-- Songs that were not in the game yet are added. To go back to normal later:
--     update public.song_bank set special = false;
-- To give the special songs their "first" priority again (e.g. right before the event):
--     update public.song_bank set times_dealt = 0 where special;

alter table public.song_bank add column if not exists special boolean not null default false;

${fn}

-- songs not in the game yet
${inserts}

-- mark the special ones (and make sure they are on and "never dealt")
${marks}

-- check: ${songs.length} special songs, and the total in the game
select count(*) filter (where special) as special_songs, count(*) filter (where active) as songs_in_play from public.song_bank;
`
writeFileSync(join(root, 'supabase/song/S08_special_songs.sql'), sql)
console.log(`\n${songs.length} músicas especiais -> supabase/song/S08_special_songs.sql`)
