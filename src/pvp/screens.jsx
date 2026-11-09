// Telas do torneio do Pyth Bomb PVP com DADOS DE VERDADE (do servidor), no cartão do meio da arena.
// O visual é o da prévia aprovada (/pvp-preview, PvpPreview.jsx); aqui cada tela recebe o resumo do torneio.
import { useEffect, useState } from 'react'
import { HEROES, CORNERS, heroById } from './heroes'
import { planRounds, summary } from './bracket'
import { cornersFor } from './engine/maps.js'

export function Sprite({ hero, k = 0.075 }) {
  const h = heroById(hero)
  // tamanho em variáveis: no computador acompanha a arena (cqw); no celular em pé o pvp.css troca por pixels
  return <img className="pv-sprite pv-sized" src={h.img} alt="" style={{ '--w': h.w, '--h': h.h, '--k': k }} />
}

const Logo = () => <img className="ga-logo" src="/logo.webp" alt="Pyth Bomb" width="2000" height="667" />

function HeroPicker({ hero, onPick }) {
  return (
    <div className="pv-picker" role="radiogroup" aria-label="Choose your fighter">
      {HEROES.map((h) => (
        <button key={h.id} type="button" role="radio" aria-checked={hero === h.id} aria-label={h.label}
          className={`pv-hero${hero === h.id ? ' is-on' : ''}`} onClick={() => onPick(h.id)}>
          <Sprite hero={h.id} k={0.085} />
        </button>
      ))}
    </div>
  )
}

// plano do torneio: no lobby, o plano pelo número de lutadores; depois do Start, as salas de verdade
export function Bracket({ n, rounds = null, fill = false }) {
  if (rounds?.length) {
    const nowIdx = rounds.findIndex((r) => r.rooms.length < r.sizes.length || r.rooms.some((x) => x.st !== 'done'))
    return (
      <ol className="pv-bracket" aria-label="Tournament">
        {rounds.map((r, i) => (
          <li key={i} className={`pv-round${r.final ? ' is-final' : ''}${i === nowIdx ? ' is-now' : ''}${nowIdx === -1 || nowIdx > i ? ' is-done' : ''}`}>
            <div className="pv-rooms">
              {r.sizes.length > 6
                ? <span className="pv-room is-many">{r.sizes.length} rooms</span>
                : r.sizes.map((size, j) => {
                  const room = r.rooms.find((x) => x.index === j)
                  const st = room ? room.st : 'wait'
                  const shown = room ? room.ids.length : fill && !r.final ? 4 : size
                  return <span key={j} className={`pv-room is-${st}`} title={room ? `${st === 'done' ? 'finished' : st === 'playing' ? 'playing now' : 'starting'}` : 'waiting for winners'}>{r.final ? `🏆${shown}` : shown}</span>
                })}
            </div>
            <span className="pv-round-name">{r.final ? 'Final' : `Round ${i + 1}`}</span>
          </li>
        ))}
      </ol>
    )
  }
  const plan = planRounds(n)
  if (!plan.length) return null
  return (
    <ol className="pv-bracket" aria-label="Tournament plan">
      {plan.map((r, i) => (
        <li key={i} className={`pv-round${r.final ? ' is-final' : ''}`}>
          <div className="pv-rooms">
            {r.rooms.length > 6
              ? <span className="pv-room is-many">{r.rooms.length} rooms</span>
              : r.rooms.map((s, j) => <span key={j} className={`pv-room${fill && !r.final && s < 4 ? ' has-bots' : ''}`}>{r.final ? `🏆${s}` : fill ? 4 : s}</span>)}
          </div>
          <span className="pv-round-name">{r.final ? 'Final' : `Round ${i + 1}`}</span>
        </li>
      ))}
    </ol>
  )
}

// ---- entrar: apelido, herói, criar torneio ou entrar com código
export function EntryPanel({ name, setName, hero, setHero, code, setCode, onCreate, onJoin, busy, error, status }) {
  return (
    <>
      <Logo />
      <p className="ga-mode-name">⚔️ PVP</p>
      <p className="ga-hint">Up to 20 fighters. 4 per room, winners move on until the final.</p>
      <p className="pv-label">Your nickname</p>
      <input className="pv-input" value={name} maxLength={16} placeholder="Nickname" onChange={(e) => setName(e.target.value)} />
      <p className="pv-label">Your fighter</p>
      <HeroPicker hero={hero} onPick={setHero} />
      <button type="button" className="ga-send ga-bigbtn" disabled={busy || name.trim().length < 2} onClick={onCreate}>Create tournament</button>
      <p className="pv-label">Or join with a code</p>
      <div className="pv-join-row">
        <input className="pv-input pv-code-input" value={code} maxLength={6} placeholder="CODE" onChange={(e) => setCode(e.target.value.toUpperCase())} />
        <button type="button" className="ga-copy" disabled={busy || name.trim().length < 2 || code.trim().length < 6} onClick={onJoin}>Join</button>
      </div>
      {status !== 'open' && <p className="ga-wait">Connecting to the game server<span className="ga-dots" aria-hidden="true" /></p>}
      {error && <p className="ga-error" role="alert">{error}</p>}
    </>
  )
}

