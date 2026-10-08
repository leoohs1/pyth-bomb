// Música de fundo do Pyth Bomb: uma faixa em loop (public/music/athens.mp3, já masterizada
// bem baixinha), com fade de entrada/saída.
//
// - Só começa depois do primeiro clique/toque/tecla (regra do navegador pra áudio).
// - Usa o MESMO mudo do resto do som (botão 🔊/🔇): mutou, a música para; desmutou, volta.
// - Silencia quando a aba fica escondida.
// - Na página inicial (pythbomb.com) ela toca no volume normal. Em TODO o /play (modos, home, lobby,
//   partida e fim) cai pra METADE, pra não tirar o foco da bomba. A arena também chama
//   setMusicDuck(true) (cobre a rota de preview, que não é /play).
import { getSoundState, subscribeSound } from './sound.js'

const SRC = '/music/athens.mp3'
const VOLUME = 1.0        // volume máximo da música (o arquivo já é baixo); o controle do jogador multiplica isso
const DUCK = 0.5          // fração do volume durante a partida (metade)
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
  const st = getSoundState()
  if (!started || hidden || st.musicMuted) return 0
  const onPlay = typeof location !== 'undefined' && location.pathname.startsWith('/play')
  return VOLUME * st.musicVolume * (duck || onPlay ? DUCK : 1)
}

function rampTo(to, ms = FADE_MS) {
  const a = ensure()
  clearInterval(fadeTimer)
  if (to > 0 && a.paused) a.play().catch(() => { /* ainda sem gesto: tenta de novo no próximo clique */ })
  const from = a.volume
  const t0 = performance.now()
  fadeTimer = setInterval(() => {
    const k = Math.min(1, (performance.now() - t0) / ms)
    a.volume = Math.max(0, Math.min(1, from + (to - from) * k))
    if (k >= 1) {
      clearInterval(fadeTimer)
      if (to === 0) a.pause()
    }
  }, 40)
}

function apply(ms) {
  if (!started) return
  rampTo(target(), ms)
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
  subscribeSound(() => apply(180)) // mexer no controle responde rápido
  document.addEventListener('visibilitychange', () => {
    hidden = document.visibilityState === 'hidden'
    apply()
  })
}
