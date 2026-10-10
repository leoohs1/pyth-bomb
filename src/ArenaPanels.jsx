import { useEffect, useRef, useState } from 'react'
import CharacterPicker from './CharacterPicker.jsx'
import { CHARACTER_NAMES, avatarIndex } from './characters.js'
import { inviteMessage } from './invite.js'

const MIN_PLAYERS = 2

// Conteúdo do painel central da arena fora da partida (sala de espera e fim de
// jogo). Só visual: a lógica (começar, sair) chega por props do App.jsx.
// O estilo (.ga-panel*) fica em GameArenaV2.css e escala com a arena (cqw).

function copyText(text) {
  return navigator.clipboard?.writeText(text).catch(() => false) ?? Promise.resolve(false)
}

export function LobbyPanel({ room, players, me: meProp, iAmHost, onStart, onLeave, onPick, error }) {
  // o "me" do App é o registro de quando entrei; o da lista é o atual (personagem escolhido etc.)
  const me = players.find((x) => x.id === meProp?.id) ?? meProp
  const [copied, setCopied] = useState(false)
  const [picking, setPicking] = useState(false)
  // só mostra a escolha se o banco já tem a coluna avatar_idx (SQL 013 rodado)
  const canPick = !!me && players.some((p) => p.avatar_idx != null)
  const timerRef = useRef(null)
  useEffect(() => () => clearTimeout(timerRef.current), [])

  async function copyCode() {
    await copyText(inviteMessage(room.code)) // link completo + código, pronto pra colar
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
          {copied ? '✓ Copied' : 'Copy link'}
        </button>
      </div>
      <p className="ga-hint">Share this link with your friends</p>

      {canPick && (
        <div className="ga-pick">
          <img className="ga-pick-thumb" src={CHARACTER_NAMES[avatarIndex(me, players)].file} alt="" />
          <button type="button" className="ga-pick-btn" onClick={() => setPicking(true)}>Choose character</button>
        </div>
      )}
      {picking && <CharacterPicker players={players} me={me} onPick={onPick} onClose={() => setPicking(false)} />}

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
