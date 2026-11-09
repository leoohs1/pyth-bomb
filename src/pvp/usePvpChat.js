// Chat do torneio do PVP no formato que a caixinha do Classic (ChatBox.jsx) espera:
// { messages, available, error, send(texto), clearError }. As mensagens vão e vêm pelo servidor do PVP (net.js).
import { useCallback, useState } from 'react'

export function usePvpChat(sendRef) {
  const [messages, setMessages] = useState([])
  const [error, setError] = useState(null)

  // chamado pelo PvpApp com as mensagens do servidor
  const onServer = useCallback((m) => {
    if (m.t === 'chatlog') setMessages(m.list ?? [])
    else if (m.t === 'chat') setMessages((old) => (old.some((x) => x.id === m.m.id) ? old : [...old, m.m].slice(-100)))
    else if (m.t === 'chaterr') setError(m.error)
  }, [])

  const send = useCallback(async (text) => {
    const body = String(text ?? '').trim()
    if (!body) return false
    sendRef.current?.({ t: 'chat', text: body })
    return true
  }, [sendRef])

  const reset = useCallback(() => { setMessages([]); setError(null) }, [])

  return { chat: { messages, available: true, error, send, clearError: () => setError(null) }, onServer, reset }
}
