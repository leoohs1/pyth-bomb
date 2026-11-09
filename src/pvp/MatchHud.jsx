// Placar da sala do PVP (em cima: lutadores e relógio) e os avisos por cima da sala (3-2-1, quem ganhou).
// Usado pelo teste local (/pvp-local) e pelo jogo online (/pvp).
import { Fragment, useEffect, useRef, useState } from 'react'
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
            <span className="pl-face-box"><img className="pl-face" src={heroById(p.hero).img} alt="" /></span>
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

// TELA VS (nos 3 segundos antes da luta): os lutadores grandes, frente a frente, com o nome e a cor do canto
function VsIntro({ hud }) {
  const ps = hud.players
  return (
    <div className={`pl-vs n-${ps.length}`} aria-label="Fighters">
      <div className="pl-vs-map">{hud.final ? <b>FINAL</b> : null}{hud.map}</div>
      <div className="pl-vs-row">
        {ps.map((p, i) => (
          <Fragment key={p.id}>
            {i > 0 && <span className="pl-vs-vs" aria-hidden="true">VS</span>}
            <div className="pl-vs-fighter" style={{ '--ring': cornerColor(p.corner), '--i': i, '--side': i < ps.length / 2 ? -1 : 1 }}>
              <img className="pl-vs-hero" src={heroById(p.hero).img} alt="" />
              <span className="pl-vs-name">{p.name}</span>
            </div>
          </Fragment>
        ))}
      </div>
      <div className="pl-vs-count" key={hud.phase}>{hud.phase}</div>
    </div>
  )
}

// avisos por cima da sala. overNote: frase embaixo do "X wins!" quando a sala acabou
export function MatchBanners({ hud, overNote = null }) {
  // "FIGHT!" por quase 1 s logo que a contagem acaba
  const [fight, setFight] = useState(false)
  const prev = useRef(null)
  useEffect(() => {
    const st = hud?.status
    if (prev.current === 'countdown' && st === 'playing') {
      setFight(true)
      const t = setTimeout(() => setFight(false), 950)
      prev.current = st
      return () => clearTimeout(t)
    }
    prev.current = st
  }, [hud?.status])
  if (!hud) return null
  return (
    <>
      {hud.status === 'countdown' && <VsIntro hud={hud} />}
      {fight && <div className="pl-banner pl-fight">FIGHT!</div>}
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
