// Modo "uma pessoa por aba", só pra TESTAR com vários jogadores no mesmo computador.
// Normalmente o navegador guarda o crachá (login anônimo) e a sala no localStorage, que é
// compartilhado entre todas as abas (e entre todas as janelas anônimas): resultado, todas as
// abas viram o MESMO jogador. Abrindo o link com &tab=1, cada aba passa a guardar tudo no
// sessionStorage, que é separado por aba: cada aba é um jogador diferente.
const FLAG = 'pb_pertab'

function detect() {
  try {
    if (new URLSearchParams(window.location.search).get('tab') === '1') window.sessionStorage.setItem(FLAG, '1')
    return window.sessionStorage.getItem(FLAG) === '1'
  } catch {
    return false
  }
}

export const perTab = typeof window !== 'undefined' && detect()

// onde guardar sala/apelido (e o login): por aba no modo de teste, senão no navegador todo
export function store() {
  try { return perTab ? window.sessionStorage : window.localStorage } catch { return null }
}
