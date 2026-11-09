// Conexão do site com o servidor de jogo do PVP (WebSocket), com reconexão automática.
// Endereço do servidor: no site publicado, o servidor do Railway (Europa); no computador (localhost), o servidor local
// (node server/index.js, porta 8787). ?server=railway no computador testa contra o Railway. VITE_PVP_SERVER troca tudo.
const RAILWAY_URL = 'wss://pyth-bomb-production.up.railway.app'
const LOCAL = ['localhost', '127.0.0.1'].includes(window.location.hostname)
const FORCE_RAILWAY = new URLSearchParams(window.location.search).get('server') === 'railway'

export const PVP_URL = import.meta.env.VITE_PVP_SERVER ||
  (LOCAL && !FORCE_RAILWAY ? `ws://${window.location.hostname}:8787` : RAILWAY_URL)

// getToken(): devolve o crachá do Supabase (login anônimo) na hora de conectar
// TESTE (só no computador): ?lag=250 atrasa cada mensagem 125 ms pra ir e 125 ms pra voltar, como uma internet longe
const LAG = import.meta.env.DEV ? Math.max(0, Number(new URLSearchParams(window.location.search).get('lag')) || 0) / 2 : 0
const later = (fn) => (LAG ? setTimeout(fn, LAG) : fn())

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
      later(() => onMessage(m))
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
    send(obj) { const str = JSON.stringify(obj); later(() => { if (ws?.readyState === 1) ws.send(str) }) },
    close() { closed = true; clearTimeout(timer); ws?.close() },
  }
}
