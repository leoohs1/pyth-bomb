import { useEffect, useState } from 'react'
import GameArenaV2 from '../GameArenaV2'
import Confetti from '../Confetti.jsx'
import { HEROES, CORNERS, heroById } from './heroes'
import { planRounds, mapFor, summary } from './bracket'
import './pvp.css'

// Prévia do Pyth Bomb PVP com dados de mentira (sem servidor), só pra ver o visual das telas:
// /pvp-preview  (?phase=lobby|draw|out|champion  &n=2..32 = quantos lutadores  &round=0.. = rodada mostrada).
// Não faz parte do jogo: o torneio de verdade (salas, partidas, Entropy) ainda não existe.
const NAMES = ['Halls', 'Gio', 'Ricardo', 'Samurai', 'Cakky', 'Kirito', 'Luna', 'Pedro', 'Nina', 'Theo', 'Bia', 'Rafa',
  'Duda', 'Leo', 'Mia', 'Caio', 'Iris', 'Davi', 'Zoe', 'Ana', 'Joao', 'Vini', 'Lara', 'Otto', 'Bruna', 'Enzo', 'Sol',
  'Nico', 'Lia', 'Hugo', 'Tati', 'Dani']
// heróis de mentira: repete de propósito pra mostrar dois jogadores com o mesmo personagem
const HERO_SEQ = ['derrpu', 'plancky', 'pirb', 'plancky', 'boryso', 'derrpu', 'pirb', 'boryso']
const MAX_PLAYERS = 20 // limite do torneio: a Halls sugeriu 20 (5 salas na 1ª rodada); ainda não confirmado
const COUNTS = [2, 5, 7, 12, 16, 20]
// fundos pra comparar (?bg=painted|temple|hold|tavern|flood|military): "painted" é o anfiteatro pintado do Classic,
// que é o do PVP por enquanto (sem trocar nada); "temple" é o templo escuro; os outros são os do Solo em pixel
const BGS = {
  painted: null,
  temple: { src: '/pvp/lobby-bg.webp', pixel: false },
  hold: { src: '/solo/pixel/bg-hold.png', pixel: true },
  tavern: { src: '/solo/pixel/bg-tavern.png', pixel: true },
  flood: { src: '/solo/pixel/bg-flood.png', pixel: true },
  military: { src: '/solo/pixel/bg-military.png', pixel: true },
}

function makePlayers(n, myHero) {
  return Array.from({ length: n }, (_, i) => ({
    id: 'p' + i, user_id: 'u' + i, nickname: NAMES[i], alive: true, hero: i === 0 ? myHero : HERO_SEQ[i % HERO_SEQ.length],
  }))
}

// "sorteio" de mentira: sempre a mesma ordem (no jogo vem do Entropy)
function drawOrder(players) {
  return players.map((p, i) => ({ p, k: (i * 37 + 11) % 101 })).sort((a, b) => a.k - b.k).map((x) => x.p)
}

function assignRooms(players, sizes) {
  const order = drawOrder(players)
  const rooms = []
  let at = 0
  for (const size of sizes) {
    rooms.push(order.slice(at, at + size))
    at += size
  }
  return rooms
}

// o herói em pixel, sempre na mesma escala (k = tamanho de cada pixel de arte)
function Sprite({ hero, k = 0.075 }) {
  const h = heroById(hero)
  return <img className="pv-sprite" src={h.img} alt="" style={{ width: `${h.w * k}cqw`, height: `${h.h * k}cqw` }} />
}