// ---- lobby (quem já entrou, herói, plano, Start do host)
export function LobbyPanel({ tour, meId, onHero, onStart, onBot, onFill, testBots, onLeave, error }) {
  const [copied, setCopied] = useState(false)
  const fighters = tour.players.filter((p) => p.st === 'lobby')
  const n = fighters.length
  const me = tour.players.find((p) => p.id === meId)
  const isHost = tour.host === meId
  const link = `${window.location.origin}/pvp?code=${tour.code}`
  const copy = () => {
    navigator.clipboard?.writeText(link).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1400)
  }
  return (
    <>
      <Logo />
      <p className="ga-mode-name">⚔️ PVP</p>
      <p className="ga-qnum">Tournament code</p>
      <div className="ga-code-row">
        <div className="ga-code">{tour.code}</div>
        <button type="button" className={`ga-copy${copied ? ' is-copied' : ''}`} onClick={copy}>{copied ? '✓ Copied' : 'Copy link'}</button>
      </div>

      <p className="pv-label">Fighters · {n}/{tour.max}</p>
      <ul className="pv-roster">
        {fighters.map((p) => (
          <li key={p.id} className={`pv-chip${p.id === meId ? ' is-me' : ''}${p.on ? '' : ' is-off'}`} title={p.on ? '' : 'Reconnecting…'}>
            <span className="pv-chip-art"><Sprite hero={p.hero} /></span>
            <span className="pv-chip-name">{p.name}</span>
            {p.id === tour.host && <span className="pv-host" title="Host" aria-label="Host">👑</span>}
          </li>
        ))}
      </ul>

      <p className="pv-label">Your fighter</p>
      <HeroPicker hero={me?.hero ?? 'pirb'} onPick={onHero} />

      <p className="pv-label">Tournament</p>
      <Bracket n={n} fill={tour.fill} />
      <p className="pv-summary">{n >= 2 ? summary(n) : 'Waiting for at least 2 fighters…'}</p>
      {isHost ? (
        <label className="pv-fill">
          <input type="checkbox" checked={!!tour.fill} onChange={(e) => onFill(e.target.checked)} />
          <span>Fill rooms with bots <small>(4 per room · never in the final)</small></span>
        </label>
      ) : tour.fill && <p className="pv-fill-note">🤖 Rooms are filled with bots (never in the final)</p>}

      {isHost
        ? <button type="button" className="ga-send ga-bigbtn" disabled={n < 2} onClick={onStart}>Start tournament</button>
        : <p className="ga-wait">Waiting for the host to start<span className="ga-dots" aria-hidden="true" /></p>}
      {isHost && testBots && n < tour.max && <button type="button" className="ga-copy pv-testbot" onClick={onBot}>+ Add test bot</button>}
      {error && <p className="ga-error" role="alert">{error}</p>}
      <button type="button" className="ga-leave" onClick={onLeave}>Leave tournament</button>
    </>
  )
}

function Slot({ corner, player }) {
  return (
    <div className={`pv-slot${player ? '' : ' is-empty'}`} style={{ '--ring': corner.color }} aria-label={`${corner.label}: ${player?.name ?? 'empty'}`}>
      {player ? (
        <>
          <span className="pv-feet"><Sprite hero={player.hero} k={0.07} /></span>
          <span className="pv-tag">{player.name}</span>
        </>
      ) : <span className="pv-empty">empty</span>}
    </div>
  )
}

function RoomCard({ room, players, mine, title }) {
  const used = cornersFor(room.ids.length)
  const byId = (id) => players.find((p) => p.id === id)
  return (
    <section className={`pv-room-card${mine ? ' is-mine' : ''}`}>
      <header className="pv-room-head">
        <span>{title} · {room.mapName}</span>
        {mine && <b className="pv-yours">Your room</b>}
      </header>
      <div className="pv-corners">
        {CORNERS.map((c) => {
          const i = used.indexOf(c.id)
          return <Slot key={c.id} corner={c} player={i >= 0 ? byId(room.ids[i]) : null} />
        })}
      </div>
    </section>
  )
}

