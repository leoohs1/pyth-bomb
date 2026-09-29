import { useEffect, useRef, useState } from 'react'
import './GameArena.css'

const DANGER_LABEL = ['', 'safe', 'warming up', 'danger!', 'critical!']
const QUESTION_MS = 10000 // tem que ser igual ao intervalo em deal_question (supabase/007_timers2.sql)

// elenco sentado (entregue por Halls) — se um dia tiver mais gente que isso, repete
const AVATARS = [
  '/seat-oracle.webp', '/seat-athena.webp', '/seat-cyclops2.webp', '/seat-spartan.webp',
  '/seat-minotaur2.webp', '/seat-owl.webp', '/seat-amphora.webp', '/seat-boy.webp',
  '/seat-nymph.webp', '/seat-blossom.webp', '/seat-faun.webp', '/seat-statue.webp',
  '/seat-raven.webp', '/seat-pegasus.webp', '/seat-naiad.webp', '/seat-ram.webp',
]

// 20 "cadeiras" fixas: 3 fileiras (0 = mais perto/maior ... 2 = mais longe/menor,
// que divide a altura com o cartão e por isso só usa as laterais). Posição
// horizontal em % da arena — não é calculado, é mobília fixa, como combinado.
const SEATS = [
  // fileira 0 (frente) — 7 lugares, largura toda. Colunas começam em 6% e
  // terminam em 94% (não em 0%/100%) pra sobrar margem: o assento é centrado
  // no ponto, e a plaquinha do nome é um pouco mais larga que o personagem —
  // sem essa margem, a ponta esquerda/direita fica cortada pela arena.
  { row: 0, col: 6 }, { row: 0, col: 20.7 }, { row: 0, col: 35.3 }, { row: 0, col: 50 },
  { row: 0, col: 64.7 }, { row: 0, col: 79.3 }, { row: 0, col: 94 },
  // fileira 1 (meio) — 7 lugares, largura toda
  { row: 1, col: 6 }, { row: 1, col: 20.7 }, { row: 1, col: 35.3 }, { row: 1, col: 50 },
  { row: 1, col: 64.7 }, { row: 1, col: 79.3 }, { row: 1, col: 94 },
  // fileira 2 (fundo) — 6 lugares, só nas laterais (o cartão ocupa o centro aqui)
  { row: 2, col: 6 }, { row: 2, col: 17 }, { row: 2, col: 28 },
  { row: 2, col: 72 }, { row: 2, col: 83 }, { row: 2, col: 94 },
]

// ORDEM DE PREENCHIMENTO: índices em SEATS, do centro pra fora, alternando
// esquerda/direita, espalhando entre as fileiras — não é "primeiro N da
// fileira 0". Com poucos jogadores (6-8), isso preenche frente+meio de forma
// equilibrada antes de tocar na fileira de trás. Índices: 0-6 = fileira 0
// (centro=3), 7-13 = fileira 1 (centro=10), 14-19 = fileira 2 (sem centro
// único, começa pelos dois mais próximos do cartão).
const SEAT_ORDER = [
  3, 10,           // frente-centro, meio-centro
  4, 2, 11, 9,      // frente-dir, frente-esq, meio-dir, meio-esq (1 passo)
  5, 1, 12, 8,      // (2 passos)
  6, 0, 13, 7,      // (bordas)
  17, 16,          // fundo: mais perto do cartão (dir, esq)
  18, 15,          // fundo: meio
  19, 14,          // fundo: mais longe (cantos)
]

const PencilIcon = () => (
  <svg className="ga-icon" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4" stroke="currentColor" strokeWidth="2.2"
      strokeLinejoin="round" strokeLinecap="round" fill="none" />
  </svg>
)

