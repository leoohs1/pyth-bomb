import { useRef, useState } from 'react'
import GameArena from './GameArena.jsx'

// "Chicote de testes" pro GameArena: dados fictícios, só pra ver o visual sem
// precisar de uma partida de verdade rodando. Nada disso entra no jogo real —
// no Step 3 de verdade (wire no App.jsx), o App vai passar os dados reais no
// lugar destes.
const NICKNAMES = [
  'Halls', 'Ricardo', 'Adrian', 'Samurai', 'Crown', 'Cakky', 'Hinkah', 'Planck',
  'Kirito', 'Noname', 'Borys', 'Eukodal', 'Zeph', 'Mira', 'Otto', 'Juno',
  'Vex', 'Tala', 'Remy', 'Kaia',
]
const ALL_MOCK_PLAYERS = NICKNAMES.map((nickname, i) => ({ id: 'p' + i, nickname, alive: true }))

export default function GameArenaHarness() {
  const [answer, setAnswer] = useState('')
  const [danger, setDanger] = useState(1)
  const [count, setCount] = useState(8)
  const [holderIdx, setHolderIdx] = useState(0)
  const [outIds, setOutIds] = useState(() => new Set())
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

  function toggleOut(id) {
    setOutIds((s) => {
      const n = new Set(s)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  return (
    <>
      <GameArena
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
      />
      {/* controles de teste, só nesse harness — não existem no jogo real */}
      <div style={{ position: 'fixed', top: 46, left: 8, zIndex: 50, display: 'flex', gap: 6, flexWrap: 'wrap', maxWidth: 260, background: 'rgba(0,0,0,0.6)', padding: 6, borderRadius: 6 }}>
        {[1, 2, 3, 4].map((d) => (
          <button key={d} onClick={() => setDanger(d)}
            style={{ padding: '4px 10px', fontSize: 12, cursor: 'pointer' }}>
            perigo {d}
          </button>
        ))}
        {[1, 2, 4, 6, 8, 10, 12, 15, 20].map((n) => (
          <button key={n} onClick={() => setCount(n)}
            style={{ padding: '4px 10px', fontSize: 12, cursor: 'pointer', fontWeight: count === n ? 800 : 400 }}>
            {n} jog.
          </button>
        ))}
        <button onClick={passToRandom} style={{ padding: '4px 10px', fontSize: 12, cursor: 'pointer', background: '#dcae40' }}>
          💣 passar bomba
        </button>
        <button onClick={() => toggleOut(room.bomb_holder_id)} style={{ padding: '4px 10px', fontSize: 12, cursor: 'pointer', background: '#d92f5b', color: '#fff' }}>
          ☠️ eliminar quem tem a bomba
        </button>
      </div>
    </>
  )
}
