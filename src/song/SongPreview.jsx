import { useEffect, useState } from 'react'
import GameArenaV2 from '../GameArenaV2'
import { LobbyPanel, FinishedPanel } from '../ArenaPanels'
import ScoreList from '../modes/ScoreList'
import { ReadyPanel, ListenPanel, RevealPanel } from './SongPanels'
import './song.css'

// Prévia do Guess the Song com dados de mentira (sem servidor e sem música), só pra ver o visual:
// /song-preview  (?phase=lobby|ready|listen|reveal|finished). Não faz parte do jogo de verdade.
const NAMES = ['Halls', 'Gio', 'Ricardo', 'Samurai', 'Cakky', 'Kirito']
const PLAYERS = NAMES.map((nickname, i) => ({
  id: 'p' + i, user_id: 'u' + i, nickname, alive: true, avatar_idx: i, score: [3480, 2950, 4120, 1500, 2210, 640][i],
  place: [2, 3, 1, 5, 4, 6][i], song_artist_round: [3, 3, null, 3, null, null][i], song_title_round: [null, null, null, 3, null, null][i],
}))
const REVEAL = {
  round: 3, artist: 'Queen', title: 'Bohemian Rhapsody', year: 1975,
  players: [
    { player_id: 'p3', nickname: 'Samurai', artist: true, title: true, artist_secs: 2.1, title_secs: 3.4, points: 2010, first: true },
    { player_id: 'p0', nickname: 'Halls', artist: true, title: true, artist_secs: 4.8, title_secs: 6.2, points: 1650, first: false },
    { player_id: 'p1', nickname: 'Gio', artist: true, title: false, artist_secs: 9.5, title_secs: null, points: 667, first: false },
    { player_id: 'p2', nickname: 'Ricardo', artist: false, title: false, artist_secs: null, title_secs: null, points: 0, first: false },
    { player_id: 'p4', nickname: 'Cakky', artist: false, title: false, artist_secs: null, title_secs: null, points: 0, first: false },
    { player_id: 'p5', nickname: 'Kirito', artist: false, title: false, artist_secs: null, title_secs: null, points: 0, first: false },
  ],
}

export default function SongPreview() {
  const [phase, setPhase] = useState(() => new URLSearchParams(window.location.search).get('phase') || 'listen')
  const [text, setText] = useState('bohemian rap')
  const [, setT] = useState(0)
  useEffect(() => { const id = setInterval(() => setT((n) => n + 1), 500); return () => clearInterval(id) }, [])
  useEffect(() => { document.documentElement.dataset.mode = 'song' }, [])

  const room = {
    id: 'r', code: 'PYTHM4', status: phase === 'finished' ? 'finished' : phase === 'lobby' ? 'lobby' : 'playing',
    mode: 'song', round_number: 3, song_total: 10, song_phase: phase, host_user_id: 'u0', winner_id: 'p2',
    song_round: { file: 'x.mp3', listen_at: new Date().toISOString(), listen_secs: 20 },
    song_reveal: phase === 'reveal' ? REVEAL : null,
  }
  const common = { room, players: PLAYERS, alive: PLAYERS, danger: 1, questionMs: 0, myPlayerId: 'p0', onLeave: () => {} }
  const chip = 'Round 3/10 · Guess the Song'

  let view
  if (phase === 'lobby') {
    view = <GameArenaV2 {...common} phase="lobby" chip="Lobby · Guess the Song"
      panel={<LobbyPanel room={room} players={PLAYERS} me={PLAYERS[0]} iAmHost onStart={() => setPhase('ready')} onLeave={() => {}}
        onPick={() => {}} subtitle="🎵 Guess the Song" invitePath="/song" />} />
  } else if (phase === 'finished') {
    view = <GameArenaV2 {...common} phase="finished" centerId="p2" chip="Game over · Guess the Song"
      panel={<><FinishedPanel room={room} players={PLAYERS} myId="p0" winner={PLAYERS[2]} iWon={false} iAmOut={false} iAmHost
        onStart={() => setPhase('ready')} onLeave={() => {}} /><ScoreList players={PLAYERS} me={PLAYERS[0]} /></>} />
  } else if (phase === 'ready') {
    view = <GameArenaV2 {...common} phase="song" chip={chip} panel={<ReadyPanel room={room} msToStart={2200} />} />
  } else if (phase === 'reveal') {
    view = <GameArenaV2 {...common} phase="song" chip={chip} panel={<RevealPanel room={room} players={PLAYERS} me={PLAYERS[0]} msLeft={6000} />} />
  } else {
    view = <GameArenaV2 {...common} phase="song" chip={chip}
      panel={<ListenPanel room={room} players={PLAYERS} me={PLAYERS[0]} msLeft={12400} total={20} text={text} setText={setText}
        onSubmit={() => {}} feedback={{ kind: 'close', text: 'So close! Check the spelling' }} />} />
  }

  return (
    <>
      {view}
      <div style={{ position: 'fixed', left: 8, bottom: 8, zIndex: 999, display: 'flex', gap: 4 }}>
        {['lobby', 'ready', 'listen', 'reveal', 'finished'].map((p) => (
          <button key={p} onClick={() => setPhase(p)} style={{ fontWeight: phase === p ? 800 : 400 }}>{p}</button>
        ))}
      </div>
    </>
  )
}
