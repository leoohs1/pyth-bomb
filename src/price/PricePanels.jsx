import { fmtPrice, fmtWhen, fmtErr, parseGuess, KIND_LABEL } from './format.js'
import ScoreList from '../modes/ScoreList'

// Conteúdo do cartão do meio da arena no Guess the Price (chute, revelação, placar).
// Só visual: as regras ficam no servidor (supabase/price/P01_guess_the_price.sql).

const GUESS_SECS = 20  // igual ao price_next_round (P01)
const REVEAL_SECS = 9  // igual ao price_reveal (P01)

// o que a rodada mostra pra todo mundo: ativo, data/hora e o preço 24 h antes
function RoundHeader({ room }) {
  const r = room.price_round ?? {}
  return (
    <>
      <p className="ga-qnum">
        Round {room.round_number}/{room.price_total ?? 10}
        {r.kind && <span className="pr-kind">{KIND_LABEL[r.kind] ?? r.kind}</span>}
        {r.demo && <span className="pr-demo" title="Practice prices: not real Pyth data yet">DEMO</span>}
      </p>
      <h2 className="pr-asset">{r.label}</h2>
      <p className="pr-when">{fmtWhen(r.at)}</p>
      {r.ref_price != null && (
        <p className="pr-ref">24 h before: <b>{fmtPrice(r.ref_price, r.decimals, r.quote)}</b></p>
      )}
    </>
  )
}

function TimeBar({ ms, total }) {
  const secs = Math.max(0, Math.ceil(ms / 1000))
  const urgent = ms <= 5000
  return (
    <div className="ga-time pr-time">
      <div className="ga-track" role="progressbar" aria-label="Time left" aria-valuemin={0} aria-valuemax={total} aria-valuenow={secs}>
        <div className={`ga-fill${urgent ? ' is-urgent' : ''}`} style={{ width: `${Math.max(0, Math.min(100, (ms / (total * 1000)) * 100))}%` }} />
      </div>
      <span className={`ga-secs${urgent ? ' is-urgent' : ''}`}>{secs}s</span>
    </div>
  )
}

// fase de chute: digita o preço, confere como o jogo entendeu e manda
export function GuessPanel({ room, players, msLeft, guessText, setGuessText, sent, onSubmit, inputRef, error }) {
  const r = room.price_round ?? {}
  const parsed = parseGuess(guessText, r.ref_price)
  const here = players.filter((p) => p.price_guessed_round === room.round_number).length
  return (
    <>
      <RoundHeader room={room} />
      <TimeBar ms={msLeft} total={GUESS_SECS} />
      <form className="pr-form" onSubmit={(e) => { e.preventDefault(); if (parsed) onSubmit(parsed) }}>
        <input
          ref={inputRef}
          className="pr-input"
          value={guessText}
          onChange={(e) => setGuessText(e.target.value)}
          inputMode="decimal"
          autoComplete="off"
          autoFocus
          placeholder="Your guess"
          aria-label="Your price guess"
          maxLength={24}
        />
        <button type="submit" className="ga-send" disabled={!parsed}>{sent != null ? 'Change' : 'Lock in'}</button>
      </form>
      <p className="pr-preview" aria-live="polite">
        {guessText && (parsed ? <>= {fmtPrice(parsed, r.decimals, r.quote)}</> : 'Type a number, like 97500 or 97.5k')}
      </p>
      {sent != null && (
        <p className="pr-sent">🔒 Locked: <b>{fmtPrice(sent, r.decimals, r.quote)}</b> · you can change it until time runs out</p>
      )}
      <p className="pr-count">{here}/{players.length} guessed</p>
      {error && <p className="ga-error" role="alert">{error}</p>}
    </>
  )
}

// fase de revelação: preço certo, chutes de todo mundo, pontos da rodada
export function RevealPanel({ room, players, me, msLeft }) {
  const r = room.price_round ?? {}
  const rv = room.price_reveal ?? {}
  const list = rv.guesses ?? []
  const mine = list.find((g) => g.player_id === me?.id)
  const last = room.round_number >= (room.price_total ?? 10)
  const show = list.slice(0, 6)
  if (mine && !show.includes(mine)) show.push(mine)
  return (
    <>
      <RoundHeader room={room} />
      <p className="pr-answer-label">The price was</p>
      <p className="pr-answer">{fmtPrice(rv.answer, r.decimals, r.quote)}</p>
      {Number(rv.confidence) > 0 && (
        <p className="pr-conf">Pyth confidence: ± {fmtPrice(rv.confidence, r.decimals, r.quote)}</p>
      )}
      <ol className="pr-list">
        {show.map((g) => (
          <li key={g.player_id} className={`pr-row${g.player_id === me?.id ? ' is-me' : ''}${g.player_id === rv.worst ? ' is-worst' : ''}`}>
            <span className="pr-name">{g.player_id === rv.worst ? '💣 ' : ''}{g.nickname}</span>
            <span className="pr-guess">{g.guess == null ? 'no guess' : fmtPrice(g.guess, r.decimals, r.quote)}</span>
            <span className="pr-off">{g.perfect ? <b className="pr-perfect">🎯 PYTH PERFECT</b> : fmtErr(g.err_pct)}</span>
            <span className="pr-pts">+{g.points}</span>
          </li>
        ))}
      </ol>
      <ScoreList players={players} me={me} compact />
      <p className="pr-next">{last ? 'Final results in' : 'Next round in'} {Math.max(0, Math.ceil(msLeft / 1000))}s</p>
    </>
  )
}
