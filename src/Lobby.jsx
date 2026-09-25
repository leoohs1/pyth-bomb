import { useEffect, useRef, useState } from 'react'
import './Home.css'   // fundo, painel de mármore e personagens (compartilhados com a entrada)
import './Lobby.css'

const MIN_PLAYERS = 2

// Sala de espera: código da sala, jogadores e botão de começar (só o dono).
// Só visual: a lógica (iniciar o jogo, lista de jogadores) chega por props do App.jsx.
export default function Lobby({ room, players, me, iAmHost, onStart, error }) {
  const [copied, setCopied] = useState(false)
  const timerRef = useRef(null)

  useEffect(() => () => clearTimeout(timerRef.current), [])

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(room.code)
    } catch {
      // navegadores antigos / sem permissão: método alternativo
      const t = document.createElement('textarea')
      t.value = room.code
      document.body.appendChild(t)
      t.select()
      document.execCommand('copy')
      document.body.removeChild(t)
    }
    setCopied(true)
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setCopied(false), 1600)
  }

  const enough = players.length >= MIN_PLAYERS

  return (
    <main className="hm-stage">
      <div className="hm-bg" role="img" aria-label="Marble arena above a night city with the Pyth emblem on the floor" />
      <div className="hm-shade" />

      <div className="hm-scroll lb-scroll">
        <section className="hm-panel lb-panel">
          <h1 className="hm-title lb-logo">
            <img src="/logo.webp" alt="Pyth Bomb" width="2000" height="667" />
          </h1>

          <p className="lb-label"><span>Room code</span></p>
          <div className="lb-code-row">
            <div className="lb-code" aria-label={`Room code ${room.code.split('').join(' ')}`}>{room.code}</div>
            <button type="button" className={`lb-copy${copied ? ' is-copied' : ''}`} onClick={copyCode}>
              {copied ? '✓ Copied!' : 'Copy'}
            </button>
          </div>
          <p className="lb-hint">Share this code with your friends</p>

          <p className="lb-label lb-players-label"><span>Players ({players.length})</span></p>
          <ul className="lb-list">
            {players.map((p) => (
              <li key={p.id} className={`lb-plate${p.id === me?.id ? ' is-me' : ''}`}>
                <span className="lb-avatar" aria-hidden="true">{p.nickname.trim().charAt(0).toUpperCase() || '?'}</span>
                <span className="lb-name">{p.nickname}</span>
                {p.id === me?.id && <span className="lb-you">you</span>}
                {p.user_id === room.host_user_id && (
                  <span className="lb-crown" role="img" aria-label="Host" title="Host">👑</span>
                )}
              </li>
            ))}
          </ul>

          {iAmHost ? (
            <>
              <button type="button" className="hm-btn hm-create lb-start" onClick={onStart} disabled={!enough}>
                Start game
              </button>
              {!enough && <p className="lb-hint">Waiting for at least {MIN_PLAYERS} players…</p>}
            </>
          ) : (
            <p className="lb-wait" role="status">Waiting for the host<span className="lb-dots" aria-hidden="true" /></p>
          )}

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
