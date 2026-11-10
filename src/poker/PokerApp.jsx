import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../supabaseClient'
import Home from '../Home'
import GameArenaV2 from '../GameArenaV2'
import { LobbyPanel, FinishedPanel } from '../ArenaPanels'
import useChat from '../useChat'
import useModeRoom from '../modes/useModeRoom'
import useModeTheme from '../modes/useModeTheme'
import { play } from '../sound'
import { setMusicSilenced } from '../music'
import PokerTable from './PokerTable'
import PokerHowTo from './PokerHowTo'
import { fmt, DECK_ART } from './cards'
import { emoOf, emoCode, REACTION_MS } from './reactions'
import './poker.css'

// Pyth Poker: torneio de Texas Hold'em (Sit & Go) de 2 a 9 pessoas por sala, só com fichas de brincadeira.
// Sala, lobby, chat e personagens são os mesmos dos outros modos (src/modes/useModeRoom.js); durante o
// torneio a tela é a mesa (PokerTable). Todas as regras, as cartas escondidas e o embaralhar ficam no
// servidor (supabase/poker/K01_poker.sql). Endereço: /poker.

const PATH = '/poker'
const CHIP_ACTIONS = ['Call', 'Bet', 'Raise', 'All-in']

// lugares no fim do torneio (1º, 2º, 3º...)
export function PlacesList({ players, me }) {
  const list = players.filter((p) => p.place != null).sort((a, b) => a.place - b.place)
  if (!list.length) return null
  return (
    <div className="rm-scores">
      <p className="rm-scores-title">Final places</p>
      <ol>
        {list.map((p) => (
          <li key={p.id} className={p.id === me?.id ? 'is-me' : ''}>
            <span>{p.place}. {p.nickname}</span>
            <b>{p.place === 1 ? `${fmt(p.poker_stack)} chips` : ''}</b>
          </li>
        ))}
      </ol>
    </div>
  )
}

