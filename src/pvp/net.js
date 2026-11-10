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
const QS = new URLSearchParams(window.location.search)
const LAG = import.meta.env.DEV ? Math.max(0, Number(QS.get('lag')) || 0) / 2 : 0
// ?jitter=120: cada mensagem atrasa mais 0 a 120 ms (sem trocar a ordem, como na internet de verdade)
// ?spike=1: de vez em quando (2%) a internet "trava" 400 ms e depois solta tudo de uma vez
const JIT = import.meta.env.DEV ? Math.max(0, Number(QS.get('jitter')) || 0) : 0
const SPIKE = import.meta.env.DEV && QS.get('spike') === '1'
let releaseIn = 0, releaseOut = 0
const delayFor = (dir) => {
  if (!LAG && !JIT && !SPIKE) return 0
  const now = performance.now()
  let at = now + LAG + Math.random() * JIT + (SPIKE && Math.random() < 0.02 ? 400 : 0)
  if (dir === 'in') { at = Math.max(at, releaseIn); releaseIn = at } else { at = Math.max(at, releaseOut); releaseOut = at }
  return at - now
}
const later = (fn, dir = 'in') => { const d = delayFor(dir); return d ? setTimeout(fn, d) : fn() }

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
    send(obj) { const str = JSON.stringify(obj); later(() => { if (ws?.readyState === 1) ws.send(str) }, 'out') },
    close() { closed = true; clearTimeout(timer); ws?.close() },
  }
}
