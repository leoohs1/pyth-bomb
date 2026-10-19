// Sistema de som do Pyth Bomb.
//
// Cada som tem um NOME (lista em SOUNDS abaixo). Se existir um arquivo
// /sounds/<nome>.mp3 (ou .ogg / .wav) na pasta public/sounds, ele toca; se não
// existir, toca uma versão sintetizada provisória (Web Audio, sem arquivo).
// Então dá pra trocar um som por vez: é só soltar o arquivo com o nome certo.
//
// O navegador só libera áudio depois do primeiro clique/tecla da pessoa — por
// isso o `unlock()` é ligado a esses eventos.

const KEY = 'pb_sound'
const EXTS = ['mp3', 'ogg', 'wav']

export const SOUNDS = [
  'bomb_received', // a bomba chegou em MIM
  'bomb_pass',     // a bomba voa de um jogador pra outro
  'tick',          // batida de coração enquanto eu seguro a bomba (o ritmo acelera com o perigo)
  'clock_tick',    // tique de relógio digital enquanto OUTRO jogador segura a bomba
  'danger_up',     // o perigo subiu de nível (opts.level = 2..4)
  'explosion',     // alguém explodiu
  'wrong',         // resposta errada / tempo da pergunta acabou
  'correct',       // acertei e a bomba saiu de mim
  'eliminated',    // eu fui eliminado
  // Guess the Price
  'lock_in',       // travei meu chute
  'reveal',        // o preço certo aparece
  'perfect',       // PYTH PERFECT (acertei dentro da faixa da Pyth)
  'cash',          // ganhei pontos na rodada
  // Guess the Song
  'get_ready',     // começou a contagem antes da música (tela GET READY)
  'countdown',     // cada número da contagem (menos o primeiro, quando a voz "get ready" fala)
  'go',            // fim da contagem: BEEP de "valendo" logo antes da música entrar
]

// Cada modo pode ter os próprios sons: com setSoundTheme('price'), o jogo procura primeiro
// public/sounds/price/<nome>.mp3 e, se não tiver, usa public/sounds/<nome>.mp3 (e por último
// a versão sintetizada lá embaixo). null = só os sons padrão (Hot Potato).
let theme = null
export function setSoundTheme(t = null) {
  if (theme === t) return
  theme = t
  if (ctx) SOUNDS.forEach((n) => loadFile(n)) // já baixa os do modo novo
}

let ctx = null
let hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden'
let master = null
let noiseBuf = null
const cache = new Map() // nome -> AudioBuffer | null (null = sem arquivo)
const loading = new Set()
const listeners = new Set()

// Dois canais independentes: música ambiente (music.js) e sons do jogo (efeitos). Cada um tem
// mudo e volume (0 a 1), guardados no navegador. Versão antiga guardava só {muted, volume}.
const DEFAULTS = { musicMuted: false, musicVolume: 0.8, sfxMuted: false, sfxVolume: 0.7 }
const clamp01 = (v) => Math.max(0, Math.min(1, Number(v)))
function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY)) || {}
    const old = typeof s.muted === 'boolean' // formato antigo: um mudo só pra tudo
    return {
      musicMuted: typeof s.musicMuted === 'boolean' ? s.musicMuted : (old ? s.muted : DEFAULTS.musicMuted),
      musicVolume: typeof s.musicVolume === 'number' ? clamp01(s.musicVolume) : DEFAULTS.musicVolume,
      sfxMuted: typeof s.sfxMuted === 'boolean' ? s.sfxMuted : (old ? s.muted : DEFAULTS.sfxMuted),
      sfxVolume: typeof s.sfxVolume === 'number' ? clamp01(s.sfxVolume) : (typeof s.volume === 'number' ? clamp01(s.volume) : DEFAULTS.sfxVolume),
    }
  } catch {
    return { ...DEFAULTS }
  }
}
const state = loadState()

