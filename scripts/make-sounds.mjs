// Gera os efeitos sonoros do Pyth Bomb por síntese (sem nenhum arquivo de fora).
//   uso:  node scripts/make-sounds.mjs
// Escreve WAV em scripts/.out e converte pra mp3 em public/sounds (precisa do ffmpeg
// no PATH ou na variável FFMPEG). Cada som é uma função abaixo; mexer nos números
// e rodar de novo regrava o arquivo.
import { writeFileSync, mkdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const SR = 44100
const TAU = Math.PI * 2
const OUT_WAV = new URL('./.out/', import.meta.url)
const OUT_MP3 = new URL('../public/sounds/', import.meta.url)
mkdirSync(OUT_WAV, { recursive: true })
mkdirSync(OUT_MP3, { recursive: true })

// ---------- ferramentas ----------
const buf = (sec) => new Float32Array(Math.ceil(sec * SR))
let seed = 1234567
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1 // -1..1, determinístico

// envelope exponencial de ataque curto + decaimento
const env = (t, attack, decay) => (t < attack ? t / attack : Math.exp(-(t - attack) / decay))

function addTo(dst, src, at = 0, gain = 1) {
  const o = Math.round(at * SR)
  for (let i = 0; i < src.length && i + o < dst.length; i++) dst[i + o] += src[i] * gain
}

function synth(sec, fn) {
  const b = buf(sec)
  for (let i = 0; i < b.length; i++) b[i] = fn(i / SR, i)
  return b
}

// oscilador com frequência variável no tempo (integra a fase)
function osc(sec, freqAt, shape = 'sine', ampAt = () => 1) {
  const b = buf(sec)
  let ph = 0
  for (let i = 0; i < b.length; i++) {
    const t = i / SR
    ph += (TAU * freqAt(t)) / SR
    let v
    if (shape === 'sine') v = Math.sin(ph)
    else if (shape === 'tri') v = (2 / Math.PI) * Math.asin(Math.sin(ph))
    else if (shape === 'square') v = Math.sin(ph) >= 0 ? 1 : -1
    else v = ((ph / TAU) % 1) * 2 - 1 // saw
    b[i] = v * ampAt(t)
  }
  return b
}

// filtro biquad com frequência variável (lowpass / highpass / bandpass)
function filter(src, type, freqAt, q = 0.8) {
  const out = new Float32Array(src.length)
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0
  for (let i = 0; i < src.length; i++) {
    const f = Math.min(SR * 0.45, Math.max(20, freqAt(i / SR)))
    const w = (TAU * f) / SR, cw = Math.cos(w), al = Math.sin(w) / (2 * q)
    let b0, b1, b2
    if (type === 'low') { b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = (1 - cw) / 2 }
    else if (type === 'high') { b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = (1 + cw) / 2 }
    else { b0 = al; b1 = 0; b2 = -al }
    const a0 = 1 + al, a1 = -2 * cw, a2 = 1 - al
    const y = (b0 * src[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0
    x2 = x1; x1 = src[i]; y2 = y1; y1 = y
    out[i] = y
  }
  return out
}

const noise = (sec) => synth(sec, () => rnd())

function mul(b, fn) { for (let i = 0; i < b.length; i++) b[i] *= fn(i / SR); return b }

// reverb de Schroeder (4 combs + 2 allpass) — dá "espaço" aos sons
function reverb(src, wet = 0.25, size = 1, tail = 1.2) {
  const out = new Float32Array(src.length + Math.round(tail * SR))
  const x = new Float32Array(out.length); x.set(src)
  const combs = [1557, 1617, 1491, 1422].map((d) => Math.round(d * size))
  const acc = new Float32Array(out.length)
  for (const d of combs) {
    const line = new Float32Array(d); let p = 0
    const fb = 0.8
    for (let i = 0; i < out.length; i++) {
      const y = line[p]
      line[p] = x[i] + y * fb
      p = (p + 1) % d
      acc[i] += y * 0.25
    }
  }
  let sig = acc
  for (const d of [225, 556]) {
    const line = new Float32Array(d); let p = 0
    const o = new Float32Array(out.length)
    for (let i = 0; i < out.length; i++) {
      const z = line[p]
      const v = sig[i] + z * 0.5
      line[p] = v
      o[i] = z - v * 0.5
      p = (p + 1) % d
    }
    sig = o
  }
  for (let i = 0; i < out.length; i++) out[i] = x[i] * (1 - wet * 0.5) + sig[i] * wet * 2.2
  return out
}

function softClip(b, drive = 1.4) {
  for (let i = 0; i < b.length; i++) b[i] = Math.tanh(b[i] * drive) / Math.tanh(drive)
  return b
}

function fade(b, inSec = 0.002, outSec = 0.02) {
  const fi = Math.round(inSec * SR), fo = Math.round(outSec * SR)
  for (let i = 0; i < fi && i < b.length; i++) b[i] *= i / fi
  for (let i = 0; i < fo && i < b.length; i++) b[b.length - 1 - i] *= i / fo
  return b
}

// sino: parciais inarmônicas leves com decaimentos diferentes
function bell(sec, f, gain = 1, decay = 0.35) {
  const parts = [[1, 1, 1], [2.01, 0.5, 0.7], [2.76, 0.32, 0.45], [4.07, 0.18, 0.3], [5.4, 0.1, 0.2]]
  const b = buf(sec)
  for (const [m, a, d] of parts) {
    const w = osc(sec, () => f * m, 'sine', (t) => a * env(t, 0.002, decay * d))
    for (let i = 0; i < b.length; i++) b[i] += w[i]
  }
  return b.map((v) => v * gain)
}

// ---------- os 8 sons ----------

// A bomba chegou em MIM: impacto grave + estouro de ruído + brilho mágico subindo + pavio chiando
function bomb_received() {
  const L = 1.1
  const out = buf(L)
  addTo(out, osc(L, (t) => 38 + 80 * Math.exp(-t * 9), 'sine', (t) => 1.1 * env(t, 0.003, 0.22)), 0, 1)
  addTo(out, filter(noise(0.5), 'low', (t) => 5200 * Math.exp(-t * 9) + 300, 0.9).map((v, i) => v * env(i / SR, 0.002, 0.07)), 0, 0.7)
  // brilho mágico subindo
  const shim = buf(L)
  for (const [f, g] of [[880, 1], [1320, 0.7], [1760, 0.5], [2640, 0.3]]) {
    addTo(shim, osc(L, (t) => f * (0.92 + 0.12 * t), 'sine', (t) => g * Math.sin(Math.PI * Math.min(1, t / 0.9)) ** 2 * (0.75 + 0.25 * Math.sin(TAU * 11 * t))), 0, 1)
  }
  addTo(out, shim, 0.12, 0.16)
  // pavio: estalos agudos
  const sizzle = filter(noise(0.7), 'high', () => 4500, 0.7).map((v, i) => (Math.abs(rnd()) > 0.78 ? v : v * 0.15) * (1 - i / (0.7 * SR)))
  addTo(out, sizzle, 0.18, 0.22)
  return softClip(fade(reverb(out, 0.18, 1, 0.9), 0.001, 0.12), 1.3)
}

// A bomba voa entre jogadores: whoosh de ruído com varredura + brilho
function bomb_pass() {
  const L = 0.4
  const n = noise(L)
  const w = filter(n, 'band', (t) => 350 * Math.pow(10, 1.05 * Math.min(1, t / 0.28)), 3.2)
  mul(w, (t) => Math.sin(Math.PI * Math.min(1, t / 0.32)) ** 1.5)
  const out = buf(L)
  addTo(out, w, 0, 1.2)
  addTo(out, osc(0.2, (t) => 2400 + 1400 * t * 5, 'sine', (t) => env(t, 0.004, 0.05)), 0.12, 0.1)
  return fade(reverb(out, 0.12, 0.7, 0.3), 0.003, 0.05)
}

// Pulso da bomba na mão. HOJE só tick_3 (batida de coração) é usado, em todos os níveis;
// tick_1, tick_2 e tick_4 são versões mais leves/pesadas guardadas pra experimentar.
function tick_1() {
  const L = 0.11
  const out = buf(L)
  addTo(out, filter(noise(0.03), 'band', () => 2200, 7).map((v, i) => v * env(i / SR, 0.0005, 0.006)), 0, 1.5)
  addTo(out, osc(L, () => 780, 'sine', (t) => env(t, 0.0008, 0.02)), 0, 0.8)
  return fade(out, 0.0005, 0.01)
}
function tick_2() {
  const L = 0.2
  const out = buf(L)
  addTo(out, filter(noise(0.03), 'band', () => 1500, 6).map((v, i) => v * env(i / SR, 0.0005, 0.007)), 0, 1.1)
  addTo(out, osc(L, () => 560, 'sine', (t) => env(t, 0.0008, 0.03)), 0, 0.6)
  addTo(out, osc(L, (t) => 55 + 70 * Math.exp(-t * 28), 'sine', (t) => env(t, 0.002, 0.07)), 0, 1.2) // corpo grave
  return softClip(fade(reverb(out, 0.1, 0.5, 0.15), 0.0005, 0.03), 1.2)
}
function tick_3() {
  const L = 0.4
  const out = buf(L)
  // batida de coração: "tum-tum"
  for (const [t0, g] of [[0, 1], [0.11, 0.75]]) {
    addTo(out, osc(0.25, (t) => 40 + 55 * Math.exp(-t * 22), 'sine', (t) => env(t, 0.003, 0.085)), t0, 1.3 * g)
    addTo(out, filter(noise(0.1), 'low', () => 380, 0.8).map((v, i) => v * env(i / SR, 0.002, 0.03)), t0, 0.7 * g)
  }
  addTo(out, filter(noise(0.4), 'low', () => 140, 0.8).map((v, i) => v * env(i / SR, 0.01, 0.12)), 0, 0.5)
  return softClip(fade(reverb(out, 0.22, 0.9, 0.35), 0.001, 0.08), 1.8)
}
function tick_4() {
  const L = 0.5
  const out = buf(L)
  // pancada subgrave distorcida + zumbido grave
  addTo(out, osc(L, (t) => 26 + 44 * Math.exp(-t * 14), 'sine', (t) => env(t, 0.004, 0.16)), 0, 1.5)
  addTo(out, filter(osc(L, () => 58, 'saw', (t) => env(t, 0.004, 0.2)), 'low', () => 170, 0.9), 0, 1.0)
  addTo(out, filter(noise(0.12), 'low', (t) => 700 * Math.exp(-t * 14) + 90, 0.8).map((v, i) => v * env(i / SR, 0.001, 0.035)), 0, 1.3)
  // metálico dissonante (segunda menor batendo) — dá a sensação de ameaça
  for (const f of [233, 247, 349]) addTo(out, osc(L, () => f, 'tri', (t) => env(t, 0.004, 0.18)), 0, 0.17)
  return softClip(fade(reverb(out, 0.38, 1.5, 0.6), 0.001, 0.15), 1.9)
}

// Perigo subiu: alarme de 3 bipes (tom duplo) com eco
function danger_up() {
  const L = 0.75
  const out = buf(L)
  for (let k = 0; k < 3; k++) {
    const f = k % 2 === 0 ? 880 : 1175
    const t0 = k * 0.17
    const a = osc(0.14, () => f, 'tri', (t) => env(t, 0.004, 0.07))
    const b = osc(0.14, () => f * 2.005, 'sine', (t) => 0.3 * env(t, 0.004, 0.05))
    addTo(out, a, t0, 0.6); addTo(out, b, t0, 0.6)
  }
  return softClip(fade(reverb(out, 0.15, 0.6, 0.3), 0.002, 0.08), 1.2)
}

// [FORA DO JOGO por enquanto — Halls quer trabalhar melhor nessa ideia; não está na lista SOUNDS]
// Perigo 3 — "psicose": rajada de stabs de cordas agudas e dissonantes (sobem de tom a cada
// golpe) terminando num grito longo que desliza pra cima. Inspirado no clima de terror
// clássico, mas é uma criação própria (outras notas, outro ritmo, outro desfecho).
function stringStab(freqs, sec, { bend = 3, bendRate = 22, vib = 0.004, vibHz = 6, atk = 0.004, dec = 0.12, trem = 0 } = {}) {
  const out = buf(sec)
  for (const f of freqs) {
    for (const cents of [-9, 0, 9]) {
      const det = Math.pow(2, cents / 1200)
      const w = osc(
        sec,
        (t) => f * det * Math.pow(2, (-bend * Math.exp(-t * bendRate)) / 12) * (1 + vib * Math.sin(TAU * vibHz * t)),
        'saw',
        (t) => env(t, atk, dec) * (trem ? 0.75 + 0.25 * Math.sin(TAU * trem * t) : 1)
      )
      for (let i = 0; i < out.length; i++) out[i] += w[i] / 3
    }
    // ruído de arco raspando a corda
    const bow = filter(noise(sec), 'band', () => f * 1.6, 2.2)
    for (let i = 0; i < out.length; i++) out[i] += bow[i] * 0.22 * env(i / SR, atk, dec)
  }
  return filter(filter(out, 'high', () => 520, 0.7), 'low', () => 8000, 0.7)
}
function danger_3() {
  const L = 2.2
  const out = buf(L)
  addTo(out, osc(0.4, (t) => 52 * Math.exp(-t * 2.5) + 30, 'sine', (t) => env(t, 0.003, 0.14)), 0, 0.9) // pancada grave
  const base = [1318.5, 1396.9, 1864.7] // segunda menor + trítono: o intervalo mais "errado"
  ;[0, 1, 2, 3].forEach((i) => {
    const k = Math.pow(2, i / 12)
    addTo(out, stringStab(base.map((f) => f * k), 0.2, { bend: 2.5, dec: 0.07 }), 0.03 + i * 0.13, 0.55 + i * 0.12)
  })
  // grito final: sobe deslizando, com vibrato abrindo e tremolo de arco
  const k = Math.pow(2, 5 / 12)
  addTo(out, stringStab([1568 * k, 1661 * k, 2093 * k], 1.4, { bend: 7, bendRate: 5, vib: 0.012, vibHz: 7.5, atk: 0.03, dec: 0.55, trem: 16 }), 0.6, 0.85)
  return softClip(fade(reverb(out, 0.2, 0.9, 0.8), 0.001, 0.25), 1.5)
}

// Explosão BRUTAL: estalo + BOOOM com subgrave caindo + onda de choque + rumble rolando +
// destroços + apito no ouvido + cauda de sinos mágicos bem baixinha
function explosion() {
  const L = 5.0
  const out = buf(L)
  // 1) estalo seco, quase instantâneo
  addTo(out, noise(0.12).map((v, i) => v * env(i / SR, 0.0003, 0.02)), 0, 1.6)
  addTo(out, filter(noise(0.2), 'band', () => 1800, 0.6).map((v, i) => v * env(i / SR, 0.0005, 0.04)), 0, 1.0)
  // 2) BOOM: subgrave que despenca (de ~110 Hz até ~20 Hz) + camada gorda de serra filtrada
  addTo(out, osc(L, (t) => 20 + 95 * Math.exp(-t * 2.4), 'sine', (t) => 1.2 * env(t, 0.004, 0.7)), 0, 0.9)
  addTo(out, filter(osc(L, (t) => 40 + 70 * Math.exp(-t * 3), 'saw', (t) => env(t, 0.004, 0.45)), 'low', (t) => 400 * Math.exp(-t * 2) + 60, 0.9), 0, 0.9)
  // 3) onda de choque: corpo de ruído grave varrendo pra baixo
  addTo(out, filter(noise(2.0), 'low', (t) => 3200 * Math.exp(-t * 3.6) + 110, 0.8).map((v, i) => v * env(i / SR, 0.003, 0.32)), 0, 1.2)
  // 4) bola de fogo: ruído de faixa média caindo
  addTo(out, filter(noise(1.8), 'band', (t) => 4200 * Math.exp(-t * 1.8) + 300, 0.8).map((v, i) => v * env(i / SR, 0.004, 0.32)), 0, 1.0)
  // 5) rumble rolando (graves que ficam "tremendo") — a parte que dá peso e duração
  const rumble = filter(noise(4.2), 'low', (t) => 150 * Math.exp(-t * 0.5) + 45, 0.9)
  addTo(out, rumble.map((v, i) => { const t = i / SR; return v * env(t, 0.08, 1.15) * (0.8 + 0.2 * Math.sin(TAU * 13 * t)) }), 0.05, 1.0)
  // 6) destroços caindo (estalos agudos espaçados)
  const deb = filter(noise(3.0), 'high', () => 2200, 0.7).map((v, i) => (Math.abs(rnd()) > 0.93 ? v : 0) * Math.exp(-(i / SR) * 1.3))
  addTo(out, deb, 0.12, 1.1)
  // 7) apito no ouvido depois do estrondo (discreto)
  addTo(out, osc(3.0, () => 6900, 'sine', (t) => 0.5 * Math.min(1, t / 0.35) * Math.exp(-t * 0.95)), 0.2, 0.1)
  // 8) cauda mágica: sinos descendo, bem baixinho (mantém a identidade do jogo)
  ;[1568, 1319, 1175, 988, 784].forEach((f, i) => addTo(out, bell(1.5, f, 1, 0.9), 0.9 + i * 0.16, 0.07))
  const wet = reverb(out, 0.3, 1.7, 1.8)
  // prensa final: distorção suave + limitador, pra soar GRANDE e colado
  return softClip(fade(wet, 0.0005, 0.5), 1.5)
}

// Errou: dois "uh-uh" descendentes, graves e secos
function wrong() {
  const L = 0.5
  const out = buf(L)
  for (const [t0, f] of [[0, 196], [0.17, 156]]) {
    const a = osc(0.2, () => f, 'saw', (t) => env(t, 0.005, 0.1))
    const b = osc(0.2, () => f * 1.01, 'square', (t) => 0.5 * env(t, 0.005, 0.1))
    const m = buf(0.2); for (let i = 0; i < m.length; i++) m[i] = a[i] + b[i]
    addTo(out, filter(m, 'low', () => 1300, 0.9), t0, 0.6)
  }
  return softClip(fade(reverb(out, 0.08, 0.5, 0.2), 0.002, 0.06), 1.3)
}

// Acertou: arpejo de sinos subindo + brilho
function correct() {
  const L = 1.0
  const out = buf(L)
  ;[659.25, 880, 1108.7, 1318.5].forEach((f, i) => addTo(out, bell(0.9, f, 1, 0.5), i * 0.075, 0.5))
  addTo(out, filter(noise(0.5), 'high', () => 6000, 0.7).map((v, i) => v * env(i / SR, 0.002, 0.08)), 0.2, 0.1)
  return softClip(fade(reverb(out, 0.22, 1, 0.8), 0.001, 0.15), 1.1)
}

// Eliminada (tocou a bomba na cara): trombone triste "wah wah wah waaaah" — o clássico
// do fracasso. 3 notas curtas descendo e uma longa final que desafina caindo, com vibrato
// e o "wah" do filtro abrindo/fechando em cada nota.
function brassNote(sec, f0, f1, wahHz, vib = 0) {
  const raw = osc(
    sec,
    (t) => (f0 + (f1 - f0) * Math.min(1, t / sec)) * (1 + vib * Math.sin(TAU * 5.5 * t) * Math.min(1, t / 0.4)),
    'saw',
    (t) => env(t, 0.03, 10) * Math.min(1, (sec - t) / 0.06)
  )
  const sq = osc(sec, (t) => (f0 + (f1 - f0) * Math.min(1, t / sec)) * 0.5, 'square', (t) => 0.35 * env(t, 0.03, 10) * Math.min(1, (sec - t) / 0.06))
  for (let i = 0; i < raw.length; i++) raw[i] += sq[i]
  return filter(raw, 'low', (t) => 380 + 1500 * Math.pow(Math.sin((Math.PI * Math.min(t, sec)) / sec), 1.3) * (wahHz > 0 ? 1 : 0.6), 2.2)
}
function eliminated() {
  const L = 3.4
  const out = buf(L)
  // Bb3, A3, Ab3 curtas, depois G3 longa caindo
  addTo(out, brassNote(0.42, 233.1, 231, 1), 0.00, 0.8)
  addTo(out, brassNote(0.42, 220.0, 218, 1), 0.46, 0.8)
  addTo(out, brassNote(0.42, 207.7, 205, 1), 0.92, 0.8)
  addTo(out, brassNote(1.5, 196.0, 170, 1, 0.012), 1.38, 0.9)
  // baque seco no começo (o 'tapa na cara')
  addTo(out, osc(0.4, (t) => 70 * Math.exp(-t * 3) + 36, 'sine', (t) => env(t, 0.004, 0.18)), 0, 0.6)
  return softClip(fade(reverb(out, 0.18, 1.0, 0.6), 0.003, 0.3), 1.3)
}

// ---------- gravação ----------
// pico alvo (dBFS) de cada som — o relativo entre eles é o "mix" do jogo
const SOUNDS = {
  bomb_received: [bomb_received, -3],
  bomb_pass: [bomb_pass, -9],
  // um tique só pra todos os níveis de perigo (a batida de coração do antigo nível 3);
  // o que muda de um nível pro outro é só o RITMO (no jogo). tick_1/2/4 ficam guardados acima.
  tick: [tick_3, -11, 0.36],
  danger_up: [danger_up, -9],
  explosion: [explosion, -1, 4.2],
  wrong: [wrong, -9],
  correct: [correct, -9],
  eliminated: [eliminated, -7],
}

function wav(name, data) {
  const n = data.length, bytes = Buffer.alloc(44 + n * 2)
  bytes.write('RIFF', 0); bytes.writeUInt32LE(36 + n * 2, 4); bytes.write('WAVEfmt ', 8)
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22)
  bytes.writeUInt32LE(SR, 24); bytes.writeUInt32LE(SR * 2, 28); bytes.writeUInt16LE(2, 32)
  bytes.writeUInt16LE(16, 34); bytes.write('data', 36); bytes.writeUInt32LE(n * 2, 40)
  for (let i = 0; i < n; i++) bytes.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(data[i] * 32767))), 44 + i * 2)
  const url = new URL(`${name}.wav`, OUT_WAV)
  writeFileSync(url, bytes)
  return url
}

