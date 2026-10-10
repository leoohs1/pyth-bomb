import { LAUNCHED, BETA_KEY } from './PlayGate.jsx'

// Link de convite da sala: abre direto na tela de entrar, com o código já preenchido.
// Enquanto o jogo está fechado (LAUNCHED = false em PlayGate.jsx) o link leva também a chave de teste.
export function buildInviteLink(code) {
  const u = new URL('/play', window.location.origin)
  if (!LAUNCHED) u.searchParams.set('beta', BETA_KEY)
  u.searchParams.set('room', code)
  return u.toString()
}

// texto que o botão Copy coloca na área de transferência (pronto pra colar no WhatsApp/Discord)
export function inviteMessage(code) {
  return `Join my Pyth Bomb room! 💣\n${buildInviteLink(code)}\nRoom code: ${code}`
}

// código vindo do link (?room=PYTHFY), limpo (só letras e números, maiúsculo), ou '' se não tem
export function readInviteCode() {
  try {
    const c = new URLSearchParams(window.location.search).get('room') || ''
    return c.replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, 8)
  } catch {
    return ''
  }
}
