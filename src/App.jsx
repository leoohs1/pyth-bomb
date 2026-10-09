import { useEffect, useState, useRef } from 'react'
import { supabase, ensureSession } from './supabaseClient'
import { saveRoomCode, loadRoomCode, clearRoomCode, saveNickname, loadNickname } from './roomStorage'
import Modes from './Modes'
import Home from './Home'
import GameArenaV2 from './GameArenaV2'
import { LobbyPanel, FinishedPanel } from './ArenaPanels'
import { preloadCharacters } from './characters'

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
  // tela de modos: hoje só existe o Classic, mas a "porta de entrada" já está pronta
  // pro Solo e a Arena, que chegam mais pra frente
  const [mode, setMode] = useState(null)
  const [error, setError] = useState(null)
  const [elapsed, setElapsed] = useState(0)

  const roomId = room?.id
  const lastEventRef = useRef(null)
  const [flash, setFlash] = useState(null)
  const [answer, setAnswer] = useState('')
  const [feedback, setFeedback] = useState(null)
  const answerRef = useRef(null)
  const meRef = useRef(null)
  const statusRef = useRef(null)
  meRef.current = me
  statusRef.current = room?.status

  // baixa as imagens dos personagens em segundo plano (a arena abre sem "pipocar")
  useEffect(() => {
    const id = setTimeout(preloadCharacters, 1200)
    return () => clearTimeout(id)
  }, [])

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
      // fui removido por inatividade (lobby / fim de jogo)? volta pra tela inicial com um aviso
      const mine = meRef.current
      if (data && mine && !data.some((p) => p.id === mine.id) && statusRef.current !== 'playing') {
        clearRoomCode()
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
    let n = 0
    const id = setInterval(async () => {
      const { error } = await supabase.rpc('tick', { p_room_id: roomId })
      if (error) console.log('TICK ERROR:', error.message)
      // rede de segurança: o tempo real pode falhar no celular (tela apagou, sinal fraco). A cada
      // 3 s confere a sala e a cada 6 s os jogadores, e só atualiza se algo mudou. Assim a bomba, a
      // eliminação e o aviso de explosão chegam mesmo se o aviso ao vivo se perder.
      n++
      if (n % 3 === 0) {
        const { data: r } = await supabase.from('rooms').select().eq('id', roomId).single()
        // (nunca aceita uma versão MAIS VELHA da sala que a já mostrada: resposta atrasada)
        if (r) setRoom((old) => {
          if (old && JSON.stringify(old) === JSON.stringify(r)) return old
          if (old && (r.round_number < old.round_number || (old.last_event_at && r.last_event_at && new Date(r.last_event_at) < new Date(old.last_event_at)))) return old
          return r
        })
      }
      if (n % 6 === 0) {
        const { data: ps } = await supabase.from('players').select().eq('room_id', roomId).order('joined_at')
        if (ps) setPlayers((old) => (JSON.stringify(old) === JSON.stringify(ps) ? old : ps))
      }
    }, 1000)
    return () => clearInterval(id)
  }, [roomId, room?.status])

  // "ainda estou aqui": a cada 15 s o servidor sabe quem está presente. Quem some do lobby é
  // removido; se o dono sumir, o próximo a ter entrado vira o dono (supabase/013).
  useEffect(() => {
    if (!roomId || !me) return
    let stopped = false
    async function beat() {
      const { error: e } = await supabase.rpc('heartbeat', { p_room_id: roomId })
      if (e || stopped) return // SQL 013 ainda não rodado, ou sem internet: segue sem
      if (statusRef.current === 'playing') return
      // lobby / fim: pode ter saído gente ou mudado o dono -> atualiza
      const [{ data: ps }, { data: r }] = await Promise.all([
        supabase.from('players').select().eq('room_id', roomId).order('joined_at'),
        supabase.from('rooms').select().eq('id', roomId).single(),
      ])
      if (stopped) return
      if (ps) {
        setPlayers(ps)
        const mine = meRef.current
        if (mine && !ps.some((p) => p.id === mine.id) && statusRef.current !== 'playing') {
          clearRoomCode()
          setRoom(null); setMe(null); setPlayers([])
          setError('You were removed from the room because you were away. Join again with the code.')
          return
        }
      }
      if (r) setRoom(r)
    }
    beat()
    const id = setInterval(beat, 15000)
    return () => { stopped = true; clearInterval(id) }
  }, [roomId, me?.id])

  // avisa quem explodiu
  useEffect(() => {
    if (!room?.last_event_at) return
    // só dispara pra explosão NOVA (mais recente que a última avisada), nunca pra uma antiga
    if (lastEventRef.current && new Date(room.last_event_at) <= new Date(lastEventRef.current)) return
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
    if (nick.length < 2) return setError('Pick a nickname first (at least 2 characters)')
    saveNickname(nick)
    const { data, error: e } = await supabase.from('rooms').insert({ code: makeCode() }).select().single()
    if (e) return setError(e.message)
    joinRoom(data)
  }

  async function joinByCode() {
    setError(null)
    const nick = nickname.trim()
    if (nick.length < 2) return setError('Pick a nickname first (at least 2 characters)')
    // o teclado do celular pode meter espaço, hífen ou letra minúscula: fica só letra e número, em maiúscula
    const code = codeInput.replace(/[^a-z0-9]/gi, '').toUpperCase()
    if (!code) return setError('Type the room code first')
    saveNickname(nick)
    const { data, error: e } = await supabase
      .from('rooms').select().eq('code', code).maybeSingle()
    if (e) {
      console.warn('join error:', e)
      return setError('Could not reach the game server. Check your connection and try again.')
    }
    if (!data) return setError('Room not found. Check the code (' + code + ').')
    joinRoom(data)
  }

  // sai da sala guardada no navegador; não mexe no jogo em si nem apaga o jogador
  function leaveRoom() {
    if (room) supabase.rpc('leave_room', { p_room_id: room.id }).then(() => {}, () => {}) // tira meu jogador do lobby e passa o dono pra frente
    clearRoomCode()
    setRoom(null)
    setMe(null)
    setPlayers([])
    setError(null)
  }

  async function pickCharacter(idx) {
    setError(null)
    const { error: e } = await supabase.rpc('pick_character', { p_room_id: room.id, p_idx: idx })
    if (e) setError(e.message)
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
    else if (data === 'exploded') setFeedback('💥 5 mistakes — boom!')
    else setFeedback(null)
    if (data !== 'correct') setTimeout(() => setFeedback(null), 1200)
    setAnswer('')
    answerRef.current?.focus()
  }

  if (!room) {
    if (mode !== 'classic') {
      return <Modes onSelectClassic={() => setMode('classic')} />
    }
    return (
      <Home
        nickname={nickname} setNickname={setNickname}
        codeInput={codeInput} setCodeInput={setCodeInput}
        onCreate={createRoom} onJoin={joinByCode} onBack={() => setMode(null)} error={error}
      />
    )
  }

  const alive = players.filter((p) => p.alive)
  const winner = players.find((p) => p.id === room.winner_id)
  const iAmHost = !!me && room.host_user_id === me.user_id

  if (room.status === 'lobby') {
    return (
      <GameArenaV2
        room={room} players={players} alive={alive} danger={1} questionMs={0}
        myPlayerId={me?.id} phase="lobby" onLeave={leaveRoom}
        panel={<LobbyPanel room={room} players={players} me={me} iAmHost={iAmHost} onStart={startGame} onLeave={leaveRoom} onPick={pickCharacter} error={error} />}
      />
    )
  }

  // perigo cresce com o tempo decorrido (o tempo real continua secreto).
  // Marcos pensados para uma bomba de 55 a 65s: "critical" só nos últimos ~5-15s.
  const danger = elapsed < 20 ? 1 : elapsed < 35 ? 2 : elapsed < 50 ? 3 : 4

  // milissegundos que faltam pra pergunta atual (o relógio da bomba continua secreto)
  const questionMs = room.question_expires_at
    ? Math.max(0, new Date(room.question_expires_at).getTime() - Date.now())
    : 0

  if (room.status === 'playing') {
    return (
      <GameArenaV2
        room={room} players={players} alive={alive} danger={danger} questionMs={questionMs}
        answer={answer} setAnswer={setAnswer} answerRef={answerRef} onSubmit={submitAnswer}
        error={error} myPlayerId={me?.id} flash={flash} feedback={feedback} onLeave={leaveRoom}
        mistakes={room.holder_mistakes ?? 0}
      />
    )
  }

  // status 'finished': a mesma arena, com o vencedor no centro
  const meNow = players.find((p) => p.id === me?.id)
  return (
    <GameArenaV2
      room={room} players={players} alive={alive} danger={1} questionMs={0}
      myPlayerId={me?.id} phase="finished" centerId={winner?.id} flash={flash} onLeave={leaveRoom}
      panel={
        <FinishedPanel
          room={room} winner={winner} iWon={!!winner && winner.id === me?.id}
          iAmOut={!!meNow && !meNow.alive} iAmHost={iAmHost}
          onStart={startGame} onLeave={leaveRoom} error={error}
        />
      }
    />
  )
}
