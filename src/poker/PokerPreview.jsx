import { useEffect, useState } from 'react'
import GameArenaV2 from '../GameArenaV2'
import { LobbyPanel, FinishedPanel } from '../ArenaPanels'
import PokerTable from './PokerTable'
import PokerHowTo from './PokerHowTo'
import { PlacesList } from './PokerApp'
import { sha256, deckFromSeed, bytesToHex } from './fair'
import { EMOJIS, REACTION_MS } from './reactions'
import './poker.css'

// Prévia do Pyth Poker com dados de mentira (sem servidor), só pra ver o visual. Não faz parte do jogo.
// /poker-preview?phase=lobby|ready|preflop|flop|wait|river|result|split|away|out|finished|verify  &n=2..9 (jogadores)
// verify = fim de mão com prova do embaralhamento (de mentira, mas com as contas certas) pra testar a tela Verify
const NAMES = ['Halls', 'Gio', 'Ricardo', 'Samurai', 'Cakky', 'Kirito', 'Luna', 'Pedro', 'Nina']
const C = (s) => s.split(' ').map((x) => '23456789TJQKA'.indexOf(x[0]) * 4 + 'cdhs'.indexOf(x[1]))

function makePlayers(n, phase) {
  const stacks = [1340, 2210, 980, 1500, 0, 1875, 640, 3100, 1105]
  const bets = { preflop: [0, 25, 50, 150, 0, 0, 0, 0, 0], flop: [200, 0, 200, 0, 0, 450, 0, 0, 0], wait: [100, 0, 300, 0, 0, 0, 0, 0, 0], river: [0, 0, 0, 0, 0, 0, 0, 0, 0] }[phase] ?? []
  const actions = { preflop: [null, 'SB', 'BB', 'Raise', null, null, null, null, null], flop: ['Call', 'Fold', 'Call', 'Check', null, 'Raise', null, null, null], wait: ['Bet', 'Fold', 'Raise', null, null, null, null, null, null], river: ['Check', 'Fold', null, null, null, null, null, null, null] }[phase] ?? []
  return NAMES.slice(0, n).map((nickname, i) => ({
    id: 'p' + i, user_id: 'u' + i, nickname, alive: i !== 4, avatar_idx: [0, 18, 3, 9, 14, 19, 6, 11, 2][i],
    poker_seat: i, poker_stack: stacks[i], poker_bet: bets[i] ?? 0, poker_committed: (bets[i] ?? 0) + (phase === 'preflop' ? 0 : 150),
    poker_in_hand: i !== 4, poker_folded: i === 4 || (actions[i] === 'Fold'), poker_allin: false, poker_out: i === 4,
    poker_action: actions[i] ?? null, poker_acted: !!actions[i], poker_acted_level: actions[i] ? 50 : -1,
    poker_away: phase === 'away' && i === 0, place: i === 4 ? n : (phase === 'finished' ? [3, 1, 2, 4, 6, 5, 7, 8, 9][i] : null),
  }))
}

