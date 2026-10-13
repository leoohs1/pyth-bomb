import { useEffect, useRef, useState } from 'react'
import './SoloGame.css'
import SoundToggle from '../SoundToggle.jsx'
import { COLS, ROWS, STEP, PLAYER_SPEED, SPEED_STEP } from './engine/constants.js'
import { LEVELS } from './engine/levels.js'
import {
  createGame, nextLevel, retryLevel, update, enemiesLeft, doorOpen, levelInfo,
} from './engine/game.js'
import { createControls, bindKeyboard } from './engine/input.js'
import { BOSS } from './engine/boss.js'
import { draw } from './engine/render.js'

// Modo Solo (Bomberman) — protótipo com quadradinhos (inimigos, power-ups, porta, 3 fases).
// O React só cuida da moldura (placar, avisos). O jogo roda num laço próprio,
// ~60 vezes por segundo, fora do React, e desenha direto no <canvas>.

// atalho de teste: /solo?level=4 começa direto na fase 4
const START_LEVEL = (Number(new URLSearchParams(window.location.search).get('level')) || 1) - 1
const newRun = () => createGame(Math.random, START_LEVEL)

const isTouchOnly = () =>
  typeof window !== 'undefined' && window.matchMedia('(hover: none) and (pointer: coarse)').matches

function hudOf(s) {
  const p = s.player
  return {
    status: s.status,
    level: s.levelIndex + 1,
    levelName: levelInfo(s).name,
    lives: s.lives,
    enemies: enemiesLeft(s),
    door: s.door.revealed ? (doorOpen(s) ? 'open' : 'locked') : null,
    bombs: p.maxBombs,
    range: p.range,
    boots: Math.round((p.speed - PLAYER_SPEED) / SPEED_STEP),
    secs: Math.floor(s.runTime),
    intro: s.status === 'playing' && s.time < 2.2,
    boss: s.boss ? { name: BOSS.name, hp: Math.max(0, s.boss.hp), max: BOSS.hp } : null,
  }
}

