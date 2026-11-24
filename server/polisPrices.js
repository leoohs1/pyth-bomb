// Pyth Polis: o Market paga preços REAIS da Pyth. Uma vez por minuto este servidor pega o último preço de 7 feeds no
// Hermes (ouro, trigo, algodão, alumínio, cobre, boi gordo + Brent pra oliva) e grava no Supabase com polis_set_prices
// (supabase/polis/G05_gold_market.sql). UMA chamada por minuto pro servidor inteiro, não importa quantos jogadores.
//
// Variáveis (painel do Railway; NUNCA no chat nem no GitHub):
//   PYTH_API_KEY               chave de API da Pyth (desde ago/2026 o Hermes pede chave pra dar preço)
//   PYTH_HERMES_URL            opcional, padrão https://hermes.pyth.network
//   SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY   (já existem, as mesmas do poker): só a chave secreta grava preço
// Sem a chave da Pyth, fica desligado e o Market usa os preços base (o jogo funciona igual).
const EVERY_MS = 60_000
const TIMEOUT = 8000
export const POLIS_FEEDS = {
  gold: 'fa0f57505be633c026896e15afef2c7ce2cf8ff9a45349d1da737f4f01266b01', // Metal.Index.GOLD/USD
  grain: '2ce2d1aed956d847f4b72c28c1fb5a520107a0500d8f180bedbe4f45b758794c', // Commodities.Index.RWHEAT/USc
  wood: 'cddebbb880cbe01c5fd98e8700e16ce4268ec20e02d21122b607a040341a2af9', // Commodities.Index.RCOTTON/USc
  marble: '9397ba38556359e78a52853b5db5e350e86b9e9a6c01094698130112f3d10cb6', // Metal.AL3M/USD
  bronze: 'b2b238aeb6ef5a722c5cf278595bf40434e174cac4f88c8ad5b6f5009b548c59', // Commodities.Index.CU/USD
  fish: '15a3e4116a15e60b1b4a168348a16ebdadc476f5a6f5cb962bd5724f42727d23', // Commodities.Index.RLIVECATTLE/USc
  olive: 'f33ce961935076ef4dc98be75cf2126046eac1bffdcd7a0fa05ccf18b746fda6', // Commodities.Index.BRENT/USD (faixa de preços)
}

// resposta do Hermes (parsed) -> { gold: { usd, t }, ... }
export function pricesFromHermes(json) {
  const out = {}
  for (const p of json?.parsed ?? []) {
    const kind = Object.keys(POLIS_FEEDS).find((k) => POLIS_FEEDS[k] === String(p.id).replace(/^0x/, ''))
    if (!kind || !p.price) continue
    const e = Number(p.price.expo)
    const usd = e < 0 ? Number(p.price.price) / 10 ** -e : Number(p.price.price) * 10 ** e
    if (Number.isFinite(usd) && usd > 0) out[kind] = { usd, t: Number(p.price.publish_time) }
  }
  return out
}

export function startPolisPrices({ env = process.env, log = console.log, fetchFn = fetch } = {}) {
  const pythKey = (env.PYTH_API_KEY || '').trim()
  const hermes = (env.PYTH_HERMES_URL || 'https://hermes.pyth.network').replace(/\/+$/, '')
  const url = (env.SUPABASE_URL || '').replace(/\/+$/, '')
  const key = (env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  const state = { on: false, reason: null, updates: 0, lastError: null, lastOkAt: null, kinds: 0 }
  if (!pythKey) { state.reason = 'no PYTH_API_KEY'; log('Polis prices: off (no PYTH_API_KEY)'); return { state } }
  if (!url || !key) { state.reason = 'no SUPABASE_SERVICE_ROLE_KEY'; log('Polis prices: off (no SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)'); return { state } }
  state.on = true
  const sbHeaders = { apikey: key, 'content-type': 'application/json', ...(key.startsWith('eyJ') ? { authorization: `Bearer ${key}` } : {}) }
  const query = Object.values(POLIS_FEEDS).map((id) => `ids[]=${id}`).join('&')

  async function beat() {
    try {
      const r = await fetchFn(`${hermes}/v2/updates/price/latest?parsed=true&encoding=hex&${query}`, {
        headers: { authorization: `Bearer ${pythKey}`, accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT),
      })
      if (!r.ok) throw new Error(`Hermes ${r.status}: ${(await r.text()).slice(0, 100)}`)
      const prices = pricesFromHermes(await r.json())
      if (!prices.gold) throw new Error('Hermes sent no gold price')
      const s = await fetchFn(`${url}/rest/v1/rpc/polis_set_prices`, { method: 'POST', headers: sbHeaders, body: JSON.stringify({ p: prices }), signal: AbortSignal.timeout(TIMEOUT) })
      if (s.status === 404) throw new Error('polis_set_prices not found (run supabase/polis/G05_gold_market.sql)')
      if (!s.ok) throw new Error(`Supabase ${s.status}: ${(await s.text()).slice(0, 100)}`)
      if (!state.lastOkAt || state.lastError) log(`Polis prices: on (${Object.keys(prices).length} feeds)`)
      state.updates++; state.kinds = Object.keys(prices).length; state.lastOkAt = Date.now(); state.lastError = null
    } catch (e) {
      if (state.lastError !== e.message) log('Polis prices: ' + e.message)
      state.lastError = e.name === 'TimeoutError' ? 'timeout' : e.message
    }
  }
  beat()
  const timer = setInterval(beat, EVERY_MS)
  timer.unref?.()
  return { state, stop: () => clearInterval(timer), beat }
}
