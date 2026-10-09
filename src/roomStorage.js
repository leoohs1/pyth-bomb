// Guarda a sala/apelido no navegador pra "lembrar" o jogador depois de um refresh.
// Tudo em try/catch: modo anônimo ou navegador restrito pode bloquear o armazenamento,
// e nesse caso o jogo simplesmente não lembra de nada, sem quebrar a página.
// (No modo de teste ?tab=1 guarda por aba, ver storageMode.js.)
import { store } from './storageMode'

const CODE_KEY = 'pythbomb:code'
const NICK_KEY = 'pythbomb:nickname'

export function saveRoomCode(code) {
  try { store()?.setItem(CODE_KEY, code) } catch { /* sem storage: tudo bem */ }
}
export function loadRoomCode() {
  try { return store()?.getItem(CODE_KEY) ?? null } catch { return null }
}
export function clearRoomCode() {
  try { store()?.removeItem(CODE_KEY) } catch { /* nada a limpar */ }
}

export function saveNickname(nickname) {
  try { store()?.setItem(NICK_KEY, nickname) } catch { /* sem storage: tudo bem */ }
}
export function loadNickname() {
  try { return store()?.getItem(NICK_KEY) ?? '' } catch { return '' }
}
