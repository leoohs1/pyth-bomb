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
let playing = false
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
  if (!started || hidden || st.musicMuted || silenced) return 0
  const onPlay = typeof location !== 'undefined' && /^\/(play|price|song)/.test(location.pathname)
  return VOLUME * st.musicVolume * (duck || onPlay ? DUCK : 1)
}

function rampTo(to, ms = FADE_MS) {
  const a = ensure()
  clearInterval(fadeTimer)
  if (to > 0 && a.paused) {
    a.play().then(() => { playing = true; stopListening() }).catch(() => { /* ainda sem gesto (iPhone só aceita toque/clique): tenta de novo no próximo */ })
  }
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

// silêncio total por um tempo (ex.: Guess the Song, enquanto toca o trecho da rodada)
let silenced = false
export function setMusicSilenced(v) {
  silenced = !!v
  apply()
}

export function setMusicDuck(v) {
  duck = !!v
  apply()
}

// Cada modo pode ter a própria música (ex.: setMusicTrack('/music/price.mp3') no Guess the Price).
// Só troca se o arquivo existir de verdade; sem ele, continua a faixa atual. Sem argumento = a padrão.
let track = SRC
export async function setMusicTrack(src = SRC) {
  if (src === track) return
  if (src !== SRC) {
    try {
      const r = await fetch(src, { method: 'HEAD' })
      // sem o arquivo, o servidor devolve a página inicial (html) — não é áudio
      if (!r.ok || !(r.headers.get('content-type') || '').includes('audio')) return
    } catch { return }
  }
  track = src
  const a = ensure()
  const wasPlaying = !a.paused
  a.src = src
  if (wasPlaying) a.play().catch(() => { /* sem gesto ainda: começa no próximo toque */ })
}

// primeiro gesto da pessoa: começa a música (fade curtinho, pra não parecer atraso)
function start() {
  if (playing) return
  started = true
  ensure()
  apply(500)
}
const GESTURES = ['pointerdown', 'click', 'touchend', 'keydown']
function stopListening() {
  GESTURES.forEach((e) => window.removeEventListener(e, start))
}

if (typeof window !== 'undefined') {
  ensure()
  audio.load() // já vai baixando o arquivo (2 MB) pra começar na hora do primeiro toque
  GESTURES.forEach((e) => window.addEventListener(e, start, { passive: true }))
  subscribeSound(() => apply(180)) // mexer no controle responde rápido
  document.addEventListener('visibilitychange', () => {
    hidden = document.visibilityState === 'hidden'
    apply()
  })
}
