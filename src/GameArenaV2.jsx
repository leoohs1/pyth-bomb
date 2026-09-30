import { useEffect, useRef, useState } from 'react'
import './GameArenaV2.css'
import BombPovFlash from './BombPovFlash.jsx'

const QUESTION_MS = 10000 // tem que ser igual ao intervalo em deal_question (supabase/007_timers2.sql)

// elenco sentado (entregue por Halls) — se um dia tiver mais gente que isso, repete
const AVATARS = [
  '/seat-oracle.webp', '/seat-athena.webp', '/seat-cyclops2.webp', '/seat-spartan.webp',
  '/seat-minotaur2.webp', '/seat-owl.webp', '/seat-amphora.webp', '/seat-boy.webp',
  '/seat-nymph.webp', '/seat-blossom.webp', '/seat-faun.webp', '/seat-statue.webp',
  '/seat-raven.webp', '/seat-pegasus.webp', '/seat-naiad.webp', '/seat-ram.webp',
]

// V2: NÃO é mais uma grade de fileiras retas. São posições desenhadas à mão em
// cima dos degraus curvos de verdade do novo fundo (arena-seats-bg-v3.webp) —
// dois "clusters" (esquerda/direita) com alturas variadas, deixando o centro
// livre pro cartão. `row` aqui é só pra escala (0=banco da frente/maior,
// 1=segundo banco, 2=escada, 3=patamar perto das colunas/menor), não
// define mais o "top".
// Tentativa de 4+3+3 por lado (20 jogadores) ficou "amontoado" (nomes de
// trás sumindo atrás dos da frente) — voltou pro espaçamento original de
// 3 por banco (que já funcionava bem) e abriu um 4º nível mais pro fundo,
// perto da base das colunas, em vez de espremer mais gente nos 3 bancos
// de sempre.
const SEATS = [
  // --- cluster esquerdo (10) ---
  { row: 0, top: 49, col: 23 },   // banco da frente
  { row: 0, top: 50, col: 14 },
  { row: 0, top: 51, col: 5 },
  { row: 1, top: 39, col: 18 },   // segundo banco
  { row: 1, top: 40, col: 10 },
  { row: 1, top: 39, col: 2 },
  { row: 2, top: 27, col: 12 },   // escada do fundo
  { row: 2, top: 26, col: 5 },
  { row: 3, top: 16, col: 10 },   // patamar perto da base das colunas
  { row: 3, top: 15, col: 3 },
  // --- cluster direito (espelhado, 10) ---
  { row: 0, top: 49, col: 77 },
  { row: 0, top: 50, col: 86 },
  { row: 0, top: 51, col: 95 },
  { row: 1, top: 39, col: 82 },
  { row: 1, top: 40, col: 90 },
  { row: 1, top: 39, col: 98 },
  { row: 2, top: 27, col: 88 },
  { row: 2, top: 26, col: 95 },
  { row: 3, top: 16, col: 90 },
  { row: 3, top: 15, col: 97 },
]

// ordem de preenchimento: mais perto do cartão primeiro, alternando lado,
// depois sobe pros níveis de trás — com poucos jogadores fica só a frente
// dos dois lados, equilibrado. Índices: 0-2/10-12 = banco da frente,
// 3-5/13-15 = segundo banco, 6-7/16-17 = escada, 8-9/18-19 = patamar.
const SEAT_ORDER = [
  0, 10, 1, 11, 2, 12,            // banco da frente (esq/dir alternando)
  3, 13, 4, 14, 5, 15,            // segundo banco
  6, 16, 7, 17,                   // escada do fundo
  8, 18, 9, 19,                   // patamar perto das colunas
]

const PencilIcon = () => (
  <svg className="ga-icon" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4" stroke="currentColor" strokeWidth="2.2"
      strokeLinejoin="round" strokeLinecap="round" fill="none" />
  </svg>
)

// troca pra uma segunda arte (expressão de pânico) quando o personagem está com
// a bomba — mesmo mecanismo do GameArena.jsx original.
function SeatAvatar({ src, isHolder, imgRef }) {
  const panicSrc = src.replace('.webp', '-panic.webp')
  const [shown, setShown] = useState(isHolder ? panicSrc : src)

  useEffect(() => {
    setShown(isHolder ? panicSrc : src)
  }, [isHolder, src, panicSrc])

  return (
    <img
      className="ga-avatar"
      src={shown}
      alt=""
      ref={imgRef}
      onError={() => setShown(src)}
    />
  )
}