export default function SoloGame() {
  const [touch] = useState(isTouchOnly)
  const wrapRef = useRef(null)
  const canvasRef = useRef(null)
  const advanceRef = useRef(() => {})
  const [hud, setHud] = useState(null)

  useEffect(() => {
    if (touch) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const controls = createControls()
    let game = newRun()
    let tilePx = 40
    let dpr = window.devicePixelRatio || 1
    let raf = 0
    let last = performance.now()
    let hudKey = ''

    const start = (g) => { game = g; controls.clear() }
    // Enter / botão da mensagem: tentar de novo, próxima fase ou corrida nova
    const advance = () => {
      if (game.status === 'dead') start(retryLevel(game))
      else if (game.status === 'cleared') start(nextLevel(game))
      else if (game.status === 'gameover' || game.status === 'won') start(newRun())
    }
    advanceRef.current = advance

    const unbind = bindKeyboard(controls, (e) => {
      if (e.code === 'Enter') advance()
      else if (e.code === 'KeyR') start(newRun()) // recomeça a corrida do zero
    })

    // o tamanho da casa acompanha o tamanho da janela, e o canvas é redesenhado nítido
    const fit = () => {
      const r = wrapRef.current.getBoundingClientRect()
      tilePx = Math.max(16, Math.floor(Math.min(r.width / COLS, r.height / ROWS)))
      dpr = window.devicePixelRatio || 1
      canvas.style.width = `${tilePx * COLS}px`
      canvas.style.height = `${tilePx * ROWS}px`
      canvas.width = Math.round(tilePx * COLS * dpr)
      canvas.height = Math.round(tilePx * ROWS * dpr)
    }
    const ro = new ResizeObserver(fit)
    ro.observe(wrapRef.current)
    fit()

    const frame = (now) => {
      // Avança o jogo exatamente o tempo que passou desde o último desenho, em pedacinhos de
      // no máximo STEP. (Com passo fixo, a tela às vezes repetia um quadro e pulava dois no
      // seguinte: as coisas lentas, como a baleia, pareciam "engasgar".)
      const dt = Math.min(0.1, (now - last) / 1000) // aba escondida não acumula um "pulo" enorme
      last = now
      const n = Math.ceil(dt / STEP)
      for (let i = 0; i < n; i++) update(game, controls, dt / n)
      draw(ctx, game, tilePx, dpr)
      const h = hudOf(game)
      const key = JSON.stringify(h)
      if (key !== hudKey) { hudKey = key; setHud(h) }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    return () => { cancelAnimationFrame(raf); ro.disconnect(); unbind() }
  }, [touch])

  if (touch) {
    return (
      <div className="solo-page solo-touch">
        <div className="solo-card">
          <h1>Dungeon Run</h1>
          <p>Play on desktop</p>
          <p className="solo-sub">This mode needs a keyboard for now.</p>
          <a className="solo-btn" href="/play">Back</a>
        </div>
      </div>
    )
  }

  const time = hud ? `${Math.floor(hud.secs / 60)}:${String(hud.secs % 60).padStart(2, '0')}` : '0:00'

  return (
    <div className="solo-page">
      <SoundToggle className="sound-fixed" />
      <header className="solo-top">
        <a className="solo-back" href="/play">← Back</a>
        <h1>Dungeon Run <span className="solo-tag">prototype</span></h1>
      </header>

      <div className="solo-hud">
        <span title="Lives">❤️ {hud?.lives ?? 3}</span>
        <span title="Level">Level {hud?.level ?? 1}/{LEVELS.length}</span>
        <span title="Enemies left">👾 {hud?.enemies ?? '–'}</span>
        {hud?.door && <span title="Exit door">🚪 {hud.door === 'open' ? 'Open!' : 'Locked'}</span>}
        <span className="solo-hud-sep" />
        <span title="Bombs at once">💣 {hud?.bombs ?? 1}</span>
        <span title="Explosion range">🔥 {hud?.range ?? 2}</span>
        <span title="Speed boosts">👟 {hud?.boots ?? 0}</span>
        <span title="Time">⏱ {time}</span>
      </div>

      {hud?.boss && (
        <div className="solo-boss" title={`${hud.boss.name}: ${hud.boss.hp}/${hud.boss.max}`}>
          <span>🐋 {hud.boss.name}</span>
          <div className="solo-boss-bar">
            <div style={{ width: `${(hud.boss.hp / hud.boss.max) * 100}%` }} />
          </div>
        </div>
      )}

      <div className="solo-stage" ref={wrapRef}>
        <canvas ref={canvasRef} className="solo-canvas" />
        {hud?.intro && (
          <div className="solo-banner" key={hud.level}>
            <span>Level {hud.level}</span>
            <strong>{hud.levelName}</strong>
          </div>
        )}
        {hud?.status === 'dead' && (
          <Overlay title="You got rugged!" button="Try again"
            text={`${hud.lives} ${hud.lives === 1 ? 'life' : 'lives'} left`} onClick={() => advanceRef.current()} />
        )}
        {hud?.status === 'gameover' && (
          <Overlay title="Game over" button="Play again"
            text={`You reached level ${hud.level}`} onClick={() => advanceRef.current()} />
        )}
        {hud?.status === 'cleared' && (
          <Overlay win title={`Level ${hud.level} clear!`} button="Next level"
            text={`Next: ${LEVELS[hud.level].name}`} onClick={() => advanceRef.current()} />
        )}
        {hud?.status === 'won' && (
          <Overlay win title="You escaped the dungeon!" button="Play again"
            text={`All ${LEVELS.length} levels in ${time}`} onClick={() => advanceRef.current()} />
        )}
      </div>

      <footer className="solo-keys">
        <span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> or arrows: move</span>
        <span><kbd>Space</kbd>: drop a bomb</span>
        <span><kbd>Enter</kbd>: continue</span>
        <span><kbd>R</kbd>: restart run</span>
      </footer>
    </div>
  )
}

function Overlay({ title, text, button, onClick, win = false }) {
  return (
    <div className={`solo-over${win ? ' is-win' : ''}`}>
      <h2>{title}</h2>
      <p className="solo-sub">{text}</p>
      <button type="button" className="solo-btn" onClick={onClick}>{button}</button>
      <p className="solo-sub">or press Enter</p>
    </div>
  )
}
