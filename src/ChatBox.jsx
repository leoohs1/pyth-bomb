import { useEffect, useRef, useState } from 'react'
import './ChatBox.css'

// Chat da sala. No lobby e na tela final fica ABERTO; durante a partida fica fechado e só
// aparece o balãozinho 💬 (com um número quando chega mensagem). Cada pessoa abre e fecha o
// seu, sem afetar os outros. `variant`: 'arena' (dentro da arena, em cqw) ou 'compact' (celular).
export default function ChatBox({ chat, myPlayerId, phase, variant = 'arena' }) {
  const [override, setOverride] = useState(null) // null = automático (aberto fora da partida)
  const [text, setText] = useState('')
  const listRef = useRef(null)
  const seenRef = useRef(0)

  // a cada mudança de fase (lobby -> partida -> fim) volta ao automático
  useEffect(() => { setOverride(null) }, [phase])

  const open = override ?? (phase !== 'playing')
  const msgs = chat.messages

  // não lidas: mensagens dos outros que chegaram com o chat fechado
  const [unread, setUnread] = useState(0)
  useEffect(() => {
    if (open) { seenRef.current = msgs.length; setUnread(0); return }
    const fresh = msgs.slice(seenRef.current).filter((m) => m.player_id !== myPlayerId).length
    seenRef.current = msgs.length
    if (fresh) setUnread((n) => n + fresh)
  }, [msgs, open, myPlayerId])

  // rola pro fim quando chega mensagem ou o chat abre
  useEffect(() => {
    if (open && listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
  }, [msgs.length, open])

  if (!chat.available) return null

  async function submit(e) {
    e.preventDefault()
    const t = text
    setText('')
    const ok = await chat.send(t)
    if (!ok) setText(t) // devolve o texto se foi recusado (rápido demais, palavra bloqueada...)
  }

  const toggle = () => setOverride(!open)

  if (!open) {
    return (
      <button type="button" className={`ct-fab ct-${variant}`} onClick={toggle} aria-label="Open chat" title="Chat">
        💬{unread > 0 && <span className="ct-badge">{unread > 9 ? '9+' : unread}</span>}
      </button>
    )
  }

  return (
    <section className={`ct-panel ct-${variant}${variant === 'compact' && phase !== 'playing' ? ' ct-inline' : ''}${phase === 'playing' ? ' ct-playing' : ''}`} aria-label="Chat">
      <header className="ct-head">
        <span className="ct-title">💬 Chat</span>
        <button type="button" className="ct-close" onClick={toggle} aria-label="Close chat">×</button>
      </header>
      <ul className="ct-list" ref={listRef}>
        {msgs.length === 0 && <li className="ct-empty">Say hi 👋</li>}
        {msgs.map((m) => (
          <li key={m.id} className={`ct-msg${m.player_id === myPlayerId ? ' is-me' : ''}`}>
            <span className="ct-nick">{m.nickname}</span>
            <span className="ct-body">{m.body}</span>
          </li>
        ))}
      </ul>
      {chat.error && <p className="ct-error" role="alert">{chat.error}</p>}
      <form className="ct-form" onSubmit={submit}>
        <input
          className="ct-input"
          value={text}
          onChange={(e) => { setText(e.target.value); if (chat.error) chat.clearError() }}
          maxLength={140}
          autoComplete="off"
          autoCorrect="off"
          enterKeyHint="send"
          placeholder="Type a message…"
          aria-label="Chat message"
        />
        <button type="submit" className="ct-send" disabled={!text.trim()}>Send</button>
      </form>
    </section>
  )
}
