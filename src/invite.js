import { LAUNCHED, BETA_KEY } from './PlayGate.jsx'

// Link de convite da sala: abre direto na tela de entrar, com o código já preenchido.
// Enquanto o jogo está fechado (LAUNCHED = false em PlayGate.jsx) o link leva também a chave de teste.
// `path`: endereço do modo (o Hot Potato fica em /play; o Guess the Price em /price)
export function buildInviteLink(code, path = '/play') {
  const u = new URL(path, window.location.origin)
  if (!LAUNCHED) u.searchParams.set('beta', BETA_KEY)
  u.searchParams.set('room', code)
  return u.toString()
}

// nome de cada modo no convite (o resto é Pyth Bomb)
const INVITE_NAMES = { '/price': 'Guess the Price room! 📈', '/song': 'Guess the Song room! 🎵' }

// texto que o botão Copy coloca na área de transferência (pronto pra colar no WhatsApp/Discord)
export function inviteMessage(code, path = '/play') {
  return `Join my ${INVITE_NAMES[path] ?? 'Pyth Bomb room! 💣'}\n${buildInviteLink(code, path)}\nRoom code: ${code}`
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
