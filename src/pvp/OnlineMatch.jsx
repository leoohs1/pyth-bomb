// Sala do PVP ONLINE: desenha o que o servidor manda (20 vezes por segundo) e manda as teclas pra ele.
// Os outros jogadores aparecem 0,1 s "atrasados", deslizando entre uma mensagem e outra (fica suave);
// o próprio jogador usa sempre a posição mais nova (responde mais rápido).
// Teclado: WASD ou setas pra andar, Espaço ou Enter = bomba, E ou Shift = detonador.
// Celular/tablet: direcional e botão de bomba na tela (os mesmos do Solo, TouchControls.jsx). ?touch=1 força, ?touch=0 desliga.
import { useEffect, useMemo, useRef, useState } from 'react'
import './local.css'
import SoundToggle from '../SoundToggle.jsx'
import { COLS, ROWS } from './engine/constants.js'
import { stateFromInit, applySnap } from './engine/snapshot.js'
import { drawMatch, makeView, loadHeroes } from './render.js'
import { hudOf, MatchTop, MatchBanners } from './MatchHud.jsx'
import { loadSprites, PX_TILE } from '../solo/engine/sprites.js'
import * as FX from '../solo/engine/fx.js'
import { createSoloSfx } from '../solo/sfx.js'
import { TouchPad, TouchButtons } from '../solo/TouchControls.jsx'
import { useSoloAudio, PVP_MUSIC } from './useSoloAudio.js'

// tela de toque (sem mouse): mostra os controles na tela
export const TOUCH = (() => {
  const v = new URLSearchParams(window.location.search).get('touch')
  if (v === '1') return true
  if (v === '0') return false
  return window.matchMedia('(hover: none) and (pointer: coarse)').matches
})()

const DELAY = 0.1 // segundos de atraso pra deslizar os outros jogadores

const KEYS = {
  KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
  Space: 'bomb', Enter: 'bomb', NumpadEnter: 'bomb', KeyE: 'detonate', ShiftLeft: 'detonate', ShiftRight: 'detonate',
}

