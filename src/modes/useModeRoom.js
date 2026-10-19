import { useEffect, useRef, useState } from 'react'
import { supabase, ensureSession } from '../supabaseClient'
import { saveNickname, loadNickname } from '../roomStorage'
import { store } from '../storageMode'
import { readInviteCode } from '../invite'
import { preloadCharacters } from '../characters'

// A "sala" dos modos de rodada (Guess the Price, Guess the Song...): entrar, criar, voltar depois
// de recarregar, jogadores e sala ao vivo, "ainda estou aqui" e o tique do servidor na partida.
// Cada modo só diz qual é (mode), o endereço (path) e a função que avança o jogo no servidor (tickRpc).
// As salas são as mesmas do Hot Potato (tabela rooms, coluna mode); o servidor barra quem chega
// no meio da partida (supabase/027) e cuida do dono da sala (supabase/013).

function makeCode(extra = 2) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = 'PYTH'
  for (let i = 0; i < extra; i++) code += chars[Math.floor(Math.random() * chars.length)]
  return code
}

const saved = (key) => ({
  load: () => { try { return store()?.getItem(key) ?? null } catch { return null } },
  save: (code) => { try { store()?.setItem(key, code) } catch { /* sem storage: tudo bem */ } },
  clear: () => { try { store()?.removeItem(key) } catch { /* nada a limpar */ } },
})

