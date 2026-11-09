// Conexão do site com o servidor de jogo do PVP (WebSocket), com reconexão automática.
// O endereço do servidor vem de VITE_PVP_SERVER (no site publicado); no computador, ws://localhost:8787.

export const PVP_URL = import.meta.env.VITE_PVP_SERVER ||
  `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.hostname}:8787`

// getToken(): devolve o crachá do Supabase (login anônimo) na hora de conectar
export function connectPvp({ url = PVP_URL, getToken, onMessage, onStatus }) {
  let ws = null
  let closed = false
  let retry = 0
  let timer = 0

  const open = () => {
    onStatus?.(retry ? 'reconnecting' : 'connecting')
    try { ws = new WebSocket(url) } catch { schedule(); return }
    ws.onopen = async () => {
      retry = 0
      let token = null
      try { token = await getToken() } catch { /* sem crachá: o servidor responde com erro */ }
      if (ws?.readyState === 1) ws.send(JSON.stringify({ t: 'hello', token }))
      onStatus?.('open')
    }
    ws.onmessage = (e) => {
      let m
      try { m = JSON.parse(e.data) } catch { return }
      if (m.t === 'kicked') closed = true // abriu o jogo em outra aba: esta para de tentar
      onMessage(m)
    }
    ws.onclose = () => {
      ws = null
      if (closed) { onStatus?.('closed'); return }
      schedule()
    }
  }
  const schedule = () => {
    onStatus?.('reconnecting')
    clearTimeout(timer)
    timer = setTimeout(open, Math.min(4000, 400 * 2 ** retry++))
  }
  open()

  return {
    send(obj) { if (ws?.readyState === 1) ws.send(JSON.stringify(obj)) },
    close() { closed = true; clearTimeout(timer); ws?.close() },
  }
}