function Bracket({ n, highlight = -1 }) {
  const rounds = planRounds(n)
  if (!rounds.length) return null
  return (
    <ol className="pv-bracket" aria-label="Tournament plan">
      {rounds.map((r, i) => (
        <li key={i} className={`pv-round${r.final ? ' is-final' : ''}${i === highlight ? ' is-now' : ''}${highlight > i ? ' is-done' : ''}`}>
          <div className="pv-rooms">
            {r.rooms.length > 6
              ? <span className="pv-room is-many">{r.rooms.length} rooms</span> // muitas salas: uma caixa só, pra não crescer o cartão
              : r.rooms.map((s, j) => <span key={j} className="pv-room" title={`${s} fighters`}>{r.final ? `🏆${s}` : s}</span>)}
          </div>
          <span className="pv-round-name">{r.final ? 'Final' : `Round ${i + 1}`}</span>
        </li>
      ))}
    </ol>
  )
}

function LobbyContent({ players, myHero, setMyHero, onStart }) {
  const [copied, setCopied] = useState(false)
  const n = players.length
  return (
    <>
      <img className="ga-logo" src="/logo.webp" alt="Pyth Bomb" width="2000" height="667" />
      <p className="ga-mode-name">⚔️ PVP</p>
      <p className="ga-qnum">Room code</p>
      <div className="ga-code-row">
        <div className="ga-code">PYTHPV</div>
        <button type="button" className={`ga-copy${copied ? ' is-copied' : ''}`}
          onClick={() => { setCopied(true); setTimeout(() => setCopied(false), 1400) }}>{copied ? '✓ Copied' : 'Copy link'}</button>
      </div>

      <p className="pv-label">Fighters · {n}</p>
      <ul className="pv-roster">
        {players.map((p, i) => (
          <li key={p.id} className={`pv-chip${i === 0 ? ' is-me' : ''}`}>
            <span className="pv-chip-art"><Sprite hero={p.hero} /></span>
            <span className="pv-chip-name">{p.nickname}</span>
            {i === 0 && <span className="pv-host" title="Host" aria-label="Host">👑</span>}
          </li>
        ))}
      </ul>

      <p className="pv-label">Your fighter</p>
      <div className="pv-picker" role="radiogroup" aria-label="Choose your fighter">
        {HEROES.map((h) => (
          <button key={h.id} type="button" role="radio" aria-checked={myHero === h.id} aria-label={h.label}
            className={`pv-hero${myHero === h.id ? ' is-on' : ''}`} onClick={() => setMyHero(h.id)}>
            <Sprite hero={h.id} k={0.085} />
          </button>
        ))}
      </div>

      <p className="pv-label">Tournament</p>
      <Bracket n={n} />
      <p className="pv-summary">{n >= 2 ? summary(n) : 'Waiting for at least 2 fighters…'}</p>

      <button type="button" className="ga-send ga-bigbtn" disabled={n < 2} onClick={onStart}>Start tournament</button>
      <button type="button" className="ga-leave">Leave room</button>
    </>
  )
}

// um canto da sala: o herói em cima de um anel da cor do canto, com o nome embaixo
function Slot({ corner, player }) {
  return (
    <div className={`pv-slot${player ? '' : ' is-empty'}`} style={{ '--ring': corner.color }} aria-label={`${corner.label}: ${player?.nickname ?? 'empty'}`}>
      {player ? (
        <>
          <span className="pv-feet"><Sprite hero={player.hero} k={0.07} /></span>
          <span className="pv-tag">{player.nickname}</span>
        </>
      ) : <span className="pv-empty">empty</span>}
    </div>
  )
}

// em quais cantos cada tamanho de sala começa: em dupla, cantos opostos. No jogo quem sorteia cantos e donos é o Entropy.
const CORNER_SLOTS = { 1: [0], 2: [0, 3], 3: [0, 1, 2], 4: [0, 1, 2, 3] }

function RoomCard({ index, size, players, round, final, mine }) {
  const slots = CORNER_SLOTS[size] ?? CORNER_SLOTS[4]
  return (
    <section className={`pv-room-card${mine ? ' is-mine' : ''}`}>
      <header className="pv-room-head">
        <span>Room {index + 1} · {mapFor(round, index, final)}</span>
        {mine && <b className="pv-yours">Your room</b>}
      </header>
      <div className="pv-corners">
        {CORNERS.map((c, i) => <Slot key={c.id} corner={c} player={slots.includes(i) ? players[slots.indexOf(i)] : null} />)}
      </div>
    </section>
  )
}

