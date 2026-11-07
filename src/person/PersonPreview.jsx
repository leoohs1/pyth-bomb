import { useEffect, useState } from 'react'
import GameArenaV2 from '../GameArenaV2'
import { LobbyPanel, FinishedPanel } from '../ArenaPanels'
import ScoreList from '../modes/ScoreList'
import { ReadyPanel, GuessPanel, RevealPanel } from './PersonPanels'
import PersonHowTo from './PersonHowTo'
import { blocksFor } from './PersonPhoto'
import './person.css'

// Prévia do Guess the Person com dados de mentira (sem servidor), só pra ver o visual:
// /person-preview  (?phase=lobby|ready|guess|reveal|finished  &p=0..1 = o quanto a foto já clareou).
// A "pessoa" aqui é um desenho do repositório (nenhuma foto de gente de verdade). Não faz parte do jogo.
const NAMES = ['Halls', 'Gio', 'Ricardo', 'Samurai', 'Cakky', 'Kirito', 'Luna', 'Pedro', 'Nina', 'Theo', 'Bia', 'Rafa',
  'Duda', 'Leo', 'Mia', 'Caio', 'Iris', 'Davi', 'Zoe']
const PLAYERS = NAMES.map((nickname, i) => ({
  id: 'p' + i, user_id: 'u' + i, nickname, alive: true, avatar_idx: i, score: [3480, 2950, 4120, 1500, 2210, 640][i] ?? 0,
  place: [2, 3, 1, 5, 4, 6][i] ?? i + 1, person_got_round: [null, null, 3, null, null, null][i] ?? null,
}))
const REVEAL = {
  round: 3, name: 'The Oracle', category: 'preview',
  players: [
    { player_id: 'p2', nickname: 'Ricardo', got: true, secs: 3.1, points: 1180, first: true },
    { player_id: 'p0', nickname: 'Halls', got: true, secs: 7.8, points: 790, first: false },
    { player_id: 'p1', nickname: 'Gio', got: false, secs: null, points: 0, first: false },
    { player_id: 'p3', nickname: 'Samurai', got: false, secs: null, points: 0, first: false },
  ],
}
const PHOTO = '/oracle.webp'

export default function PersonPreview() {
  const qs = new URLSearchParams(window.location.search)
  const [phase, setPhase] = useState(() => qs.get('phase') || 'guess')
  const [p, setP] = useState(() => (qs.get('p') != null ? Number(qs.get('p')) : 0.3))
  const [text, setText] = useState('')
  const [count, setCount] = useState(() => Number(qs.get('n')) || 6)
  useEffect(() => { document.documentElement.dataset.mode = 'person' }, [])

  const players = PLAYERS.slice(0, count)
  const room = {
    id: 'r', code: 'PYTHM4', status: phase === 'finished' ? 'finished' : phase === 'lobby' ? 'lobby' : 'playing',
    mode: 'person', round_number: 3, person_total: 10, person_phase: phase, host_user_id: 'u0', winner_id: 'p2',
    person_round: { file: 'x.jpg', guess_at: new Date().toISOString(), guess_secs: 20 },
    person_reveal: phase === 'reveal' ? REVEAL : null,
  }
  const common = { room, players, alive: players, danger: 1, questionMs: 0, myPlayerId: 'p0', onLeave: () => {} }
  const chip = 'Round 3/10 · Guess the Person'

  let view
  if (phase === 'lobby') {
    view = <><GameArenaV2 {...common} phase="lobby" chip="Lobby · Guess the Person"
      panel={<LobbyPanel room={room} players={players} me={players[0]} iAmHost onStart={() => setPhase('ready')} onLeave={() => {}}
        onPick={() => {}} subtitle="📸 Guess the Person" invitePath="/person" />} />
      <PersonHowTo /></>
  } else if (phase === 'finished') {
    view = <GameArenaV2 {...common} phase="finished" centerId="p2" chip="Game over · Guess the Person"
      panel={<><FinishedPanel room={room} players={players} myId="p0" winner={players[2] ?? players[0]} iWon={false} iAmOut={false} iAmHost
        onStart={() => setPhase('ready')} onLeave={() => {}} /><ScoreList players={players} me={players[0]} /></>} />
  } else if (phase === 'ready') {
    view = <GameArenaV2 {...common} phase="person" chip={chip} panel={<ReadyPanel room={room} msToStart={3200} />} />
  } else if (phase === 'reveal') {
    view = <GameArenaV2 {...common} phase="person" chip={chip} panel={<RevealPanel room={room} players={players} me={players[0]} msLeft={6000} photoUrl={PHOTO} />} />
  } else {
    view = <GameArenaV2 {...common} phase="person" chip={chip}
      panel={<GuessPanel room={room} players={players} me={players[0]} msLeft={Math.round((1 - p) * 20000)} total={20} photoUrl={PHOTO} progress={p}
        text={text} setText={setText} onSubmit={() => {}} feedback={{ kind: 'close', text: 'So close! Check the spelling or the full name' }} />} />
  }

  return (
    <>
      {view}
      <div style={{ position: 'fixed', left: 8, bottom: 8, zIndex: 999, display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
        {['lobby', 'ready', 'guess', 'reveal', 'finished'].map((ph) => (
          <button key={ph} onClick={() => setPhase(ph)} style={{ fontWeight: phase === ph ? 800 : 400 }}>{ph}</button>
        ))}
        <span style={{ width: 10 }} />
        <label style={{ color: '#fff', font: '12px sans-serif' }}>
          clareza {Math.round(p * 100)}% ({blocksFor(p) || 'nítida'})
          <input type="range" min="0" max="1" step="0.01" value={p} onChange={(e) => setP(Number(e.target.value))} style={{ marginLeft: 6 }} />
        </label>
        <span style={{ width: 10 }} />
        {[2, 6, 12, 19].map((n) => (
          <button key={n} onClick={() => setCount(n)} style={{ fontWeight: count === n ? 800 : 400 }}>👥 {n === 19 ? '19 (lotado)' : n}</button>
        ))}
      </div>
    </>
  )
}
