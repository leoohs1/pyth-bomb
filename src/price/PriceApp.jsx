import { useEffect, useRef, useState } from 'react'
import { supabase } from '../supabaseClient'
import Home from '../Home'
import GameArenaV2 from '../GameArenaV2'
import { LobbyPanel, FinishedPanel } from '../ArenaPanels'
import useChat from '../useChat'
import useModeRoom from '../modes/useModeRoom'
import useModeTheme from '../modes/useModeTheme'
import ScoreList from '../modes/ScoreList'
import { GuessPanel, RevealPanel } from './PricePanels'
import { play } from '../sound'
import './price.css'

// Guess the Price: a turma vê um ativo (Bitcoin, ouro, Nvidia...), uma data e hora do passado e o
// preço 24 h antes, e chuta quanto valia naquele momento. Mais perto = mais pontos; 10 rodadas.
// Sala, lobby, chat, personagens e arena são os mesmos do Hot Potato (src/modes/useModeRoom.js);
// as regras ficam no servidor (supabase/price/P01_guess_the_price.sql). Endereço: /price.
// Personalidade própria (arena DeFi, cartão escuro, sons): price.css + useModeTheme('price').

const ROUNDS = 10
const PATH = '/price'

export default function PriceApp() {
  const R = useModeRoom({ mode: 'price', tickRpc: 'price_tick' })
  const { room, me, players, error, setError, now } = R
  const chat = useChat(room?.id)
  useModeTheme('price')
  const [guessText, setGuessText] = useState('')
  const [sent, setSent] = useState(null) // meu chute já enviado nesta rodada
  const [flash, setFlash] = useState(null)
  const inputRef = useRef(null)
  const lastEventRef = useRef(undefined)

  // rodada nova: limpa o chute da tela
  useEffect(() => {
    setGuessText('')
    setSent(null)
  }, [room?.round_number, room?.status])

  // o pior chute da rodada "leva a bomba" (só avisos novos; nunca um antigo ao reconectar)
  useEffect(() => {
    if (!room) return
    if (lastEventRef.current === undefined) { lastEventRef.current = room.last_event_at ?? null; return }
    if (!room.last_event_at || room.last_event_at === lastEventRef.current) return
    lastEventRef.current = room.last_event_at
    const victim = players.find((p) => p.id === room.last_victim_id)
    if (victim && room.status === 'playing') {
      setFlash({ name: victim.nickname, mine: victim.id === me?.id })
      setTimeout(() => setFlash(null), 3000)
    }
  }, [room, players, me?.id])

  // sons da rodada: revelação (e se EU fiz PYTH PERFECT ou pontos) + tique nos últimos 5 segundos
  const phaseKey = room?.status === 'playing' ? room.round_number + ':' + room.price_phase : null
  const lastPhaseRef = useRef(null)
  useEffect(() => {
    const prev = lastPhaseRef.current
    lastPhaseRef.current = phaseKey
    if (!prev || !phaseKey || prev === phaseKey || room?.price_phase !== 'reveal') return
    play('reveal')
    const mine = room.price_reveal?.guesses?.find((g) => g.player_id === me?.id)
    if (mine?.perfect) setTimeout(() => play('perfect'), 500)
    else if (mine?.points > 0) setTimeout(() => play('cash'), 500)
  }, [phaseKey, room, me?.id])
  const secsLeft = room?.price_phase === 'guess' && room.question_expires_at
    ? Math.ceil(Math.max(0, new Date(room.question_expires_at).getTime() - now) / 1000) : null
  useEffect(() => {
    if (secsLeft != null && secsLeft > 0 && secsLeft <= 5) play('clock_tick')
  }, [secsLeft])

  async function startGame() {
    setError(null)
    const { error: e } = await supabase.rpc('price_start_game', { p_room_id: room.id, p_rounds: ROUNDS })
    if (e) setError(e.message)
  }

  async function submitGuess(value) {
    setError(null)
    const { data, error: e } = await supabase.rpc('price_submit_guess', { p_room_id: room.id, p_guess: value })
    if (e) return setError(e.message)
    if (data === 'ok') { setSent(value); play('lock_in') }
    else setError('Too late! The round is over.')
    inputRef.current?.focus()
  }

  if (!room) {
    return (
      <Home
        nickname={R.nickname} setNickname={R.setNickname}
        codeInput={R.codeInput} setCodeInput={R.setCodeInput}
        onCreate={R.createRoom} onJoin={R.joinByCode} onBack={() => { window.location.href = '/play' }}
        error={error} invite={R.invite} subtitle="Guess the Price"
      />
    )
  }

  const msLeft = room.question_expires_at ? Math.max(0, new Date(room.question_expires_at).getTime() - now) : 0
  const common = { room, players, alive: players, danger: 1, questionMs: 0, myPlayerId: me?.id, onLeave: R.leaveRoom, chat }

  if (room.status === 'lobby') {
    return (
      <GameArenaV2 {...common} phase="lobby" chip="Lobby · Guess the Price"
        panel={<LobbyPanel room={room} players={players} me={me} iAmHost={R.iAmHost} onStart={startGame} onLeave={R.leaveRoom}
          onPick={R.pickCharacter} error={error} subtitle="📈 Guess the Price" invitePath={PATH} />}
      />
    )
  }

  if (room.status === 'playing') {
    const reveal = room.price_phase === 'reveal'
    return (
      <GameArenaV2 {...common} phase="price" flash={flash}
        chip={`Round ${room.round_number}/${room.price_total ?? ROUNDS} · Guess the Price`}
        panel={reveal
          ? <RevealPanel room={room} players={players} me={me} msLeft={msLeft} />
          : <GuessPanel room={room} players={players} msLeft={msLeft} guessText={guessText} setGuessText={setGuessText}
              sent={sent} onSubmit={submitGuess} inputRef={inputRef} error={error} />}
      />
    )
  }

  // fim: pódio por pontos + placar
  const winner = players.find((p) => p.id === room.winner_id)
  return (
    <GameArenaV2 {...common} phase="finished" centerId={winner?.id} chip="Game over · Guess the Price"
      panel={
        <>
          <FinishedPanel room={room} players={players} myId={me?.id} winner={winner}
            iWon={!!winner && winner.id === me?.id} iAmOut={false} iAmHost={R.iAmHost}
            onStart={startGame} onLeave={R.leaveRoom} error={error} />
          <ScoreList players={players} me={me} />
        </>
      }
    />
  )
}