function DrawContent({ players, round }) {
  const rounds = planRounds(players.length)
  const r = rounds[Math.min(round, rounds.length - 1)] ?? { rooms: [players.length], final: true }
  const idx = Math.min(round, rounds.length - 1)
  const total = r.rooms.reduce((a, b) => a + b, 0)
  const rooms = assignRooms(players.slice(0, total), r.rooms)
  const [drawn, setDrawn] = useState(false)
  useEffect(() => {
    setDrawn(false)
    const t = setTimeout(() => setDrawn(true), 1800)
    return () => clearTimeout(t)
  }, [round, players.length])
  return (
    <>
      <img className="ga-logo" src="/logo.webp" alt="Pyth Bomb" width="2000" height="667" />
      <p className="ga-mode-name">{r.final ? '🏆 Final' : `⚔️ Round ${idx + 1}`}</p>
      {!drawn ? (
        <div className="pv-drawing" role="status">
          <span className="pv-dice" aria-hidden="true">🎲</span>
          <p className="ga-wait">Drawing the rooms with Pyth Entropy<span className="ga-dots" aria-hidden="true" /></p>
        </div>
      ) : (
        <>
          <p className="pv-label">{r.rooms.length} room{r.rooms.length > 1 ? 's' : ''} · {total} fighters</p>
          <div className={`pv-cards${r.rooms.length === 1 ? ' is-single' : ''}`}>
            {rooms.map((ps, i) => (
              <RoomCard key={i} index={i} size={r.rooms[i]} players={ps} round={idx} final={r.final}
                mine={ps.some((p) => p.id === 'p0')} />
            ))}
          </div>
          <p className="pv-proof">Fair draw by Pyth Entropy · sample data, not a real proof</p>
          <p className="ga-wait">Starting in 5<span className="ga-dots" aria-hidden="true" /></p>
        </>
      )}
    </>
  )
}

function OutContent({ players, round }) {
  const rounds = planRounds(players.length)
  const idx = Math.min(round, rounds.length - 1)
  const r = rounds[idx] ?? { rooms: [players.length], final: true }
  return (
    <>
      <img className="ga-logo" src="/logo.webp" alt="Pyth Bomb" width="2000" height="667" />
      <p className="ga-mode-name">👀 You are out</p>
      <p className="ga-hint">You made it to {r.final ? 'the final' : `round ${idx + 1}`}. Pick a room to watch.</p>
      <p className="pv-label">Rooms playing now</p>
      <ul className="pv-watch">
        {r.rooms.map((s, i) => (
          <li key={i} className="pv-watch-row">
            <span>Room {i + 1} · {mapFor(idx, i, r.final)}</span>
            <span className="pv-alive">{Math.max(1, s - (i % 2))} alive</span>
            <button type="button" className="ga-copy">Watch</button>
          </li>
        ))}
      </ul>
      <p className="pv-label">Tournament</p>
      <Bracket n={players.length} highlight={idx} />
      <button type="button" className="ga-leave">Leave room</button>
    </>
  )
}

function ChampionContent({ players }) {
  const champ = players[0]
  const last = planRounds(players.length).length || 1
  return (
    <>
      <img className="ga-logo" src="/logo.webp" alt="Pyth Bomb" width="2000" height="667" />
      <p className="ga-mode-name">🏆 Champion</p>
      <div className="pv-champ">
        <span className="pv-crown" aria-hidden="true">👑</span>
        <span className="pv-feet pv-feet-gold"><Sprite hero={champ.hero} k={0.16} /></span>
        <span className="pv-champ-name">{champ.nickname}</span>
      </div>
      <p className="ga-me is-win">🎉 You won the tournament!</p>
      <p className="ga-hint">{last > 1 ? `Won ${last} rooms in a row` : 'Won the only room'} · last one standing in {mapFor(0, 0, true)}</p>
      <button type="button" className="ga-send ga-bigbtn">New tournament</button>
      <button type="button" className="ga-leave">Leave room</button>
    </>
  )
}

