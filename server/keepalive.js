// "Toque" diário no Supabase: o plano grátis pausa o projeto depois de ~7 dias sem uso (o site mostra "Failed to fetch").
// O servidor de jogo fica ligado o tempo todo no Railway, então ele faz uma consulta simples por dia, o que conta
// como atividade (a mesma consulta do .github/workflows/keepalive.yml). Usa só a chave PÚBLICA (anon).
const DAY = 24 * 60 * 60 * 1000

export function startKeepAlive({ url, key, log = console.log }) {
  if (!url || !key) { log('Supabase keep-alive: off (no SUPABASE_URL / SUPABASE_ANON_KEY)'); return }
  const ping = async () => {
    try {
      const res = await fetch(`${url}/rest/v1/rooms?select=id&limit=1`, { headers: { apikey: key, Authorization: `Bearer ${key}` } })
      log(`Supabase keep-alive: HTTP ${res.status}`)
    } catch (e) {
      log(`Supabase keep-alive failed: ${e.message}`)
    }
  }
  setTimeout(ping, 60 * 1000) // 1 minuto depois de ligar, e depois uma vez por dia
  setInterval(ping, DAY)
}
