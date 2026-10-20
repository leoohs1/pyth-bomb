// Respostas aceitas do Guess the Song, além do nome principal (usado por song-prep.mjs e
// song-deezer.mjs). A conferência no servidor já ignora maiúsculas, acentos, pontuação,
// "the" no começo e erros pequenos de digitação; aqui entram as outras formas de escrever.

// nome limpo, sem "(Remastered 2011)", "[Live]", "- Radio Edit"...
export function cleanTitle(title) {
  return title.replace(/\s*[([].*?[)\]]\s*/g, ' ').replace(/\s+-\s+.*(remaster|live|version|edit|mix|mono|stereo).*$/i, '').replace(/\s+/g, ' ').trim() || title
}

// outras formas de escrever que a conferência automática não adivinha (acentos, pontuação e maiúsculas
// ela já ignora; números por extenso, apelidos e letras trocadas por símbolo não)
const EXTRA_ARTIST = [[/^a-ha$/i, ['Aha']], [/^kesha$/i, ['Ke$ha']]]
const EXTRA_TITLE = [
  [/^7 rings$/i, ['Seven Rings']],
  [/^sk8er boi$/i, ['Skater Boi', 'Skater Boy', 'Sk8er Boy']],
  [/^seven nation army$/i, ['7 Nation Army']],
  [/^thank u, next$/i, ['Thank You Next', 'Thank You, Next']],
  [/^\.*baby one more time$/i, ['Hit Me Baby One More Time']],
]
const extras = (table, text) => table.flatMap(([re, list]) => (re.test(text.trim()) ? list : []))

export function artistAnswers(artist) {
  const out = new Set()
  const add = (s) => { s = s.trim(); if (s.length >= 2) out.add(s) }
  add(artist)
  for (const x of extras(EXTRA_ARTIST, artist)) add(x)
  add(artist.replace(/^the\s+/i, ''))
  add(artist.replace(/\s*&\s*/g, ' and '))
  add(artist.replace(/\s+and\s+/gi, ' & '))
  add(artist.replace(/\s+n'?\s+/gi, ' and ')) // Guns N' Roses = Guns and Roses
  const main = artist.split(/\s+(?:feat\.?|ft\.?|featuring|x)\s+/i)[0]
  add(main)
  // dupla, grupo ou participação ("A & B", "A, B", "A feat. B"): cada nome sozinho também vale
  // (em "Uptown Funk", de Mark Ronson feat. Bruno Mars, quase todo mundo digita "Bruno Mars")
  for (const part of artist.split(/\s*(?:&|,| and |\s(?:feat\.?|ft\.?|featuring|x)\s)\s*/i)) if (part.trim().length >= 4) add(part)
  out.delete(artist)
  return [...out]
}

export function titleAnswers(title) {
  const out = new Set()
  const add = (s) => { s = s.trim(); if (s.length >= 2) out.add(s) }
  add(title)
  const clean = cleanTitle(title)
  add(clean)
  add(clean.replace(/\s*&\s*/g, ' and '))
  add(clean.replace(/\s+and\s+/gi, ' & '))
  add(clean.replace(/\bo'(?=\s)/gi, 'of')) // Sweet Child O' Mine = Sweet Child of Mine
  add(clean.replace(/\b(\w+)in'(?=\s|$)/gi, '$1ing')) // Livin' on a Prayer = Living on a Prayer; Stayin' Alive = Staying Alive
  add(clean.replace(/(\w)'s\b/gi, '$1')) // Gangsta's Paradise = Gangsta Paradise
  add(clean.replace(/\bMr\.?(?=\s)/gi, 'Mister')) // Mr. Brightside = Mister Brightside
  for (const x of extras(EXTRA_TITLE, clean)) add(x)
  out.delete(title)
  return [...out]
}

export const esc = (s) => String(s).replace(/'/g, "''")
export const sqlArray = (list) => `array[${list.map((s) => `'${esc(s)}'`).join(', ')}]::text[]`
