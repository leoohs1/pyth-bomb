import './Home.css'    // fundo, painel de mármore, personagens
import './Lobby.css'   // placas de jogador, texto de espera
import './Game.css'    // clarão da explosão
import './Finished.css'
import { Boom } from './Game'

// confete leve: valores fixos por posição (nada de sorteio a cada render)
const CONFETTI = Array.from({ length: 18 }, (_, i) => ({
  left: `${(i * 37) % 100}%`,
  delay: `${((i * 0.43) % 3).toFixed(2)}s`,
  dur: `${(3.6 + ((i * 0.37) % 2)).toFixed(2)}s`,
  color: ['#f8de8e', '#8f62e6', '#ffffff', '#dcae40', '#c9a2ff'][i % 5],
}))

// Tela de fim de jogo: vencedor, lista final e jogar de novo (só o dono).
// Só visual: a lógica (iniciar outra partida) chega por props do App.jsx.
export default function Finished({ room, players, me, winner, iAmHost, onStart, flash, error }) {
  const iWon = !!winner && winner.id === me?.id
  const meNow = players.find((p) => p.id === me?.id)
  const iAmOut = !!meNow && !meNow.alive

  // vencedor primeiro; o resto na ordem de entrada
  const standings = [...players].sort((a, b) => (b.id === winner?.id) - (a.id === winner?.id))

  return (
    <main className="hm-stage">
      <div className="hm-bg" role="img" aria-label="Marble arena above a night city" />
      <div className="hm-shade" />

      <div className="hm-scroll lb-scroll">
        <section className="hm-panel lb-panel fin-panel">
          {winner && (
            <div className="fin-confetti" aria-hidden="true">
              {CONFETTI.map((c, i) => (
                <span key={i} style={{ left: c.left, animationDelay: c.delay, animationDuration: c.dur, background: c.color }} />
              ))}
            </div>
          )}

          <Boom flash={flash} full />

          <div className="fin-content">
            <img className="fin-logo" src="/logo.webp" alt="Pyth Bomb" width="2000" height="667" />

            {winner ? (
              <>
                <p className="fin-trophy" role="img" aria-label="Trophy">🏆</p>
                <p className="lb-label fin-label"><span>Winner</span></p>
                <div className="lb-code fin-name">{winner.nickname}</div>
                <p className="fin-sub">survived the Pyth Bomb</p>
                {iWon && <p className="fin-me is-win">🎉 That's you!</p>}
                {!iWon && iAmOut && <p className="fin-me">You got rugged. Better luck next round!</p>}
              </>
            ) : (
              <p className="fin-sub fin-over">Game over</p>
            )}

            <p className="lb-label fin-standings-label"><span>Final standings</span></p>
            <ul className="lb-list fin-standings">
              {standings.map((p) => (
                <li key={p.id}
                  className={`lb-plate${p.id === me?.id ? ' is-me' : ''}${p.id === winner?.id ? ' is-holder' : ''}${p.alive ? '' : ' is-out'}`}>
                  <span className="lb-avatar" aria-hidden="true">
                    {p.alive ? (p.nickname.trim().charAt(0).toUpperCase() || '?') : '☠️'}
                  </span>
                  <span className="lb-name">{p.nickname}</span>
                  {p.id === me?.id && <span className="lb-you">you</span>}
                  {p.id === winner?.id && (
                    <span className="lb-crown" role="img" aria-label="Winner">👑</span>
                  )}
                </li>
              ))}
            </ul>

            {iAmHost ? (
              <button type="button" className="hm-btn hm-create lb-start" onClick={onStart}>Play again</button>
            ) : (
              <p className="lb-wait" role="status">Waiting for the host to play again<span className="lb-dots" aria-hidden="true" /></p>
            )}
            <p className="lb-hint">Room {room.code}</p>

            {error && <p className="hm-error" role="alert">{error}</p>}
          </div>
        </section>

        <div className="hm-chars" aria-hidden="true">
          <img className="hm-char hm-oracle" src="/oracle.webp" alt="" />
          <img className="hm-char hm-cyclops" src="/cyclops.webp" alt="" />
        </div>
      </div>
    </main>
  )
}
