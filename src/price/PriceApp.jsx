import { useEffect, useRef, useState } from 'react'
import { supabase, ensureSession } from '../supabaseClient'
import { saveNickname, loadNickname } from '../roomStorage'
import { savePriceRoom, loadPriceRoom, clearPriceRoom } from './storage'
import Home from '../Home'
import GameArenaV2 from '../GameArenaV2'
import { LobbyPanel, FinishedPanel } from '../ArenaPanels'
import { preloadCharacters } from '../characters'
import useChat from '../useChat'
import { readInviteCode } from '../invite'
import { GuessPanel, RevealPanel, ScoreList } from './PricePanels'
import './price.css'

// Guess the Price: a turma vê um ativo (Bitcoin, ouro, Nvidia...), uma data e hora do passado e o
// preço 24 h antes, e chuta quanto valia naquele momento. Mais perto = mais pontos; 10 rodadas.
// Usa a mesma sala, lobby, chat, personagens e arena do Hot Potato; as regras ficam no servidor
// (supabase/price/P01_guess_the_price.sql). Endereço: /price.

const ROUNDS = 10
const PATH = '/price'

function makeCode(extra = 2) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = 'PYTH'
  for (let i = 0; i < extra; i++) code += chars[Math.floor(Math.random() * chars.length)]
  return code
}

