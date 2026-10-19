// Respostas aceitas do Guess the Song, além do nome principal (usado por song-prep.mjs e
// song-deezer.mjs). A conferência no servidor já ignora maiúsculas, acentos, pontuação,
// "the" no começo e erros pequenos de digitação; aqui entram as outras formas de escrever.

// nome limpo, sem "(Remastered 2011)", "[Live]", "- Radio Edit"...
export function cleanTitle(title) {
  return title.replace(/\s*[([].*?[)\]]\s*/g, ' ').replace(/\s+-\s+.*(remaster|live|version|edit|mix|mono|stereo).*$/i, '').replace(/\s+/g, ' ').trim() || title
}

export function artistAnswers(artist) {
  const out = new Set()
  const add = (s) => { s = s.trim(); if (s.length >= 2) out.add(s) }
  add(artist)
  add(artist.replace(/^the\s+/i, ''))
  add(artist.replace(/\s*&\s*/g, ' and '))
  add(artist.replace(/\s+and\s+/gi, ' & '))
  add(artist.replace(/\s+n'?\s+/gi, ' and ')) // Guns N' Roses = Guns and Roses
  const main = artist.split(/\s+(?:feat\.?|ft\.?|featuring|x)\s+/i)[0]
  add(main)
  // dupla/grupo "A & B" / "A, B": cada nome sozinho também vale
  for (const part of main.split(/\s*(?:&|,| and )\s*/i)) if (part.length >= 4) add(part)
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
  out.delete(title)
  return [...out]
}

export const esc = (s) => String(s).replace(/'/g, "''")
export const sqlArray = (list) => `array[${list.map((s) => `'${esc(s)}'`).join(', ')}]::text[]`