// Mesma "forma" de props que o Game.jsx real recebe de App.jsx, pra plugar
// direto quando chegar a hora (Step 3) sem precisar reescrever nada. Por
// enquanto (Step 2) os jogadores aparecem sentados, parados — sem brilho de
// quem tem a bomba nem estado de eliminado ainda (isso é o Step 3).
export default function GameArena({
  room, players, alive, danger, questionMs,
  answer, setAnswer, answerRef, onSubmit, error,
}) {
  const pct = Math.max(0, Math.min(100, (questionMs / QUESTION_MS) * 100))
  const secs = Math.ceil(questionMs / 1000)
  const urgent = questionMs <= 3000

  // cada jogador (até 20) ganha uma cadeira, na ordem de preenchimento acima
  const seated = players.slice(0, 20).map((p, i) => ({ player: p, seat: SEATS[SEAT_ORDER[i]] }))

  // bomba "pulando" de assento em assento — mesmo mecanismo já testado no
  // jogo real (Game.jsx): mede onde estava e pra onde foi, anima um ícone
  // voando em arco. Só decoração — se algo não bater, simplesmente não anima.
  const avatarRefs = useRef({})
  const prevHolderRef = useRef(null)
  const flightSeqRef = useRef(0)
  const [flight, setFlight] = useState(null)

  useEffect(() => {
    const prevId = prevHolderRef.current
    const nextId = room.bomb_holder_id
    prevHolderRef.current = nextId

    if (!prevId || !nextId || prevId === nextId) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return

    // explosão + rodada nova (bomba renasce em outra pessoa) não é um "passe"
    const prevPlayer = players.find((p) => p.id === prevId)
    if (!prevPlayer || !prevPlayer.alive) return

    const fromEl = avatarRefs.current[prevId]
    const toEl = avatarRefs.current[nextId]
    if (!fromEl || !toEl) return

    const a = fromEl.getBoundingClientRect()
    const b = toEl.getBoundingClientRect()
    const x0 = a.left + a.width / 2, y0 = a.top + a.height / 2
    const x1 = b.left + b.width / 2, y1 = b.top + b.height / 2

    const seq = ++flightSeqRef.current
    setFlight({
      seq,
      id: nextId,
      vars: {
        '--x0': `${x0}px`, '--y0': `${y0}px`,
        '--x1': `${x1}px`, '--y1': `${y1}px`,
        '--xm': `${(x0 + x1) / 2}px`, '--ym': `${Math.min(y0, y1) - 60}px`,
      },
    })
    const t = setTimeout(() => {
      setFlight((f) => (f && f.seq === seq ? null : f))
    }, 550)
    return () => clearTimeout(t)
  }, [room.bomb_holder_id, players])

  return (
    <main className="ga-stage">
      <div className="ga-arena">
        <div className="ga-bg" />
        <div className="ga-shade" />

        <div className="ga-hud">
          <span className="ga-chip">👥 {alive?.length ?? 0}/20 players</span>
          <span className="ga-chip">Round {room.round_number} · Classic</span>
        </div>

        {flight && (
          <span key={flight.seq} className="ga-flying-bomb" aria-hidden="true" style={flight.vars}>💣</span>
        )}

        <div className="ga-seats">
          {seated.map(({ player: p, seat: s }, i) => {
            const isHolder = p.id === room.bomb_holder_id
            const isOut = !p.alive
            return (
              <div key={p.id}
                className={`ga-seat ga-row-${s.row}${isHolder ? ` is-holder dl-${danger}` : ''}${isOut ? ' is-out' : ''}`}
                style={{ left: `${s.col}%` }}>
                {isHolder && (
                  <>
                    <div className="ga-glow" />
                    <div className="ga-ring" />
                    <div className="ga-sparks" aria-hidden="true">
                      <span /><span /><span /><span /><span /><span />
                    </div>
                  </>
                )}
                <img
                  className="ga-avatar"
                  src={AVATARS[i % AVATARS.length]}
                  alt=""
                  ref={(el) => {
                    if (el) avatarRefs.current[p.id] = el
                    else delete avatarRefs.current[p.id]
                  }}
                />
                {isHolder && <span className="ga-bomb-badge" aria-hidden="true">💣</span>}
                <span className="ga-name">{p.nickname}</span>
              </div>
            )
          })}
        </div>

        <section className={`ga-card dl-${danger}`}>
          <img className="ga-logo" src="/logo.webp" alt="Pyth Bomb" width="2000" height="667" />
          <p className="ga-qnum">Question</p>
          <p className="ga-qtext">{room.current_question_text}</p>

          <div className="ga-time">
            <div className="ga-track" role="progressbar" aria-label="Time left for this question"
              aria-valuemin={0} aria-valuemax={QUESTION_MS / 1000} aria-valuenow={secs}>
              <div className={`ga-fill${urgent ? ' is-urgent' : ''}`} style={{ width: `${pct}%` }} />
            </div>
            <span className={`ga-secs${urgent ? ' is-urgent' : ''}`}>{secs}s</span>
          </div>

          <form className="ga-answer" onSubmit={onSubmit}>
            <label className="ga-field">
              <PencilIcon />
              <input
                ref={answerRef}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                aria-label="Your answer"
                placeholder="type your answer…"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
              />
            </label>
            <button type="submit" className="ga-send">Answer</button>
          </form>

          {error && <p className="ga-error" role="alert">{error}</p>}
        </section>
      </div>
    </main>
  )
}
