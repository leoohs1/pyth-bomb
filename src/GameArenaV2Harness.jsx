import { useRef, useState } from 'react'
import GameArenaV2 from './GameArenaV2.jsx'
import { LobbyPanel, FinishedPanel } from './ArenaPanels.jsx'

// mesmo chicote de testes do GameArenaHarness.jsx, só que pro layout V2
// (composição em clusters, fundo novo). Já testado com ~14, agora
// estendido pra 20.
const NICKNAMES = [
  'Halls', 'Ricardo', 'Adrian', 'Samurai', 'Crown', 'Cakky', 'Hinkah', 'Planck',
  'Kirito', 'Noname', 'Borys', 'Eukodal', 'Zeph', 'Mira', 'Otto', 'Juno',
  'Vex', 'Tala', 'Remy', 'Kaia',
]
const ALL_MOCK_PLAYERS = NICKNAMES.map((nickname, i) => ({ id: 'p' + i, nickname, alive: true }))
const MY_ID = ALL_MOCK_PLAYERS[0].id

export default function GameArenaV2Harness() {
  const [answer, setAnswer] = useState('')
  const [danger, setDanger] = useState(1)
  const [count, setCount] = useState(14)
  const [holderIdx, setHolderIdx] = useState(0)
  const [outIds, setOutIds] = useState(() => new Set())
  const [povSeq, setPovSeq] = useState(0)
  const [mistakes, setMistakes] = useState(0)
  const [phase, setPhase] = useState('playing') // 'playing' | 'lobby' | 'finished'
  const [asHost, setAsHost] = useState(true)
  const [myIdx, setMyIdx] = useState(0) // personagem escolhido por "mim" (Halls) no lobby
  const [controlsVisible, setControlsVisible] = useState(true)
  const answerRef = useRef(null)
  // só pra testar a explosão e o aviso de erro que o jogo real manda
  const [flash, setFlash] = useState(null)
  const [feedbackMsg, setFeedbackMsg] = useState(null)

  const players = ALL_MOCK_PLAYERS.slice(0, count).map((p, i) => ({ ...p, alive: !outIds.has(p.id), avatar_idx: p.id === MY_ID ? myIdx : i }))
  const room = {
    round_number: 3,
    current_question_text: 'Which ancient wonder was located in the city of Rhodes?',
    bomb_holder_id: players[holderIdx % players.length]?.id,
  }

  // mesma regra do servidor (supabase/008_fair_passing.sql): vai pro próximo
  // vivo da fila, em círculo — depois que sai de alguém, passa por todos os
  // outros antes de voltar pra ele.
  function passToRandom() {
    const cur = players.findIndex((p) => p.id === room.bomb_holder_id)
    for (let k = 1; k <= players.length; k++) {
      const cand = players[(cur + k) % players.length]
      if (cand.alive && cand.id !== room.bomb_holder_id) {
        setHolderIdx(players.findIndex((p) => p.id === cand.id))
        return
      }
    }
  }

  function passToMe() {
    const me = players.find((p) => p.id === MY_ID)
    if (!me || !me.alive || room.bomb_holder_id === MY_ID) return
    setHolderIdx(players.findIndex((p) => p.id === MY_ID))
  }

  function eliminateHolder() {
    const id = room.bomb_holder_id
    if (!id) return
    setOutIds((s) => new Set(s).add(id))
    setMistakes(0)
    const alive = players.filter((p) => p.id !== id && p.alive)
    if (alive.length) {
      const next = alive[Math.floor(Math.random() * alive.length)]
      setHolderIdx(players.findIndex((p) => p.id === next.id))
    }
  }

  // só pra testar o estado "eu, eliminado, assistindo" (spec item 12) sem
  // precisar torcer pra sorte cair em mim no eliminar aleatório
  function toggleMyElimination() {
    setOutIds((s) => {
      const next = new Set(s)
      if (next.has(MY_ID)) next.delete(MY_ID)
      else next.add(MY_ID)
      return next
    })
  }

  return (
    <>
      <GameArenaV2
        flash={flash}
        feedback={feedbackMsg}
        room={room}
        players={players}
        alive={players.filter((p) => p.alive)}
        danger={danger}
        questionMs={7000}
        answer={answer}
        setAnswer={setAnswer}
        answerRef={answerRef}
        onSubmit={(e) => e.preventDefault()}
        error={null}
        myPlayerId={MY_ID}
        povFlash={povSeq || null}
        mistakes={mistakes}
        phase={phase}
        onLeave={() => window.alert('(preview) saiu da sala')}
        centerId={phase === 'finished' ? 'p3' : null}
        panel={phase === 'lobby'
          ? <LobbyPanel room={{ code: 'K7QX2M' }} players={players} me={players[0]} onPick={setMyIdx} iAmHost={asHost} onStart={() => setPhase('playing')} onLeave={() => {}} error={null} />
          : phase === 'finished'
            ? <FinishedPanel room={{ code: 'K7QX2M' }} winner={players.find((p) => p.id === 'p3')} iWon={false} iAmOut={false} iAmHost={asHost} onStart={() => setPhase('playing')} onLeave={() => {}} error={null} />
            : null}
      />
      {/* botãozinho sempre visível pra esconder/mostrar o painel de teste
          na hora de tirar print pra revisão (pedido: "hide the left-side
          test controls for the next screenshot") */}
      <button onClick={() => setControlsVisible((v) => !v)}
        style={{ position: 'fixed', bottom: 8, left: 8, zIndex: 51, padding: '4px 8px', fontSize: 11, cursor: 'pointer', opacity: 0.7 }}>
        {controlsVisible ? '🙈 esconder controles' : '👁️ mostrar controles'}
      </button>
      <div style={{ display: controlsVisible ? 'flex' : 'none', position: 'fixed', bottom: 36, left: 8, zIndex: 50, gap: 6, flexWrap: 'wrap', maxWidth: 260, background: 'rgba(0,0,0,0.6)', padding: 6, borderRadius: 6 }}>
        {['playing', 'lobby', 'finished'].map((ph) => (
          <button key={ph} onClick={() => setPhase(ph)}
            style={{ padding: '4px 10px', fontSize: 12, cursor: 'pointer', background: '#38bdf8', fontWeight: phase === ph ? 800 : 400 }}>
            tela: {ph}
          </button>
        ))}
        <button onClick={() => setAsHost((v) => !v)} style={{ padding: '4px 10px', fontSize: 12, cursor: 'pointer' }}>
          sou dono da sala: {asHost ? 'sim' : 'não'}
        </button>
        <span style={{ width: '100%', color: '#fff', fontSize: 11, opacity: 0.8 }}>🫵 "eu" sou: Halls (Oracle)</span>
        {[1, 2, 3, 4].map((d) => (
          <button key={d} onClick={() => setDanger(d)}
            style={{ padding: '4px 10px', fontSize: 12, cursor: 'pointer' }}>
            perigo {d}
          </button>
        ))}
        {[1, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20].map((n) => (
          <button key={n} onClick={() => setCount(n)}
            style={{ padding: '4px 10px', fontSize: 12, cursor: 'pointer', fontWeight: count === n ? 800 : 400 }}>
            {n} jog.
          </button>
        ))}
        <button onClick={passToRandom} style={{ padding: '4px 10px', fontSize: 12, cursor: 'pointer', background: '#dcae40' }}>
          💣 passar bomba (próximo da fila)
        </button>
        <button onClick={passToMe} style={{ padding: '4px 10px', fontSize: 12, cursor: 'pointer', background: '#22c55e' }}>
          🎯 bomba vem até mim
        </button>
        <button onClick={eliminateHolder} style={{ padding: '4px 10px', fontSize: 12, cursor: 'pointer', background: '#d92f5b', color: '#fff' }}>
          ☠️ eliminar quem tem a bomba
        </button>
        <button onClick={() => setPovSeq((n) => n + 1)} style={{ padding: '4px 10px', fontSize: 12, cursor: 'pointer', background: '#8b5cf6', color: '#fff' }}>
          🎥 forçar flash (teste visual)
        </button>
        <button onClick={toggleMyElimination} style={{ padding: '4px 10px', fontSize: 12, cursor: 'pointer', background: '#6b7280', color: '#fff' }}>
          💀 eu, eliminado (on/off)
        </button>
        <button onClick={() => { setFlash({ name: 'Samurai', mine: false }); setTimeout(() => setFlash(null), 3000) }}
          style={{ padding: '4px 10px', fontSize: 12, cursor: 'pointer', background: '#f97316', color: '#fff' }}>
          💥 testar explosão
        </button>
        <button onClick={() => { setFlash({ name: 'Halls', mine: true }); setTimeout(() => setFlash(null), 3000) }}
          style={{ padding: '4px 10px', fontSize: 12, cursor: 'pointer', background: '#dc2626', color: '#fff' }}>
          🤡 explodiu EU (deboche)
        </button>
        <button onClick={() => { setFeedbackMsg('❌ wrong, try again!'); setTimeout(() => setFeedbackMsg(null), 1500) }}
          style={{ padding: '4px 10px', fontSize: 12, cursor: 'pointer', background: '#6b7280', color: '#fff' }}>
          ❌ testar resposta errada
        </button>
        <span style={{ width: '100%', color: '#fff', fontSize: 11, opacity: 0.8, marginTop: 4 }}>erros do holder: {mistakes}/5</span>
        {[0, 1, 2, 3, 4, 5].map((n) => (
          <button key={n} onClick={() => setMistakes(n)}
            style={{ padding: '4px 10px', fontSize: 12, cursor: 'pointer', fontWeight: mistakes === n ? 800 : 400 }}>
            {n}
          </button>
        ))}
      </div>
    </>
  )
}
