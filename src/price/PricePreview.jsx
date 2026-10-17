import { useEffect, useState } from 'react'
import GameArenaV2 from '../GameArenaV2'
import { LobbyPanel, FinishedPanel } from '../ArenaPanels'
import { GuessPanel, RevealPanel } from './PricePanels'
import ScoreList from '../modes/ScoreList'
import './price.css'

// Prévia do Guess the Price com dados de mentira (sem servidor), só pra ver o visual:
// /price-preview  (?phase=lobby|guess|reveal|finished). Não faz parte do jogo de verdade.
const NAMES = ['Halls', 'Gio', 'Ricardo', 'Samurai', 'Cakky', 'Kirito']
const PLAYERS = NAMES.map((nickname, i) => ({
  id: 'p' + i, user_id: 'u' + i, nickname, alive: true, avatar_idx: i, score: [2310, 1840, 2875, 960, 1430, 0][i],
  place: [2, 3, 1, 5, 4, 6][i], price_guessed_round: i < 4 ? 3 : null,
}))
const ROUND = {
  pro_id: 1, label: 'Bitcoin (BTC)', kind: 'crypto', decimals: 2, quote: 'USD',
  at: '2026-10-10T15:30:00Z', ref_at: '2026-10-09T15:30:00Z', ref_price: 95348.15, demo: true,
}
const REVEAL = {
  round: 3, answer: 97201.55, confidence: 38.65, worst: 'p5',
  guesses: [
    { player_id: 'p2', nickname: 'Ricardo', guess: 97210, err_pct: 0.009, perfect: true, points: 1500 },
    { player_id: 'p0', nickname: 'Halls', guess: 96500, err_pct: 0.722, perfect: false, points: 880 },
    { player_id: 'p1', nickname: 'Gio', guess: 99000, err_pct: 1.85, perfect: false, points: 692 },
    { player_id: 'p4', nickname: 'Cakky', guess: 93000, err_pct: 4.32, perfect: false, points: 280 },
    { player_id: 'p3', nickname: 'Samurai', guess: null, err_pct: null, perfect: false, points: 0 },
    { player_id: 'p5', nickname: 'Kirito', guess: 120000, err_pct: 23.45, perfect: false, points: 0 },
  ],
}

export default function PricePreview() {
  const [phase, setPhase] = useState(() => new URLSearchParams(window.location.search).get('phase') || 'guess')
  const [guessText, setGuessText] = useState('97.5k')
  const [sent, setSent] = useState(null)
  const [, setT] = useState(0)
  useEffect(() => { const id = setInterval(() => setT((n) => n + 1), 500); return () => clearInterval(id) }, [])
  useEffect(() => { document.documentElement.dataset.mode = 'price' }, []) // mesma arte do modo

  const room = {
    id: 'r', code: 'PYTHK7', status: phase === 'finished' ? 'finished' : phase === 'lobby' ? 'lobby' : 'playing',
    mode: 'price', round_number: 3, price_total: 10, price_phase: phase, price_round: ROUND,
    price_reveal: phase === 'reveal' ? REVEAL : null, host_user_id: 'u0', winner_id: 'p2',
  }
  const common = { room, players: PLAYERS, alive: PLAYERS, danger: 1, questionMs: 0, myPlayerId: 'p0', onLeave: () => {} }
  const msLeft = 1000 * (phase === 'reveal' ? 6 : 14)

  let view
  if (phase === 'lobby') {
    view = <GameArenaV2 {...common} phase="lobby" chip="Lobby · Guess the Price"
      panel={<LobbyPanel room={room} players={PLAYERS} me={PLAYERS[0]} iAmHost onStart={() => setPhase('guess')} onLeave={() => {}}
        onPick={() => {}} subtitle="📈 Guess the Price" invitePath="/price" />} />
  } else if (phase === 'finished') {
    view = <GameArenaV2 {...common} phase="finished" centerId="p2" chip="Game over · Guess the Price"
      panel={<><FinishedPanel room={room} players={PLAYERS} myId="p0" winner={PLAYERS[2]} iWon={false} iAmOut={false} iAmHost
        onStart={() => setPhase('guess')} onLeave={() => {}} /><ScoreList players={PLAYERS} me={PLAYERS[0]} /></>} />
  } else {
    view = <GameArenaV2 {...common} phase="price" chip="Round 3/10 · Guess the Price"
      panel={phase === 'reveal'
        ? <RevealPanel room={room} players={PLAYERS} me={PLAYERS[0]} msLeft={msLeft} />
        : <GuessPanel room={room} players={PLAYERS} msLeft={msLeft} guessText={guessText} setGuessText={setGuessText}
            sent={sent} onSubmit={setSent} />} />
  }

  return (
    <>
      {view}
      <div style={{ position: 'fixed', left: 8, bottom: 8, zIndex: 999, display: 'flex', gap: 4 }}>
        {['lobby', 'guess', 'reveal', 'finished'].map((p) => (
          <button key={p} onClick={() => setPhase(p)} style={{ fontWeight: phase === p ? 800 : 400 }}>{p}</button>
        ))}
      </div>
    </>
  )
}
