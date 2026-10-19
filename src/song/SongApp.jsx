import { useEffect, useRef, useState } from 'react'
import { supabase } from '../supabaseClient'
import Home from '../Home'
import GameArenaV2 from '../GameArenaV2'
import { LobbyPanel, FinishedPanel } from '../ArenaPanels'
import useChat from '../useChat'
import useModeRoom from '../modes/useModeRoom'
import useModeTheme from '../modes/useModeTheme'
import ScoreList from '../modes/ScoreList'
import { ReadyPanel, ListenPanel, RevealPanel } from './SongPanels'
import { play } from '../sound'
import { setMusicSilenced } from '../music'
import './song.css'

// Guess the Song: toca um trecho de música (o mesmo, na mesma hora, pra todo mundo) e a turma
// digita o artista ou o nome da música. Mais rápido = mais pontos; 10 rodadas.
// Sala, lobby, chat, personagens e arena são os mesmos dos outros modos (src/modes/useModeRoom.js);
// as regras ficam no servidor (supabase/song/S01_guess_the_song.sql). Endereço: /song.
// O trecho vem da prévia oficial de 30 s do Deezer (o servidor pega um link novo a cada rodada,
// supabase/song/S01b) ou de um arquivo na pasta "songs" do Supabase (fora do GitHub).

const ROUNDS = 10
const PATH = '/song'
// áudio vazio (só pra "destravar" o som no celular no primeiro toque)
const SILENT = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA='

const clipUrl = (file) => supabase.storage.from('songs').getPublicUrl(file).data.publicUrl

const FEEDBACK = {
  artist: { kind: 'hit', text: '🎤 Artist found!' },
  title: { kind: 'hit', text: '🎵 Song found!' },
  both: { kind: 'hit', text: '🎉 Artist and song found!' },
  close: { kind: 'close', text: 'So close! Check the spelling' },
  wrong: { kind: 'wrong', text: '✗ Nope, try again' },
  late: { kind: 'wrong', text: 'Too late! The round is over' },
  closed: { kind: 'wrong', text: 'Wait for the music to start' },
}

