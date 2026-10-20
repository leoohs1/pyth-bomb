import { useEffect, useState } from 'react'

// "Como jogar" do Guess the Song: abre sozinho na 1ª vez que a pessoa entra no lobby (guarda no navegador
// que já viu) e fica disponível num botão "?" pra abrir quando quiser. Texto do jogo em inglês.
const KEY = 'pb_song_howto'

export function useHowToPlay(active) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!active) return
    let seen = true
    try { seen = !!localStorage.getItem(KEY) } catch { seen = true }
    if (!seen) setOpen(true)
  }, [active])
  const close = () => {
    setOpen(false)
    try { localStorage.setItem(KEY, '1') } catch { /* sem storage: tudo bem, só aparece de novo */ }
  }
  return { open, show: () => setOpen(true), close }
}

export function HowToButton({ onClick }) {
  return (
    <button type="button" className="sg-how-btn" onClick={onClick} aria-label="How to play">
      <span aria-hidden="true">?</span> How to play
    </button>
  )
}

export function HowToPlay({ open, onClose }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="sg-how-back" onClick={onClose}>
      <div className="sg-how" role="dialog" aria-modal="true" aria-labelledby="sg-how-title" onClick={(e) => e.stopPropagation()}>
        <h2 id="sg-how-title">How to play</h2>
        <ul>
          <li><span className="sg-how-ico" aria-hidden="true">🎧</span><span>A <b>30-second clip</b> plays for everyone at the same time.</span></li>
          <li><span className="sg-how-ico" aria-hidden="true">🎤</span><span>Type the <b>artist</b>, the <b>song name</b>, or both, in the same box.</span></li>
          <li><span className="sg-how-ico" aria-hidden="true">⚡</span><span>The <b>faster</b> you answer, the more points you get. Find both first for a <b>+250 FIRST</b> bonus!</span></li>
          <li><span className="sg-how-ico" aria-hidden="true">✍️</span><span><b>Spelling counts:</b> no typos. Capital letters, accents and punctuation don't matter.</span></li>
          <li><span className="sg-how-ico" aria-hidden="true">🏆</span><span><b>10 songs.</b> Most points wins!</span></li>
        </ul>
        <p className="sg-how-note">No sound? Tap the screen once.</p>
        <button type="button" className="sg-how-ok" onClick={onClose} autoFocus>Got it!</button>
      </div>
    </div>
  )
}