export default function PvpPreview() {
  const qs = new URLSearchParams(window.location.search)
  const [phase, setPhase] = useState(() => qs.get('phase') || 'lobby')
  const [count, setCount] = useState(() => Math.min(MAX_PLAYERS, Math.max(2, Number(qs.get('n')) || 7)))
  const [round, setRound] = useState(() => Number(qs.get('round')) || 0)
  const [myHero, setMyHero] = useState('derrpu')
  const [bg, setBg] = useState(() => (qs.get('bg') in BGS ? qs.get('bg') : 'painted'))
  // troca só a imagem de fundo da arena (teste de fundos); sem mexer no componente da arena
  useEffect(() => {
    const el = document.querySelector('.ga-bg')
    if (!el) return
    const b = BGS[bg]
    el.style.background = b ? `url(${b.src}) center / ${b.pixel ? 'cover' : '100% 100%'} no-repeat` : ''
    el.style.imageRendering = b?.pixel ? 'pixelated' : ''
  })
  const players = makePlayers(count, myHero)
  const rounds = planRounds(count)

  const room = { id: 'r', code: 'PYTHPV', status: phase === 'lobby' ? 'lobby' : 'playing', mode: 'pvp', round_number: 1, host_user_id: 'u0' }
  const common = { room, players, alive: players, danger: 1, questionMs: 0, myPlayerId: null, hideCrowd: true, maxPlayers: MAX_PLAYERS, onLeave: () => {} }

  let view
  if (phase === 'draw') {
    view = <GameArenaV2 {...common} phase="pvp" chip={`Round ${Math.min(round, rounds.length - 1) + 1} · Pyth Bomb PVP`}
      panel={<DrawContent players={players} round={round} />} />
  } else if (phase === 'out') {
    view = <GameArenaV2 {...common} phase="pvp" chip="Spectating · Pyth Bomb PVP"
      panel={<OutContent players={players} round={round} />} />
  } else if (phase === 'champion') {
    view = <><GameArenaV2 {...common} phase="pvp" chip="Champion · Pyth Bomb PVP" panel={<ChampionContent players={players} />} /><Confetti /></>
  } else {
    view = <GameArenaV2 {...common} phase="pvp" chip="Lobby · Pyth Bomb PVP"
      panel={<LobbyContent players={players} myHero={myHero} setMyHero={setMyHero} onStart={() => { setRound(0); setPhase('draw') }} />} />
  }

  return (
    <>
      {view}
      <div style={{ position: 'fixed', left: 8, bottom: 8, zIndex: 999, display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
        {['lobby', 'draw', 'out', 'champion'].map((ph) => (
          <button key={ph} onClick={() => setPhase(ph)} style={{ fontWeight: phase === ph ? 800 : 400 }}>{ph}</button>
        ))}
        <span style={{ width: 10 }} />
        {COUNTS.map((n) => (
          <button key={n} onClick={() => { setCount(n); setRound(0) }} style={{ fontWeight: count === n ? 800 : 400 }}>👥 {n}</button>
        ))}
        <span style={{ width: 10 }} />
        {Object.keys(BGS).map((k) => (
          <button key={k} onClick={() => setBg(k)} style={{ fontWeight: bg === k ? 800 : 400 }}>{k}</button>
        ))}
        {(phase === 'draw' || phase === 'out') && (
          <>
            <span style={{ width: 10 }} />
            {rounds.map((r, i) => (
              <button key={i} onClick={() => setRound(i)} style={{ fontWeight: round === i ? 800 : 400 }}>{r.final ? 'Final' : `R${i + 1}`}</button>
            ))}
          </>
        )}
      </div>
    </>
  )
}