function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(state)) } catch { /* sem storage: tudo bem */ }
}
function applyGain() {
  if (master) master.gain.value = state.sfxMuted ? 0 : state.sfxVolume
}
function emit() { listeners.forEach((f) => f({ ...state })) }

export function getSoundState() { return { ...state } }
export function subscribeSound(fn) { listeners.add(fn); return () => listeners.delete(fn) }
function update(patch) { Object.assign(state, patch); persist(); applyGain(); emit() }
export function setSfxMuted(m) { update({ sfxMuted: !!m }) }
export function setSfxVolume(v) { update({ sfxVolume: clamp01(v) }) }
export function setMusicMuted(m) { update({ musicMuted: !!m }) }
export function setMusicVolume(v) { update({ musicVolume: clamp01(v) }) }

function ensure() {
  if (ctx) return ctx
  const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)
  if (!AC) return null
  ctx = new AC()
  master = ctx.createGain()
  master.connect(ctx.destination)
  applyGain()
  return ctx
}

// som guardado por modo: 'price:reveal', 'base:explosion'...
const keyOf = (name) => `${theme ?? 'base'}:${name}`

async function loadFile(name) {
  const key = keyOf(name)
  if (cache.has(key) || loading.has(key)) return
  loading.add(key)
  let buf = null
  const folders = theme ? [`/sounds/${theme}/`, '/sounds/'] : ['/sounds/']
  for (const folder of folders) {
    for (const ext of EXTS) {
      try {
        const r = await fetch(`${folder}${name}.${ext}`)
        // sem o arquivo, o servidor devolve a página inicial (html) — não é áudio
        if (!r.ok || !(r.headers.get('content-type') || '').includes('audio')) continue
        buf = await ctx.decodeAudioData(await r.arrayBuffer())
        break
      } catch { /* tenta a próxima extensão */ }
    }
    if (buf) break
  }
  cache.set(key, buf)
  loading.delete(key)
}

export function unlock() {
  if (hidden) return
  const c = ensure()
  if (!c) return
  if (c.state === 'suspended') c.resume()
  SOUNDS.forEach((n) => loadFile(n))
}
// aba escondida / minimizada: silêncio total (senão a bomba fica apitando em segundo plano)
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    hidden = document.visibilityState === 'hidden'
    if (!ctx) return
    if (hidden) ctx.suspend()
    else ctx.resume()
  })
}
if (typeof window !== 'undefined') {
  // iPhone/Safari só libera o áudio com toque ou clique (pointerdown sozinho não basta)
  ;['pointerdown', 'touchend', 'click', 'keydown'].forEach((e) => window.addEventListener(e, unlock, { passive: true }))
}

// ---------- versões sintetizadas (provisórias) ----------
function noise() {
  if (noiseBuf) return noiseBuf
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
  const d = noiseBuf.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  return noiseBuf
}
function tone({ type = 'sine', f0, f1 = f0, dur = 0.2, gain = 0.3, at = 0 }) {
  const t = ctx.currentTime + at
  const o = ctx.createOscillator(), g = ctx.createGain()
  o.type = type
  o.frequency.setValueAtTime(f0, t)
  o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur)
  g.gain.setValueAtTime(gain, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.connect(g); g.connect(master)
  o.start(t); o.stop(t + dur + 0.02)
}
function swish({ type = 'bandpass', f0, f1, q = 1.5, dur = 0.3, gain = 0.3, at = 0 }) {
  const t = ctx.currentTime + at
  const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain()
  s.buffer = noise(); s.loop = true
  f.type = type; f.Q.value = q
  f.frequency.setValueAtTime(f0, t)
  f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur)
  g.gain.setValueAtTime(gain, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  s.connect(f); f.connect(g); g.connect(master)
  s.start(t); s.stop(t + dur + 0.02)
}

