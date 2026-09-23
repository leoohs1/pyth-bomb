import { useEffect, useState } from 'react'
import { supabase, ensureSession } from './supabaseClient'

function makeCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = 'PYTH'
  for (let i = 0; i < 2; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

export default function App() {
  const [room, setRoom] = useState(null)
  const [me, setMe] = useState(null)
  const [players, setPlayers] = useState([])
  const [codeInput, setCodeInput] = useState('')
  const [nickname, setNickname] = useState('')
  const [error, setError] = useState(null)
  
  const roomId = room?.id

  // pega o crachá anônimo assim que a página abre
  useEffect(() => {
    ensureSession().catch((e) => setError(e.message))
  }, [])
  // pega o crachá anônimo assim que a página abre
  useEffect(() => {
    ensureSession().catch((e) => setError(e.message))
  }, [])

  // escuta jogadores entrando e a bomba mudando de mão
  useEffect(() => {
    if (!roomId) return

    async function loadPlayers() {
      const { data } = await supabase
        .from('players')
        .select()
        .eq('room_id', roomId)
        .order('joined_at')
      setPlayers(data ?? [])
    }

    loadPlayers()

    const channel = supabase
      .channel('room-' + roomId)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'players', filter: `room_id=eq.${roomId}` },
        () => loadPlayers()
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
        (payload) => setRoom(payload.new)
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [roomId])

    async function joinRoom(targetRoom) {
    const user = await ensureSession()
    const { data: player, error: playerError } = await supabase
      .from('players')
      .insert({ room_id: targetRoom.id, nickname: nickname.trim(), user_id: user.id })
      .select()
      .single()

    if (playerError) return setError(playerError.message)
    setMe(player)
    setRoom(targetRoom)
  }

  async function createRoom() {
    setError(null)
    if (!nickname.trim()) return setError('Pick a nickname first')

    const { data: newRoom, error: roomError } = await supabase
      .from('rooms')
      .insert({ code: makeCode() })
      .select()
      .single()

    if (roomError) return setError(roomError.message)
    joinRoom(newRoom)
  }

  async function joinByCode() {
    setError(null)
    if (!nickname.trim()) return setError('Pick a nickname first')

    const { data: found, error: findError } = await supabase
      .from('rooms')
      .select()
      .eq('code', codeInput.trim().toUpperCase())
      .single()

    if (findError) return setError('Room not found')
    joinRoom(found)
  }

  async function startGame() {
    setError(null)
    const { error } = await supabase.rpc('start_game', { p_room_id: room.id })
    if (error) setError(error.message)
  }

  async function passBomb() {
    setError(null)
    const { error } = await supabase.rpc('pass_bomb', {
      p_room_id: room.id,
      p_player_id: me.id,
    })
    if (error) setError(error.message)
  }

  const input = { padding: 10, marginRight: 8, fontSize: 16 }
  const page = { padding: 40, fontFamily: 'sans-serif', color: '#EDEAF8' }

  if (room) {
    const holder = players.find((p) => p.id === room.bomb_holder_id)
    const iHaveTheBomb = room.bomb_holder_id === me?.id

    return (
      <div style={page}>
        <h1>PYTH BOMB</h1>
        <p>Room: <strong style={{ fontSize: 28 }}>{room.code}</strong></p>
        <p>You are: <strong>{me?.nickname}</strong></p>

        {room.status === 'lobby' && (
          <button onClick={startGame} style={input}>START GAME</button>
        )}

        {room.status === 'playing' && (
          <div style={{ margin: '24px 0', fontSize: 24 }}>
            {iHaveTheBomb ? (
              <>
                <p>💣 <strong>YOU HAVE THE BOMB</strong></p>
                <button onClick={passBomb} style={{ ...input, fontSize: 22 }}>
                  PASS THE BOMB
                </button>
              </>
            ) : (
              <p>💣 <strong>{holder?.nickname ?? '...'}</strong> has the bomb</p>
            )}
          </div>
        )}

        <h3>Players ({players.length}/20)</h3>
        <ul>
          {players.map((p) => (
            <li key={p.id}>
              {p.id === room.bomb_holder_id && '💣 '}
              {p.nickname} {p.id === me?.id && '(you)'}
            </li>
          ))}
        </ul>

        {error && <p style={{ color: 'salmon' }}>{error}</p>}
      </div>
    )
  }

  return (
    <div style={page}>
      <h1>PYTH BOMB</h1>

      <p>
        <input
          placeholder="your nickname"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          style={input}
        />
      </p>

      <p>
        <button onClick={createRoom} style={input}>CREATE ROOM</button>
      </p>

      <p>
        <input
          placeholder="room code"
          value={codeInput}
          onChange={(e) => setCodeInput(e.target.value)}
          style={input}
        />
        <button onClick={joinByCode} style={input}>JOIN</button>
      </p>

      {error && <p style={{ color: 'salmon' }}>{error}</p>}
    </div>
  )
}