export default function PokerApp() {
  const R = useModeRoom({ mode: 'poker', tickRpc: 'poker_tick' })
  const { room, me, players, error, setError, serverNow } = R
  const chat = useChat(room?.id)
  useModeTheme('poker')
  // o poker não tem música de fundo (pedido da Halls): só os sons do jogo
  useEffect(() => { setMusicSilenced(true); return () => setMusicSilenced(false) }, [])
  // já carrega a arte do baralho, a mesa e o fundo enquanto a pessoa está no lobby (assim nada pisca na 1ª mão)
  useEffect(() => {
    for (const src of [...DECK_ART, '/poker/table.webp', '/poker/bg.webp']) { const im = new Image(); im.src = src }
  }, [])
  const [myCards, setMyCards] = useState(null)
  const [busy, setBusy] = useState(false)

  // ---- reações com emoji (vêm pelo chat como "[emo:fire]"; ver reactions.js)
  // o chat da tela não mostra esses códigos
  const chatView = useMemo(() => ({ ...chat, messages: chat.messages.filter((m) => !emoOf(m.body)) }), [chat])
  const [reactions, setReactions] = useState({}) // id do jogador -> { e, key, until }
  const seenEmoRef = useRef(null)
  useEffect(() => {
    const emos = chat.messages.filter((m) => emoOf(m.body))
    if (seenEmoRef.current === null) { // primeira leitura: as antigas não aparecem
      if (!chat.available) return
      seenEmoRef.current = new Set(emos.map((m) => m.id))
      return
    }
    const fresh = emos.filter((m) => !seenEmoRef.current.has(m.id))
    if (!fresh.length) return
    const now = Date.now()
    setReactions((old) => {
      const next = { ...old }
      for (const m of fresh) {
        seenEmoRef.current.add(m.id)
        // a rede de segurança do chat (a cada 8 s) pode trazer uma velha: só mostra se é recente
        if (m.created_at && Date.parse(m.created_at) < serverNow - 6000) continue
        next[m.player_id] = { e: emoOf(m.body), key: m.id, until: now + REACTION_MS }
      }
      return next
    })
  }, [chat.messages, chat.available]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { seenEmoRef.current = null; setReactions({}) }, [room?.id])
  // tira da mesa as que já passaram
  useEffect(() => {
    const ids = Object.keys(reactions)
    if (!ids.length) return
    const next = Math.min(...ids.map((k) => reactions[k].until)) - Date.now()
    const t = setTimeout(() => setReactions((old) => {
      const now = Date.now()
      return Object.fromEntries(Object.entries(old).filter(([, r]) => r.until > now))
    }), Math.max(50, next))
    return () => clearTimeout(t)
  }, [reactions])
  const lastEmoRef = useRef(0)
  const sendEmoji = useCallback(async (id) => {
    if (Date.now() - lastEmoRef.current < 1300) return // o servidor também segura quem manda rápido demais
    lastEmoRef.current = Date.now()
    await chat.send(emoCode(id))
  }, [chat])

  const playing = room?.status === 'playing'
  const handNo = room?.poker_hand_no ?? 0
  const meNow = players.find((p) => p.id === me?.id) ?? null

  // minhas 2 cartas: busca a cada mão nova (e ao voltar pra aba); só o servidor sabe quais são
  const loadCards = useCallback(async () => {
    if (!room?.id) return
    const { data, error: e } = await supabase.rpc('poker_my_cards', { p_room_id: room.id })
    if (!e) setMyCards(data ?? null)
  }, [room?.id])
  useEffect(() => { if (playing) loadCards() }, [playing, handNo, loadCards])
  useEffect(() => {
    if (!playing) return
    const again = () => { if (document.visibilityState === 'visible') loadCards() }
    document.addEventListener('visibilitychange', again)
    window.addEventListener('online', again)
    return () => { document.removeEventListener('visibilitychange', again); window.removeEventListener('online', again) }
  }, [playing, loadCards])
  // rede de segurança: mão nova mas as cartas ainda não chegaram
  useEffect(() => {
    if (!playing || !meNow?.poker_in_hand || myCards?.hand_no === handNo) return
    const id = setTimeout(loadCards, 1500)
    return () => clearTimeout(id)
  })

  // ---- sons
  const myTurn = playing && !!meNow && room.poker_turn === meNow.id
  useEffect(() => { if (myTurn) play('go') }, [myTurn, room?.poker_turn_ends_at])
  const turnSecs = myTurn && room.poker_turn_ends_at ? Math.ceil((Date.parse(room.poker_turn_ends_at) - serverNow) / 1000) : null
  const lastTickRef = useRef(null)
  useEffect(() => {
    if (turnSecs == null || turnSecs > 5 || turnSecs < 1) return
    if (lastTickRef.current !== turnSecs) { lastTickRef.current = turnSecs; play('clock_tick') }
  }, [turnSecs])
  const lastAt = room?.poker_last?.at
  useEffect(() => { if (lastAt && CHIP_ACTIONS.includes(room.poker_last.action)) play('lock_in') }, [lastAt]) // eslint-disable-line react-hooks/exhaustive-deps
  const resultHand = room?.poker_street === 'result' ? room.poker_result?.hand_no : null
  useEffect(() => {
    if (!resultHand) return
    const res = room.poker_result
    if (res.showdown) play('reveal')
    const mine = res.players?.find((p) => p.player_id === me?.id)
    if (mine && mine.won > mine.committed) setTimeout(() => play('cash'), res.showdown ? 450 : 0)
  }, [resultHand]) // eslint-disable-line react-hooks/exhaustive-deps
  const iAmOut = !!meNow?.poker_out
  const outRef = useRef(iAmOut)
  useEffect(() => { if (iAmOut && !outRef.current && playing) play('eliminated'); outRef.current = iAmOut }, [iAmOut, playing])
  const iWon = room?.status === 'finished' && !!me && room.winner_id === me.id
  useEffect(() => { if (iWon) play('perfect') }, [iWon])

  async function startGame() {
    setError(null)
    const { error: e } = await supabase.rpc('poker_start_game', { p_room_id: room.id })
    if (e) setError(e.message)
  }

  async function act(action, to = null) {
    if (busy) return
    setBusy(true)
    setError(null)
    const { error: e } = await supabase.rpc('poker_act', { p_room_id: room.id, p_action: action, p_to: to })
    setBusy(false)
    if (e) setError(e.message)
  }

  async function back() {
    setError(null)
    const { error: e } = await supabase.rpc('poker_back', { p_room_id: room.id })
    if (e) setError(e.message)
  }

  // o erro some sozinho depois de uns segundos (na mesa não tem outro lugar pra ele)
  useEffect(() => {
    if (!error || !playing) return
    const id = setTimeout(() => setError(null), 5000)
    return () => clearTimeout(id)
  }, [error, playing, setError])

  if (!room) {
    return (
      <Home
        nickname={R.nickname} setNickname={R.setNickname}
        codeInput={R.codeInput} setCodeInput={R.setCodeInput}
        onCreate={R.createRoom} onJoin={R.joinByCode} onBack={() => { window.location.href = '/play' }}
        error={error} invite={R.invite} subtitle="Pyth Poker"
      />
    )
  }

  const common = { room, players, alive: players, danger: 1, questionMs: 0, myPlayerId: me?.id, onLeave: R.leaveRoom, chat: chatView, maxPlayers: room.poker_cfg?.max_players ?? 9 }

  if (room.status === 'lobby') {
    return (
      <>
        <GameArenaV2 {...common} phase="lobby" chip="Lobby · Pyth Poker"
          panel={<LobbyPanel room={room} players={players} me={me} iAmHost={R.iAmHost} onStart={startGame} onLeave={R.leaveRoom}
            onPick={R.pickCharacter} error={error} subtitle="🃏 Pyth Poker" invitePath={PATH} />}
        />
        <PokerHowTo />
      </>
    )
  }

  if (playing) {
    return (
      <PokerTable room={room} players={players} myPlayerId={me?.id} myCards={myCards} serverNow={serverNow}
        onAct={act} onBack={back} onLeave={R.leaveRoom} chat={chatView} busy={busy} error={error}
        reactions={reactions} onEmoji={chat.available ? sendEmoji : null} />
    )
  }

  // fim: pódio + lugares
  const winner = players.find((p) => p.id === room.winner_id)
  return (
    <GameArenaV2 {...common} phase="finished" centerId={winner?.id} chip="Game over · Pyth Poker"
      panel={
        <>
          <FinishedPanel room={room} players={players} myId={me?.id} winner={winner}
            iWon={!!winner && winner.id === me?.id} iAmOut={!!meNow?.poker_out} iAmHost={R.iAmHost}
            onStart={startGame} onLeave={R.leaveRoom} error={error} />
          <PlacesList players={players} me={me} />
        </>
      }
    />
  )
}
