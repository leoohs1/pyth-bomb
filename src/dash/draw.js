// Sorteio dos baús do Pyth Dash pelo servidor de jogo (Pyth Entropy). Ver server/dashDraws.js.
// Se o servidor não responder, o baú usa um sorteio local (marcado 'local', sem prova) e o jogo não para.
import { PVP_URL } from '../pvp/net.js'
import { lootFor, ODDS } from './loot.js'

const BASE = PVP_URL.replace(/^ws/, 'http')

async function get(path, ms = 4000) {
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), ms)
  try {
    const res = await fetch(BASE + path, { signal: ctl.signal, cache: 'no-store' })
    const data = await res.json()
    if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`)
    return data
  } finally { clearTimeout(t) }
}

// começa a partida: { run, via: 'entropy'|'server'|'local', proof, odds }
export async function startRun() {
  try { return await get('/dash/run') } catch { return { run: null, via: 'local', proof: null, odds: ODDS } }
}

function localLoot() {
  const a = new Uint32Array(1)
  crypto.getRandomValues(a)
  return { ...lootFor(a[0]), via: 'local' }
}

// prêmio do baú n (espera a partida começar no servidor, se ainda estiver chegando)
export async function chestLoot(runPromise, n) {
  const info = await runPromise
  if (!info?.run) return localLoot()
  try {
    const r = await get(`/dash/chest?run=${encodeURIComponent(info.run)}&n=${n}`)
    return { ...r.loot, via: r.via }
  } catch { return localLoot() }
}

// fim da fase: o servidor mostra o segredo (pra conferir o sorteio)
export async function revealRun(runPromise) {
  const info = await runPromise
  if (!info?.run) return null
  try { return await get(`/dash/reveal?run=${encodeURIComponent(info.run)}`) } catch { return null }
}
