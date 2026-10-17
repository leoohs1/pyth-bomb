// Lembra a sala do Guess the Price no navegador (separada da sala do Hot Potato), pra voltar
// direto pra ela depois de um refresh. Mesmo esquema do roomStorage.js (?tab=1 = por aba).
import { store } from '../storageMode'

const KEY = 'pythbomb:price-code'

export function savePriceRoom(code) {
  try { store()?.setItem(KEY, code) } catch { /* sem storage: tudo bem */ }
}
export function loadPriceRoom() {
  try { return store()?.getItem(KEY) ?? null } catch { return null }
}
export function clearPriceRoom() {
  try { store()?.removeItem(KEY) } catch { /* nada a limpar */ }
}
