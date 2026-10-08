// Música de fundo do Pyth Bomb: uma faixa em loop (public/music/athens.mp3, já masterizada
// bem baixinha), com fade de entrada/saída.
//
// - Só começa depois do primeiro clique/toque/tecla (regra do navegador pra áudio).
// - Usa o MESMO mudo do resto do som (botão 🔊/🔇): mutou, a música para; desmutou, volta.
// - Silencia quando a aba fica escondida.
// - Durante a partida ela abaixa ainda mais ("duck"), pra o coração da bomba e os efeitos
//   aparecerem. Quem chama: GameArenaV2 -> setMusicDuck(true).
import { getSoundState, subscribeSound } from './sound.js'

const SRC = '/music/athens.mp3'
const VOLUME = 0.8        // volume "normal" da música (o arquivo já é baixo)
const DUCK = 0.35         // fração do volume durante a partida
const FADE_MS = 1200

let audio = null
let started = false
let duck = false
let hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden'
let fadeTimer = null

function ensure() {
  if (audio) return audio
  audio = new Audio(SRC)
  audio.loop = true
  audio.preload = 'auto'
  audio.volume = 0
  return audio
}

function target() {
  if (!started || hidden || getSoundState().muted) return 0
  return VOLUME * (duck ? DUCK : 1)
}

function rampTo(to) {
  const a = ensure()
  clearInterval(fadeTimer)
  if (to > 0 && a.paused) a.play().catch(() => { /* ainda sem gesto: tenta de novo no próximo clique */ })
  const from = a.volume
  const t0 = performance.now()
  fadeTimer = setInterval(() => {
    const k = Math.min(1, (performance.now() - t0) / FADE_MS)
    a.volume = Math.max(0, Math.min(1, from + (to - from) * k))
    if (k >= 1) {
      clearInterval(fadeTimer)
      if (to === 0) a.pause()
    }
  }, 40)
}

function apply() {
  if (!started) return
  rampTo(target())
}

export function setMusicDuck(v) {
  duck = !!v
  apply()
}

function start() {
  if (started) return
  started = true
  ensure()
  apply()
}

if (typeof window !== 'undefined') {
  ;['pointerdown', 'keydown'].forEach((e) => window.addEventListener(e, start, { once: true, passive: true }))
  subscribeSound(apply)
  document.addEventListener('visibilitychange', () => {
    hidden = document.visibilityState === 'hidden'
    apply()
  })
}
