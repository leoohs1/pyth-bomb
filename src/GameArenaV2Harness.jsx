import { useRef, useState } from 'react'
import GameArenaV2 from './GameArenaV2.jsx'

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
  const answerRef = useRef(null)

  const players = ALL_MOCK_PLAYERS.slice(0, count).map((p) => ({ ...p, alive: !outIds.has(p.id) }))
  const room = {
    round_number: 3,
    current_question_text: 'Which ancient wonder was located in the city of Rhodes?',
    bomb_holder_id: players[holderIdx % players.length]?.id,
  }

  function passToRandom() {
    const alive = players.filter((p) => p.id !== room.bomb_holder_id && p.alive)
    if (!alive.length) return
    const next = alive[Math.floor(Math.random() * alive.length)]
    setHolderIdx(players.findIndex((p) => p.id === next.id))
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
    const alive = players.filter((p) => p.id !== id && p.alive)
    if (alive.length) {
      const next = alive[Math.floor(Math.random() * alive.length)]
      setHolderIdx(players.findIndex((p) => p.id === next.id))
    }
  }

  return (
    <>
      <GameArenaV2
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
      />
      <div style={{ position: 'fixed', bottom: 8, left: 8, zIndex: 50, display: 'flex', gap: 6, flexWrap: 'wrap', maxWidth: 260, background: 'rgba(0,0,0,0.6)', padding: 6, borderRadius: 6 }}>
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
          💣 passar bomba (aleatório)
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
      </div>
    </>
  )
}
