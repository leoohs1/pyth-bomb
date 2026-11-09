// Placar da sala do PVP (em cima: lutadores e relógio) e os avisos por cima da sala (3-2-1, quem ganhou).
// Usado pelo teste local (/pvp-local) e pelo jogo online (/pvp).
import { cornerColor } from './render.js'
import { heroById } from './heroes.js'
import { PLAYER_SPEED, SPEED_STEP } from './engine/constants.js'

// resumo do estado pra tela (só muda quando algo visível muda)
export function hudOf(s) {
  return {
    mapId: s.map, status: s.status, phase: Math.ceil(s.phaseT), clock: Math.ceil(s.clock), sudden: !!s.closing, map: s.mapName, final: s.final,
    winner: s.winner ? s.players.find((p) => p.id === s.winner)?.name : null, winnerId: s.winner ?? null, tie: !!s.result?.tie,
    players: s.players.map((p) => ({
      id: p.id, name: p.name, hero: p.hero, corner: p.corner, alive: p.alive, on: p.connected !== false,
      bombs: p.maxBombs, range: p.range, speed: Math.round((p.speed - PLAYER_SPEED) / SPEED_STEP), shield: p.shield, kick: p.kick, detonator: p.detonator,
    })),
  }
}

export function MatchTop({ hud }) {
  const timeText = hud ? `${Math.floor(hud.clock / 60)}:${String(hud.clock % 60).padStart(2, '0')}` : '2:00'
  return (
    <header className="pl-top">
      <div className="pl-players">
        {hud?.players.map((p) => (
          <div key={p.id} className={`pl-card${p.alive ? '' : ' is-out'}`} style={{ '--ring': cornerColor(p.corner) }}>
            <img className="pl-face" src={heroById(p.hero).img} alt="" />
            <div className="pl-info">
              <b>{p.name}</b>
              <span className="pl-stats">
                {!p.alive ? 'OUT' : !p.on ? 'Reconnecting…' : <>💣{p.bombs} 🔥{p.range}{p.speed > 0 ? ` 👟${p.speed}` : ''}{p.shield ? ' 🛡️' : ''}{p.kick ? ' 🦶' : ''}{p.detonator ? ' 📡' : ''}</>}
              </span>
            </div>
          </div>
        ))}
      </div>
      <div className={`pl-clock${hud?.sudden ? ' is-sudden' : ''}`}>{hud?.sudden ? 'SUDDEN DEATH' : timeText}</div>
    </header>
  )
}

// avisos por cima da sala. overNote: frase embaixo do "X wins!" quando a sala acabou
export function MatchBanners({ hud, overNote = null }) {
  if (!hud) return null
  return (
    <>
      {hud.status === 'countdown' && <div className="pl-banner pl-count" key={hud.phase}>{hud.phase}</div>}
      {hud.status === 'countdown' && <div className="pl-mapname">{hud.final ? 'FINAL · ' : ''}{hud.map}</div>}
      {(hud.status === 'ending' || hud.status === 'over') && (
        <div className="pl-banner pl-win">
          <span>{hud.winner} wins!</span>
          {hud.tie && <small>Tie broken by a draw</small>}
          {overNote && <small>{overNote}</small>}
        </div>
      )}
    </>
  )
}
