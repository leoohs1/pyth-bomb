// Cartas e fichas do Pyth Poker: figuras, Ás de espadas e verso com a arte do baralho da Pyth (imagens em
// public/poker/cards); números, naipes e as outras cartas desenhados em código; ficha roxa com borda dourada.
// Cartas chegam do servidor como números 0..51: valor = carta / 4 (0 = dois ... 12 = ás), naipe = carta % 4.

export const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A']
export const SUITS = [
  { sym: '♣', name: 'clubs', red: false },
  { sym: '♦', name: 'diamonds', red: true },
  { sym: '♥', name: 'hearts', red: true },
  { sym: '♠', name: 'spades', red: false },
]
const RANK_WORD = ['Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Jack', 'Queen', 'King', 'Ace']

export const cardLabel = (c) => `${RANK_WORD[c >> 2]} of ${SUITS[c & 3].name}`
export const fmt = (n) => (n ?? 0).toLocaleString('en-US')

// arte do baralho da Pyth (public/poker/cards): figuras J, Q, K de cada naipe, o Ás de espadas e o verso.
// As outras cartas (2 a 10 e os outros ases) continuam desenhadas em código.
const SUIT_FILE = ['c', 'd', 'h', 's']
export const BACK_ART = '/poker/cards/back.webp'
export function artFor(c) {
  const r = c >> 2, s = c & 3
  if (r >= 9 && r <= 11) return `/poker/cards/${'JQK'[r - 9]}-${SUIT_FILE[s]}.webp`
  if (r === 12 && s === 3) return '/poker/cards/A-s.webp'
  return null
}
export const DECK_ART = [BACK_ART, '/poker/cards/A-s.webp', ...['J', 'Q', 'K'].flatMap((r) => SUIT_FILE.map((s) => `/poker/cards/${r}-${s}.webp`))]

// size: 'sm' (na cadeira) | 'md' (mesa) | 'lg' (as minhas)
export function Card({ c, size = 'md', dim = false, glow = false, className = '' }) {
  if (c == null) return <CardBack size={size} className={className} />
  const s = SUITS[c & 3]
  const r = RANKS[c >> 2]
  const art = artFor(c)
  return (
    <span className={`pk-card pk-${size}${s.red ? ' is-red' : ''}${dim ? ' is-dim' : ''}${glow ? ' is-glow' : ''}${art ? ' has-art' : ''} ${className}`}
      role="img" aria-label={cardLabel(c)}>
      {art && <img className="pk-art" src={art} alt="" draggable="false" decoding="async" />}
      <span className="pk-corner" aria-hidden="true"><b>{r}</b><i>{s.sym}</i></span>
      {!art && <span className="pk-pip" aria-hidden="true">{s.sym}</span>}
    </span>
  )
}

export function CardBack({ size = 'md', className = '' }) {
  return (
    <span className={`pk-card pk-${size} is-back ${className}`} aria-label="Hidden card">
      <img className="pk-back-art" src={BACK_ART} alt="" draggable="false" decoding="async" />
    </span>
  )
}

// pilha de fichas (1 a 3 discos, conforme o tamanho da aposta em blinds) + valor
export function Chips({ amount, bb = 50, className = '' }) {
  if (!amount) return null
  const n = amount >= bb * 10 ? 3 : amount >= bb * 2 ? 2 : 1
  return (
    <span className={`pk-chips ${className}`}>
      <span className="pk-chipstack" aria-hidden="true">
        {Array.from({ length: n }, (_, i) => <span key={i} className="pk-chip" style={{ '--i': i }} />)}
      </span>
      <span className="pk-amt">{fmt(amount)}</span>
    </span>
  )
}