const FFMPEG = process.env.FFMPEG || 'ffmpeg'
const report = []
for (const [name, [fn, peakDb, maxSec]] of Object.entries(SOUNDS)) {
  seed = 1234567
  let data = fn()
  // corta o silêncio no fim (cauda do eco abaixo de -52 dB do pico) e deixa 80 ms de respiro
  let pk = 0; for (const v of data) pk = Math.max(pk, Math.abs(v))
  let end = data.length - 1; while (end > 0 && Math.abs(data[end]) < pk * 0.0025) end--
  data = data.slice(0, Math.min(data.length, end + Math.round(0.08 * SR)))
  if (maxSec) data = data.slice(0, Math.round(maxSec * SR)) // pulsos de bomba: sem cauda longa pra não acumular grave
  fade(data, 0.0005, maxSec ? 0.08 : 0.06)
  let peak = 0, sum = 0
  for (const v of data) { peak = Math.max(peak, Math.abs(v)); sum += v * v }
  const g = Math.pow(10, peakDb / 20) / (peak || 1)
  for (let i = 0; i < data.length; i++) data[i] *= g
  const w = wav(name, data)
  const mp3 = new URL(`${name}.mp3`, OUT_MP3)
  execFileSync(FFMPEG, ['-y', '-v', 'error', '-i', w.pathname.replace(/^\/([A-Za-z]:)/, '$1'), '-codec:a', 'libmp3lame', '-q:a', '3', mp3.pathname.replace(/^\/([A-Za-z]:)/, '$1')])
  report.push(`${name.padEnd(14)} ${(data.length / SR).toFixed(2)}s  pico ${peakDb} dB  rms ${(20 * Math.log10(Math.sqrt(sum / data.length) * g + 1e-9)).toFixed(1)} dB`)
}
console.log(report.join('\n'))
