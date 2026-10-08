import { useEffect, useRef, useState } from 'react'

const MIN_PLAYERS = 2

// Conteúdo do painel central da arena fora da partida (sala de espera e fim de
// jogo). Só visual: a lógica (começar, sair) chega por props do App.jsx.
// O estilo (.ga-panel*) fica em GameArenaV2.css e escala com a arena (cqw).

function copyText(text) {
  return navigator.clipboard?.writeText(text).catch(() => false) ?? Promise.resolve(false)
}

export function LobbyPanel({ room, players, iAmHost, onStart, onLeave, error }) {
  const [copied, setCopied] = useState(false)
  const timerRef = useRef(null)
  useEffect(() => () => clearTimeout(timerRef.current), [])

  async function copyCode() {
    await copyText(room.code)
    setCopied(true)
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setCopied(false), 1600)
  }

  const enough = players.length >= MIN_PLAYERS

  return (
    <>
      <img className="ga-logo" src="/logo.webp" alt="Pyth Bomb" width="2000" height="667" />
      <p className="ga-qnum">Room code</p>
      <div className="ga-code-row">
        <div className="ga-code" aria-label={`Room code ${room.code.split('').join(' ')}`}>{room.code}</div>
        <button type="button" className={`ga-copy${copied ? ' is-copied' : ''}`} onClick={copyCode}>
          {copied ? '✓ Copied' : 'Copy'}
        </button>
      </div>
      <p className="ga-hint">Share this code with your friends</p>

      {iAmHost ? (
        <>
          <button type="button" className="ga-send ga-bigbtn" onClick={onStart} disabled={!enough}>
            Start game
          </button>
          {!enough && <p className="ga-hint">Waiting for at least {MIN_PLAYERS} players…</p>}
        </>
      ) : (
        <p className="ga-wait" role="status">Waiting for the host<span className="ga-dots" aria-hidden="true" /></p>
      )}

      {error && <p className="ga-error" role="alert">{error}</p>}

      <button type="button" className="ga-leave"
        onClick={() => window.confirm('Leave this room?') && onLeave()}>
        Leave room
      </button>
    </>
  )
}

export function FinishedPanel({ room, winner, iWon, iAmOut, iAmHost, onStart, onLeave, error }) {
  return (
    <>
      <img className="ga-logo" src="/logo.webp" alt="Pyth Bomb" width="2000" height="667" />
      {winner ? (
        <>
          <p className="ga-qnum">Winner</p>
          <div className="ga-code ga-winner-name">{winner.nickname}</div>
          <p className="ga-hint">survived the Pyth Bomb</p>
          {iWon && <p className="ga-me is-win">🎉 That's you!</p>}
          {!iWon && iAmOut && <p className="ga-me">You got rugged. Better luck next round!</p>}
        </>
      ) : (
        <p className="ga-qtext">Game over</p>
      )}

      {iAmHost ? (
        <button type="button" className="ga-send ga-bigbtn" onClick={onStart}>Play again</button>
      ) : (
        <p className="ga-wait" role="status">Waiting for the host to play again<span className="ga-dots" aria-hidden="true" /></p>
      )}
      <p className="ga-hint">Room {room.code}</p>

      {error && <p className="ga-error" role="alert">{error}</p>}

      <button type="button" className="ga-leave"
        onClick={() => window.confirm('Leave this room?') && onLeave()}>
        Leave room
      </button>
    </>
  )
}
