// Quem é quem: cada navegador já tem um "crachá anônimo" do Supabase (o mesmo login sem cadastro dos outros modos).
// O navegador manda o crachá (token) quando conecta e o servidor pergunta ao Supabase se ele é verdadeiro.
// Assim ninguém se passa por outra pessoa, e quem cai da internet volta como ele mesmo.
// Só precisa do endereço e da chave PÚBLICA do Supabase (as mesmas que já ficam no site): nada de segredo aqui.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// no Railway: variáveis SUPABASE_URL e SUPABASE_ANON_KEY. No computador: lê do .env.local do site (VITE_...)
function loadLocalEnv() {
  try {
    const file = readFileSync(fileURLToPath(new URL('../.env.local', import.meta.url)), 'utf8')
    const out = {}
    for (const line of file.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m) out[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
    }
    return out
  } catch { return {} }
}
const local = process.env.SUPABASE_URL ? {} : loadLocalEnv()
const URL_ = process.env.SUPABASE_URL || local.VITE_SUPABASE_URL || ''
const KEY = process.env.SUPABASE_ANON_KEY || local.VITE_SUPABASE_ANON_KEY || ''
export const authReady = !!(URL_ && KEY)
export const supabaseConfig = { url: URL_, key: KEY } // (endereço e chave pública, pro toque diário)

const cache = new Map() // token -> { id, until }

// devolve o id do usuário (ou null se o crachá não vale)
export async function verifyToken(token) {
  if (!authReady || typeof token !== 'string' || token.length < 20 || token.length > 4000) return null
  const hit = cache.get(token)
  if (hit && hit.until > Date.now()) return hit.id
  try {
    const res = await fetch(`${URL_}/auth/v1/user`, { headers: { apikey: KEY, Authorization: `Bearer ${token}` } })
    if (!res.ok) return null
    const user = await res.json()
    if (!user?.id) return null
    cache.set(token, { id: user.id, until: Date.now() + 10 * 60 * 1000 })
    if (cache.size > 5000) cache.clear()
    return user.id
  } catch {
    return null
  }
}
