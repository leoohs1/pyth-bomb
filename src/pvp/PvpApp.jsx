// Pyth Bomb PVP de verdade (/pvp): conversa com o servidor de jogo (server/) e mostra cada tela do torneio.
//   sem torneio -> entrar (apelido, herói, criar ou entrar com código)
//   lobby -> sorteio das salas -> partida -> (ganhou: espera a próxima sala | perdeu: assiste) -> campeão
// Endereço com código: /pvp?code=ABC123 (o link que o "Copy link" copia). ?tab=1 = cada aba é um jogador (teste).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import GameArenaV2 from '../GameArenaV2'
import Confetti from '../Confetti.jsx'
import { supabase, ensureSession } from '../supabaseClient'
import { loadNickname, saveNickname } from '../roomStorage'
import { store } from '../storageMode'
import { connectPvp } from './net.js'
import { useSoloAudio, PVP_MUSIC } from './useSoloAudio.js'
import OnlineMatch from './OnlineMatch.jsx'
import { EntryPanel, LobbyPanel, DrawingPanel, DrawPanel, WaitPanel, ChampionPanel } from './screens.jsx'
import './pvp.css'

const HERO_KEY = 'pvp_hero'
const loadHero = () => { try { return store().getItem(HERO_KEY) || 'pirb' } catch { return 'pirb' } }
const saveHero = (h) => { try { store().setItem(HERO_KEY, h) } catch { /* sem armazenamento */ } }

