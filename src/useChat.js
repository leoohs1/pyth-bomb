import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './supabaseClient'

// Chat da sala (supabase/014_chat.sql). As mensagens chegam ao vivo pelo tempo real; a rede de
// segurança relê as últimas a cada 8 s caso o aviso ao vivo se perca (celular, sinal fraco).
// `available` fica falso enquanto a tabela não existe (SQL 014 ainda não rodado): o chat some.
const KEEP = 100

export default function useChat(roomId) {
  const [messages, setMessages] = useState([])
  const [available, setAvailable] = useState(false)
  const [error, setError] = useState(null)
  const seenRef = useRef(new Set())

  const merge = useCallback((rows) => {
    setMessages((old) => {
      const byId = new Map(old.map((m) => [m.id, m]))
      for (const r of rows) byId.set(r.id, r)
      const all = [...byId.values()].sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0))
      return all.slice(-KEEP)
    })
  }, [])

  useEffect(() => {
    if (!roomId) { setMessages([]); setAvailable(false); return }
    let stopped = false
    seenRef.current = new Set()

    async function load() {
      const { data, error: e } = await supabase
        .from('messages').select().eq('room_id', roomId).order('created_at', { ascending: false }).limit(50)
      if (stopped) return
      if (e) { setAvailable(false); return } // tabela ainda não existe
      setAvailable(true)
      if (data?.length) merge(data)
    }
    load()

    const channel = supabase
      .channel('chat-' + roomId)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${roomId}` },
        (payload) => { setAvailable(true); merge([payload.new]) })
      .subscribe()
    const id = setInterval(load, 8000)

    return () => { stopped = true; clearInterval(id); supabase.removeChannel(channel) }
  }, [roomId, merge])

  const send = useCallback(async (text) => {
    const body = text.trim()
    if (!body || !roomId) return false
    setError(null)
    const { error: e } = await supabase.rpc('send_message', { p_room_id: roomId, p_body: body })
    if (e) { setError(e.message); return false }
    return true
  }, [roomId])

  return { messages, available, error, send, clearError: () => setError(null) }
}
