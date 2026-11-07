import ScoreList from '../modes/ScoreList'
import PersonPhoto from './PersonPhoto'

// Conteúdo do cartão do meio da arena no Guess the Person (prepara, adivinhando, revelação).
// Só visual: as regras ficam no servidor (supabase/person/W01_guess_the_person.sql).

function Header({ room }) {
  return <p className="ga-qnum">Round {room.round_number}/{room.person_total ?? 10}</p>
}

// 5, 4, 3... (enquanto todo mundo baixa a foto). A foto ainda não aparece.
export function ReadyPanel({ room, msToStart }) {
  const n = Math.max(1, Math.ceil(msToStart / 1000))
  return (
    <>
      <Header room={room} />
      <p className="pe-ready">Get ready</p>
      <p className="pe-count" key={n}>{n}</p>
      <p className="pe-hint">Who is this? Type the <b>name</b>. The photo gets <b>sharper</b> as time passes.</p>
    </>
  )
}

// adivinhando: a foto vai ficando nítida, a turma digita o nome (quantas vezes quiser)
export function GuessPanel({ room, players, me, msLeft, total, photoUrl, progress, text, setText, onSubmit, feedback, inputRef, error }) {
  const r = room.round_number
  const meNow = players.find((p) => p.id === me?.id)
  const got = meNow?.person_got_round === r
  const secs = Math.max(0, Math.ceil(msLeft / 1000))
  const urgent = msLeft <= 5000
  return (
    <>
      <Header room={room} />
      <PersonPhoto src={photoUrl} progress={progress} />
      <div className="ga-time pe-time">
        <div className="ga-track" role="progressbar" aria-label="Time left" aria-valuemin={0} aria-valuemax={total} aria-valuenow={secs}>
          <div className={`ga-fill${urgent ? ' is-urgent' : ''}`} style={{ width: `${Math.max(0, Math.min(100, (msLeft / (total * 1000)) * 100))}%` }} />
        </div>
        <span className={`ga-secs${urgent ? ' is-urgent' : ''}`}>{secs}s</span>
      </div>
      {got ? (
        <p className="pe-done">You got it! 🎉 Waiting for the others…</p>
      ) : (
        <form className="pe-form" onSubmit={(e) => { e.preventDefault(); if (text.trim()) onSubmit(text) }}>
          <input
            ref={inputRef}
            className="pe-input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            autoFocus
            maxLength={120}
            placeholder="Who is this?"
            aria-label="Name of the person"
          />
          <button type="submit" className="ga-send" disabled={!text.trim()}>Send</button>
        </form>
      )}
      <p className={`pe-feedback is-${feedback?.kind ?? 'none'}`} aria-live="polite">{feedback?.text ?? ''}</p>
      <hr className="pe-divider" />
      <ScoreList players={players} me={me} compact limit={5} title="Leaderboard" extra={(p) => (
        <span className={`pe-got${p.person_got_round === r ? ' is-got' : ''}`}>✓</span>
      )} />
      {error && <p className="ga-error" role="alert">{error}</p>}
    </>
  )
}

// revelação: a foto nítida, quem era, quem acertou e quão rápido
export function RevealPanel({ room, players, me, msLeft, photoUrl }) {
  const rv = room.person_reveal ?? {}
  const list = (rv.players ?? []).slice(0, 8)
  const last = room.round_number >= (room.person_total ?? 10)
  return (
    <>
      <Header room={room} />
      <PersonPhoto src={photoUrl} progress={1} className="is-small" />
      <p className="pe-was">It was</p>
      <p className="pe-name">{rv.name}</p>
      <ol className="pe-list">
        {list.map((g) => (
          <li key={g.player_id} className={`pe-row${g.player_id === me?.id ? ' is-me' : ''}`}>
            <span className="pe-nick">{g.nickname}{g.first ? <b className="pe-first"> FIRST!</b> : null}</span>
            <span className={g.got ? 'is-got' : 'is-miss'}>{g.got ? `${g.secs}s` : '–'}</span>
            <span className="pe-pts">+{g.points}</span>
          </li>
        ))}
      </ol>
      <ScoreList players={players} me={me} compact />
      <p className="pe-next">{last ? 'Final results in' : 'Next person in'} {Math.max(0, Math.ceil(msLeft / 1000))}s</p>
    </>
  )
}
