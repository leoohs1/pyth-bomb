// Regras do torneio do Pyth Bomb PVP (a Halls definiu em 2026-11-08):
// - no máximo 4 por sala, cada um num canto;
// - quem ganha a sala passa; os vencedores formam as salas da rodada seguinte;
// - repete até sobrar uma sala FINAL (4, 3 ou 2 jogadores). Com 4 ou menos no total é uma sala só.
// Pra ninguém ficar sozinho numa sala, a divisão é a mais parelha possível: 5 viram 3+2, 9 viram 3+3+3.
export const ROOM_SIZE = 4

// divide n jogadores em ceil(n/4) salas o mais parelho possível, ex.: 10 -> [4, 3, 3]
export function splitEven(n) {
  const rooms = Math.ceil(n / ROOM_SIZE)
  const base = Math.floor(n / rooms)
  const extra = n % rooms
  return Array.from({ length: rooms }, (_, i) => base + (i < extra ? 1 : 0))
}

// plano completo: [{ rooms: [tamanhos], final }] — a última rodada é sempre a final
export function planRounds(n) {
  if (n < 2) return []
  const rounds = []
  let left = n
  while (left > ROOM_SIZE) {
    const rooms = splitEven(left)
    rounds.push({ rooms, final: false })
    left = rooms.length // um vencedor por sala
  }
  rounds.push({ rooms: [left], final: true })
  return rounds
}

// mapa de cada sala: a final é sempre a arena do CHOP; as outras alternam (no jogo o Entropy sorteia)
const OPEN_MAPS = ['Tavern', 'Hull']
export function mapFor(roundIdx, roomIdx, final) {
  return final ? "CHOP's Arena" : OPEN_MAPS[(roundIdx + roomIdx) % OPEN_MAPS.length]
}

export function summary(n) {
  const rounds = planRounds(n)
  if (!rounds.length) return ''
  if (rounds.length === 1) return `${n} fighters · one room, the winner takes it all`
  const parts = [`${n} fighters`]
  for (const r of rounds) parts.push(r.final ? `Final of ${r.rooms[0]}` : `${r.rooms.length} room${r.rooms.length > 1 ? 's' : ''}`)
  return parts.join(' → ')
}
