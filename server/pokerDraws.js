// Pyth Poker: deixa sorteios do Pyth Entropy PRONTOS no Supabase, pra mesa nunca esperar a blockchain.
//
// Cada sorteio: segredo de 32 bytes -> commit = sha256(segredo) vai pro contrato (PythBombDraw, o mesmo do PVP)
// junto com o pedido ao Entropy -> chega o número -> guardamos (segredo, commit, número, sequence) na tabela
// escondida public.poker_draws (supabase/poker/K02_poker_entropy.sql). Cada mão nova pega um; o segredo só
// aparece pros jogadores quando a mão termina (tela Verify). Sem sorteio pronto, a mão usa o sorteio do servidor.
//
// Variáveis (painel do Railway; NUNCA no chat nem no GitHub):
//   SUPABASE_URL               (já existe)
//   SUPABASE_SERVICE_ROLE_KEY  chave secreta do Supabase (Project Settings > API keys). Só ela escreve em poker_draws.
//   PVP_WALLET_KEY / PVP_CHAIN / PVP_DRAW_CONTRACT: as mesmas do Entropy do PVP (ver entropy.js)
// Sem a chave do Supabase ou sem o Entropy ligado, isso fica desligado e o poker usa o sorteio do servidor.
import { newSecret, commitOf } from './entropy.js'

const CHECK_EVERY_MS = 5000

export function startPokerDraws({ entropy, env = process.env, log = console.log } = {}) {
  const url = (env.SUPABASE_URL || '').replace(/\/+$/, '')
  const key = (env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  const state = { on: false, ready: null, made: 0, failed: 0, lastError: null, reason: null }
  if (!entropy?.state?.enabled) { state.reason = 'Entropy off'; log('Poker draws: off (Entropy is off)'); return { state } }
  if (!url || !key) { state.reason = 'no SUPABASE_SERVICE_ROLE_KEY'; log('Poker draws: off (no SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)'); return { state } }
  state.on = true

  // chave nova (sb_secret_...) vai só no apikey; a antiga (JWT eyJ...) também vai no Authorization
  const headers = { apikey: key, 'content-type': 'application/json', ...(key.startsWith('eyJ') ? { authorization: `Bearer ${key}` } : {}) }
  const bytea = (buf) => '\\x' + Buffer.from(buf).toString('hex')

  async function count(path) {
    const res = await fetch(`${url}/rest/v1/${path}`, { headers: { ...headers, prefer: 'count=exact', range: '0-0' } })
    if (!res.ok) throw new Error(`Supabase ${res.status}: ${(await res.text()).slice(0, 200)}`)
    const total = (res.headers.get('content-range') || '').split('/')[1]
    return Number(total) || 0
  }

  // quantos deixar prontos: poucos quando ninguém joga, mais quando tem mesa rolando
  async function target() {
    const playing = await count('rooms?select=id&mode=eq.poker&status=eq.playing')
    return playing === 0 ? 2 : Math.min(20, 4 + 2 * playing)
  }

  async function makeOne() {
    const secret = newSecret()
    const commit = commitOf(secret)
    const r = await entropy.draw(commit, 40000)
    const row = {
      chain: r.chain, chain_name: r.chainName, contract: r.contract, explorer: r.explorer,
      sequence: String(r.sequence), tx: r.tx, commit: bytea(Buffer.from(commit.slice(2), 'hex')),
      random: bytea(Buffer.from(String(r.random).slice(2), 'hex')), secret: bytea(secret),
    }
    const res = await fetch(`${url}/rest/v1/poker_draws`, { method: 'POST', headers: { ...headers, prefer: 'return=minimal' }, body: JSON.stringify(row) })
    if (!res.ok) throw new Error(`Supabase ${res.status}: ${(await res.text()).slice(0, 200)}`)
    state.made++
    log(`Poker draws: +1 ready (sequence ${row.sequence}, ${r.ms} ms)`)
  }

  let busy = false
  let backoffUntil = 0
  async function loop() {
    if (busy || Date.now() < backoffUntil) return
    busy = true
    try {
      const ready = await count('poker_draws?select=id&used_at=is.null')
      state.ready = ready
      if (ready < await target()) { await makeOne(); state.ready = ready + 1; state.lastError = null }
    } catch (e) {
      state.failed++
      state.lastError = e.shortMessage || e.message
      log('Poker draws: ' + state.lastError)
      backoffUntil = Date.now() + 30000 // deu erro: espera 30 s antes de tentar de novo
    } finally { busy = false }
  }
  const timer = setInterval(loop, CHECK_EVERY_MS)
  timer.unref?.()
  log('Poker draws: on — keeping Pyth Entropy draws ready for poker hands')
  return { state, stop: () => clearInterval(timer), _loop: loop }
}

