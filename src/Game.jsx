import './Home.css'    // fundo, painel de mármore, personagens
import './Lobby.css'   // placas de jogador
import './Game.css'

const DANGER_LABEL = ['', 'safe', 'warming up', 'danger!', 'critical!']
const QUESTION_MS = 10000

const PencilIcon = () => (
  <svg className="hm-icon" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4" stroke="currentColor" strokeWidth="2.2"
      strokeLinejoin="round" strokeLinecap="round" fill="none" />
  </svg>
)

// Tela da partida: bomba, pergunta, resposta e jogadores.
// Só visual: toda a lógica (respostas, tempo, perigo) continua no App.jsx e chega por props.
export default function Game({
  room, players, me, holder, iAmHolder, iAmOut, alive, danger, questionMs,
  flash, feedback, answer, setAnswer, answerRef, onSubmit, error,
}) {
  const pct = Math.max(0, Math.min(100, (questionMs / QUESTION_MS) * 100))
  const secs = Math.ceil(questionMs / 1000)
  const urgent = questionMs <= 3000

  return (
    <main className="hm-stage">
      <div className="hm-bg" role="img" aria-label="Marble arena above a night city" />
      <div className="hm-shade" />

      <div className="hm-scroll lb-scroll gm-scroll">
        <section className={`hm-panel lb-panel gm-panel dl-${danger}`}>
          <div className="gm-top">
            <img className="gm-logo" src="/logo.webp" alt="Pyth Bomb" width="2000" height="667" />
            <p className="gm-chip">Round {room.round_number} · {alive.length} alive</p>
          </div>

          {flash && <p className="gm-flash" role="status">{flash}</p>}

          <div className="gm-bomb-wrap" aria-hidden="true">
            <div className="gm-aura" />
            <img className="gm-bomb" src="/bomb-laurel.webp" alt="" width="1254" height="1254" />
          </div>
          <p className="gm-danger" role="status">{DANGER_LABEL[danger]}</p>

          {iAmOut ? (
            <p className="gm-banner is-out">☠️ You're out — watching</p>
          ) : iAmHolder ? (
            <p className="gm-banner is-me">You have the bomb! Answer!</p>
          ) : (
            <p className="gm-banner">💣 <strong>{holder?.nickname ?? '...'}</strong> has the bomb</p>
          )}

          {room.current_question_text && (
            <div className="gm-question">
              <p className="gm-qtext">{room.current_question_text}</p>
              <div className="gm-time">
                <div className="gm-track" role="progressbar" aria-label="Time left for this question"
                  aria-valuemin={0} aria-valuemax={10} aria-valuenow={secs}>
                  <div className={`gm-fill${urgent ? ' is-urgent' : ''}`} style={{ width: `${pct}%` }} />
                </div>
                <span className={`gm-secs${urgent ? ' is-urgent' : ''}`}>{secs}s</span>
              </div>
            </div>
          )}

          {iAmHolder && !iAmOut && (
            <form className="gm-answer" onSubmit={onSubmit}>
              <label className="hm-field">
                <PencilIcon />
                <input
                  ref={answerRef}
                  autoFocus
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  aria-label="Your answer"
                  placeholder="your answer"
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  onFocus={(e) => e.target.scrollIntoView({ block: 'center', behavior: 'smooth' })}
                />
              </label>
              <button type="submit" className="hm-btn hm-create gm-send">Answer</button>
            </form>
          )}
          {feedback && <p className="gm-feedback" role="alert">{feedback}</p>}

          <ul className="lb-list gm-players">
            {players.map((p) => (
              <li key={p.id}
                className={`lb-plate${p.id === me?.id ? ' is-me' : ''}${p.id === room.bomb_holder_id ? ' is-holder' : ''}${p.alive ? '' : ' is-out'}`}>
                <span className="lb-avatar" aria-hidden="true">
                  {p.alive ? (p.nickname.trim().charAt(0).toUpperCase() || '?') : '☠️'}
                </span>
                <span className="lb-name">{p.nickname}</span>
                {p.id === me?.id && <span className="lb-you">you</span>}
                {p.id === room.bomb_holder_id && (
                  <span className="lb-crown" role="img" aria-label="Has the bomb">💣</span>
                )}
              </li>
            ))}
          </ul>

          {error && <p className="hm-error" role="alert">{error}</p>}
        </section>

        <div className="hm-chars" aria-hidden="true">
          <img className="hm-char hm-oracle" src="/oracle.webp" alt="" />
          <img className="hm-char hm-cyclops" src="/cyclops.webp" alt="" />
        </div>
      </div>
    </main>
  )
}
