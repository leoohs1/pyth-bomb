import './GameArena.css'

const DANGER_LABEL = ['', 'safe', 'warming up', 'danger!', 'critical!']
const QUESTION_MS = 10000 // tem que ser igual ao intervalo em deal_question (supabase/007_timers2.sql)

const PencilIcon = () => (
  <svg className="ga-icon" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4" stroke="currentColor" strokeWidth="2.2"
      strokeLinejoin="round" strokeLinecap="round" fill="none" />
  </svg>
)

// STEP 1 — painel central + HUD, ainda sem os jogadores (isso é o Step 2).
// Mesma "forma" de props que o Game.jsx real recebe de App.jsx, pra plugar
// direto quando chegar a hora (Step 3) sem precisar reescrever nada.
export default function GameArena({
  room, players, alive, danger, questionMs,
  answer, setAnswer, answerRef, onSubmit, error,
}) {
  const pct = Math.max(0, Math.min(100, (questionMs / QUESTION_MS) * 100))
  const secs = Math.ceil(questionMs / 1000)
  const urgent = questionMs <= 3000

  return (
    <main className="ga-stage">
      <div className="ga-arena">
        <div className="ga-bg" />
        <div className="ga-shade" />

        <div className="ga-hud">
          <span className="ga-chip">👥 {alive?.length ?? 0}/20 players</span>
          <span className="ga-chip">Round {room.round_number} · Classic</span>
        </div>

        {/* Step 2 entra aqui: os assentos com os jogadores */}

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
