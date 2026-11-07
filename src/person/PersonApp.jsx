import { useEffect, useRef, useState } from 'react'
import { supabase } from '../supabaseClient'
import Home from '../Home'
import GameArenaV2 from '../GameArenaV2'
import { LobbyPanel, FinishedPanel } from '../ArenaPanels'
import useChat from '../useChat'
import useModeRoom from '../modes/useModeRoom'
import useModeTheme from '../modes/useModeTheme'
import ScoreList from '../modes/ScoreList'
import { ReadyPanel, GuessPanel, RevealPanel } from './PersonPanels'
import { play } from '../sound'
import PersonHowTo from './PersonHowTo'
import './person.css'

// Guess the Person: aparece a foto de uma pessoa (a mesma, na mesma hora, pra todo mundo), bem pixelada,
// e vai ficando nítida. A turma digita o nome; quanto mais cedo acertar, mais pontos; 10 rodadas.
// Sala, lobby, chat, personagens e arena são os mesmos dos outros modos (src/modes/useModeRoom.js) e o
// visual é o do Classic (arena de mármore); as regras ficam no servidor (supabase/person/W01_guess_the_person.sql).
// As fotos ficam na pasta "people" do Supabase (fora do GitHub). Endereço: /person.

const ROUNDS = 10
const PATH = '/person'

const photoUrl = (file) => supabase.storage.from('people').getPublicUrl(file).data.publicUrl

const FEEDBACK = {
  right: { kind: 'hit', text: '🎉 You got it!' },
  close: { kind: 'close', text: 'So close! Check the spelling or the full name' },
  wrong: { kind: 'wrong', text: '✗ Nope, try again' },
  late: { kind: 'wrong', text: 'Too late! The round is over' },
  closed: { kind: 'wrong', text: 'Wait for the photo to show up' },
}

export default function PersonApp() {
  const R = useModeRoom({ mode: 'person', tickRpc: 'person_tick' })
  const { room, me, players, error, setError, serverNow } = R
  const chat = useChat(room?.id)
  useModeTheme('person') // sem arte própria: usa a arena e a música do Classic (public/music/person.mp3 troca a música, se existir)
  const [text, setText] = useState('')
  const [feedback, setFeedback] = useState(null)
  const inputRef = useRef(null)

  const pr = room?.status === 'playing' ? room.person_round : null
  const file = pr?.file ?? null
  const url = file ? photoUrl(file) : null
  const guessAt = pr?.guess_at ? Date.parse(pr.guess_at) : null
  const guessSecs = pr?.guess_secs ?? 20
  const phase = room?.status === 'playing' ? room.person_phase : null

  // rodada nova: já baixa a foto enquanto a contagem roda e limpa o campo
  useEffect(() => {
    setText('')
    setFeedback(null)
    if (!url) return
    const i = new Image()
    i.src = url
  }, [url])

  // contagem do começo: voz "get ready" e um bip a cada número (só antes da 1ª pessoa); no fim, o BEEP de "valendo"
  const countdown = phase === 'ready' && (room?.round_number ?? 0) <= 1
  const readyN = countdown && guessAt ? Math.max(1, Math.ceil((guessAt - serverNow) / 1000)) : null
  const lastReadyRef = useRef(null)
  const voiceAtRef = useRef(0)
  useEffect(() => {
    if (readyN == null) { lastReadyRef.current = null; return }
    if (lastReadyRef.current == null) { play('get_ready'); voiceAtRef.current = Date.now() }
    else if (readyN < lastReadyRef.current && Date.now() - voiceAtRef.current > 850) play('countdown')
    lastReadyRef.current = readyN
  }, [readyN])
  const goRef = useRef(null)
  useEffect(() => {
    if (!guessAt || phase === 'reveal') return
    const t = serverNow - guessAt
    if (t >= 0 && t < 1500 && goRef.current !== guessAt) {
      goRef.current = guessAt
      play('go')
    }
  }, [serverNow, guessAt, phase])

  async function startGame() {
    setError(null)
    const { error: e } = await supabase.rpc('person_start_game', { p_room_id: room.id, p_rounds: ROUNDS })
    if (e) setError(e.message)
  }

  async function submitGuess(value) {
    setError(null)
    setText('')
    const { data, error: e } = await supabase.rpc('person_submit_guess', { p_room_id: room.id, p_text: value })
    if (e) return setError(e.message)
    const res = data?.result
    const fb = FEEDBACK[res]
    setFeedback(fb ? { ...fb, text: fb.text + (data.points ? ` +${data.points}` : '') + (data.first ? ' · FIRST!' : '') } : null)
    if (res === 'right') play(data?.first ? 'perfect' : 'cash')
    else if (res === 'wrong') play('wrong')
    inputRef.current?.focus()
  }

  if (!room) {
    return (
      <Home
        nickname={R.nickname} setNickname={R.setNickname}
        codeInput={R.codeInput} setCodeInput={R.setCodeInput}
        onCreate={R.createRoom} onJoin={R.joinByCode} onBack={() => { window.location.href = '/play' }}
        error={error} invite={R.invite} subtitle="Guess the Person"
      />
    )
  }

  const common = { room, players, alive: players, danger: 1, questionMs: 0, myPlayerId: me?.id, onLeave: R.leaveRoom, chat }

  if (room.status === 'lobby') {
    return (
      <>
        <GameArenaV2 {...common} phase="lobby" chip="Lobby · Guess the Person"
          panel={<LobbyPanel room={room} players={players} me={me} iAmHost={R.iAmHost} onStart={startGame} onLeave={R.leaveRoom}
            onPick={R.pickCharacter} error={error} subtitle="📸 Guess the Person" invitePath={PATH} />}
        />
        <PersonHowTo />
      </>
    )
  }

  if (room.status === 'playing') {
    const chip = `Round ${room.round_number}/${room.person_total ?? ROUNDS} · Guess the Person`
    let panel
    if (phase === 'reveal') {
      const ms = room.question_expires_at ? Math.max(0, Date.parse(room.question_expires_at) - serverNow) : 0
      panel = <RevealPanel room={room} players={players} me={me} msLeft={ms} photoUrl={url} />
    } else if (!guessAt || serverNow < guessAt) {
      panel = <ReadyPanel room={room} msToStart={guessAt ? guessAt - serverNow : 3000} />
    } else {
      const elapsed = serverNow - guessAt
      const ms = Math.max(0, Math.min(guessSecs * 1000, guessSecs * 1000 - elapsed))
      const progress = Math.max(0, Math.min(1, elapsed / (guessSecs * 1000)))
      panel = <GuessPanel room={room} players={players} me={me} msLeft={ms} total={guessSecs} photoUrl={url} progress={progress}
        text={text} setText={setText} onSubmit={submitGuess} feedback={feedback} inputRef={inputRef} error={error} />
    }
    return <GameArenaV2 {...common} phase="person" chip={chip} panel={panel} />
  }

  // fim: pódio por pontos + placar
  const winner = players.find((p) => p.id === room.winner_id)
  return (
    <GameArenaV2 {...common} phase="finished" centerId={winner?.id} chip="Game over · Guess the Person"
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