const SYNTH = {
  bomb_received: () => {
    tone({ f0: 95, f1: 38, dur: 0.4, gain: 0.9 })
    swish({ f0: 300, f1: 3200, dur: 0.45, gain: 0.35 })
    tone({ type: 'triangle', f0: 220, f1: 330, dur: 0.18, gain: 0.25, at: 0.05 })
  },
  bomb_pass: () => swish({ f0: 500, f1: 2400, q: 2, dur: 0.24, gain: 0.4 }),
  tick: () => { tone({ f0: 95, f1: 40, dur: 0.14, gain: 0.8 }); tone({ f0: 95, f1: 40, dur: 0.14, gain: 0.6, at: 0.11 }) },
  clock_tick: () => tone({ type: 'sine', f0: 2100, dur: 0.05, gain: 0.12 }),
  danger_up: (o) => {
    const n = Math.max(1, (o.level || 2) - 1)
    for (let i = 0; i < n; i++) tone({ type: 'square', f0: 600 + (o.level || 2) * 120, dur: 0.1, gain: 0.22, at: i * 0.14 })
  },
  explosion: () => {
    swish({ type: 'lowpass', f0: 4200, f1: 180, q: 0.7, dur: 0.95, gain: 0.9 })
    tone({ f0: 75, f1: 24, dur: 0.95, gain: 1 })
  },
  wrong: () => tone({ type: 'sawtooth', f0: 150, f1: 105, dur: 0.28, gain: 0.3 }),
  correct: () => {
    tone({ f0: 660, dur: 0.09, gain: 0.3 })
    tone({ f0: 880, dur: 0.14, gain: 0.3, at: 0.09 })
  },
  eliminated: () => tone({ type: 'triangle', f0: 440, f1: 110, dur: 0.7, gain: 0.35 }),
  // Guess the Price (provisórios, até chegarem os arquivos do modo)
  lock_in: () => { tone({ type: 'square', f0: 1200, dur: 0.04, gain: 0.12 }); tone({ type: 'square', f0: 1600, dur: 0.05, gain: 0.1, at: 0.05 }) },
  reveal: () => { swish({ f0: 300, f1: 2600, q: 1.2, dur: 0.5, gain: 0.3 }); tone({ f0: 140, f1: 70, dur: 0.35, gain: 0.6, at: 0.45 }) },
  perfect: () => [523, 659, 784, 1047].forEach((f, i) => tone({ type: 'triangle', f0: f, dur: 0.16, gain: 0.28, at: i * 0.08 })),
  cash: () => { tone({ f0: 1320, dur: 0.07, gain: 0.2 }); tone({ f0: 1760, dur: 0.12, gain: 0.2, at: 0.07 }) },
  // Guess the Song (provisórios, até chegarem os arquivos em public/sounds/song/)
  get_ready: () => { swish({ f0: 400, f1: 2200, q: 1.5, dur: 0.4, gain: 0.25 }); [659, 988].forEach((f, i) => tone({ type: 'triangle', f0: f, dur: 0.18, gain: 0.25, at: 0.3 + i * 0.12 })) },
  countdown: () => tone({ type: 'sine', f0: 880, dur: 0.09, gain: 0.25 }),
  go: () => { tone({ type: 'sine', f0: 1320, dur: 0.45, gain: 0.3 }); tone({ type: 'triangle', f0: 2640, dur: 0.3, gain: 0.06 }) },
}

export function play(name, opts = {}) {
  if (state.sfxMuted || hidden) return
  const c = ensure()
  if (!c) return
  if (c.state === 'suspended') { c.resume(); return } // ainda sem clique: o navegador não deixa tocar
  if (!cache.has(keyOf(name))) loadFile(name)
  const buf = cache.get(keyOf(name))
  if (buf) {
    const s = ctx.createBufferSource()
    s.buffer = buf
    // o alarme sobe de tom conforme o perigo
    if (name === 'danger_up') s.playbackRate.value = 1 + ((opts.level || 2) - 2) * 0.12
    s.connect(master); s.start()
    return
  }
  SYNTH[name]?.(opts)
}
