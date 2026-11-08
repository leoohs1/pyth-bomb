// Nome da mão que eu tenho agora (só pra mostrar "You have: Two pair" na tela).
// Mesma conta do servidor (poker_score em supabase/poker/K01_poker.sql); quem decide o pote é sempre o servidor.

function straightHigh(mask) {
  let m = mask
  if ((m >> 14) & 1) m |= 2 // ás também vale 1 (A-2-3-4-5)
  for (let h = 14; h >= 5; h--) if (((m >> (h - 4)) & 31) === 31) return h
  return 0
}

// categoria: 0 carta alta ... 8 straight flush; hi = carta mais alta da sequência (pra saber se é royal)
export function handCategory(cards) {
  const cnt = new Array(15).fill(0)
  const scnt = [0, 0, 0, 0]
  const smask = [0, 0, 0, 0]
  let mask = 0
  for (const c of cards) {
    const r = (c >> 2) + 2, s = c & 3
    cnt[r]++; scnt[s]++; smask[s] |= 1 << r; mask |= 1 << r
  }
  const fs = scnt.findIndex((n) => n >= 5)
  if (fs >= 0) { const hi = straightHigh(smask[fs]); if (hi) return { cat: 8, hi } }
  const groups = cnt.slice(2)
  if (groups.includes(4)) return { cat: 7 }
  const trips = groups.filter((n) => n === 3).length, pairs = groups.filter((n) => n === 2).length
  if (trips >= 2 || (trips === 1 && pairs >= 1)) return { cat: 6 }
  if (fs >= 0) return { cat: 5 }
  if (straightHigh(mask)) return { cat: 4 }
  if (trips) return { cat: 3 }
  if (pairs >= 2) return { cat: 2 }
  if (pairs === 1) return { cat: 1 }
  return { cat: 0 }
}

const NAMES = ['High card', 'Pair', 'Two pair', 'Three of a kind', 'Straight', 'Flush', 'Full house', 'Four of a kind', 'Straight flush']

export function handName(cards) {
  if (!cards || cards.length < 2) return null
  const { cat, hi } = handCategory(cards)
  if (cat === 8 && hi === 14) return 'Royal flush'
  return NAMES[cat]
}
