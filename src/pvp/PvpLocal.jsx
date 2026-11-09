// TESTE LOCAL do Pyth Bomb PVP (/pvp-local): uma sala no mesmo computador, sem internet.
// Serve pra sentir as regras antes do servidor: 1 ou 2 pessoas no teclado + bots.
//   Jogador 1: WASD + Espaço (bomba) + E (detonador). Com 1 pessoa só, as setas também servem.
//   Jogador 2: setas + Enter (bomba) + Shift direito (detonador).
//   R = sala nova.
// Endereço: ?map=tavern|hull|chop &n=2..4 (jogadores na sala) &humans=0..2 &heroes=pirb,derrpu,boryso,plancky
import { useEffect, useRef, useState } from 'react'
import './local.css'
import SoundToggle from '../SoundToggle.jsx'
import { createMatch, step } from './engine/match.js'
import { createBot } from './engine/bot.js'
import { makeRng, randomSeed } from './engine/rng.js'
import { STEP, COLS, ROWS } from './engine/constants.js'
import { MAPS, pickRoomMap } from './engine/maps.js'
import { drawMatch, makeView, loadHeroes } from './render.js'
import { hudOf, MatchTop, MatchBanners } from './MatchHud.jsx'
import { useSoloAudio, PVP_MUSIC } from './useSoloAudio.js'
import { loadSprites, PX_TILE } from '../solo/engine/sprites.js'
import * as FX from '../solo/engine/fx.js'
import { createSoloSfx } from '../solo/sfx.js'
import { HEROES, heroById } from './heroes.js'

const Q = new URLSearchParams(window.location.search)
const clampInt = (v, lo, hi, def) => { const n = Number(v); return Number.isFinite(n) && v !== null ? Math.max(lo, Math.min(hi, Math.round(n))) : def }
const START = {
  map: MAPS[Q.get('map')] ? Q.get('map') : 'random', // 'random' = sala normal (taverna ou casco, sorteado)
  n: clampInt(Q.get('n'), 2, 4, 4),
  humans: clampInt(Q.get('humans'), 0, 2, 1),
  heroes: (Q.get('heroes') ?? '').split(',').filter((h) => HEROES.some((x) => x.id === h)),
}

