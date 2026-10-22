import { useEffect, useRef, useState } from 'react'
import './SoloGame.css'
import SoundToggle from '../SoundToggle.jsx'
import { setMusicSilenced } from '../music'
import { setSoundTheme } from '../sound'
import { createSoloSfx } from './sfx.js'
import { COLS, ROWS, STEP, PLAYER_SPEED, SPEED_STEP, MAX_BOMBS, MAX_RANGE, MAX_SPEED } from './engine/constants.js'
import { LEVELS } from './engine/levels.js'
import {
  createGame, nextLevel, retryLevel, update, enemiesLeft, doorOpen, levelInfo,
  chestNear, chestDone, beginChest, finishChest, dismissChest, isPaused,
} from './engine/game.js'
import { openChest, CHEST_IS_DEMO } from './chest/index.js'
import { createControls, bindKeyboard } from './engine/input.js'
import { BOSS } from './engine/boss.js'
import { draw } from './engine/render.js'
import { loadSprites, STYLE, setStyle, PX_TILE } from './engine/sprites.js'
import * as FX from './engine/fx.js'

// Modo Solo (Bomberman) — protótipo com quadradinhos (inimigos, power-ups, porta, baú, chefe).
// O React só cuida da moldura (placar, avisos). O jogo roda num laço próprio,
// ~60 vezes por segundo, fora do React, e desenha direto no <canvas>.

// atalho de teste: /solo?level=4 começa direto na fase 4
const START_LEVEL = (Number(new URLSearchParams(window.location.search).get('level')) || 1) - 1
const newRun = () => createGame(Math.random, START_LEVEL)

const INTRO_SECS = 3.4 // quanto tempo a faixa de abertura da fase fica na tela (igual ao CSS .solo-banner)
// Estilo pixel (botão no topo): o jogo é desenhado com PX_TILE pixels por casinha e ampliado
// com pixels quadrados. TESTE antigo: /solo?pixel=16 (ou 12, 24...) espreme a arte pintada em
// poucos pixels e com menos tons de cor (POSTER).
const PIXEL_TEST = (() => {
  const v = Number(new URLSearchParams(window.location.search).get('pixel'))
  if (!v) return 0
  return v === 1 ? 16 : Math.max(8, Math.min(48, Math.round(v)))
})()
const PIXEL = PIXEL_TEST || (STYLE === 'pixel' ? PX_TILE : 0)
const POSTER = !!PIXEL_TEST

// diminui a quantidade de tons de cada cor (efeito de paleta retrô)
function posterize(ctx) {
  const { width, height } = ctx.canvas
  const img = ctx.getImageData(0, 0, width, height)
  const d = img.data
  for (let i = 0; i < d.length; i += 4) {
    d[i] = (d[i] >> 5) * 36 + 18
    d[i + 1] = (d[i + 1] >> 5) * 36 + 18
    d[i + 2] = (d[i + 2] >> 5) * 36 + 18
  }
  ctx.putImageData(img, 0, 0)
}

// baú grande da janela do prêmio (no estilo pixel, a versão pixel ampliada sem borrar)
const CHEST_ART = STYLE === 'pixel'
  ? { closed: '/solo/pixel/chest-closed.png', open: '/solo/pixel/chest-open.png' }
  : { closed: '/solo/chest-closed-big.webp', open: '/solo/chest-open-big.webp' }

const FRAME_PAD = 12 // espessura da moldura de metal (px), igual ao padding de .solo-frame

const isTouchOnly = () =>
  typeof window !== 'undefined' && window.matchMedia('(hover: none) and (pointer: coarse)').matches

// aviso curto embaixo do placar, guiando o jogador
function hintOf(s) {
  if (s.status !== 'playing') return null
  if (s.time < s.noteUntil) return s.note
  if (s.player.detonator && s.bombs.some((b) => b.remote)) return 'Press E to detonate your bomb'
  const c = s.chest
  if (c?.state === 'closed') return chestNear(s) ? 'Click the chest to open it!' : 'A chest appeared! Walk up to it and click it'
  if (c && chestDone(s)) return 'The door is open! Step on it to leave'
  if (s.boss?.alive) return null
  if (s.door.revealed && !doorOpen(s)) return 'Defeat all enemies to open the door'
  if (!s.door.revealed && enemiesLeft(s) === 0) return 'All enemies down! Find the hidden door under a block'
  return null
}

