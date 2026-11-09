// Sala do PVP ONLINE: desenha o que o servidor manda (30 vezes por segundo) e manda as teclas pra ele.
// Os outros jogadores aparecem 0,12 s "atrasados", deslizando entre uma mensagem e outra (fica suave).
// O PRÓPRIO boneco é "previsto": anda na hora, aqui mesmo, com as mesmas regras do servidor, e vai sendo corrigido
// de leve pela posição oficial (que chega atrasada pela internet). Quem decide o que vale continua sendo o servidor.
// Teclado: WASD ou setas pra andar, Espaço ou Enter = bomba, E ou Shift = detonador.
// Celular/tablet: direcional e botão de bomba na tela (os mesmos do Solo, TouchControls.jsx). ?touch=1 força, ?touch=0 desliga.
import { useEffect, useMemo, useRef, useState } from 'react'
import './local.css'
import SoundToggle from '../SoundToggle.jsx'
import { COLS, ROWS, STEP } from './engine/constants.js'
import { stateFromInit, applySnap, tilesFromString } from './engine/snapshot.js'
import { movePlayer } from './engine/match.js'
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

const DELAY = 0.12 // segundos de atraso pra deslizar os outros jogadores
const FIX = 0.3     // quanto da diferença pra posição oficial corrige a cada mensagem do servidor

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

    // mede o tempo de ida e volta até o servidor (a resposta 'pong' é guardada no feed pelo PvpApp)
    const ping = setInterval(() => send({ t: 'ping', at: performance.now() / 1000 }), 1000)
    send({ t: 'ping', at: performance.now() / 1000 })

    // previsão do próprio boneco
    let pred = null, hist = [], lastTm = null, acc = 0, world = null, worldTiles = null
    const predictMe = (latest, f, nowS, dt) => {
      const mine = latest.p.find((q) => q.id === meId)
      if (!mine) return null
      if (!pred) pred = { x: mine.x, y: mine.y, walkT: mine.w, facing: mine.f, flip: !!mine.fl, moving: false }
      const canMove = mine.a && (latest.st === 'playing' || latest.st === 'ending')
      if (!canMove) {
        Object.assign(pred, { x: mine.x, y: mine.y, moving: false, facing: mine.f, flip: !!mine.fl })
        hist = []; acc = 0
        return pred
      }
      // o mundo mais novo (paredes, caixotes e bombas) pra andar igual ao servidor
      if (worldTiles !== latest.tiles) { worldTiles = latest.tiles; world = { level: { cols: s.level.cols, rows: s.level.rows, tiles: tilesFromString(latest.tiles) }, bombs: latest.b } }
      else world.bombs = latest.b
      const dir = held.at(-1) ?? null
      const p = { id: meId, x: pred.x, y: pred.y, speed: mine.sp }
      let moved = false
      acc += dt
      while (acc >= STEP) { acc -= STEP; if (dir && movePlayer(world, p, dir, STEP)) moved = true }
      pred.x = p.x; pred.y = p.y
      if (dir) { pred.facing = dir; if (dir === 'left') pred.flip = true; else if (dir === 'right') pred.flip = false }
      pred.moving = moved
      if (moved) pred.walkT += dt
      hist.push({ t: nowS, x: pred.x, y: pred.y })
      while (hist.length && hist[0].t < nowS - 2) hist.shift()
      // chegou posição oficial nova: compara com onde EU estava quando o servidor calculou ela, e corrige um pouco
      if (latest.tm !== lastTm) {
        lastTm = latest.tm
        const rtt = f.rtt ?? 0.15
        const when = latest._at - rtt - 1 / 60
        let h = hist[0]
        for (let i = hist.length - 1; i >= 0; i--) { if (hist[i].t <= when) { const n = hist[i + 1]; h = n ? { x: hist[i].x + (n.x - hist[i].x) * ((when - hist[i].t) / Math.max(1e-3, n.t - hist[i].t)), y: hist[i].y + (n.y - hist[i].y) * ((when - hist[i].t) / Math.max(1e-3, n.t - hist[i].t)) } : hist[i]; break } }
        if (h) {
          const ex = mine.x - h.x, ey = mine.y - h.y
          if (Math.abs(ex) + Math.abs(ey) > 1.5) { pred.x = mine.x; pred.y = mine.y; hist = [] } // muito longe: pula pra oficial
          else { pred.x += ex * FIX; pred.y += ey * FIX; for (const q of hist) { q.x += ex * FIX; q.y += ey * FIX } }
        }
        // parado (eu e o servidor): encosta de vez na posição oficial
        if (!dir && !mine.m) { pred.x += (mine.x - pred.x) * 0.5; pred.y += (mine.y - pred.y) * 0.5 }
      }
      return pred
    }

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
        pred = null; hist = []; lastTm = null // sala nova: começa a previsão do zero
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
        // eu mesmo: a posição PREVISTA (anda na hora, sem esperar a internet)
        if (!spectating && meId) {
          const me = s.players.find((p) => p.id === meId)
          const pr = predictMe(latest, f, nowS, dt)
          if (pr && me) { me.x = pr.x; me.y = pr.y; me.facing = pr.facing; me.flip = pr.flip; me.moving = pr.moving; me.walkT = pr.walkT }
        }
        s.events = f.events
        if (import.meta.env.DEV) window.__pvpDraw = { t: nowS, me: s.players.find((p) => p.id === meId), rtt: f.rtt } // só no desenvolvimento: pros testes
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
      cancelAnimationFrame(raf); ro.disconnect(); sfx.stop(); clearInterval(ping)
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