export default function PriceApp() {
  const [room, setRoom] = useState(null)
  const [me, setMe] = useState(null)
  const [players, setPlayers] = useState([])
  const [invite] = useState(() => readInviteCode())
  const [codeInput, setCodeInput] = useState(invite)
  const [nickname, setNickname] = useState(() => loadNickname())
  const [error, setError] = useState(null)
  const [now, setNow] = useState(() => Date.now())
  const [guessText, setGuessText] = useState('')
  const [sent, setSent] = useState(null) // meu chute já enviado nesta rodada
  const [flash, setFlash] = useState(null)
  const inputRef = useRef(null)
  const lastEventRef = useRef(undefined)
  const meRef = useRef(null)
  const statusRef = useRef(null)
  meRef.current = me
  statusRef.current = room?.status

  const roomId = room?.id
  const chat = useChat(roomId)

  useEffect(() => {
    const id = setTimeout(preloadCharacters, 1200)
    return () => clearTimeout(id)
  }, [])

  // tira o ?room= do endereço (o código já foi pro campo)
  useEffect(() => {
    if (!invite) return
    try {
      const q = new URLSearchParams(window.location.search); q.delete('room')
      const rest = q.toString()
      window.history.replaceState(null, '', window.location.pathname + (rest ? '?' + rest : ''))
    } catch { /* tudo bem */ }
  }, [invite])

  // volta sozinho pra sala guardada (refresh, fechou a aba...)
  useEffect(() => {
    (async () => {
      let user
      try { user = await ensureSession() } catch (e) { return setError(e.message) }
      const code = loadPriceRoom()
      if (!code || (invite && code !== invite)) return
      const { data: r } = await supabase.from('rooms').select().eq('code', code).maybeSingle()
      if (!r || r.mode !== 'price') return clearPriceRoom()
      const { data: p } = await supabase.from('players').select().eq('room_id', r.id).eq('user_id', user.id).maybeSingle()
      if (!p) return clearPriceRoom()
      setRoom(r)
      setMe(p)
    })()
  }, [invite])

  // jogadores e sala ao vivo (+ recarrega ao voltar pra aba ou à internet)
  useEffect(() => {
    if (!roomId) return
    async function loadPlayers() {
      const { data } = await supabase.from('players').select().eq('room_id', roomId).order('joined_at')
      setPlayers(data ?? [])
      const mine = meRef.current
      if (data && mine && !data.some((p) => p.id === mine.id) && statusRef.current !== 'playing') {
        clearPriceRoom()
        setRoom(null); setMe(null); setPlayers([])
        setError('You were removed from the room because you were away. Join again with the code.')
      }
    }
    async function loadRoom() {
      const { data } = await supabase.from('rooms').select().eq('id', roomId).single()
      if (data) setRoom(data)
    }
    loadPlayers()
    loadRoom()
    const channel = supabase
      .channel('price-room-' + roomId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `room_id=eq.${roomId}` }, () => loadPlayers())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` }, (payload) => setRoom(payload.new))
      .subscribe()
    function refresh() {
      if (document.visibilityState !== 'visible') return
      loadPlayers(); loadRoom()
    }
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener('online', refresh)
    return () => {
      document.removeEventListener('visibilitychange', refresh)
      window.removeEventListener('online', refresh)
      supabase.removeChannel(channel)
    }
  }, [roomId])

  // durante a partida: relógio da tela + cutuca o servidor 1x por segundo (ele avança as rodadas)
  useEffect(() => {
    if (!roomId || room?.status !== 'playing') return
    const clock = setInterval(() => setNow(Date.now()), 200)
    let n = 0
    const tick = setInterval(async () => {
      const { error: e } = await supabase.rpc('price_tick', { p_room_id: roomId })
      if (e) console.log('PRICE TICK ERROR:', e.message)
      n++
      // rede de segurança se o aviso ao vivo se perder (celular com tela apagada etc.)
      if (n % 3 === 0) {
        const { data: r } = await supabase.from('rooms').select().eq('id', roomId).single()
        if (r) setRoom((old) => (old && JSON.stringify(old) === JSON.stringify(r) ? old : r))
      }
      if (n % 4 === 0) {
        const { data: ps } = await supabase.from('players').select().eq('room_id', roomId).order('joined_at')
        if (ps) setPlayers((old) => (JSON.stringify(old) === JSON.stringify(ps) ? old : ps))
      }
    }, 1000)
    return () => { clearInterval(clock); clearInterval(tick) }
  }, [roomId, room?.status])

  // "ainda estou aqui" a cada 15 s (mesmo esquema do Hot Potato, supabase/013)
  useEffect(() => {
    if (!roomId || !me) return
    let stopped = false
    async function beat() {
      const { error: e } = await supabase.rpc('heartbeat', { p_room_id: roomId })
      if (e || stopped || statusRef.current === 'playing') return
      const { data: ps } = await supabase.from('players').select().eq('room_id', roomId).order('joined_at')
      if (!stopped && ps) setPlayers(ps)
    }
    beat()
    const id = setInterval(beat, 15000)
    return () => { stopped = true; clearInterval(id) }
  }, [roomId, me?.id])

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

  async function joinRoom(target) {
    const user = await ensureSession()
    const { data: existing } = await supabase.from('players').select().eq('room_id', target.id).eq('user_id', user.id).maybeSingle()
    if (existing) { setMe(existing); setRoom(target); savePriceRoom(target.code); return }
    if (target.status === 'playing') return setError('This game has already started. Wait for it to end, then join.')
    const { data: player, error: e } = await supabase.from('players')
      .insert({ room_id: target.id, nickname: nickname.trim(), user_id: user.id }).select().single()
    if (e) {
      if (e.code === '23505') {
        const { data: again } = await supabase.from('players').select().eq('room_id', target.id).eq('user_id', user.id).maybeSingle()
        if (again) { setMe(again); setRoom(target); savePriceRoom(target.code); return }
      }
      return setError(e.message)
    }
    setMe(player); setRoom(target); savePriceRoom(target.code)
  }

  async function createRoom() {
    setError(null)
    const nick = nickname.trim()
    if (nick.length < 2) return setError('Pick a nickname first (at least 2 characters)')
    saveNickname(nick)
    let data, e
    for (let i = 0; i < 8; i++) {
      ({ data, error: e } = await supabase.from('rooms').insert({ code: makeCode(i < 5 ? 2 : 3), mode: 'price' }).select().single())
      if (e?.code !== '23505') break
    }
    if (e) return setError(e.code === '23505' ? 'Could not create a room right now. Please try again.' : e.message)
    joinRoom(data)
  }

  async function joinByCode() {
    setError(null)
    const nick = nickname.trim()
    if (nick.length < 2) return setError('Pick a nickname first (at least 2 characters)')
    const code = codeInput.replace(/[^a-z0-9]/gi, '').toUpperCase()
    if (!code) return setError('Type the room code first')
    saveNickname(nick)
    const { data, error: e } = await supabase.from('rooms').select().eq('code', code).maybeSingle()
    if (e) return setError('Could not reach the game server. Check your connection and try again.')
    if (!data) return setError('Room not found. Check the code (' + code + ').')
    // código de uma sala do Hot Potato: manda pro modo certo
    if (data.mode !== 'price') { window.location.href = '/play?room=' + code; return }
    joinRoom(data)
  }

  function leaveRoom() {
    if (room) supabase.rpc('leave_room', { p_room_id: room.id }).then(() => {}, () => {})
    clearPriceRoom()
    setRoom(null); setMe(null); setPlayers([]); setError(null)
  }

  async function pickCharacter(idx) {
    setError(null)
    const { error: e } = await supabase.rpc('pick_character', { p_room_id: room.id, p_idx: idx })
    if (e) setError(e.message)
  }

  async function startGame() {
    setError(null)
    const { error: e } = await supabase.rpc('price_start_game', { p_room_id: room.id, p_rounds: ROUNDS })
    if (e) setError(e.message)
  }

  async function submitGuess(value) {
    setError(null)
    const { data, error: e } = await supabase.rpc('price_submit_guess', { p_room_id: room.id, p_guess: value })
    if (e) return setError(e.message)
    if (data === 'ok') setSent(value)
    else setError('Too late! The round is over.')
    inputRef.current?.focus()
  }

  if (!room) {
    return (
      <Home
        nickname={nickname} setNickname={setNickname}
        codeInput={codeInput} setCodeInput={setCodeInput}
        onCreate={createRoom} onJoin={joinByCode} onBack={() => { window.location.href = '/play' }}
        error={error} invite={invite} subtitle="Guess the Price"
      />
    )
  }

  const iAmHost = !!me && room.host_user_id === me.user_id
  const msLeft = room.question_expires_at ? Math.max(0, new Date(room.question_expires_at).getTime() - now) : 0
  const common = { room, players, alive: players, danger: 1, questionMs: 0, myPlayerId: me?.id, onLeave: leaveRoom, chat }

  if (room.status === 'lobby') {
    return (
      <GameArenaV2 {...common} phase="lobby" chip="Lobby · Guess the Price"
        panel={<LobbyPanel room={room} players={players} me={me} iAmHost={iAmHost} onStart={startGame} onLeave={leaveRoom}
          onPick={pickCharacter} error={error} subtitle="📈 Guess the Price" invitePath={PATH} />}
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

  // fim: pódio por pontos + placar completo
  const winner = players.find((p) => p.id === room.winner_id)
  return (
    <GameArenaV2 {...common} phase="finished" centerId={winner?.id} chip="Game over · Guess the Price"
      panel={
        <>
          <FinishedPanel room={room} players={players} myId={me?.id} winner={winner}
            iWon={!!winner && winner.id === me?.id} iAmOut={false} iAmHost={iAmHost}
            onStart={startGame} onLeave={leaveRoom} error={error} />
          <ScoreList players={players} me={me} />
        </>
      }
    />
  )
}