// frases da tela de morte: algumas pelo que te matou, outras servem pra qualquer morte
const DEATH_LINES = {
  fire: ['Ser, that was your own bomb.', 'Self-liquidated.', 'You rugged yourself.', 'Friendly fire is still fire.', 'Bold strategy. It did not work.'],
  marine: ['The Blue Marines were not impressed.', 'Outmarched.'],
  sarge: ['The Sarge says: drop and give me 20.', 'Chain of command: you lost.'],
  fud: ['Caught by the FUD.', 'You let the FUD get to you.'],
  bear: ['The bears got you.', 'Bear market claims another one.'],
  rug: ['Rug pulled. Classic.', 'Never trust a rug.'],
  boss: ['The Whale ate your bags.', 'Whale-sized loss.', 'Market manipulated.'],
  any: ['Rekt.', 'Liquidated.', 'Should have done your own research.', 'Not financial advice.', 'GG. Go again.'],
}
function deathLine(s) {
  const pool = [...(DEATH_LINES[s.deathCause] ?? []), ...DEATH_LINES.any]
  return pool[Math.floor((s.deathRoll ?? 0) * pool.length)]
}

function hudOf(s, paused) {
  const p = s.player
  return {
    status: s.status,
    paused,
    deathLine: s.status === 'dead' || s.status === 'gameover' ? deathLine(s) : null,
    level: s.levelIndex + 1,
    levelName: levelInfo(s).name,
    tagline: levelInfo(s).tagline ?? '',
    tileset: s.tileset,
    lives: s.lives,
    enemies: enemiesLeft(s),
    door: s.door.revealed ? (doorOpen(s) ? 'open' : 'locked') : null,
    bombs: p.maxBombs,
    range: p.range,
    boots: Math.round((p.speed - PLAYER_SPEED) / SPEED_STEP),
    // já no máximo: o placar mostra MAX (pegar mais desse item não muda nada)
    bombsMax: p.maxBombs >= MAX_BOMBS,
    rangeMax: p.range >= MAX_RANGE,
    bootsMax: p.speed >= MAX_SPEED - 1e-6,
    shield: !!p.shield,
    kick: !!p.kick,
    detonator: !!p.detonator,
    secs: Math.floor(s.runTime),
    intro: s.status === 'playing' && s.time < INTRO_SECS,
    firstLevel: s.levelIndex === 0,
    boss: s.boss ? { name: BOSS.name, hp: Math.max(0, s.boss.hp), max: BOSS.hp } : null,
    loot: s.loot,
    hint: hintOf(s),
    chest: s.chest && !s.chest.dismissed && s.chest.state !== 'closed'
      ? { state: s.chest.state, result: s.chest.result } : null,
  }
}

