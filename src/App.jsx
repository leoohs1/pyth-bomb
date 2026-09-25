import { useEffect, useState, useRef } from 'react'
import { supabase, ensureSession } from './supabaseClient'
import Home from './Home'

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
  const [nickname, setNickname] = useState('')
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

  useEffect(() => {
    ensureSession().catch((e) => setError(e.message))
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

    return () => { supabase.removeChannel(channel) }
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
      setFlash(`💥 ${victim.nickname} GOT RUGGED!`)
      setTimeout(() => setFlash(null), 3000)
    }
  }, [room?.last_event_at, room?.last_victim_id, players])

  async function joinRoom(targetRoom) {
    const user = await ensureSession()
    const { data: player, error: e } = await supabase
      .from('players')
      .insert({ room_id: targetRoom.id, nickname: nickname.trim(), user_id: user.id })
      .select().single()
    if (e) return setError(e.message)
    setMe(player)
    setRoom(targetRoom)
  }

  async function createRoom() {
    setError(null)
    if (!nickname.trim()) return setError('Pick a nickname first')
    const { data, error: e } = await supabase.from('rooms').insert({ code: makeCode() }).select().single()
    if (e) return setError(e.message)
    joinRoom(data)
  }

  async function joinByCode() {
    setError(null)
    if (!nickname.trim()) return setError('Pick a nickname first')
    const { data, error: e } = await supabase
      .from('rooms').select().eq('code', codeInput.trim().toUpperCase()).single()
    if (e) return setError('Room not found')
    joinRoom(data)
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

  const input = { padding: 10, marginRight: 8, fontSize: 16 }
  const page = { padding: 40, fontFamily: 'sans-serif', color: '#EDEAF8' }

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

  // perigo cresce com o tempo decorrido (o tempo real continua secreto)
  const danger = elapsed < 12 ? 1 : elapsed < 22 ? 2 : elapsed < 30 ? 3 : 4
  const bombSize = [0, 34, 44, 58, 74][danger]
  const dangerText = ['', 'safe', 'warming up', 'DANGER', 'CRITICAL'][danger]

  // segundos que faltam pra pergunta atual (o relógio da bomba continua secreto)
  const questionLeft = room.question_expires_at
    ? Math.max(0, Math.ceil((new Date(room.question_expires_at).getTime() - Date.now()) / 1000))
    : 0

  return (
    <div style={page}>
      <h1>PYTH BOMB</h1>
      <p>Room: <strong style={{ fontSize: 28 }}>{room.code}</strong> · Round {room.round_number} · {alive.length} alive</p>

      {flash && <h2 style={{ color: '#FF8AA8' }}>{flash}</h2>}

      {room.status === 'lobby' && (
        iAmHost
          ? <button onClick={startGame} style={input}>START GAME</button>
          : <p style={{ color: '#948CBC' }}>Waiting for the host to start...</p>
      )}

      {room.status === 'finished' && (
        <h2 style={{ color: '#EBD28A' }}>
          🏆 {winner ? `${winner.nickname} SURVIVED THE PYTH BOMB` : 'Game over'}
          <br />
          {iAmHost
            ? <button onClick={startGame} style={{ ...input, marginTop: 16 }}>PLAY AGAIN</button>
            : <span style={{ fontSize: 16, color: '#948CBC' }}>Waiting for the host to play again...</span>}
        </h2>
      )}

      {room.status === 'playing' && (
        <div style={{ margin: '24px 0' }}>
          <div style={{ fontSize: bombSize, lineHeight: 1 }}>💣</div>
          <p style={{ color: danger >= 3 ? '#FF8AA8' : '#948CBC' }}>{dangerText}</p>

          {iAmOut ? (
            <p>☠️ you are out — watching</p>
          ) : iAmHolder ? (
            <p style={{ fontSize: 22 }}><strong>YOU HAVE THE BOMB — answer to pass it!</strong></p>
          ) : (
            <p style={{ fontSize: 20 }}><strong>{holder?.nickname ?? '...'}</strong> has the bomb</p>
          )}

          {room.current_question_text && (
            <div style={{ margin: '16px 0' }}>
              <p style={{ fontSize: 24, margin: 0 }}>{room.current_question_text}</p>
              <p style={{ color: questionLeft <= 3 ? '#FF8AA8' : '#948CBC' }}>⏱ {questionLeft}s</p>
            </div>
          )}

          {iAmHolder && !iAmOut && (
            <form onSubmit={submitAnswer}>
              <input ref={answerRef} autoFocus value={answer} placeholder="type your answer"
                onChange={(e) => setAnswer(e.target.value)} style={{ ...input, fontSize: 20 }} />
              <button type="submit" style={{ ...input, fontSize: 20 }}>ANSWER</button>
            </form>
          )}
          {feedback && <p style={{ fontSize: 20, color: '#FF8AA8' }}>{feedback}</p>}
        </div>
      )}

      <h3>Players ({alive.length}/{players.length} alive)</h3>
      <ul>
        {players.map((p) => (
          <li key={p.id} style={{ opacity: p.alive ? 1 : 0.45 }}>
            {p.id === room.bomb_holder_id && '💣 '}
            {p.alive ? '' : '☠️ '}
            {p.nickname} {p.id === me?.id && '(you)'}
          </li>
        ))}
      </ul>

      {error && <p style={{ color: 'salmon' }}>{error}</p>}
    </div>
  )
}