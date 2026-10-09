import Landing from './Landing.jsx'

// Portão do /play enquanto o jogo está FECHADO pro público.
// - Aberto pra quem já tem a chave de teste guardada no navegador.
// - Pra receber a chave: abrir uma vez /play?beta=bomba-beta-7Q4K (guarda no navegador e limpa o endereço).
// - Todo o resto vê a Landing com 'Coming soon'.
// Pra ABRIR o jogo de vez: trocar LAUNCHED para true.
// (É um portão simples de 'beta fechado', não segurança de verdade: a chave está no código do site.)
const LAUNCHED = false
const BETA_KEY = 'bomba-beta-7Q4K'
const STORE = 'pb_beta'

function hasAccess() {
  if (LAUNCHED) return true
  try {
    // perdoa maiúscula/minúscula e pontuação colada no fim do link (ex.: um ponto final do chat)
    const q = (new URLSearchParams(window.location.search).get('beta') ?? '').trim().replace(/[^A-Za-z0-9]+$/, '')
    if (q && q.toLowerCase() === BETA_KEY.toLowerCase()) {
      localStorage.setItem(STORE, '1')
      const keep = new URLSearchParams(window.location.search)
      keep.delete('beta')
      const rest = keep.toString()
      window.history.replaceState(null, '', window.location.pathname + (rest ? '?' + rest : ''))
    }
    return localStorage.getItem(STORE) === '1'
  } catch {
    return false
  }
}

export default function PlayGate({ children }) {
  return hasAccess() ? children : <Landing label="Coming soon" />
}
