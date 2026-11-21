// O RELÓGIO dos modos do Supabase (Hot Potato/Classic, Guess the Person, Song, Price, Poker).
// Antes cada celular chamava o "tick" da sala 1x por segundo (13 celulares = 13 chamadas por segundo por sala) e o
// Supabase grátis travava. Agora este servidor, que fica ligado o tempo todo, chama tick_all() 2x por segundo:
// UMA chamada avança todas as salas que estão jogando (supabase/046_server_clock.sql). Os celulares só cutucam de
// vez em quando, de reserva. Usa só a chave PÚBLICA (anon), igual ao login.
const EVERY = 500        // ms entre chamadas
const SLOW = 30000       // se a função ainda não foi instalada no Supabase, tenta de novo a cada 30 s
const TIMEOUT = 4000

export function startGameClock({ url, key, log = console.log }) {
  const state = { on: false, missing: false, rooms: 0, calls: 0, errors: 0, lastError: null, lastOkAt: null }
  if (!url || !key) { state.lastError = 'no SUPABASE_URL / SUPABASE_ANON_KEY'; log('Game clock: off (no Supabase config)'); return { state } }
  const headers = { apikey: key, 'content-type': 'application/json', ...(key.startsWith('sb_') ? {} : { authorization: `Bearer ${key}` }) }
  let busy = false
  let timer = null
  const next = (ms) => { clearTimeout(timer); timer = setTimeout(beat, ms) }

  async function beat() {
    if (busy) return next(EVERY)
    busy = true
    let wait = EVERY
    try {
      const res = await fetch(`${url}/rest/v1/rpc/tick_all`, { method: 'POST', headers, body: '{}', signal: AbortSignal.timeout(TIMEOUT) })
      state.calls++
      if (res.status === 404) {
        // a função ainda não existe no Supabase (falta rodar o 046): os celulares continuam com o tique de reserva
        if (!state.missing) log('Game clock: tick_all() not found in Supabase (run supabase/046_server_clock.sql)')
        state.missing = true; state.on = false; wait = SLOW
      } else if (!res.ok) {
        state.errors++
        state.lastError = `Supabase ${res.status}: ${(await res.text()).slice(0, 120)}`
        state.on = false; wait = 2000
      } else {
        const out = await res.json()
        if (state.missing || !state.on) log('Game clock: on')
        state.missing = false; state.on = true; state.lastOkAt = Date.now(); state.lastError = null
        if (!out?.skipped) state.rooms = out?.rooms ?? 0
      }
    } catch (e) {
      state.errors++
      state.lastError = e.name === 'TimeoutError' ? 'Supabase did not answer in 4 s' : e.message
      state.on = false; wait = 2000
    } finally {
      busy = false
      next(wait)
    }
  }
  next(1000)
  return { state, stop: () => clearTimeout(timer) }
}
