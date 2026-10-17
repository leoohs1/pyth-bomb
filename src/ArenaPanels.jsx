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

// subtitle: nome do modo embaixo do logo (ex.: Guess the Price); invitePath: endereço do modo no link de convite
export function LobbyPanel({ room, players, me: meProp, iAmHost, onStart, onLeave, onPick, error, subtitle = null, invitePath = '/play' }) {
  // o "me" do App é o registro de quando entrei; o da lista é o atual (personagem escolhido etc.)
  const me = players.find((x) => x.id === meProp?.id) ?? meProp
  const [copied, setCopied] = useState(false)
  const [picking, setPicking] = useState(false)
  // só mostra a escolha se o banco já tem a coluna avatar_idx (SQL 013 rodado)
  const canPick = !!me && players.some((p) => p.avatar_idx != null)
  const timerRef = useRef(null)
  useEffect(() => () => clearTimeout(timerRef.current), [])

  async function copyCode() {
    await copyText(inviteMessage(room.code, invitePath)) // link completo + código, pronto pra colar
    setCopied(true)
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setCopied(false), 1600)
  }

  const enough = players.length >= MIN_PLAYERS

  return (
    <>
      <img className="ga-logo" src="/logo.webp" alt="Pyth Bomb" width="2000" height="667" />
      {subtitle && <p className="ga-mode-name">{subtitle}</p>}
      {/* código e link de convite: só o dono da sala vê (os outros já entraram) */}
      {iAmHost && (
        <>
          <p className="ga-qnum">Room code</p>
          <div className="ga-code-row">
            <div className="ga-code" aria-label={`Room code ${room.code.split('').join(' ')}`}>{room.code}</div>
            <button type="button" className={`ga-copy${copied ? ' is-copied' : ''}`} onClick={copyCode}>
              {copied ? '✓ Copied' : 'Copy link'}
            </button>
          </div>
        </>
      )}

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

const PLACE_LABEL = { 1: '1st', 2: '2nd', 3: '3rd' }

// Pódio do fim de jogo: 2º à esquerda, 1º no meio (mais alto), 3º à direita (a ordem na
// tela vem do CSS; na página fica 1, 2, 3 pra leitor de tela). 1º = vencedor da sala;
// 2º e 3º vêm de players.place (supabase/026_podium_places.sql). Sem esse SQL rodado, ou se
// a pessoa já saiu da sala, o degrau fica vazio.
function Podium({ players, winner, myId }) {
  const at = (n) => (n === 1 ? winner : players.find((p) => p.place === n)) ?? null
  return (
    <ol className="ga-podium" aria-label="Top 3">
      {[1, 2, 3].map((n) => {
        const p = at(n)
        return (
          <li key={n} className={`ga-step ga-step-${n}${p ? '' : ' is-empty'}${p && p.id === myId ? ' is-me' : ''}`}
            aria-label={`${PLACE_LABEL[n]}: ${p ? p.nickname : 'nobody'}`}>
            <div className="ga-step-who" aria-hidden="true">
              {p && <img src={CHARACTER_NAMES[avatarIndex(p, players)].file} alt="" />}
              {p && n === 1 && <span className="ga-step-crown">👑</span>}
            </div>
            <div className="ga-step-block" aria-hidden="true">{n}</div>
            <span className="ga-step-name" aria-hidden="true">{p?.nickname ?? ''}</span>
          </li>
        )
      })}
    </ol>
  )
}

export function FinishedPanel({ room, players, myId, winner, iWon, iAmOut, iAmHost, onStart, onLeave, error }) {
  const myPlace = players.find((p) => p.id === myId)?.place
  return (
    <>
      <img className="ga-logo" src="/logo.webp" alt="Pyth Bomb" width="2000" height="667" />
      {winner ? (
        <>
          <Podium players={players} winner={winner} myId={myId} />
          {iWon && <p className="ga-me is-win">🎉 You won!</p>}
          {!iWon && myPlace === 2 && <p className="ga-me">🥈 So close! You finished 2nd</p>}
          {!iWon && myPlace === 3 && <p className="ga-me">🥉 Nice! You finished 3rd</p>}
          {!iWon && myPlace !== 2 && myPlace !== 3 && iAmOut && <p className="ga-me">You got rugged. Better luck next round!</p>}
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
