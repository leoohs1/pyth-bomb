import { useEffect, useState, useRef } from 'react'
import { supabase, ensureSession } from './supabaseClient'
import { saveRoomCode, loadRoomCode, clearRoomCode, saveNickname, loadNickname } from './roomStorage'
import Home from './Home'
import Lobby from './Lobby'
import Game from './Game'
import Finished from './Finished'

function makeCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = 'PYTH'
  for (let i = 0; i < 2; i++) code += chars[Math.floor(Math.random() * chars.length)]
  return code
}

export default function App() {
  const [room, setRoom] = useState(null)
  const [me, setMe] = useState(null)
  const [players, setPlayers] = useState([])
  const [codeInput, setCodeInput] = useState('')
  const [nickname, setNickname] = useState(() => loadNickname())
  const [error, setError] = useState(null)
  const [elapsed, setElapsed] = useState(0)

  const roomId = room?.id
  const lastEventRef = useRef(null)
  const [flash, setFlash] = useState(null)
  const [answer, setAnswer] = useState('')
  const [feedback, setFeedback] = useState(null)
  const answerRef = useRef(null)

  // pergunta nova (ou sala nova): limpa o campo de resposta
  useEffect(() => {
    setAnswer('')
  }, [room?.question_expires_at])

  // entra com o crachá anônimo e, se o navegador lembra de uma sala, volta direto pra
  // ela (reconexão depois de fechar a aba, recarregar a página ou trocar de app)
  useEffect(() => {
    (async () => {
      let user
      try {
        user = await ensureSession()
      } catch (e) {
        return setError(e.message)
      }

      const code = loadRoomCode()
      if (!code) return

      const { data: targetRoom } = await supabase.from('rooms').select().eq('code', code).maybeSingle()
      if (!targetRoom) return clearRoomCode()

      const { data: player } = await supabase
        .from('players').select()
        .eq('room_id', targetRoom.id).eq('user_id', user.id).maybeSingle()
      if (!player) return clearRoomCode()

      setRoom(targetRoom)
      setMe(player)
    })()
  }, [])

  // escuta jogadores e mudanças na sala
  useEffect(() => {
    if (!roomId) return

    async function loadPlayers() {
      const { data } = await supabase
        .from('players').select().eq('room_id', roomId).order('joined_at')
      setPlayers(data ?? [])
    }
    async function loadRoom() {
      const { data } = await supabase.from('rooms').select().eq('id', roomId).single()
      if (data) setRoom(data)
    }

    loadPlayers()
    loadRoom()

    const channel = supabase
      .channel('room-' + roomId)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'players', filter: `room_id=eq.${roomId}` },
        () => loadPlayers())
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
        (payload) => setRoom(payload.new))
      .subscribe()

    // celular bloqueou a tela / trocou de app / ficou sem internet: pode ter perdido
    // atualizações em tempo real. Ao voltar, recarrega tudo pra não mostrar tela velha.
    function refresh() {
      if (document.visibilityState !== 'visible') return
      loadPlayers()
      loadRoom()
    }
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener('online', refresh)

    return () => {
      document.removeEventListener('visibilitychange', refresh)
      window.removeEventListener('online', refresh)
      supabase.removeChannel(channel)
    }
  }, [roomId])

  // relógio local: só mede quanto tempo passou, nunca sabe quando explode
  useEffect(() => {
    if (!room?.round_started_at || room.status !== 'playing') return setElapsed(0)
    const start = new Date(room.round_started_at).getTime()
    const id = setInterval(() => setElapsed((Date.now() - start) / 1000), 200)
    return () => clearInterval(id)
  }, [room?.round_started_at, room?.status])

  // cutuca o servidor pra ver se já explodiu
  useEffect(() => {
    if (!roomId || room?.status !== 'playing') return
        const id = setInterval(async () => {
      const { error } = await supabase.rpc('tick', { p_room_id: roomId })
      if (error) console.log('TICK ERROR:', error.message)
    }, 1000)
    return () => clearInterval(id)
  }, [roomId, room?.status])

  // avisa quem explodiu
  useEffect(() => {
    if (!room?.last_event_at || room.last_event_at === lastEventRef.current) return
    lastEventRef.current = room.last_event_at
    const victim = players.find((p) => p.id === room.last_victim_id)
    if (victim) {
      setFlash({ name: victim.nickname, mine: victim.id === me?.id })
      setTimeout(() => setFlash(null), 3000)
    }
  }, [room?.last_event_at, room?.last_victim_id, players, me?.id])

  async function joinRoom(targetRoom) {
    const user = await ensureSession()

    // já tem uma cadeira nessa sala? (recarregou a página, ou digitou o código de
    // novo) reaproveita a mesma pessoa em vez de criar um jogador fantasma duplicado
    const { data: existing } = await supabase
      .from('players').select()
      .eq('room_id', targetRoom.id).eq('user_id', user.id).maybeSingle()
    if (existing) {
      setMe(existing)
      setRoom(targetRoom)
      saveRoomCode(targetRoom.code)
      return
    }

    const { data: player, error: e } = await supabase
      .from('players')
      .insert({ room_id: targetRoom.id, nickname: nickname.trim(), user_id: user.id })
      .select().single()

    if (e) {
      // corrida rara: a mesma pessoa entrou quase ao mesmo tempo (ex: dois cliques)
      if (e.code === '23505') {
        const { data: retry } = await supabase.from('players').select()
          .eq('room_id', targetRoom.id).eq('user_id', user.id).maybeSingle()
        if (retry) {
          setMe(retry)
          setRoom(targetRoom)
          saveRoomCode(targetRoom.code)
          return
        }
      }
      return setError(e.message)
    }

    setMe(player)
    setRoom(targetRoom)
    saveRoomCode(targetRoom.code)
  }

  async function createRoom() {
    setError(null)
    const nick = nickname.trim()
    if (!nick) return setError('Pick a nickname first')
    saveNickname(nick)
    const { data, error: e } = await supabase.from('rooms').insert({ code: makeCode() }).select().single()
    if (e) return setError(e.message)
    joinRoom(data)
  }

  async function joinByCode() {
    setError(null)
    const nick = nickname.trim()
    if (!nick) return setError('Pick a nickname first')
    saveNickname(nick)
    const { data, error: e } = await supabase
      .from('rooms').select().eq('code', codeInput.trim().toUpperCase()).single()
    if (e) return setError('Room not found')
    joinRoom(data)
  }

  // sai da sala guardada no navegador; não mexe no jogo em si nem apaga o jogador
  function leaveRoom() {
    clearRoomCode()
    setRoom(null)
    setMe(null)
    setPlayers([])
    setError(null)
  }

  async function startGame() {
    setError(null)
    const { error: e } = await supabase.rpc('start_game', { p_room_id: room.id })
    if (e) setError(e.message)
  }

  // manda a resposta pro servidor: 'correct' passa a bomba, 'wrong' tenta de novo
  async function submitAnswer(ev) {
    ev.preventDefault()
    const text = answer.trim()
    if (!text) return
    setError(null)
    const { data, error: e } = await supabase.rpc('submit_answer', { p_room_id: room.id, p_answer: text })
    if (e) return setError(e.message)
    if (data === 'wrong') setFeedback('❌ wrong, try again!')
    else if (data === 'timeout') setFeedback('⏱ too slow!')
    else setFeedback(null)
    if (data !== 'correct') setTimeout(() => setFeedback(null), 1200)
    setAnswer('')
    answerRef.current?.focus()
  }

  if (!room) {
    return (
      <Home
        nickname={nickname} setNickname={setNickname}
        codeInput={codeInput} setCodeInput={setCodeInput}
        onCreate={createRoom} onJoin={joinByCode} error={error}
      />
    )
  }

  const alive = players.filter((p) => p.alive)
  const holder = players.find((p) => p.id === room.bomb_holder_id)
  const iAmHolder = room.bomb_holder_id === me?.id
  const meNow = players.find((p) => p.id === me?.id)
  const iAmOut = meNow && !meNow.alive
  const winner = players.find((p) => p.id === room.winner_id)
  const iAmHost = !!me && room.host_user_id === me.user_id

  if (room.status === 'lobby') {
    return <Lobby room={room} players={players} me={me} iAmHost={iAmHost} onStart={startGame} onLeave={leaveRoom} error={error} />
  }

  // perigo cresce com o tempo decorrido (o tempo real continua secreto).
  // Marcos pensados para uma bomba de 80 a 90s: "critical" só nos últimos ~5-15s.
  const danger = elapsed < 35 ? 1 : elapsed < 60 ? 2 : elapsed < 75 ? 3 : 4

  // milissegundos que faltam pra pergunta atual (o relógio da bomba continua secreto)
  const questionMs = room.question_expires_at
    ? Math.max(0, new Date(room.question_expires_at).getTime() - Date.now())
    : 0

  if (room.status === 'playing') {
    return (
      <Game
        room={room} players={players} me={me} holder={holder} alive={alive}
        iAmHolder={iAmHolder} iAmOut={iAmOut} danger={danger} questionMs={questionMs}
        flash={flash} feedback={feedback} answer={answer} setAnswer={setAnswer}
        answerRef={answerRef} onSubmit={submitAnswer} error={error}
      />
    )
  }

  // status 'finished'
  const lastVictim = players.find((p) => p.id === room.last_victim_id)
  return (
    <Finished
      room={room} players={players} me={me} winner={winner} lastVictim={lastVictim}
      iAmHost={iAmHost} onStart={startGame} onLeave={leaveRoom} flash={flash} error={error}
    />
  )
}