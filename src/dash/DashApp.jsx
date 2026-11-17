// PYTH DASH — jogo de plataforma com os heróis do Pyth Bomb (modo PVE, fase de teste).
// Endereço: /dash (ainda fora do menu de modos, até a Halls aprovar).
// Teclado: ← → ou A D pra correr, Espaço / ↑ / W / Z pra pular (segurar = pulo mais alto). Esc volta pro menu.
// Celular: botões ◀ ▶ embaixo à esquerda e o botão de pulo à direita.
import { useEffect, useRef, useState } from 'react'
import { LEVELS } from './levels.js'
import { createGame, step, starsOf } from './engine.js'
import { drawGame, loadHero } from './render.js'
import { HEROES } from '../pvp/heroes.js'
import { play, unlock } from '../sound.js'
import { useSoloAudio } from '../pvp/useSoloAudio.js'
import SoundToggle from '../SoundToggle.jsx'
import './dash.css'

const DT = 1 / 120
const TOUCH = (() => {
  const v = new URLSearchParams(window.location.search).get('touch')
  if (v === '1') return true
  if (v === '0') return false
  return window.matchMedia('(hover: none) and (pointer: coarse)').matches
})()
const SFX = { jump: 'solo_kick', coin: 'solo_pickup', stomp: 'solo_enemy_die', bump: 'solo_hit', die: 'solo_dead', gameover: 'solo_gameover', win: 'solo_clear', checkpoint: 'solo_door' }
const HERO_KEY = 'pb_dash_hero'
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

export default function DashApp() {
  const [screen, setScreen] = useState('menu') // 'menu' | 'play'
  const [hero, setHero] = useState(() => { try { return localStorage.getItem(HERO_KEY) || 'pirb' } catch { return 'pirb' } })
  const [run, setRun] = useState(0) // muda a cada partida nova (recomeça o jogo)
  useSoloAudio('/music/solo.mp3') // efeitos e música do Solo ("Pixel Adventure")
  useEffect(() => { for (const h of HEROES) loadHero(h.id) }, [])
  const pick = (id) => { setHero(id); try { localStorage.setItem(HERO_KEY, id) } catch { /* sem localStorage */ } }
  const start = () => { unlock(); setRun((r) => r + 1); setScreen('play') }

  return (
    <div className="dash-page">
      <SoundToggle className="sound-fixed" />
      {screen === 'menu'
        ? <DashMenu hero={hero} onPick={pick} onStart={start} />
        : <DashPlay key={run} hero={hero} onMenu={() => setScreen('menu')} onAgain={start} />}
    </div>
  )
}

function DashMenu({ hero, onPick, onStart }) {
  const level = LEVELS[0]
  return (
    <div className="dash-menu">
      <h1 className="dash-title">PYTH <span>DASH</span></h1>
      <p className="dash-sub">Run, jump and grab every price update. Stomp the lag bugs!</p>
      <p className="dash-label">Choose your hero</p>
      <div className="dash-heroes" role="radiogroup" aria-label="Choose your hero">
        {HEROES.map((h) => (
          <button key={h.id} type="button" role="radio" aria-checked={hero === h.id} aria-label={h.label}
            className={`dash-hero${hero === h.id ? ' is-on' : ''}`} onClick={() => onPick(h.id)}>
            <img src={`/solo/pixel/${h.id}-right1.png`} alt="" />
          </button>
        ))}
      </div>
      <p className="dash-level">World 1-1 · {level.name}</p>
      <button type="button" className="dash-btn dash-btn-go" onClick={onStart}>Play</button>
      <p className="dash-keys">{TOUCH ? '◀ ▶ to run · big button to jump (hold = higher)' : '← → or A D to run · Space or ↑ to jump (hold = higher) · Esc = menu'}</p>
      <a className="dash-back" href="/play">← Back to Pyth Bomb</a>
    </div>
  )
}

