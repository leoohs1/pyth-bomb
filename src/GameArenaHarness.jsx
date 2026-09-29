import { useRef, useState } from 'react'
import GameArena from './GameArena.jsx'

// "Chicote de testes" pro GameArena: dados fictícios, só pra ver o visual sem
// precisar de uma partida de verdade rodando. Nada disso entra no jogo real —
// no Step 3, o App.jsx vai passar os dados de verdade no lugar destes.
const MOCK_ROOM = {
  round_number: 3,
  current_question_text: 'Which ancient wonder was located in the city of Rhodes?',
}
const NICKNAMES = [
  'Halls', 'Ricardo', 'Adrian', 'Samurai', 'Crown', 'Cakky', 'Hinkah', 'Planck',
  'Kirito', 'Noname', 'Borys', 'Eukodal', 'Zeph', 'Mira', 'Otto', 'Juno',
  'Vex', 'Tala', 'Remy', 'Kaia',
]
const ALL_MOCK_PLAYERS = NICKNAMES.map((nickname, i) => ({ id: 'p' + i, nickname }))

export default function GameArenaHarness() {
  const [answer, setAnswer] = useState('')
  const [danger, setDanger] = useState(1)
  const [count, setCount] = useState(8)
  const answerRef = useRef(null)
  const players = ALL_MOCK_PLAYERS.slice(0, count)

  return (
    <>
      <GameArena
        room={MOCK_ROOM}
        players={players}
        alive={players}
        danger={danger}
        questionMs={7000}
        answer={answer}
        setAnswer={setAnswer}
        answerRef={answerRef}
        onSubmit={(e) => e.preventDefault()}
        error={null}
      />
      {/* controles de teste, só nesse harness — não existem no jogo real */}
      <div style={{ position: 'fixed', top: 46, left: 8, zIndex: 50, display: 'flex', gap: 6, flexWrap: 'wrap', maxWidth: 220, background: 'rgba(0,0,0,0.6)', padding: 6, borderRadius: 6 }}>
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
      </div>
    </>
  )
}