export default function SongApp() {
  const R = useModeRoom({ mode: 'song', tickRpc: 'song_tick' })
  const { room, me, players, error, setError, serverNow } = R
  const chat = useChat(room?.id)
  useModeTheme('song')
  const [text, setText] = useState('')
  const [feedback, setFeedback] = useState(null)
  const inputRef = useRef(null)
  const audioRef = useRef(null)
  const startedRef = useRef(null) // arquivo do trecho que já começou a tocar

  // o tocador (um só, reaproveitado em todas as rodadas: o celular libera o som uma vez)
  useEffect(() => {
    const a = new Audio()
    a.preload = 'auto'
    a.loop = true // o trecho repete até a rodada acabar
    audioRef.current = a
    const unlock = () => {
      if (a.src) return
      a.src = SILENT
      a.play().then(() => a.pause()).catch(() => {})
    }
    window.addEventListener('pointerdown', unlock, { once: true })
    window.addEventListener('keydown', unlock, { once: true })
    return () => {
      a.pause()
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
  }, [])

  // durante a partida a música de fundo fica muda (só o trecho toca)
  useEffect(() => {
    setMusicSilenced(room?.status === 'playing')
    return () => setMusicSilenced(false)
  }, [room?.status])

  // de onde vem o trecho: prévia do Deezer (link novo a cada rodada) ou arquivo na pasta 'songs'
  const sr = room?.status === 'playing' ? room.song_round : null
  const file = sr?.url ?? (sr?.file ? clipUrl(sr.file) : null)
  const listenAt = room?.song_round?.listen_at ? Date.parse(room.song_round.listen_at) : null
  const listenSecs = room?.song_round?.listen_secs ?? 20
  const phase = room?.status === 'playing' ? room.song_phase : null

  // rodada nova: já baixa o trecho enquanto a contagem roda
  useEffect(() => {
    const a = audioRef.current
    if (!a || !file) return
    a.pause()
    a.src = file
    a.load()
    startedRef.current = null
    setText('')
    setFeedback(null)
  }, [file])

  // começa a tocar na hora marcada pelo servidor (todo mundo junto) e para na revelação
  useEffect(() => {
    const a = audioRef.current
    if (!a || !file || !listenAt) return
    const inListen = serverNow >= listenAt && serverNow < listenAt + listenSecs * 1000 && phase !== 'reveal'
    if (inListen && startedRef.current !== file) {
      startedRef.current = file
      const late = (serverNow - listenAt) / 1000
      try { if (late > 0.3 && a.duration) a.currentTime = late % a.duration } catch { /* ainda carregando */ }
      a.play().catch(() => setFeedback({ kind: 'close', text: 'Tap anywhere to turn the sound on' }))
    } else if (!inListen && !a.paused) {
      a.pause()
    }
  }, [serverNow, file, listenAt, listenSecs, phase])

  // se o celular bloqueou o som, o primeiro toque na tela já toca
  useEffect(() => {
    const resume = () => {
      const a = audioRef.current
      if (a && startedRef.current && a.paused && phase === 'listen') a.play().catch(() => {})
    }
    window.addEventListener('pointerdown', resume)
    return () => window.removeEventListener('pointerdown', resume)
  }, [phase])

  async function startGame() {
    setError(null)
    const { error: e } = await supabase.rpc('song_start_game', { p_room_id: room.id, p_rounds: ROUNDS })
    if (e) setError(e.message)
  }

  async function submitGuess(value) {
    setError(null)
    setText('')
    const { data, error: e } = await supabase.rpc('song_submit_guess', { p_room_id: room.id, p_text: value })
    if (e) return setError(e.message)
    const res = data?.result
    const fb = FEEDBACK[res]
    setFeedback(fb ? { ...fb, text: fb.text + (data.points ? ` +${data.points}` : '') + (data.first ? ' · FIRST!' : '') } : null)
    if (res === 'both' || data?.first) play('perfect')
    else if (res === 'artist' || res === 'title') play('cash')
    else if (res === 'wrong') play('wrong')
    inputRef.current?.focus()
  }

  if (!room) {
    return (
      <Home
        nickname={R.nickname} setNickname={R.setNickname}
        codeInput={R.codeInput} setCodeInput={R.setCodeInput}
        onCreate={R.createRoom} onJoin={R.joinByCode} onBack={() => { window.location.href = '/play' }}
        error={error} invite={R.invite} subtitle="Guess the Song"
      />
    )
  }

  const common = { room, players, alive: players, danger: 1, questionMs: 0, myPlayerId: me?.id, onLeave: R.leaveRoom, chat }

  if (room.status === 'lobby') {
    return (
      <GameArenaV2 {...common} phase="lobby" chip="Lobby · Guess the Song"
        panel={<LobbyPanel room={room} players={players} me={me} iAmHost={R.iAmHost} onStart={startGame} onLeave={R.leaveRoom}
          onPick={R.pickCharacter} error={error} subtitle="🎵 Guess the Song" invitePath={PATH} />}
      />
    )
  }

  if (room.status === 'playing') {
    const chip = `Round ${room.round_number}/${room.song_total ?? ROUNDS} · Guess the Song`
    let panel
    if (phase === 'reveal') {
      const ms = room.question_expires_at ? Math.max(0, Date.parse(room.question_expires_at) - serverNow) : 0
      panel = <RevealPanel room={room} players={players} me={me} msLeft={ms} />
    } else if (!listenAt || serverNow < listenAt) {
      panel = <ReadyPanel room={room} msToStart={listenAt ? listenAt - serverNow : 3000} />
    } else {
      const ms = Math.max(0, listenAt + listenSecs * 1000 - serverNow)
      panel = <ListenPanel room={room} players={players} me={me} msLeft={ms} total={listenSecs}
        text={text} setText={setText} onSubmit={submitGuess} feedback={feedback} inputRef={inputRef} error={error} />
    }
    return <GameArenaV2 {...common} phase="song" chip={chip} panel={panel} />
  }

  // fim: pódio por pontos + placar
  const winner = players.find((p) => p.id === room.winner_id)
  return (
    <GameArenaV2 {...common} phase="finished" centerId={winner?.id} chip="Game over · Guess the Song"
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