function DashPlay({ hero, onMenu, onAgain }) {
  const wrapRef = useRef(null)
  const canvasRef = useRef(null)
  const input = useRef({ left: false, right: false, jump: false })
  const [hud, setHud] = useState(null)
  const level = LEVELS[0]
  const menuRef = useRef(onMenu) // (num ref: trocar a função não reinicia a partida)
  useEffect(() => { menuRef.current = onMenu }, [onMenu])

  useEffect(() => {
    const g = createGame(level)
    const cam = { x: null }
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    let raf = 0, last = performance.now(), acc = 0, hudKey = ''

    const fit = () => {
      const r = wrapRef.current.getBoundingClientRect()
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr)
    }
    fit()
    const ro = new ResizeObserver(fit); ro.observe(wrapRef.current)

    const keys = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', Space: 'jump', ArrowUp: 'jump', KeyW: 'jump', KeyZ: 'jump' }
    const down = (e) => {
      if (e.code === 'Escape') { menuRef.current(); return }
      const k = keys[e.code]; if (!k) return
      e.preventDefault(); input.current[k] = true
    }
    const up = (e) => { const k = keys[e.code]; if (k) input.current[k] = false }
    const blur = () => { input.current = { left: false, right: false, jump: false } }
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', blur)

    const frame = (now) => {
      acc += Math.min(0.1, (now - last) / 1000); last = now
      while (acc >= DT) {
        step(g, input.current, DT)
        for (const ev of g.events) if (SFX[ev]) play(SFX[ev])
        acc -= DT
      }
      drawGame(ctx, g, canvas.width, canvas.height, hero, cam)
      const st = starsOf(g)
      const h = { coins: g.coinsTaken, total: st.total, time: Math.floor(g.time), lives: g.lives, status: g.status, done: g.status === 'won' && g.statusT > 1.2, stars: st }
      const key = JSON.stringify(h)
      if (key !== hudKey) { hudKey = key; setHud(h) }
      if (import.meta.env.DEV) window.__dash = g // só no desenvolvimento: pros testes
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf); ro.disconnect()
      window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur)
    }
  }, [hero, level])

  const hold = (k) => ({
    onPointerDown: (e) => { e.preventDefault(); try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* ok */ } input.current[k] = true },
    onPointerUp: () => { input.current[k] = false },
    onPointerCancel: () => { input.current[k] = false },
    onPointerLeave: () => { input.current[k] = false },
    onContextMenu: (e) => e.preventDefault(),
  })

  return (
    <div className={`dash-play${TOUCH ? ' is-touch' : ''}`}>
      <div className="dash-hud">
        <span className="dash-hud-world">1-1 · {level.name}</span>
        <span>🪙 {hud?.coins ?? 0}/{hud?.total ?? 0}</span>
        <span>⏱ {fmt(hud?.time ?? 0)}</span>
        <span>{'❤'.repeat(Math.max(0, hud?.lives ?? 3))}</span>
        <button type="button" className="dash-hud-menu" onClick={onMenu}>Menu</button>
      </div>
      <div className="dash-stage" ref={wrapRef}>
        <canvas ref={canvasRef} className="dash-canvas" />
        {hud?.done && <DashResult hud={hud} won onAgain={onAgain} onMenu={onMenu} />}
        {hud?.status === 'gameover' && <DashResult hud={hud} onAgain={onAgain} onMenu={onMenu} />}
      </div>
      {TOUCH && (
        <div className="dash-pad">
          <div className="dash-pad-move">
            <button type="button" className="dash-pad-btn" aria-label="Run left" {...hold('left')}>◀</button>
            <button type="button" className="dash-pad-btn" aria-label="Run right" {...hold('right')}>▶</button>
          </div>
          <button type="button" className="dash-pad-btn dash-pad-jump" aria-label="Jump" {...hold('jump')}>JUMP</button>
        </div>
      )}
    </div>
  )
}

function DashResult({ hud, won, onAgain, onMenu }) {
  const s = hud.stars
  const got = won ? [s.finished, s.allCoins, s.fast].filter(Boolean).length : 0
  return (
    <div className="dash-result" role="dialog" aria-label={won ? 'Level clear' : 'Game over'}>
      <h2>{won ? 'Level clear!' : 'Out of lives'}</h2>
      {won && (
        <>
          <p className="dash-stars" aria-label={`${got} of 3 stars`}>{[0, 1, 2].map((i) => <span key={i} className={i < got ? 'is-on' : ''}>★</span>)}</p>
          <ul className="dash-goals">
            <li className={s.finished ? 'is-on' : ''}>Reach the flag</li>
            <li className={s.allCoins ? 'is-on' : ''}>Grab all price updates ({hud.coins}/{s.total})</li>
            <li className={s.fast ? 'is-on' : ''}>Finish in {fmt(LEVELS[0].par)} ({fmt(hud.time)})</li>
          </ul>
        </>
      )}
      {!won && <p className="dash-sub">The lag bugs got you. Try again!</p>}
      <div className="dash-result-btns">
        <button type="button" className="dash-btn dash-btn-go" onClick={onAgain}>{won ? 'Play again' : 'Try again'}</button>
        <button type="button" className="dash-btn" onClick={onMenu}>Menu</button>
      </div>
    </div>
  )
}
