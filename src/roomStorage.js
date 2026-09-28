// Guarda a sala/apelido no navegador pra "lembrar" o jogador depois de um refresh.
// Tudo em try/catch: modo anônimo ou navegador restrito pode bloquear o localStorage,
// e nesse caso o jogo simplesmente não lembra de nada, sem quebrar a página.
const CODE_KEY = 'pythbomb:code'
const NICK_KEY = 'pythbomb:nickname'

export function saveRoomCode(code) {
  try { localStorage.setItem(CODE_KEY, code) } catch { /* sem storage: tudo bem */ }
}
export function loadRoomCode() {
  try { return localStorage.getItem(CODE_KEY) } catch { return null }
}
export function clearRoomCode() {
  try { localStorage.removeItem(CODE_KEY) } catch { /* nada a limpar */ }
}

export function saveNickname(nickname) {
  try { localStorage.setItem(NICK_KEY, nickname) } catch { /* sem storage: tudo bem */ }
}
export function loadNickname() {
  try { return localStorage.getItem(NICK_KEY) ?? '' } catch { return '' }
}
