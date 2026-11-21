// "Código de volta" do PVP: quando alguém conecta e o Supabase confirma quem é (verifyToken), o servidor entrega um
// código secreto aleatório só pra aquele navegador. Se a internet cair (tela apagou, sinal oscilou), o navegador volta
// mostrando o código e entra na hora como ele mesmo, SEM perguntar ao Supabase. Assim, se o Supabase estiver lento ou
// fora do ar, quem está no torneio continua jogando (antes ninguém conseguia voltar e a final parecia travada).
// Os códigos ficam só na memória (se o servidor reiniciar, volta a valer o login do Supabase).
import { randomBytes } from 'node:crypto'

const TTL = 12 * 60 * 60 * 1000 // vale 12 h desde o último uso
const byCode = new Map() // código -> { id, until }
const byUser = new Map() // id -> código

// devolve o código desse usuário (o mesmo se ainda vale; assim duas abas não brigam) e renova o prazo
export function issueResume(id, now = Date.now()) {
  let code = byUser.get(id)
  const hit = code && byCode.get(code)
  if (!hit || hit.until <= now) {
    if (code) byCode.delete(code)
    code = randomBytes(24).toString('base64url')
    byUser.set(id, code)
  }
  byCode.set(code, { id, until: now + TTL })
  if (byCode.size > 20000) sweep(now)
  return code
}

// quem é o dono do código (ou null se não vale / venceu)
export function useResume(code, now = Date.now()) {
  if (typeof code !== 'string' || code.length < 20 || code.length > 64) return null
  const hit = byCode.get(code)
  if (!hit) return null
  if (hit.until <= now) { byCode.delete(code); if (byUser.get(hit.id) === code) byUser.delete(hit.id); return null }
  hit.until = now + TTL
  return hit.id
}

function sweep(now) {
  for (const [code, v] of byCode) if (v.until <= now) { byCode.delete(code); if (byUser.get(v.id) === code) byUser.delete(v.id) }
}

export const resumeStats = () => ({ codes: byCode.size })
