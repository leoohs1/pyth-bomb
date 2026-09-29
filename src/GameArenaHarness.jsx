import { useRef, useState } from 'react'
import GameArena from './GameArena.jsx'

// "Chicote de testes" pro GameArena: dados fictícios, só pra ver o visual sem
// precisar de uma partida de verdade rodando. Nada disso entra no jogo real —
// no Step 3, o App.jsx vai passar os dados de verdade no lugar destes.
const MOCK_ROOM = {
  round_number: 3,
  current_question_text: 'Which ancient wonder was located in the city of Rhodes?',
}
const MOCK_PLAYERS = Array.from({ length: 15 }, (_, i) => ({ id: 'p' + i }))

export default function GameArenaHarness() {
  const [answer, setAnswer] = useState('')
  const [danger, setDanger] = useState(1)
  const answerRef = useRef(null)

  return (
    <>
      <GameArena
        room={MOCK_ROOM}
        players={MOCK_PLAYERS}
        alive={MOCK_PLAYERS}
        danger={danger}
        questionMs={7000}
        answer={answer}
        setAnswer={setAnswer}
        answerRef={answerRef}
        onSubmit={(e) => e.preventDefault()}
        error={null}
      />
      {/* botõezinhos de teste, só nesse harness — não existem no jogo real */}
      <div style={{ position: 'fixed', bottom: 8, left: 8, zIndex: 50, display: 'flex', gap: 6 }}>
        {[1, 2, 3, 4].map((d) => (
          <button key={d} onClick={() => setDanger(d)}
            style={{ padding: '4px 10px', fontSize: 12, cursor: 'pointer' }}>
            perigo {d}
          </button>
        ))}
      </div>
    </>
  )
}
