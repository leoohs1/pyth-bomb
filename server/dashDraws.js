// Pyth Dash: o prêmio dos baús sai do Pyth Entropy. UM sorteio por partida (não um por baú: seria lento e caro).
//
// Como funciona (o mesmo commit-reveal do torneio do PVP, ver entropy.js):
//   1. O servidor deixa alguns sorteios PRONTOS na memória: segredo -> commit = sha256(segredo) vai pro contrato
//      PythBombDraw junto com o pedido ao Entropy -> chega o número.
//   2. A fase começa: GET /dash/run pega um sorteio pronto (sem esperar a blockchain) e cria a partida.
//      semente = sha256(segredo || número do Entropy). O jogador recebe o commit e o link da transação (não o segredo).
//   3. Abriu o baú n: GET /dash/chest?run=..&n=.. -> prêmio = lootFor(sha256(semente || "chest:n")). Quem decide é o
//      servidor, então ninguém sabe antes nem consegue trocar o prêmio.
//   4. Fim da fase: GET /dash/reveal?run=.. -> devolve o segredo. Qualquer um confere: sha256(segredo) = commit
//      (que estava na blockchain antes do número sair) e refaz a conta de cada baú.
// Sem Entropy (ou sem sorteio pronto), a partida usa um número do próprio servidor e fica marcada "server" (sem prova).
// Tudo na memória: se o servidor reiniciar, as partidas abertas viram "server" no próximo baú (o jogo segue).
import { randomBytes } from 'node:crypto'
import { newSecret, commitOf, seedOf, seedNumber, hex } from './entropy.js'
import { LOOT_TABLE, lootFor, ODDS } from '../src/dash/loot.js'

const KEEP_READY = 3         // quantos sorteios deixar prontos
const MIN_GAP_MS = 20_000    // no máximo 1 sorteio novo a cada 20 s (protege a carteira se alguém abusar)
const RUN_TTL_MS = 60 * 60_000
const MAX_RUNS = 5000
const RUNS_PER_MIN_PER_IP = 12

// tabela de prêmios: a mesma do jogo (src/dash/loot.js)
export { LOOT_TABLE, lootFor }

export function startDashDraws({ entropy, log = console.log } = {}) {
  const ready = []          // sorteios prontos: { secret, commit, random, sequence, tx, explorer, chainName, chain, contract }
  const runs = new Map()    // id -> partida
  const ipHits = new Map()  // ip -> { minute, n }
  const state = { on: !!entropy?.state?.enabled, ready: 0, made: 0, runs: 0, lastError: null }
  let busy = false, lastStart = 0

  async function refill() {
    if (!state.on || busy || ready.length >= KEEP_READY || Date.now() - lastStart < MIN_GAP_MS) return
    if (!entropy.state.ready) return
    busy = true; lastStart = Date.now()
    try {
      const secret = newSecret()
      const commit = commitOf(secret)
      const r = await entropy.draw(commit, 40000)
      ready.push({ secret, commit, random: r.random, sequence: String(r.sequence), tx: r.tx, explorer: r.explorer, chainName: r.chainName, chain: r.chain, contract: r.contract })
      state.made++; state.lastError = null
      log(`Dash draws: +1 ready (sequence ${r.sequence}, ${r.ms} ms)`)
    } catch (e) {
      state.lastError = e.shortMessage || e.message
      log('Dash draws: ' + state.lastError)
    } finally { busy = false; state.ready = ready.length }
  }
  const timer = setInterval(refill, 5000)
  timer.unref?.()

  function cleanup() {
    const now = Date.now()
    for (const [id, r] of runs) if (now - r.at > RUN_TTL_MS) runs.delete(id)
    while (runs.size > MAX_RUNS) runs.delete(runs.keys().next().value)
  }

  function newRun(ip) {
    const minute = Math.floor(Date.now() / 60000)
    const hit = ipHits.get(ip)
    if (hit && hit.minute === minute && hit.n >= RUNS_PER_MIN_PER_IP) return { error: 'Too many runs, wait a minute' }
    ipHits.set(ip, hit && hit.minute === minute ? { minute, n: hit.n + 1 } : { minute, n: 1 })
    if (ipHits.size > 20000) ipHits.clear()
    cleanup()
    const d = ready.shift()
    state.ready = ready.length
    const id = hex(randomBytes(12)).slice(2)
    let run
    if (d) {
      run = { id, at: Date.now(), via: 'entropy', secret: d.secret, random: d.random, seed: seedOf(d.secret, d.random), proof: { commit: d.commit, sequence: d.sequence, tx: d.tx, explorer: d.explorer, chainName: d.chainName, chain: d.chain, contract: d.contract, random: d.random } }
    } else {
      const secret = newSecret(), random = hex(randomBytes(32))
      run = { id, at: Date.now(), via: 'server', secret, random, seed: seedOf(secret, random), proof: { commit: commitOf(secret), random } }
    }
    run.opened = new Map()
    run.revealed = false
    runs.set(id, run)
    state.runs++
    refill()
    return { run: id, via: run.via, proof: run.proof, odds: ODDS }
  }

  function chest(id, n) {
    const run = runs.get(id)
    if (!run) return { error: 'Run not found' }
    if (run.revealed) return { error: 'Run already finished' }
    const k = Math.floor(Number(n))
    if (!Number.isInteger(k) || k < 0 || k > 50) return { error: 'Bad chest' }
    if (!run.opened.has(k)) run.opened.set(k, lootFor(seedNumber(run.seed, `chest:${k}`)))
    return { chest: k, loot: run.opened.get(k), via: run.via }
  }

  function reveal(id) {
    const run = runs.get(id)
    if (!run) return { error: 'Run not found' }
    run.revealed = true
    return { run: id, via: run.via, secret: hex(run.secret), random: run.random, proof: run.proof, chests: Object.fromEntries(run.opened), formula: 'seed = sha256(secret || random); chest n = lootFor(first 4 bytes of sha256(seed || "chest:n")); roll = (that number mod 10000) / 100' }
  }

  // rotas HTTP: devolve true se cuidou do pedido
  function handle(req, res) {
    const url = new URL(req.url, 'http://x')
    if (!url.pathname.startsWith('/dash/')) return false
    const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim()
    let out
    if (url.pathname === '/dash/run') out = newRun(ip)
    else if (url.pathname === '/dash/chest') out = chest(url.searchParams.get('run'), url.searchParams.get('n'))
    else if (url.pathname === '/dash/reveal') out = reveal(url.searchParams.get('run'))
    else out = { error: 'Not found' }
    res.writeHead(out.error ? 400 : 200, { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'cache-control': 'no-store' })
    res.end(JSON.stringify(out))
    return true
  }

  log(state.on ? 'Dash draws: on — keeping Pyth Entropy draws ready for Pyth Dash chests' : 'Dash draws: Entropy off — chests use the server draw')
  return { state, handle, refill, _ready: ready }
}