const KEYS = [
  { up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'], bomb: ['Space'], detonate: ['KeyE'] },
  { up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'], bomb: ['Enter', 'NumpadEnter'], detonate: ['ShiftRight'] },
]
// com 1 pessoa só, as setas também mexem o jogador 1
const SOLO_EXTRA = { up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'], bomb: ['Enter'], detonate: [] }

function makePlayers({ n, humans, heroes }) {
  return Array.from({ length: n }, (_, i) => {
    const hero = heroes[i] ?? HEROES[i % HEROES.length].id
    const human = i < humans
    return { id: 'p' + (i + 1), name: human ? `Player ${i + 1}` : `Bot ${heroById(hero).label}`, hero, bot: !human }
  })
}

// direções seguradas por jogador (vale a última apertada) + toques de bomba/detonador
function makePad() {
  const held = []
  const inp = { dir: null, bomb: false, detonate: false }
  return {
    inp,
    press(a) { if (a === 'bomb') inp.bomb = true; else if (a === 'detonate') inp.detonate = true; else if (!held.includes(a)) held.push(a); inp.dir = held.at(-1) ?? null },
    release(a) { const i = held.indexOf(a); if (i >= 0) held.splice(i, 1); inp.dir = held.at(-1) ?? null },
    clear() { held.length = 0; inp.dir = null; inp.bomb = false; inp.detonate = false },
  }
}


export default function PvpLocal() {
  const [cfg, setCfg] = useState(START)
  const [hud, setHud] = useState(null)
  const canvasRef = useRef(null)
  const wrapRef = useRef(null)
  const restartRef = useRef(() => {})

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    loadSprites()
    loadHeroes()
    canvas.width = PX_TILE * COLS
    canvas.height = PX_TILE * ROWS
    const sfx = createSoloSfx()

    let s, view, bots, pads, raf = 0, acc = 0, last = performance.now(), hudKey = ''
    const fresh = () => {
      const players = makePlayers(cfg)
      const seed = randomSeed()
      const map = cfg.map === 'random' ? pickRoomMap(false, makeRng(seed ^ 0x9e3779b9)) : cfg.map
      s = createMatch({ players, map, seed })
      view = makeView(s)
      FX.reset()
      bots = Object.fromEntries(players.filter((p) => p.bot).map((p, i) => [p.id, createBot(p.id, makeRng(randomSeed() + i))]))
      pads = Object.fromEntries(players.filter((p) => !p.bot).map((p) => [p.id, makePad()]))
      if (import.meta.env.DEV) window.__pvpMatch = () => s // só no desenvolvimento: deixa os testes olharem a sala
    }
    fresh()
    restartRef.current = fresh

    const humans = () => s.players.filter((p) => !p.bot)
    const actionFor = (code) => {
      const hs = humans()
      for (let i = 0; i < hs.length; i++) {
        const map = hs.length === 1 && i === 0 ? { ...KEYS[0], ...Object.fromEntries(Object.entries(SOLO_EXTRA).map(([a, ks]) => [a, [...KEYS[0][a], ...ks]])) } : KEYS[i]
        for (const [a, ks] of Object.entries(map)) if (ks.includes(code)) return [hs[i].id, a]
      }
      return null
    }
    const onDown = (e) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return
      if (e.code === 'KeyR' && !e.repeat) { fresh(); return }
      const hit = actionFor(e.code)
      if (!hit) return
      e.preventDefault()
      if (e.repeat && (hit[1] === 'bomb' || hit[1] === 'detonate')) return
      pads[hit[0]]?.press(hit[1])
    }
    const onUp = (e) => { const hit = actionFor(e.code); if (hit) pads[hit[0]]?.release(hit[1]) }
    const onBlur = () => Object.values(pads).forEach((p) => p.clear())
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    window.addEventListener('blur', onBlur)

    // o canvas ocupa o maior tamanho que cabe, em casas inteiras
    const fit = () => {
      const r = wrapRef.current.getBoundingClientRect()
      const tile = Math.max(16, Math.floor(Math.min(r.width / COLS, r.height / ROWS)))
      canvas.style.width = `${tile * COLS}px`
      canvas.style.height = `${tile * ROWS}px`
    }
    const ro = new ResizeObserver(fit)
    ro.observe(wrapRef.current)
    fit()

    const frame = (now) => {
      acc += Math.min(0.1, (now - last) / 1000)
      last = now
      let n = 0
      while (acc >= STEP && n < 8) {
        const inputs = {}
        for (const p of s.players) inputs[p.id] = p.bot ? bots[p.id](s) : pads[p.id].inp
        step(s, inputs)
        acc -= STEP
        n++
      }
      drawMatch(ctx, s, view, PX_TILE, s.players.length - s.players.filter((p) => p.bot).length === 1 ? 'p1' : null)
      sfx(view)
      FX.consumeEvents(view) // (também limpa os avisos da regra)
      FX.update(view, n * STEP)
      const h = hudOf(s)
      const key = JSON.stringify(h)
      if (key !== hudKey) { hudKey = key; setHud(h) }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf); ro.disconnect(); sfx.stop()
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [cfg])

  useSoloAudio(PVP_MUSIC[hud?.mapId] ?? null)
  const set = (k, v) => setCfg((c) => ({ ...c, [k]: v, humans: k === 'n' ? Math.min(c.humans, v) : k === 'humans' ? v : c.humans }))

  return (
    <div className={`pl-page is-map-${hud?.mapId ?? 'tavern'}`}>
      <SoundToggle className="sound-fixed" />
      <MatchTop hud={hud} />

      <div className="pl-stage" ref={wrapRef}>
        <canvas ref={canvasRef} className="pl-canvas" />
        <MatchBanners hud={hud} overNote={hud?.status === 'over' ? 'Press R for a new room' : null} />
      </div>

      <footer className="pl-bar">
        <span className="pl-tag">LOCAL TEST</span>
        <label>Map
          <select value={cfg.map} onChange={(e) => set('map', e.target.value)}>
            <option value="random">Random room (tavern or hull)</option>
            {Object.entries(MAPS).map(([id, m]) => <option key={id} value={id}>{m.name}{m.final ? ' (final)' : ''}</option>)}
          </select>
        </label>
        <label>Fighters
          <select value={cfg.n} onChange={(e) => set('n', Number(e.target.value))}>
            {[2, 3, 4].map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </label>
        <label>People
          <select value={cfg.humans} onChange={(e) => set('humans', Number(e.target.value))}>
            {[0, 1, 2].filter((v) => v <= cfg.n).map((v) => <option key={v} value={v}>{v === 0 ? 'only bots' : v}</option>)}
          </select>
        </label>
        <button type="button" onClick={() => restartRef.current()}>New room (R)</button>
        <span className="pl-help">P1: WASD + Space (E = detonator){cfg.humans === 2 ? ' · P2: arrows + Enter (Right Shift = detonator)' : ''}</span>
      </footer>
    </div>
  )
}