const roomTitle = (round, room) => (round.final ? 'Final' : `Room ${room.index + 1}`)

const short = (h) => (h ? `${h.slice(0, 8)}…${h.slice(-6)}` : '')

// linha da prova do sorteio: Pyth Entropy (com link pra transação) ou o plano B do servidor
export function ProofLine({ proof }) {
  if (!proof || proof.via === 'pending') return null
  if (proof.via !== 'entropy') return <p className="pv-proof">Drawn by the game server (Pyth Entropy was not available this time)</p>
  return (
    <p className="pv-proof">
      🎲 Drawn with <b>Pyth Entropy</b> on {proof.chainName}
      {proof.tx && <> · <a href={`${proof.explorer}/tx/${proof.tx}`} target="_blank" rel="noreferrer">proof ↗</a></>}
    </p>
  )
}

// esperando o número do Pyth Entropy (logo depois do Start)
export function DrawingPanel({ tour }) {
  return (
    <>
      <Logo />
      <p className="ga-mode-name">⚔️ Round 1</p>
      <div className="pv-drawing" role="status">
        <span className="pv-dice" aria-hidden="true">🎲</span>
        <p className="ga-wait">Drawing the rooms with Pyth Entropy<span className="ga-dots" aria-hidden="true" /></p>
      </div>
      {tour.proof?.commit && <p className="pv-proof">Server secret locked first · fingerprint <code>{short(tour.proof.commit)}</code></p>}
    </>
  )
}

// ---- sorteio: na 1ª rodada, todas as salas; depois, só a sua sala que acabou de se formar
export function DrawPanel({ tour, meId, room }) {
  const ri = room.round ?? tour.rounds.findIndex((r) => r.rooms.some((x) => x.id === room.id))
  const round = tour.rounds[ri]
  const rooms = ri === 0 ? round.rooms : [room]
  // 1ª rodada: o suspense já foi na espera do Entropy; salas seguintes ganham um "sorteando" curtinho
  const [drawn, setDrawn] = useState(ri === 0)
  useEffect(() => { if (ri === 0) return; const t = setTimeout(() => setDrawn(true), 1200); return () => clearTimeout(t) }, [room.id, ri])
  return (
    <>
      <Logo />
      <p className="ga-mode-name">{round.final ? '🏆 Final' : `⚔️ Round ${ri + 1}`}</p>
      {!drawn ? (
        <div className="pv-drawing" role="status">
          <span className="pv-dice" aria-hidden="true">🎲</span>
          <p className="ga-wait">Drawing the rooms<span className="ga-dots" aria-hidden="true" /></p>
        </div>
      ) : (
        <>
          {ri === 0 && <p className="pv-label">{round.sizes.length} room{round.sizes.length > 1 ? 's' : ''} · {round.sizes.reduce((a, b) => a + b, 0)} fighters</p>}
          <div className={`pv-cards${rooms.length === 1 ? ' is-single' : ''}`}>
            {rooms.map((r) => <RoomCard key={r.id} room={r} players={tour.players} mine={r.ids.includes(meId)} title={roomTitle(round, r)} />)}
          </div>
          <ProofLine proof={tour.proof} />
          <p className="ga-wait">Starting in {room.startIn ?? 0}<span className="ga-dots" aria-hidden="true" /></p>
        </>
      )}
    </>
  )
}

// salas jogando agora (pra escolher uma e assistir)
function WatchList({ tour, onWatch }) {
  const live = []
  tour.rounds.forEach((r, ri) => r.rooms.forEach((room) => { if (room.st === 'playing') live.push({ room, r, ri }) }))
  if (!live.length) return <p className="ga-hint">No room is playing right now.</p>
  return (
    <ul className="pv-watch">
      {live.map(({ room, r, ri }) => (
        <li key={room.id} className="pv-watch-row">
          <span>{r.final ? 'Final' : `R${ri + 1} · Room ${room.index + 1}`} · {room.mapName}</span>
          <span className="pv-alive">{room.alive} alive</span>
          <button type="button" className="ga-copy" onClick={() => onWatch(room.id)}>Watch</button>
        </li>
      ))}
    </ul>
  )
}

