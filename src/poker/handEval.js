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
const PLURAL = ['', '', '2s', '3s', '4s', '5s', '6s', '7s', '8s', '9s', '10s', 'Jacks', 'Queens', 'Kings', 'Aces']

// nome com os valores ("Pair of 2s", "Two pair, Kings & 5s") pra pares, trincas, quadras e full house
function detail(cards) {
  const { cat, hi } = handCategory(cards)
  const cnt = new Array(15).fill(0)
  for (const c of cards) cnt[(c >> 2) + 2]++
  const ranks = (n) => { const out = []; for (let r = 14; r >= 2; r--) if (cnt[r] === n) out.push(r); return out }
  const quads = ranks(4), trips = ranks(3), pairs = ranks(2)
  if (cat === 8 && hi === 14) return { cat, text: 'Royal flush' }
  if (cat === 7) return { cat, text: `Four ${PLURAL[quads[0]]}`, key: `q${quads[0]}` }
  if (cat === 6) { const over = trips[1] ?? pairs[0]; return { cat, text: `Full house, ${PLURAL[trips[0]]} over ${PLURAL[over]}`, key: `f${trips[0]}-${over}` } }
  if (cat === 3) return { cat, text: `Three ${PLURAL[trips[0]]}`, key: `t${trips[0]}` }
  if (cat === 2) return { cat, text: `Two pair, ${PLURAL[pairs[0]]} & ${PLURAL[pairs[1]]}`, key: `p${pairs[0]}-${pairs[1]}` }
  if (cat === 1) return { cat, text: `Pair of ${PLURAL[pairs[0]]}`, key: `p${pairs[0]}` }
  return { cat, text: NAMES[cat] }
}

// mine = minhas 2 cartas, board = cartas da mesa. Se o par/trinca é só da mesa, avisa ("on the board"):
// essa mão vale pra todo mundo, não é vantagem minha.
export function handName(mine, board = []) {
  if (!mine || mine.length < 2) return null
  const all = [...mine, ...board]
  const me = detail(all)
  if (me.key && board.length >= 2) {
    const b = detail(board)
    if (b.key === me.key) return `${me.text} (on the board)`
  }
  return me.text
}
