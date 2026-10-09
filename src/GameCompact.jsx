import { useState } from 'react'
import './GameCompact.css'
import SoundToggle from './SoundToggle.jsx'
import RuggedOverlay from './RuggedOverlay.jsx'

// Layout do CELULAR EM PÉ (e tablet pequeno em pé). Mesma lógica do jogo (os sons, a bomba
// passando, o relógio etc. continuam no GameArenaV2); aqui é só o que a pessoa VÊ, bem
// enxuto: pergunta e campo de resposta grandes no topo (o teclado não tapa) e uma grade
// de bonequinhos com o nome de cada um logo abaixo. Sem arena, sem assentos.

// personagem pequeno: troca pra versão em pânico quando está com a bomba
function Mini({ src, panic, imgRef }) {
  const panicSrc = src.replace('.webp', '-panic.webp')
  const [failed, setFailed] = useState(false)
  return (
    <img ref={imgRef} src={panic && !failed ? panicSrc : src} alt="" draggable="false"
      onError={() => setFailed(true)} />
  )
}

export default function GameCompact({
  room, players, alive, phase, panel, centerId,
  danger, pct, secs, urgent, questionMax,
  answer, setAnswer, answerRef, onSubmit, error, feedback, mistakes, flash,
  myPlayerId, holder, iAmHolder, iAmEliminated,
  avatarOf, avatarRefs, flight, bombSeq,
}) {
  const inGame = phase === 'playing'
  // destaque grande no meio: na partida, quem está com a bomba; no lobby, eu; no fim, o vencedor
  const meNow = players.find((p) => p.id === myPlayerId)
  const hero = inGame ? holder : phase === 'finished' ? players.find((p) => p.id === centerId) : meNow
  const heroIsMe = !!hero && hero.id === myPlayerId
  const heroPanic = inGame && !!holder
  const title = inGame ? `Round ${room.round_number} · Classic` : phase === 'lobby' ? 'Lobby · Classic' : 'Game over'

  return (
    <main className={`mb-stage${players.length > 8 ? ' is-many' : ''}`}>
      <div className="mb-top">
        <span className="ga-chip">👥 {inGame ? (alive?.length ?? 0) : players.length}/18</span>
        <span className="ga-chip mb-title">{title}</span>
        <SoundToggle />
      </div>

      {flight && (
        <img key={flight.seq} className="ga-flying-bomb" src="/bomb-laurel.webp" alt="" aria-hidden="true" style={flight.vars} />
      )}

      {inGame ? (
        <section className={`mb-card dl-${danger}${iAmHolder ? ' is-mine' : ''}`}>
          <p className="ga-qnum">Question</p>
          <p className="ga-qtext">{room.current_question_text}</p>

          <div className="ga-time">
            <div className="ga-track" role="progressbar" aria-label="Time left for this question"
              aria-valuemin={0} aria-valuemax={questionMax} aria-valuenow={secs}>
              <div className={`ga-fill${urgent ? ' is-urgent' : ''}`} style={{ width: `${pct}%` }} />
            </div>
            <span className={`ga-secs${urgent ? ' is-urgent' : ''}`}>{secs}s</span>
          </div>

          {iAmEliminated ? (
            <p className="ga-status ga-status-out">ELIMINATED — WATCHING</p>
          ) : iAmHolder ? (
            <form className="ga-answer" onSubmit={onSubmit}>
              <input
                ref={answerRef}
                className="mb-input"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                enterKeyHint="send"
                aria-label="Your answer"
                placeholder="type your answer…"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
              />
              <button type="submit" className="ga-send">Answer</button>
            </form>
          ) : (
            <p className="ga-status">{holder?.nickname ?? '...'} HAS THE BOMB</p>
          )}

          {iAmHolder && !iAmEliminated && (
            <div className="ga-mistakes" aria-label={`${mistakes} of 5 mistakes`}>
              {Array.from({ length: 5 }, (_, i) => (
                <span key={i} className={`ga-mistake-dot${i < mistakes ? ' is-filled' : ''}`} />
              ))}
            </div>
          )}

          {feedback && <p className="ga-error" role="alert">{feedback}</p>}
          {error && <p className="ga-error" role="alert">{error}</p>}

          {/* "você ficou com a bomba": avisinho que some sozinho (a cena grande é só da arena) */}
          {bombSeq > 0 && <p key={bombSeq} className="mb-bombtoast" aria-hidden="true">YOU HAVE THE BOMB!</p>}
        </section>
      ) : (
        <section className={`mb-card mb-panel mb-panel-${phase}`}>{panel}</section>
      )}

      {hero && (
        <div className={`mb-hero${inGame ? ` dl-${danger}` : ''}${heroIsMe ? ' is-me' : ''}${phase === 'finished' ? ' is-winner' : ''}`}>
          <div className="mb-hero-glow" aria-hidden="true" />
          <div className="mb-hero-pic">
            <Mini src={avatarOf(hero)} panic={heroPanic} />
            {heroPanic && <img className="mb-hero-bomb" src="/bomb-laurel.webp" alt="" aria-hidden="true" />}
            {phase === 'finished' && <span className="mb-hero-crown" role="img" aria-label="Winner">👑</span>}
          </div>
          <span className="mb-hero-name">{heroIsMe ? `${hero.nickname} (you)` : hero.nickname}</span>
        </div>
      )}

      <div className="mb-players" aria-label="Players">
        {players.map((p) => {
          const isHolder = inGame && p.id === room.bomb_holder_id
          const isMe = p.id === myPlayerId
          const isOut = inGame && !p.alive
          const isWinner = phase === 'finished' && p.id === centerId
          return (
            <div key={p.id}
              className={`mb-p${isMe ? ' is-me' : ''}${isHolder ? ` is-holder dl-${danger}` : ''}${isOut ? ' is-out' : ''}${isWinner ? ' is-winner' : ''}`}>
              <div className="mb-pic">
                <Mini src={avatarOf(p)} panic={isHolder}
                  imgRef={(el) => {
                    if (el) avatarRefs.current[p.id] = el
                    else delete avatarRefs.current[p.id]
                  }} />
                {isHolder && <img className="mb-bomb" src="/bomb-laurel.webp" alt="" aria-hidden="true" />}
                {isWinner && <span className="mb-crown" role="img" aria-label="Winner">👑</span>}
              </div>
              <span className="mb-name">{p.nickname}</span>
              {isMe && <span className="mb-you">you</span>}
            </div>
          )
        })}
      </div>

      <RuggedOverlay flash={flash} />
    </main>
  )
}
