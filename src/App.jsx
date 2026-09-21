import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

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

  // quando entrar numa sala: carrega os jogadores e escuta mudanças
  useEffect(() => {
    if (!room) return

    async function loadPlayers() {
      const { data } = await supabase
        .from('players')
        .select()
        .eq('room_id', room.id)
        .order('joined_at')
      setPlayers(data ?? [])
    }

    loadPlayers()

    const channel = supabase
      .channel('room-' + room.id)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'players', filter: `room_id=eq.${room.id}` },
        () => loadPlayers()
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [room])

  async function joinRoom(targetRoom) {
    const { data: player, error: playerError } = await supabase
      .from('players')
      .insert({ room_id: targetRoom.id, nickname: nickname.trim() })
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

  const input = { padding: 10, marginRight: 8, fontSize: 16 }
  const page = { padding: 40, fontFamily: 'sans-serif', color: '#EDEAF8' }

  if (room) {
    return (
      <div style={page}>
        <h1>PYTH BOMB</h1>
        <p>Room: <strong style={{ fontSize: 28 }}>{room.code}</strong></p>
        <p>You are: <strong>{me?.nickname}</strong></p>

        <h3>Players ({players.length}/20)</h3>
        <ul>
          {players.map((p) => (
            <li key={p.id}>
              {p.nickname} {p.id === me?.id && '(you)'}
            </li>
          ))}
        </ul>
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