const codeFromUrl = () => (new URLSearchParams(window.location.search).get('code') ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
function setUrlCode(code) {
  const q = new URLSearchParams(window.location.search)
  if (code) q.set('code', code); else q.delete('code')
  const rest = q.toString()
  window.history.replaceState(null, '', window.location.pathname + (rest ? '?' + rest : ''))
}

export default function PvpApp() {
  const [status, setStatus] = useState('connecting')
  const [meId, setMeId] = useState(null)
  const [testBots, setTestBots] = useState(false)
  const [tour, setTour] = useState(null)
  const [error, setError] = useState('')
  const [name, setName] = useState(() => loadNickname() ?? '')
  const [hero, setHero] = useState(loadHero)
  const [code, setCode] = useState(codeFromUrl)
  const [watching, setWatching] = useState(null) // sala escolhida pra assistir
  const [hasFeed, setHasFeed] = useState(false)  // chegou alguma sala pra desenhar
  const [kicked, setKicked] = useState(false)
  const feedRef = useRef(null)
  const netRef = useRef(null)
  const wantRef = useRef({ code: codeFromUrl(), name: loadNickname() ?? '', hero: loadHero() }) // reentrar sozinho depois de cair

  useEffect(() => {
    const net = connectPvp({
      getToken: async () => {
        await ensureSession()
        const { data } = await supabase.auth.getSession()
        return data.session?.access_token ?? null
      },
      onStatus: setStatus,
      onMessage: (m) => {
        if (m.t === 'hello') {
          setMeId(m.id)
          setTestBots(!!m.testBots)
          const w = wantRef.current
          if (w.code && w.name.trim().length >= 2) net.send({ t: 'join', code: w.code, name: w.name, hero: w.hero }) // volta pro torneio
        } else if (m.t === 'joined') {
          wantRef.current.code = m.code
          setCode(m.code)
          setUrlCode(m.code)
          setError('')
        } else if (m.t === 'tour') {
          setTour(m)
        } else if (m.t === 'init') {
          feedRef.current = { init: m, snaps: [], events: [] }
          setHasFeed(true)
        } else if (m.t === 'snap') {
          const f = feedRef.current
          if (!f || f.init.roomId !== m.room) return
          m._at = performance.now() / 1000
          f.snaps.push(m)
          if (f.snaps.length > 8) f.snaps.shift()
          if (m.ev?.length) f.events.push(...m.ev)
        } else if (m.t === 'noroom') {
          feedRef.current = null
          setHasFeed(false)
          setWatching(null)
        } else if (m.t === 'left') {
          setTour(null)
          feedRef.current = null
          setHasFeed(false)
        } else if (m.t === 'error') {
          setError(m.error)
          // código que não existe mais: esquece, pra não ficar tentando
          if (/not found/i.test(m.error)) { wantRef.current.code = ''; setUrlCode('') }
        } else if (m.t === 'pong') {
          // tempo de ida e volta até o servidor (o OnlineMatch usa pra prever o próprio boneco)
          const rtt = performance.now() / 1000 - m.at
          const f = feedRef.current
          if (f && rtt >= 0 && rtt < 3) f.rtt = f.rtt == null ? rtt : f.rtt * 0.8 + rtt * 0.2
        } else if (m.t === 'kicked') {
          setKicked(true)
        }
      },
    })
    netRef.current = net
    if (import.meta.env.DEV) window.__pvpFeed = () => feedRef.current // só no desenvolvimento: deixa os testes olharem a sala
    return () => net.close()
  }, [])

  const send = useCallback((o) => netRef.current?.send(o), [])
  const remember = () => {
    const nm = name.trim()
    saveNickname(nm)
    saveHero(hero)
    wantRef.current = { ...wantRef.current, name: nm, hero }
    return nm
  }
  const onCreate = () => { const nm = remember(); setError(''); send({ t: 'create', name: nm, hero }) }
  const onJoin = () => { const nm = remember(); setError(''); wantRef.current.code = code; send({ t: 'join', code, name: nm, hero }) }
  const onLeave = () => {
    send({ t: 'leave' })
    wantRef.current.code = ''
    setUrlCode('')
    setCode('')
    setTour(null)
    setWatching(null)
  }
  const onHero = (h) => { setHero(h); saveHero(h); wantRef.current.hero = h; send({ t: 'hero', hero: h }) }
  const onWatch = (roomId) => { setWatching(roomId); send({ t: 'watch', room: roomId }) }
  const stopWatching = () => { setWatching(null); send({ t: 'watch', room: null }) }

  const me = tour?.players.find((p) => p.id === meId) ?? null
  // tela do campeão: música da vitória do Solo (a partida tem a música do mapa, dentro do OnlineMatch)
  const inMatch = me?.st === 'playing' || !!watching
  useSoloAudio(tour?.status === 'done' && !inMatch ? PVP_MUSIC.victory : null)
  const myRoom = useMemo(() => {
    if (!tour || !me?.room) return null
    for (const r of tour.rounds) { const x = r.rooms.find((q) => q.id === me.room); if (x) return x }
    return null
  }, [tour, me?.room])

  // ---- o que mostrar
  const playingNow = me?.st === 'playing' && myRoom?.st === 'playing' && hasFeed
  if (playingNow) {
    return <OnlineMatch feedRef={feedRef} meId={meId} send={send} />
  }
  if (watching && hasFeed && me?.st !== 'playing') {
    return <OnlineMatch feedRef={feedRef} meId={meId} spectating send={send} onBack={stopWatching} title="WATCHING" />
  }

  const room = { id: tour?.code ?? 'pvp', code: tour?.code ?? '', status: tour?.status === 'lobby' || !tour ? 'lobby' : 'playing', mode: 'pvp', round_number: 1, host_user_id: tour?.host }
  const arenaPlayers = (tour?.players ?? []).filter((p) => p.st !== 'spectator').map((p) => ({ id: p.id, user_id: p.id, nickname: p.name, alive: p.st !== 'out', hero: p.hero }))
  const common = { room, players: arenaPlayers, alive: arenaPlayers, danger: 1, questionMs: 0, myPlayerId: meId, hideCrowd: true, maxPlayers: tour?.max ?? 20, onLeave: tour ? onLeave : null }

  let panel, chip, confetti = false
  if (kicked) {
    chip = 'Pyth Bomb PVP'
    panel = <><p className="ga-mode-name">⚔️ PVP</p><p className="ga-hint">You opened the game in another tab. Keep playing there.</p></>
  } else if (!tour) {
    chip = 'Pyth Bomb PVP'
    panel = <EntryPanel name={name} setName={setName} hero={hero} setHero={setHero} code={code} setCode={setCode}
      onCreate={onCreate} onJoin={onJoin} busy={status !== 'open'} error={error} status={status} />
  } else if (tour.status === 'lobby') {
    chip = 'Lobby · Pyth Bomb PVP'
    panel = <LobbyPanel tour={tour} meId={meId} onHero={onHero} onStart={() => { setError(''); send({ t: 'start' }) }}
      onBot={() => send({ t: 'bot' })} onFill={(on) => send({ t: 'fill', on })} testBots={testBots} onLeave={onLeave} error={error} />
  } else if (tour.status === 'drawing') {
    chip = 'Drawing · Pyth Bomb PVP'
    panel = <DrawingPanel tour={tour} />
  } else if (tour.status === 'done') {
    chip = 'Champion · Pyth Bomb PVP'
    confetti = true
    panel = <ChampionPanel tour={tour} meId={meId} onNew={() => { onLeave(); setTimeout(() => send({ t: 'create', name: name.trim() || 'Host', hero }), 50) }} onLeave={onLeave} />
  } else if (me?.st === 'playing' && myRoom) {
    chip = 'Your room · Pyth Bomb PVP'
    panel = <DrawPanel tour={tour} meId={meId} room={myRoom} />
  } else {
    chip = me?.st === 'waiting' ? 'Next room · Pyth Bomb PVP' : 'Spectating · Pyth Bomb PVP'
    panel = <WaitPanel tour={tour} meId={meId} onWatch={onWatch} onLeave={onLeave} />
  }

  return (
    <>
      <GameArenaV2 {...common} phase="pvp" chip={chip} panel={<div className="pv-panel">{panel}</div>} />
      {confetti && <Confetti />}
      {tour && status !== 'open' && <div className="pv-netbar" role="status">Reconnecting to the game server…</div>}
    </>
  )
}
