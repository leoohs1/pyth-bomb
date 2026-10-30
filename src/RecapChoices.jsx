import { useEffect, useState } from 'react'
import './RecapChoices.css'

// PYTH RECAP MONTH: os 4 botões A/B/C/D e a nota "recap" da pergunta que acabou de fechar.
// Só visual: quem decide se acertou é o servidor (submit_choice, supabase/038_recap_month.sql).

const LETTERS = 'ABCD'

// choices: as 4 opções (já embaralhadas pelo servidor). canAnswer: só quem tem a bomba toca;
// os outros veem as opções apagadas, pra jogar junto de cabeça. onChoose(texto) -> true/false (false = não enviou)
export function RecapChoices({ choices, canAnswer, onChoose, questionKey }) {
  const [picked, setPicked] = useState(null)
  // pergunta nova: solta a escolha anterior
  useEffect(() => { setPicked(null) }, [questionKey])
  if (!choices?.length) return null

  async function pick(c) {
    if (!canAnswer || picked !== null) return
    setPicked(c)
    const sent = await onChoose?.(c)
    if (sent === false) setPicked(null)   // deu erro de rede: pode tocar de novo
  }

  return (
    <div className={`rc-grid${canAnswer ? '' : ' is-watching'}`} role="group" aria-label="Answer options">
      {choices.map((c, i) => (
        <button
          key={i}
          type="button"
          className={`rc-opt${picked === c ? ' is-picked' : ''}`}
          disabled={!canAnswer || picked !== null}
          onClick={() => pick(c)}
        >
          <span className="rc-letter" aria-hidden="true">{LETTERS[i]}</span>
          <span className="rc-text">{c}</span>
        </button>
      ))}
    </div>
  )
}

// o "recap": a resposta certa da pergunta anterior (e a fonte). Aparece pra todo mundo, a cada turno.
export function RecapNote({ recap }) {
  if (!recap?.a) return null
  return (
    <div className="rc-note" key={recap.q} aria-live="polite">
      <span className="rc-note-tag">Recap</span>
      <span className="rc-note-q">{recap.q}</span>
      <span className="rc-note-a"><b>{recap.a}</b>{recap.src ? <i> · {recap.src}</i> : null}</span>
      {recap.fact ? <span className="rc-note-fact">{recap.fact}</span> : null}
    </div>
  )
}
