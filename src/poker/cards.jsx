// Cartas e fichas do Pyth Poker, desenhadas em código (nada de imagem): frente creme com borda dourada,
// verso roxo com o P dourado no meio; ficha roxa com borda dourada listrada.
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

// size: 'sm' (na cadeira) | 'md' (mesa) | 'lg' (as minhas)
export function Card({ c, size = 'md', dim = false, glow = false, className = '' }) {
  if (c == null) return <span className={`pk-card pk-${size} is-back ${className}`} aria-label="Hidden card"><CardBackArt /></span>
  const s = SUITS[c & 3]
  const r = RANKS[c >> 2]
  return (
    <span className={`pk-card pk-${size}${s.red ? ' is-red' : ''}${dim ? ' is-dim' : ''}${glow ? ' is-glow' : ''} ${className}`}
      role="img" aria-label={cardLabel(c)}>
      <span className="pk-corner" aria-hidden="true"><b>{r}</b><i>{s.sym}</i></span>
      <span className="pk-pip" aria-hidden="true">{s.sym}</span>
    </span>
  )
}

export function CardBack({ size = 'md', className = '' }) {
  return <span className={`pk-card pk-${size} is-back ${className}`} aria-label="Hidden card"><CardBackArt /></span>
}

// verso: losangos finos + moeda dourada com o P
function CardBackArt() {
  return (
    <svg className="pk-back-art" viewBox="0 0 50 70" aria-hidden="true" preserveAspectRatio="none">
      <defs>
        <pattern id="pk-diamonds" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="6" height="6" fill="none" />
          <path d="M0 0H6" stroke="rgba(233,196,106,0.18)" strokeWidth="0.8" />
          <path d="M0 0V6" stroke="rgba(233,196,106,0.18)" strokeWidth="0.8" />
        </pattern>
        <radialGradient id="pk-coin" cx="40%" cy="35%" r="70%">
          <stop offset="0%" stopColor="#fff1b8" />
          <stop offset="55%" stopColor="#e2b553" />
          <stop offset="100%" stopColor="#9c6f1f" />
        </radialGradient>
      </defs>
      <rect x="0" y="0" width="50" height="70" fill="url(#pk-diamonds)" />
      <rect x="3.5" y="3.5" width="43" height="63" rx="3" fill="none" stroke="rgba(233,196,106,0.55)" strokeWidth="1" />
      <circle cx="25" cy="35" r="11" fill="url(#pk-coin)" stroke="#7a5414" strokeWidth="0.8" />
      <circle cx="25" cy="35" r="8.6" fill="none" stroke="rgba(122,84,20,0.55)" strokeWidth="0.6" />
      <text x="25" y="39.6" textAnchor="middle" fontFamily="Cinzel, Georgia, serif" fontWeight="800" fontSize="13" fill="#5a3a0c">P</text>
    </svg>
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