// feedRef.current = { init, snaps: [...], events: [...] } (quem enche é o PvpApp, com as mensagens do servidor)
export default function OnlineMatch({ feedRef, meId, spectating = false, send, title = null, onBack = null, note = null }) {
  const [hud, setHud] = useState(null)
  const canvasRef = useRef(null)
  const wrapRef = useRef(null)
  // direcional/bomba da tela falam com o mesmo controle do teclado (o efeito abaixo preenche press/release)
  const padRef = useRef({ press() {}, release() {} })
  const controls = useMemo(() => ({ press: (a) => padRef.current.press(a), release: (a) => padRef.current.release(a) }), [])

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    loadSprites()
    loadHeroes()
    canvas.width = PX_TILE * COLS
    canvas.height = PX_TILE * ROWS
    const sfx = createSoloSfx()
    let raf = 0, hudKey = '', init = null, s = null, view = null, offset = null

    // teclas: manda a direção quando muda e cada toque de bomba/detonador
    const held = []
    let sentDir = null
    const sendDir = () => {
      const d = held.at(-1) ?? null
      if (d !== sentDir) { sentDir = d; send({ t: 'in', d }) }
    }
    const press = (a) => {
      if (spectating) return
      if (a === 'bomb' || a === 'detonate') { send({ t: 'in', [a === 'bomb' ? 'b' : 'x']: 1 }); return }
      if (!held.includes(a)) held.push(a)
      sendDir()
    }
    const release = (a) => {
      const i = held.indexOf(a)
      if (i >= 0) { held.splice(i, 1); sendDir() }
    }
    padRef.current = { press, release }
    const onDown = (e) => {
      if (spectating || e.altKey || e.ctrlKey || e.metaKey) return
      const a = KEYS[e.code]
      if (!a) return
      e.preventDefault()
      if ((a === 'bomb' || a === 'detonate') && e.repeat) return
      press(a)
    }
    const onUp = (e) => { const a = KEYS[e.code]; if (a) release(a) }
    const onBlur = () => { held.length = 0; sendDir() }
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    window.addEventListener('blur', onBlur)

    const fit = () => {
      const r = wrapRef.current.getBoundingClientRect()
      const tile = Math.max(12, Math.floor(Math.min(r.width / COLS, r.height / ROWS)))
      canvas.style.width = `${tile * COLS}px`
      canvas.style.height = `${tile * ROWS}px`
    }
    const ro = new ResizeObserver(fit)
    ro.observe(wrapRef.current)
    fit()

    let lastFrame = performance.now()
    const frame = (nowMs) => {
      const dt = Math.min(0.1, (nowMs - lastFrame) / 1000)
      lastFrame = nowMs
      const f = feedRef.current
      if (f?.init && f.init !== init) {
        init = f.init
        s = stateFromInit(init)
        view = makeView(s)
        offset = null
        FX.reset()
      }
      const snaps = f?.snaps ?? []
      if (s && snaps.length) {
        const nowS = nowMs / 1000
        const latest = snaps[snaps.length - 1]
        // relógio do servidor visto daqui: acompanha devagar (a internet varia) e pula se ficou muito longe
        const est = latest.tm - latest._at
        offset = offset == null || Math.abs(est - offset) > 0.5 ? est : offset + (est - offset) * 0.05
        const rt = Math.min(latest.tm, nowS + offset - DELAY)
        let a = null, b = latest
        for (let i = snaps.length - 1; i > 0; i--) {
          if (snaps[i - 1].tm <= rt) { a = snaps[i - 1]; b = snaps[i]; break }
        }
        const k = a ? Math.max(0, Math.min(1, (rt - a.tm) / Math.max(0.001, b.tm - a.tm))) : 1
        applySnap(s, b, a, k, null, rt)
        // eu mesmo: a posição mais nova (sem esperar o atraso)
        if (!spectating && meId) {
          const mine = latest.p.find((q) => q.id === meId)
          const me = s.players.find((p) => p.id === meId)
          if (mine && me) { me.x = mine.x; me.y = mine.y; me.facing = mine.f; me.moving = !!mine.m; me.walkT = mine.w }
        }
        s.events = f.events
        drawMatch(ctx, s, view, PX_TILE, spectating ? null : meId)
        sfx(view)
        FX.consumeEvents(view) // (esvazia a lista de avisos, que é a mesma do feed)
        FX.update(view, dt)
        const h = hudOf(s)
        const key = JSON.stringify(h)
        if (key !== hudKey) { hudKey = key; setHud(h) }
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf); ro.disconnect(); sfx.stop()
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
      window.removeEventListener('blur', onBlur)
      if (!spectating) send({ t: 'in', d: null })
    }
  }, [feedRef, meId, spectating, send])

  useSoloAudio(PVP_MUSIC[hud?.mapId] ?? null) // efeitos e música do Solo (a música do mapa, assim que o mapa chega)
  const me = hud?.players.find((p) => p.id === meId)
  const iAmOut = !spectating && me && !me.alive && hud.status === 'playing'
  return (
    <div className={`pl-page is-map-${hud?.mapId ?? 'tavern'}${TOUCH ? ' is-touch' : ''}`}>
      <SoundToggle className="sound-fixed" />
      <MatchTop hud={hud} />
      <div className="pl-stage" ref={wrapRef}>
        <canvas ref={canvasRef} className="pl-canvas" />
        <MatchBanners hud={hud} overNote={note} />
        {iAmOut && <div className="pl-banner pl-out">You're out<small>Watching the rest of your room</small></div>}
      </div>
      {TOUCH && !spectating && (
        <div className="pl-touch">
          <TouchPad controls={controls} />
          <TouchButtons controls={controls} detonator={!!me?.detonator} onPause={() => {}} />
        </div>
      )}
      <footer className="pl-bar">
        {onBack && <button type="button" onClick={onBack}>← Tournament</button>}
        <span className="pl-tag">{title ?? (spectating ? 'WATCHING' : 'PYTH BOMB PVP')}</span>
        {!spectating && !TOUCH && <span className="pl-help">Move: WASD or arrows · Bomb: Space or Enter · Detonator: E or Shift</span>}
      </footer>
    </div>
  )
}