export default function useModeRoom({ mode, tickRpc }) {
  const remember = useRef(saved(`pythbomb:${mode}-code`)).current
  const [room, setRoom] = useState(null)
  const [me, setMe] = useState(null)
  const [players, setPlayers] = useState([])
  const [invite] = useState(() => readInviteCode())
  const [codeInput, setCodeInput] = useState(invite)
  const [nickname, setNickname] = useState(() => loadNickname())
  const [error, setError] = useState(null)
  const [now, setNow] = useState(() => Date.now())
  const [serverOffset, setServerOffset] = useState(0) // relógio do servidor - relógio daqui (ms)
  // acerto do relógio: só vale a resposta que voltou mais rápido (a mais confiável); a "melhor" envelhece
  // um pouco a cada amostra, pra ir se reajustando. O relógio da tela vai até ela devagarinho (no máximo
  // 40 ms a cada 150 ms), então a contagem nunca dá pulo nem volta um número. Diferença grande
  // (computador com a hora errada) acerta de uma vez — isso acontece no lobby, antes da partida.
  const rttRef = useRef(Infinity)
  const targetOffsetRef = useRef(null)
  const takeClock = (data, t0, t1) => {
    if (typeof data !== 'string' || Number.isNaN(Date.parse(data))) return false // modo que não devolve a hora
    rttRef.current += 15
    if (t1 - t0 <= rttRef.current) {
      rttRef.current = t1 - t0
      targetOffsetRef.current = Date.parse(data) - (t0 + t1) / 2
    }
    return true
  }

  const meRef = useRef(null)
  const statusRef = useRef(null)
  meRef.current = me
  statusRef.current = room?.status
  const roomId = room?.id

  // relógio da tela: anda sempre que estou numa sala (antes só andava na partida, e o 1º quadro da
  // contagem usava uma hora velha do lobby)
  useEffect(() => {
    if (!roomId) return
    const clock = setInterval(() => {
      setNow(Date.now())
      const target = targetOffsetRef.current
      if (target == null) return
      setServerOffset((cur) => {
        const d = target - cur
        if (Math.abs(d) > 1500) return target
        return cur + Math.max(-40, Math.min(40, d))
      })
    }, 150)
    return () => clearInterval(clock)
  }, [roomId])

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
      const code = remember.load()
      if (!code || (invite && code !== invite)) return
      const { data: r } = await supabase.from('rooms').select().eq('code', code).maybeSingle()
      if (!r || r.mode !== mode) return remember.clear()
      const { data: p } = await supabase.from('players').select().eq('room_id', r.id).eq('user_id', user.id).maybeSingle()
      if (!p) return remember.clear()
      setRoom(r)
      setMe(p)
    })()
  }, [invite, mode, remember])

  // jogadores e sala ao vivo (+ recarrega ao voltar pra aba ou à internet)
  useEffect(() => {
    if (!roomId) return
    async function loadPlayers() {
      const { data } = await supabase.from('players').select().eq('room_id', roomId).order('joined_at')
      setPlayers(data ?? [])
      const mine = meRef.current
      if (data && mine && !data.some((p) => p.id === mine.id) && statusRef.current !== 'playing') {
        remember.clear()
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
      .channel(`${mode}-room-${roomId}`)
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
  }, [roomId, mode, remember])

  // durante a partida: cutuca o servidor 1x por segundo (ele avança as rodadas).
  // Se o tique devolver a hora do servidor, acerta o relógio daqui (pra todos ouvirem/verem juntos).
  useEffect(() => {
    if (!roomId || room?.status !== 'playing') return
    let n = 0
    const tick = setInterval(async () => {
      const t0 = Date.now()
      const { data, error: e } = await supabase.rpc(tickRpc, { p_room_id: roomId })
      if (e) console.log('TICK ERROR:', e.message)
      else takeClock(data, t0, Date.now())
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
    return () => clearInterval(tick)
  }, [roomId, room?.status, tickRpc])

  // fora da partida (lobby, fim): já vai acertando o relógio, pra contagem da 1ª rodada não dar pulos.
  // 3 amostras ao entrar e depois uma a cada 5 s — só nos modos cujo tique devolve a hora do servidor.
  const roomStatus = room?.status ?? null
  useEffect(() => {
    if (!roomId || !roomStatus || roomStatus === 'playing') return
    let stop = false
    let id = null
    const sample = async () => {
      const t0 = Date.now()
      const { data, error: e } = await supabase.rpc(tickRpc, { p_room_id: roomId })
      return !stop && !e && takeClock(data, t0, Date.now())
    }
    ;(async () => {
      for (let i = 0; i < 3; i++) if (!(await sample())) return
      if (!stop) id = setInterval(sample, 5000)
    })()
    return () => { stop = true; clearInterval(id) }
  }, [roomId, roomStatus, tickRpc])

  // "ainda estou aqui" a cada 15 s (supabase/013)
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

  async function joinRoom(target) {
    const user = await ensureSession()
    const { data: existing } = await supabase.from('players').select().eq('room_id', target.id).eq('user_id', user.id).maybeSingle()
    if (existing) { setMe(existing); setRoom(target); remember.save(target.code); return }
    if (target.status === 'playing') return setError('This game has already started. Wait for it to end, then join.')
    const { data: player, error: e } = await supabase.from('players')
      .insert({ room_id: target.id, nickname: nickname.trim(), user_id: user.id }).select().single()
    if (e) {
      if (e.code === '23505') {
        const { data: again } = await supabase.from('players').select().eq('room_id', target.id).eq('user_id', user.id).maybeSingle()
        if (again) { setMe(again); setRoom(target); remember.save(target.code); return }
      }
      return setError(e.message)
    }
    setMe(player); setRoom(target); remember.save(target.code)
  }

  async function createRoom() {
    setError(null)
    const nick = nickname.trim()
    if (nick.length < 2) return setError('Pick a nickname first (at least 2 characters)')
    saveNickname(nick)
    let data, e
    for (let i = 0; i < 8; i++) {
      ({ data, error: e } = await supabase.from('rooms').insert({ code: makeCode(i < 5 ? 2 : 3), mode }).select().single())
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
    // código de uma sala de outro modo: manda pro endereço certo
    if (data.mode !== mode) {
      const paths = { classic: '/play', price: '/price', song: '/song' }
      window.location.href = (paths[data.mode] ?? '/play') + '?room=' + code
      return
    }
    joinRoom(data)
  }

  function leaveRoom() {
    if (room) supabase.rpc('leave_room', { p_room_id: room.id }).then(() => {}, () => {})
    remember.clear()
    setRoom(null); setMe(null); setPlayers([]); setError(null)
  }

  async function pickCharacter(idx) {
    setError(null)
    const { error: e } = await supabase.rpc('pick_character', { p_room_id: room.id, p_idx: idx })
    if (e) setError(e.message)
  }

  return {
    room, me, players, invite, codeInput, setCodeInput, nickname, setNickname, error, setError,
    now, serverNow: now + serverOffset, iAmHost: !!me && room?.host_user_id === me.user_id,
    createRoom, joinByCode, leaveRoom, pickCharacter,
  }
}