export default function SoloGame() {
  const [touch] = useState(isTouchOnly)
  const wrapRef = useRef(null)
  const canvasRef = useRef(null)
  const actionsRef = useRef({ advance() {}, dismissChest() {} })
  const [hud, setHud] = useState(null)

  // sem a música de fundo do Pyth Bomb (Athens) aqui: o Solo tem o próprio som (efeitos 8 bits, src/solo/sfx.js).
  // Ao sair, tudo volta ao normal nos outros modos.
  useEffect(() => {
    setMusicSilenced(true)
    setSoundTheme('solo')
    return () => { setMusicSilenced(false); setSoundTheme(null) }
  }, [])

  useEffect(() => {
    if (touch) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d', { willReadFrequently: POSTER }) // o teste de pixel lê a imagem toda a cada quadro
    loadSprites()
    const controls = createControls()
    let game = newRun()
    let tilePx = 40
    let dpr = window.devicePixelRatio || 1
    let raf = 0
    let last = performance.now()
    let hudKey = ''

    const sfx = createSoloSfx() // toca os sons do jogo (só escuta, não muda regra nenhuma)
    let freeze = 0 // micro-pausa ("hit-stop") quando um inimigo é derrotado
    let paused = false // pausa (P/Esc, ou sozinha quando a aba some ou a janela perde o foco)
    const start = (g) => { game = g; controls.clear(); FX.reset(); freeze = 0; paused = false }
    const setPaused = (v) => { paused = v; controls.clear() }
    // só pausa no meio da fase (nas telas de morte, fase concluída e baú o jogo já está parado)
    const pauseNow = () => { if (game.status === 'playing' && !isPaused(game)) setPaused(true) }
    const onVisibility = () => { if (document.hidden) pauseNow() }
    // pausado: qualquer tecla volta (e essa tecla não vira ação no jogo, ex.: não solta bomba)
    const onResumeKey = (e) => {
      if (!paused || e.altKey || e.ctrlKey || e.metaKey) return
      e.preventDefault()
      e.stopImmediatePropagation()
      setPaused(false)
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('blur', pauseNow)
    window.addEventListener('keydown', onResumeKey, true)
    // Enter / botão da mensagem: fecha o resultado do baú, tenta de novo, próxima fase ou corrida nova
    const advance = () => {
      if (game.chest?.state === 'opened' && !game.chest.dismissed) dismissChest(game)
      else if (game.status === 'dead') start(retryLevel(game))
      else if (game.status === 'cleared') start(nextLevel(game))
      else if (game.status === 'gameover' || game.status === 'won') start(newRun())
    }
    actionsRef.current = { advance, dismissChest: () => dismissChest(game), resume: () => setPaused(false) }

    // clique no canvas: abre o baú (se clicou nele e está do lado)
    const tileUnder = (e) => {
      const r = canvas.getBoundingClientRect()
      return {
        x: Math.floor((e.clientX - r.left - canvas.clientLeft) / tilePx),
        y: Math.floor((e.clientY - r.top - canvas.clientTop) / tilePx),
      }
    }
    const onChest = (e) => {
      const c = game.chest
      if (!c) return false
      const t = tileUnder(e)
      return t.x === c.x && t.y === c.y
    }
    const onClick = (e) => {
      if (!onChest(e) || game.chest.state !== 'closed') return
      const g = game
      if (!beginChest(g)) {
        g.note = 'Get closer to the chest first!'
        g.noteUntil = g.time + 1.6
        return
      }
      openChest({ level: g.levelIndex + 1, boss: !!g.boss })
        .then((result) => finishChest(g, result))
        .catch(() => finishChest(g, { win: false, amount: 0, token: 'PYTH', demo: true, error: true }))
    }
    const onMove = (e) => {
      canvas.style.cursor = onChest(e) && game.chest.state === 'closed' ? 'pointer' : ''
    }
    canvas.addEventListener('click', onClick)
    canvas.addEventListener('mousemove', onMove)

    const unbind = bindKeyboard(controls, (e) => {
      if (e.code === 'Enter') advance()
      else if (e.code === 'KeyR') start(newRun()) // recomeça a corrida do zero
      else if (e.code === 'KeyP' || e.code === 'Escape') pauseNow()
    })

    // o tamanho da casa acompanha o tamanho da janela, e o canvas é redesenhado nítido
    const fit = () => {
      const r = wrapRef.current.getBoundingClientRect()
      // desconta a moldura de metal em volta (FRAME_PAD de cada lado)
      tilePx = Math.max(16, Math.floor(Math.min((r.width - FRAME_PAD * 2) / COLS, (r.height - FRAME_PAD * 2) / ROWS)))
      dpr = window.devicePixelRatio || 1
      canvas.style.width = `${tilePx * COLS}px`
      canvas.style.height = `${tilePx * ROWS}px`
      canvas.width = PIXEL ? PIXEL * COLS : Math.round(tilePx * COLS * dpr)
      canvas.height = PIXEL ? PIXEL * ROWS : Math.round(tilePx * ROWS * dpr)
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
      if (paused) { /* parado: só redesenha */ }
      else if (freeze > 0) freeze -= dt
      else for (let i = 0; i < n; i++) update(game, controls, dt / n)
      if (game.events.some((ev) => ev.type === 'enemyHit' && ev.killed)) freeze = 0.06
      sfx(game) // antes do FX.consumeEvents, que limpa os avisos
      FX.consumeEvents(game)
      if (!paused) FX.update(game, dt)
      if (PIXEL) { draw(ctx, game, PIXEL, 1); if (POSTER) posterize(ctx) } else draw(ctx, game, tilePx, dpr)
      const h = hudOf(game, paused)
      const key = JSON.stringify(h)
      if (key !== hudKey) { hudKey = key; setHud(h) }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf); ro.disconnect(); unbind()
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('blur', pauseNow)
      window.removeEventListener('keydown', onResumeKey, true)
      canvas.removeEventListener('click', onClick)
      canvas.removeEventListener('mousemove', onMove)
    }
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
    <div className={`solo-page is-${hud?.tileset ?? 'temple'}${PIXEL ? ' is-pixel' : ''}`}>
      <SoundToggle className="sound-fixed" />
      <header className="solo-top">
        <div className="solo-title">
          <a className="solo-back" href="/play">← Back</a>
          <h1>Dungeon Run <span className="solo-tag">prototype</span></h1>
          <button type="button" className="solo-style" title="Switch art style"
            onClick={() => {
              setStyle(STYLE === 'pixel' ? 'painted' : 'pixel')
              const u = new URL(window.location.href)
              u.searchParams.delete('style') // senão o link força o estilo antigo de novo
              window.location.href = u.toString()
            }}>
            <span className={STYLE === 'painted' ? 'is-on' : ''}>Painted</span>
            <span className={STYLE === 'pixel' ? 'is-on' : ''}>Pixel</span>
          </button>
        </div>
        <div className="solo-hud">
          <span title="Lives">❤️ <Bump v={hud?.lives ?? 3} /></span>
          <span title="Level">Level {hud?.level ?? 1}/{LEVELS.length}</span>
          <span title="Enemies left" className={hud?.enemies === 0 ? 'solo-hud-done' : ''}>👾 <Bump v={hud?.enemies ?? '–'} /></span>
          {hud?.door && <span title="Exit door">🚪 {hud.door === 'open' ? 'Open!' : 'Locked'}</span>}
          <span className="solo-hud-sep" />
          <span title={`Bombs at once (max ${MAX_BOMBS})`}>💣 <Bump v={hud?.bombs ?? 1} />{hud?.bombsMax && <Max />}</span>
          <span title={`Explosion range (max ${MAX_RANGE})`}>🔥 <Bump v={hud?.range ?? 1} />{hud?.rangeMax && <Max />}</span>
          <span title="Speed boosts">👟 <Bump v={hud?.boots ?? 0} />{hud?.bootsMax && <Max />}</span>
          {(hud?.shield || hud?.kick || hud?.detonator) && (
            <span className="solo-hud-items">
              {hud.shield && <b className="solo-bump" title="Shield: blocks 1 hit">🛡️</b>}
              {hud.kick && <b className="solo-bump" title="Kick: walk into a bomb to kick it">🦵</b>}
              {hud.detonator && <b className="solo-bump" title="Detonator: press E to blow up your bomb">🧨</b>}
            </span>
          )}
          <span title="Time">⏱ {time}</span>
          <span className="solo-hud-sep" />
          <span title={CHEST_IS_DEMO ? 'Chest prizes (demo, not real)' : 'Chest prizes'}>
            🎁 <Bump v={hud?.loot ?? 0} /> PYTH{CHEST_IS_DEMO && <small className="solo-demo">demo</small>}
          </span>
        </div>
      </header>


      {hud?.boss && (
        <div className="solo-boss" title={`${hud.boss.name}: ${hud.boss.hp}/${hud.boss.max}`}>
          <span>🐋 {hud.boss.name}</span>
          <div className="solo-boss-bar">
            <div style={{ width: `${(hud.boss.hp / hud.boss.max) * 100}%` }} />
          </div>
        </div>
      )}

      <div className="solo-stage" ref={wrapRef}>
        <div className="solo-frame">
          <canvas ref={canvasRef} className="solo-canvas" />
          <i className="solo-lamp is-tl" /><i className="solo-lamp is-tr" />
          <i className="solo-lamp is-bl" /><i className="solo-lamp is-br" />
        </div>
        {hud?.intro && (
          <div className="solo-banner" key={hud.level}>
            <span>Level {hud.level}</span>
            <strong>{hud.levelName}</strong>
            {hud.tagline && <em>{hud.tagline}</em>}
            {hud.firstLevel && (
              <ul className="solo-controls">
                <li><kbd>WASD</kbd> / <kbd>Arrows</kbd> Move</li>
                <li><kbd>Space</kbd> Drop bomb</li>
                <li><kbd>Click</kbd> Open chest</li>
                <li><kbd>P</kbd> Pause</li>
              </ul>
            )}
          </div>
        )}
        {hud?.hint && <div className="solo-hint">{hud.hint}</div>}
        {hud?.chest && <ChestModal chest={hud.chest} onClose={() => actionsRef.current.dismissChest()} />}
        {hud?.status === 'dead' && (
          <Overlay title="You got rugged!" line={hud.deathLine} button="Try again"
            text={`${hud.lives} ${hud.lives === 1 ? 'life' : 'lives'} left`} onClick={() => actionsRef.current.advance()} />
        )}
        {hud?.status === 'gameover' && (
          <Overlay title="Game over" line={hud.deathLine} button="Play again"
            text={`You reached level ${hud.level}`} onClick={() => actionsRef.current.advance()} />
        )}
        {hud?.paused && (
          <Overlay pause title="Paused" button="Continue" text="Take your time. The enemies are frozen too."
            foot="Press any key to continue" onClick={() => actionsRef.current.resume()} />
        )}
        {hud?.status === 'cleared' && (
          <Overlay win title={`Level ${hud.level} clear!`} button="Next level"
            text={`Next: ${LEVELS[hud.level].name} · Prizes so far: ${hud.loot} PYTH${CHEST_IS_DEMO ? ' (demo)' : ''}`} onClick={() => actionsRef.current.advance()} />
        )}
        {hud?.status === 'won' && (
          <Overlay win title="You escaped the dungeon!" button="Play again"
            text={`All ${LEVELS.length} levels in ${time} · Prizes: ${hud.loot} PYTH${CHEST_IS_DEMO ? ' (demo)' : ''}`} onClick={() => actionsRef.current.advance()} />
        )}
      </div>

    </div>
  )
}

function Overlay({ title, line, text, button, onClick, win = false, pause = false, foot = 'or press Enter' }) {
  return (
    <div className={`solo-over${win ? ' is-win' : ''}${pause ? ' is-pause' : ''}`}>
      <h2>{title}</h2>
      {line && <p className="solo-line">{line}</p>}
      <p className="solo-sub">{text}</p>
      <button type="button" className="solo-btn" onClick={onClick}>{button}</button>
      <p className="solo-sub">{foot}</p>
    </div>
  )
}

// Abrindo o baú / resultado do sorteio
function ChestModal({ chest, onClose }) {
  if (chest.state === 'opening') {
    return (
      <div className="solo-over solo-chest">
        <img className="solo-chest-img is-shaking" src={CHEST_ART.closed} alt="" />
        <h2>Opening the chest...</h2>
      </div>
    )
  }
  const r = chest.result
  return (
    <div className={`solo-over solo-chest${r.win ? ' is-win' : ''}`}>
      {r.win
        ? <img className="solo-chest-img is-win" src={CHEST_ART.open} alt="" />
        : <div className="solo-chest-icon">🕸️</div>}
      <h2>{r.win ? `You found ${r.amount} ${r.token}!` : 'Empty chest...'}</h2>
      <p className="solo-sub">{r.win ? 'Nice loot!' : 'Better luck in the next one'}</p>
      {r.demo && <p className="solo-demo-note">Demo prize: not real PYTH</p>}
      <button type="button" className="solo-btn" onClick={onClose}>Continue</button>
      <p className="solo-sub">or press Enter</p>
    </div>
  )
}

// selo "MAX" ao lado de um número do placar que chegou no limite
function Max() {
  return <small className="solo-max">MAX</small>
}

// número do placar que dá um "pulinho" quando muda (a key nova refaz a animação)
function Bump({ v }) {
  return <b className="solo-bump" key={v}>{v}</b>
}
