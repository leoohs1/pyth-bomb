// Controles do modo Solo, separados em duas partes:
//
// 1) `createControls()` guarda só AÇÕES: quais direções estão seguradas e se pediram bomba.
//    As regras do jogo (game.js) leem só isso, sem saber de onde veio.
// 2) `bindKeyboard()` traduz teclas em ações. Um direcional na tela (celular, mais tarde)
//    é só outra fonte que chama os mesmos press()/release().

export const ACTIONS = ['up', 'down', 'left', 'right', 'bomb']

export function createControls() {
  const held = []          // direções seguradas, a mais recente no fim
  let bombQueued = false

  return {
    press(action) {
      if (action === 'bomb') { bombQueued = true; return }
      if (!held.includes(action)) held.push(action)
    },
    release(action) {
      if (action === 'bomb') return
      const i = held.indexOf(action)
      if (i >= 0) held.splice(i, 1)
    },
    // a direção vale a ÚLTIMA tecla apertada que ainda está segurada
    direction() {
      return held.length ? held[held.length - 1] : null
    },
    // devolve true uma vez por toque na bomba
    takeBomb() {
      const b = bombQueued
      bombQueued = false
      return b
    },
    clear() {
      held.length = 0
      bombQueued = false
    },
  }
}

const KEYMAP = {
  KeyW: 'up', ArrowUp: 'up',
  KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  Space: 'bomb',
}

// Liga o teclado aos controles. `onKey` recebe as outras teclas (ex.: R pra recomeçar).
// Devolve a função que desliga tudo.
export function bindKeyboard(controls, onKey) {
  function down(e) {
    const action = KEYMAP[e.code]
    if (action) {
      e.preventDefault() // setas e espaço não rolam a página
      if (!e.repeat || action !== 'bomb') controls.press(action)
    } else if (onKey) {
      onKey(e)
    }
  }
  function up(e) {
    const action = KEYMAP[e.code]
    if (action) controls.release(action)
  }
  function blur() { controls.clear() } // trocou de janela: solta tudo
  window.addEventListener('keydown', down)
  window.addEventListener('keyup', up)
  window.addEventListener('blur', blur)
  return () => {
    window.removeEventListener('keydown', down)
    window.removeEventListener('keyup', up)
    window.removeEventListener('blur', blur)
  }
}