// ---- esperando a próxima sala (ganhou), fora do torneio (perdeu) ou só assistindo (entrou depois do Start)
export function WaitPanel({ tour, meId, onWatch, onLeave }) {
  const me = tour.players.find((p) => p.id === meId)
  let title, hint
  if (me?.st === 'waiting') {
    const next = tour.rounds.find((r) => r.waiting.includes(meId))
    const ri = tour.rounds.indexOf(next)
    const size = next ? next.sizes[next.rooms.length] : 0
    const missing = next ? Math.max(0, size - next.waiting.length) : 0
    title = '🏅 You won your room!'
    hint = `${next?.final ? 'The final' : `Round ${ri + 1}`} starts when ${missing} more winner${missing === 1 ? '' : 's'} ${missing === 1 ? 'is' : 'are'} ready.`
  } else if (me?.st === 'spectator') {
    title = '👀 Watching'
    hint = 'This tournament already started. You can watch any room.'
  } else {
    const r = tour.rounds[me?.rd ?? 0]
    title = '👀 You are out'
    hint = `You made it to ${r?.final ? 'the final' : `round ${(me?.rd ?? 0) + 1}`}. Pick a room to watch.`
  }
  return (
    <>
      <Logo />
      <p className="ga-mode-name">{title}</p>
      <p className="ga-hint">{hint}</p>
      <p className="pv-label">Rooms playing now</p>
      <WatchList tour={tour} onWatch={onWatch} />
      <p className="pv-label">Tournament</p>
      <Bracket rounds={tour.rounds} fill={tour.fill} />
      <button type="button" className="ga-leave" onClick={onLeave}>Leave tournament</button>
    </>
  )
}

// ---- campeão
export function ChampionPanel({ tour, meId, onNew, onLeave }) {
  const champ = tour.players.find((p) => p.id === tour.champion)
  const wins = tour.rounds.length
  const mine = tour.champion === meId
  return (
    <>
      <Logo />
      <p className="ga-mode-name">🏆 Champion</p>
      <div className="pv-champ">
        <span className="pv-crown" aria-hidden="true">👑</span>
        <span className="pv-feet pv-feet-gold"><Sprite hero={champ?.hero ?? 'pirb'} k={0.16} /></span>
        <span className="pv-champ-name">{champ?.name ?? '?'}</span>
      </div>
      {mine && <p className="ga-me is-win">🎉 You won the tournament!</p>}
      <p className="ga-hint">{wins > 1 ? `Won ${wins} rooms in a row` : 'Won the only room'} · last one standing in Shark Tank</p>
      <VerifyBox proof={tour.proof} />
      <button type="button" className="ga-send ga-bigbtn" onClick={onNew}>New tournament</button>
      <button type="button" className="ga-leave" onClick={onLeave}>Leave</button>
    </>
  )
}

// "Verify": tudo pra qualquer um conferir o sorteio depois do torneio
function VerifyBox({ proof }) {
  if (!proof || proof.via === 'pending') return null
  return (
    <details className="pv-verify">
      <summary>{proof.via === 'entropy' ? '🔍 Verify the draw (Pyth Entropy)' : '🔍 About this draw'}</summary>
      {proof.via === 'entropy' ? (
        <>
          <p>1. Before the draw, the server locked the <b>fingerprint</b> of a secret on {proof.chainName}:</p>
          <code>{proof.commit}</code>
          <p>2. <b>Pyth Entropy</b> returned this random number{proof.tx && <> (<a href={`${proof.explorer}/tx/${proof.tx}`} target="_blank" rel="noreferrer">transaction ↗</a>)</>}:</p>
          <code>{proof.random}</code>
          <p>3. Now the server reveals its <b>secret</b>:</p>
          <code>{proof.secret ?? 'revealed when the tournament ends'}</code>
          <p className="pv-verify-how">Check: sha256(secret) must equal the fingerprint. The tournament seed is sha256(secret + Entropy number), and it decided the rooms, corners, maps, what each chest hides, the final's items and any tie. Nobody could predict it (the secret was hidden) and the server could not pick it (the fingerprint was locked before the number existed).</p>
          {proof.contract && <p className="pv-verify-how">Contract: <a href={`${proof.explorer}/address/${proof.contract}`} target="_blank" rel="noreferrer">{short(proof.contract)} ↗</a> · request #{proof.sequence}</p>}
        </>
      ) : (
        <p>Pyth Entropy did not answer in time, so the game server drew this tournament by itself (no public proof this time).</p>
      )}
    </details>
  )
}
