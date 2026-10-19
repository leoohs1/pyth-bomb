import ScoreList from '../modes/ScoreList'

// Conteúdo do cartão do meio da arena no Guess the Song (prepara, ouvindo, revelação).
// Só visual: as regras ficam no servidor (supabase/song/S01_guess_the_song.sql).

function Header({ room }) {
  return <p className="ga-qnum">Round {room.round_number}/{room.song_total ?? 10}</p>
}

// 3, 2, 1... (enquanto todo mundo baixa o trecho)
export function ReadyPanel({ room, msToStart }) {
  const n = Math.max(1, Math.ceil(msToStart / 1000))
  return (
    <>
      <Header room={room} />
      <p className="sg-ready">Get ready</p>
      <p className="sg-count" key={n}>{n}</p>
      <p className="sg-hint">🔊 Sound on! Type the <b>artist</b> or the <b>song name</b>.</p>
    </>
  )
}

function Bars({ on }) {
  return (
    <div className={`sg-bars${on ? ' is-on' : ''}`} aria-hidden="true">
      {Array.from({ length: 7 }, (_, i) => <span key={i} style={{ animationDelay: `${(i * 0.13) % 0.6}s` }} />)}
    </div>
  )
}

// ouvindo: o trecho toca, a turma digita artista ou música (quantas vezes quiser)
export function ListenPanel({ room, players, me, msLeft, total, text, setText, onSubmit, feedback, inputRef, error }) {
  const r = room.round_number
  const meNow = players.find((p) => p.id === me?.id)
  const gotA = meNow?.song_artist_round === r
  const gotT = meNow?.song_title_round === r
  const done = gotA && gotT
  const secs = Math.max(0, Math.ceil(msLeft / 1000))
  const urgent = msLeft <= 5000
  return (
    <>
      <Header room={room} />
      <div className="sg-play">
      <div className="sg-main">
      <Bars on={msLeft > 0} />
      <div className="ga-time sg-time">
        <div className="ga-track" role="progressbar" aria-label="Time left" aria-valuemin={0} aria-valuemax={total} aria-valuenow={secs}>
          <div className={`ga-fill${urgent ? ' is-urgent' : ''}`} style={{ width: `${Math.max(0, Math.min(100, (msLeft / (total * 1000)) * 100))}%` }} />
        </div>
        <span className={`ga-secs${urgent ? ' is-urgent' : ''}`}>{secs}s</span>
      </div>
      <div className="sg-mine">
        <span className={gotA ? 'is-got' : ''}>🎤 Artist {gotA ? '✓' : '?'}</span>
        <span className={gotT ? 'is-got' : ''}>🎵 Song {gotT ? '✓' : '?'}</span>
      </div>
      {done ? (
        <p className="sg-done">You got it! 🎉 Waiting for the others…</p>
      ) : (
        <form className="sg-form" onSubmit={(e) => { e.preventDefault(); if (text.trim()) onSubmit(text) }}>
          <input
            ref={inputRef}
            className="sg-input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            autoFocus
            maxLength={120}
            placeholder={gotA ? 'Now the song name…' : gotT ? 'Now the artist…' : 'Artist or song name'}
            aria-label="Artist or song name"
          />
          <button type="submit" className="ga-send" disabled={!text.trim()}>Send</button>
        </form>
      )}
      <p className={`sg-feedback is-${feedback?.kind ?? 'none'}`} aria-live="polite">{feedback?.text ?? ''}</p>
      {error && <p className="ga-error" role="alert">{error}</p>}
      </div>
      {/* leaderboard ao vivo numa coluna própria (os pontos sobem na hora do acerto): top 5 + eu,
          com 🎤🎵 de quem já achou nesta música */}
      <aside className="sg-board">
        <ScoreList players={players} me={me} compact limit={5} title="Leaderboard" extra={(p) => (
          <span className="sg-got">
            <span className={p.song_artist_round === r ? 'is-got' : ''}>🎤</span>
            <span className={p.song_title_round === r ? 'is-got' : ''}>🎵</span>
          </span>
        )} />
      </aside>
      </div>
    </>
  )
}

// revelação: qual era a música, quem achou o quê, pontos da rodada
export function RevealPanel({ room, players, me, msLeft }) {
  const rv = room.song_reveal ?? {}
  const list = (rv.players ?? []).slice(0, 8)
  const last = room.round_number >= (room.song_total ?? 10)
  return (
    <>
      <Header room={room} />
      <p className="sg-was">It was</p>
      <p className="sg-title">{rv.title}</p>
      <p className="sg-artist">{rv.artist}{rv.year ? ` · ${rv.year}` : ''}</p>
      <ol className="sg-list">
        {list.map((g) => (
          <li key={g.player_id} className={`sg-row${g.player_id === me?.id ? ' is-me' : ''}`}>
            <span className="sg-name">{g.nickname}{g.first ? <b className="sg-first"> FIRST!</b> : null}</span>
            <span className={g.artist ? 'is-got' : 'is-miss'}>🎤 {g.artist ? `${g.artist_secs}s` : '–'}</span>
            <span className={g.title ? 'is-got' : 'is-miss'}>🎵 {g.title ? `${g.title_secs}s` : '–'}</span>
            <span className="sg-pts">+{g.points}</span>
          </li>
        ))}
      </ol>
      <ScoreList players={players} me={me} compact />
      <p className="sg-next">{last ? 'Final results in' : 'Next song in'} {Math.max(0, Math.ceil(msLeft / 1000))}s</p>
    </>
  )
}