// V2 do GameArena: mesma lógica/props de sempre (nada de jogo real tocado),
// só a composição visual (fundo novo + card maior + clusters em vez de
// fileiras retas) — protótipo isolado pra aprovar antes de virar o principal.
export default function GameArenaV2({
  room, players, alive, danger, questionMs,
  answer, setAnswer, answerRef, onSubmit, error,
  myPlayerId, povFlash, onPovFlashDone,
}) {
  const pct = Math.max(0, Math.min(100, (questionMs / QUESTION_MS) * 100))
  const secs = Math.ceil(questionMs / 1000)
  const urgent = questionMs <= 3000

  // "eu" (myPlayerId) não senta na plateia — fico sozinho no centro vazio
  // (visão em 1ª pessoa: cada jogador se vê ali, e vê todo mundo sentado).
  // Sem myPlayerId (ex.: usos futuros sem "quem sou eu" definido), ninguém
  // é tirado da plateia — comportamento igual ao V1.
  const myIndex = myPlayerId ? players.findIndex((p) => p.id === myPlayerId) : -1
  const me = myIndex >= 0 ? players[myIndex] : null
  const crowd = myPlayerId ? players.filter((p) => p.id !== myPlayerId) : players
  const seated = crowd.slice(0, SEATS.length).map((p, i) => ({ player: p, seat: SEATS[SEAT_ORDER[i]] }))
  const iAmHolder = !!me && me.id === room.bomb_holder_id

  const avatarRefs = useRef({})
  const prevHolderRef = useRef(null)
  const flightSeqRef = useRef(0)
  const [flight, setFlight] = useState(null)
  const [povSeq, setPovSeq] = useState(0)

  useEffect(() => {
    if (povFlash != null) setPovSeq((n) => n + 1)
  }, [povFlash])

  useEffect(() => {
    const prevId = prevHolderRef.current
    const nextId = room.bomb_holder_id
    prevHolderRef.current = nextId

    if (!prevId || !nextId || prevId === nextId) return

    const prevPlayer = players.find((p) => p.id === prevId)
    if (!prevPlayer || !prevPlayer.alive) return

    if (myPlayerId && nextId === myPlayerId) {
      setPovSeq((n) => n + 1)
    }

    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return

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
  }, [room.bomb_holder_id, players, myPlayerId])

  return (
    <main className="ga-stage">
      <div className="ga-arena">
        <div className="ga-bg" />
        <div className="ga-shade" />

        <div className="ga-hud">
          <span className="ga-chip">👥 {alive?.length ?? 0}/{SEATS.length} players</span>
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
                style={{ left: `${s.col}%`, top: `${s.top}%` }}>
                {isHolder && (
                  <>
                    <div className="ga-glow" />
                    <div className="ga-ring" />
                    <div className="ga-sparks" aria-hidden="true">
                      <span /><span /><span /><span />
                    </div>
                  </>
                )}
                <SeatAvatar
                  src={AVATARS[i % AVATARS.length]}
                  isHolder={isHolder}
                  imgRef={(el) => {
                    if (el) avatarRefs.current[p.id] = el
                    else delete avatarRefs.current[p.id]
                  }}
                />
                {isHolder && (
                  <div className="ga-bomb-float" aria-hidden="true">
                    <img src="/bomb-laurel.webp" alt="" width="1254" height="1254" />
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* plaquinhas de nome numa camada própria, sempre por cima de
            QUALQUER avatar — sem isso, quem senta na frente (maior, com
            z-index mais alto) tampa o nome de quem senta atrás (mesmo em
            coluna diferente, a silhueta do personagem da frente é alta o
            bastante pra cobrir a fileira de trás) */}
        <div className="ga-seats">
          {seated.map(({ player: p, seat: s }) => (
            <div key={p.id}
              className={`ga-seat-name ga-row-${s.row}${!p.alive ? ' is-out' : ''}`}
              style={{ left: `${s.col}%`, top: `${s.top}%` }}>
              <div className="ga-seat-name-spacer" aria-hidden="true" />
              <span className="ga-name">{p.nickname}</span>
            </div>
          ))}
        </div>

        {me && (
          <div className={`ga-me-stage${iAmHolder ? ` is-holder dl-${danger}` : ''}`}>
            {iAmHolder && <p className="ga-me-banner">YOU HAVE THE BOMB!</p>}
            {iAmHolder && (
              <>
                <div className="ga-glow" />
                <div className="ga-ring" />
                <div className="ga-sparks" aria-hidden="true">
                  <span /><span /><span /><span />
                </div>
              </>
            )}
            <SeatAvatar
              src={AVATARS[myIndex % AVATARS.length]}
              isHolder={iAmHolder}
              imgRef={(el) => {
                if (el) avatarRefs.current[me.id] = el
                else delete avatarRefs.current[me.id]
              }}
            />
            {iAmHolder && (
              <div className="ga-bomb-float" aria-hidden="true">
                <img src="/bomb-laurel.webp" alt="" width="1254" height="1254" />
              </div>
            )}
            <span className="ga-name">{me.nickname}</span>
          </div>
        )}

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

        {povSeq > 0 && <BombPovFlash playKey={povSeq} onDone={onPovFlashDone} />}
      </div>
    </main>
  )
}