export default function PokerPreview() {
  const qs = new URLSearchParams(window.location.search)
  const [phase, setPhase] = useState(() => qs.get('phase') || 'preflop')
  const n = Math.max(2, Math.min(9, Number(qs.get('n')) || 7))
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(id) }, [])
  useEffect(() => { document.documentElement.dataset.mode = 'poker' }, [])
  const [t0] = useState(() => Date.now())
  const [demo, setDemo] = useState(null)
  // reações: tocar no 😀 manda pro "Halls"; com &emo=1 os outros também reagem sozinhos
  const [reactions, setReactions] = useState({})
  const react = (pid, id) => setReactions((old) => ({ ...old, [pid]: { e: EMOJIS.find((x) => x.id === id).e, key: Math.random(), until: Date.now() + REACTION_MS } }))
  useEffect(() => {
    if (qs.get('emo') !== '1') return
    const t = setInterval(() => react('p' + Math.floor(Math.random() * n), EMOJIS[Math.floor(Math.random() * EMOJIS.length)].id), 1100)
    return () => clearInterval(t)
  }, [n]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const t = setInterval(() => setReactions((old) => Object.fromEntries(Object.entries(old).filter(([, r]) => r.until > Date.now()))), 300)
    return () => clearInterval(t)
  }, [])
  useEffect(() => {
    if (phase !== 'verify') return
    ;(async () => {
      const enc = new TextEncoder()
      const secret = await sha256(enc.encode('pyth-preview-secret')), random = await sha256(enc.encode('pyth-preview-random'))
      const seed = await sha256(secret, random)
      const deck = await deckFromSeed(seed)
      setDemo({ deck, fair: { via: 'entropy', chain: 'preview', chain_name: 'Base Sepolia (preview)', contract: '0x025AFFF135525B0566d09e9C5F810DDC0cB3eE5c',
        explorer: 'https://sepolia.basescan.org', sequence: '4242', tx: '0x' + 'ab'.repeat(32), commit: bytesToHex(await sha256(secret)),
        random: bytesToHex(random), secret: bytesToHex(secret), seed: bytesToHex(seed), dealt: n } })
    })()
  }, [phase, n])

  const players = makePlayers(n, phase === 'result' || phase === 'split' || phase === 'verify' ? 'river' : phase === 'away' || phase === 'out' ? 'flop' : phase)
  if (phase === 'away') players[0].poker_away = true
  if (phase === 'out') { players[0].poker_out = true; players[0].poker_in_hand = false; players[0].place = n - 1; players[0].poker_stack = 0 }
  const street = { verify: 'result', ready: 'ready', preflop: 'preflop', flop: 'flop', wait: 'turn', river: 'river', result: 'result', split: 'result', away: 'flop', out: 'flop' }[phase] ?? 'preflop'
  const board = { preflop: [], flop: C('Ah Kd 7c'), wait: C('Ah Kd 7c Qs'), river: C('Ah Kd 7c Qs 2h'), result: C('Ah Kd 7c Qs 2h'), split: C('Ah Kh Qh Jh Th'), away: C('Ah Kd 7c'), out: C('Ah Kd 7c') }[phase] ?? []
  const loop = 20000 - ((now - t0) % 20000)
  const turn = { preflop: 'p0', flop: 'p0', wait: 'p2', river: 'p0', away: 'p3', out: 'p3' }[phase] ?? null
  const result = phase === 'result' ? {
    hand_no: 14, showdown: true, board,
    pots: [{ amount: 1200, winners: ['p2'], eligible: ['p0', 'p2'], returned: false }, { amount: 450, winners: ['p0'], eligible: ['p0'], returned: false }],
    players: [
      { player_id: 'p0', seat: 0, committed: 750, won: 450, folded: false, cards: C('Ac 7d'), hand: 'Two pair' },
      { player_id: 'p2', seat: 2, committed: 600, won: 1200, folded: false, cards: C('Ks Kh'), hand: 'Three of a kind' },
      { player_id: 'p1', seat: 1, committed: 50, won: 0, folded: true, cards: null, hand: null },
    ],
  } : phase === 'split' ? {
    hand_no: 15, showdown: true, board,
    pots: [{ amount: 325, winners: ['p0', 'p3'], eligible: ['p0', 'p3'], returned: false }],
    players: [
      { player_id: 'p0', seat: 0, committed: 150, won: 163, folded: false, cards: C('2c 3d'), hand: 'Royal flush' },
      { player_id: 'p3', seat: 3, committed: 150, won: 162, folded: false, cards: C('4s 5d'), hand: 'Royal flush' },
    ],
  } : phase === 'verify' && demo ? {
    hand_no: 13, showdown: true, board: demo.deck.slice(2 * n, 2 * n + 5), fair: demo.fair,
    pots: [{ amount: 900, winners: ['p2'], eligible: ['p0', 'p2'], returned: false }],
    players: [
      { player_id: 'p0', seat: 0, committed: 450, won: 0, folded: false, cards: [demo.deck[0], demo.deck[n]], hand: 'High card' },
      { player_id: 'p2', seat: 2, committed: 450, won: 900, folded: false, cards: [demo.deck[2], demo.deck[2 + n]], hand: 'Pair' },
    ],
  } : null
  const room = {
    id: 'r', code: 'PYTHK7', status: phase === 'finished' ? 'finished' : phase === 'lobby' ? 'lobby' : 'playing', mode: 'poker',
    host_user_id: 'u0', winner_id: 'p1', poker_hand_no: 14, poker_sb: 50, poker_bb: 100, poker_level: 1,
    poker_level_ends_at: new Date(t0 + 192000).toISOString(), poker_dealer: 3, poker_street: street, poker_board: board,
    poker_turn: turn, poker_turn_ends_at: turn ? new Date(now + loop).toISOString() : null,
    poker_current_bet: { preflop: 150, flop: 450, wait: 300 }[phase] ?? 0, poker_min_raise: { preflop: 100, flop: 250, wait: 200 }[phase] ?? 100,
    poker_full_bet: { preflop: 150, flop: 450, wait: 300 }[phase] ?? 0, poker_cfg: { act_seconds: 20 },
    poker_next_at: new Date(t0 + 3000 - ((now - t0) % 3000)).toISOString(), poker_result: result,
  }
  const myCards = phase === 'verify' && demo ? { hand_no: 13, cards: [demo.deck[0], demo.deck[n]] } : { hand_no: 14, cards: phase === 'split' ? C('2c 3d') : C('Ac 7d') }
  const common = { room, players, alive: players, danger: 1, questionMs: 0, myPlayerId: 'p0', onLeave: () => {}, maxPlayers: 9 }

  if (phase === 'lobby') {
    return <><GameArenaV2 {...common} phase="lobby" chip="Lobby · Pyth Poker"
      panel={<LobbyPanel room={room} players={players} me={players[0]} iAmHost onStart={() => setPhase('ready')} onLeave={() => {}}
        onPick={() => {}} subtitle="🃏 Pyth Poker" invitePath="/poker" />} />
      <PokerHowTo /></>
  }
  if (phase === 'finished') {
    return <GameArenaV2 {...common} phase="finished" centerId="p1" chip="Game over · Pyth Poker"
      panel={<><FinishedPanel room={room} players={players} myId="p0" winner={players[1]} iWon={false} iAmOut iAmHost
        onStart={() => setPhase('ready')} onLeave={() => {}} /><PlacesList players={players} me={players[0]} /></>} />
  }
  return (
    <PokerTable room={room} players={players} myPlayerId="p0" myCards={myCards} serverNow={now}
      onAct={(a, to) => alert(`${a}${to ? ' ' + to : ''}`)} onBack={() => setPhase('flop')} onLeave={() => {}} chat={null} busy={false} error={null}
      reactions={reactions} onEmoji={(id) => react('p0', id)} />
  )
}
