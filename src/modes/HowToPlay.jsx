import { useEffect, useState } from 'react'
import './modes.css'

// "Como jogar" dos modos: um cartão que abre sozinho na 1ª vez que a pessoa entra no lobby (guarda no
// navegador que já viu) e um botão "? How to play" pra abrir quando quiser. Cada modo passa o seu texto:
//   id    : nome do modo (guarda 'pb_<id>_howto' no navegador)
//   rows  : [{ icon: '🎧', text: <>...</> }]
//   note  : frase pequena embaixo (opcional)
//   light : cartão claro (Classic); sem isso, o cartão de veludo roxo (Song)
// Só aparece no lobby: o modo monta esta peça só lá.
export default function HowToPlay({ id, title = 'How to play', rows, note = null, light = false }) {
  const key = `pb_${id}_howto`
  const [open, setOpen] = useState(false)
  useEffect(() => {
    let seen = true
    try { seen = !!localStorage.getItem(key) } catch { seen = true }
    if (!seen) setOpen(true)
  }, [key])
  const close = () => {
    setOpen(false)
    try { localStorage.setItem(key, '1') } catch { /* sem storage: tudo bem, só aparece de novo */ }
  }
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
  return (
    <>
      <button type="button" className="htp-btn" onClick={() => setOpen(true)} aria-label={title}>
        <span aria-hidden="true">?</span> {title}
      </button>
      {open && (
        <div className="htp-back" onClick={close}>
          <div className={`htp${light ? ' is-light' : ''}`} role="dialog" aria-modal="true" aria-labelledby="htp-title" onClick={(e) => e.stopPropagation()}>
            <h2 id="htp-title">{title}</h2>
            <ul>
              {rows.map((r, i) => (
                <li key={i}><span className="htp-ico" aria-hidden="true">{r.icon}</span><span>{r.text}</span></li>
              ))}
            </ul>
            {note && <p className="htp-note">{note}</p>}
            <button type="button" className="htp-ok" onClick={close} autoFocus>Got it!</button>
          </div>
        </div>
      )}
    </>
  )
}
