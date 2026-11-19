// PYTH ODYSSEY (antes "Pyth Dash"; nome escolhido pela Halls em 2026-11-19) — jogo de plataforma com os heróis do Pyth Bomb.
// Endereço: /dash (ainda fora do menu de modos, até a Halls aprovar).
// Teclado: ← → ou A D pra correr, Espaço / ↑ / W / Z pra pular (segurar = pulo mais alto). Esc volta pro menu.
// Celular: botões ◀ ▶ embaixo à esquerda e o botão de pulo à direita.
// História: King Latency roubou o Genesis Price e o Purple Realm congelou no preço velho (cinza).
// O herói liga os Publishers e entrega o preço no Oracle Beacon; o mundo volta a ser roxo. "The price must flow."
import { useEffect, useRef, useState } from 'react'
import { LEVELS } from './levels.js'
import { createGame, step, starsOf, openChest } from './engine.js'
import { drawGame, loadHero, loadArt, RARITY, lootLabel } from './render.js'
import { startRun, chestLoot, revealRun } from './draw.js'
import { ODDS } from './loot.js'
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
const SFX = {
  jump: 'solo_kick', coin: 'solo_pickup', stomp: 'solo_enemy_die', bump: 'solo_hit', die: 'solo_dead', gameover: 'solo_gameover',
  win: 'solo_clear', checkpoint: 'solo_door', relay: 'solo_door', stale: 'solo_hit', publisher: 'solo_shield', gem: 'solo_chest_win',
  chest: 'solo_chest_open', power: 'solo_pickup', item: 'solo_jet', shieldbreak: 'solo_hurt',
  bosswake: 'solo_chop_intro', slam: 'solo_boom', bosshit: 'solo_chop_hurt', bossdown: 'solo_chop_die',
}
const HERO_KEY = 'pb_dash_hero'
const DEV_LEVEL = (() => {
  if (!import.meta.env.DEV) return null
  const n = Number(new URLSearchParams(window.location.search).get('level'))
  return n >= 1 && n <= LEVELS.length ? n - 1 : null
})()
const CHEST_MIN_MS = 700 // o dado gira pelo menos isso (o sorteio pode chegar antes)
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

export default function DashApp() {
  const [screen, setScreen] = useState('menu') // 'menu' | 'story' | 'play'
  const [hero, setHero] = useState(() => { try { return localStorage.getItem(HERO_KEY) || 'pirb' } catch { return 'pirb' } })
  const [run, setRun] = useState(0) // muda a cada partida nova (recomeça o jogo)
  useSoloAudio('/music/solo.mp3') // efeitos e música do Solo ("Pixel Adventure")
  useEffect(() => { for (const h of HEROES) loadHero(h.id); loadArt() }, [])
  useEffect(() => { const old = document.title; document.title = 'Pyth Odyssey · Pyth Bomb'; return () => { document.title = old } }, [])
  const pick = (id) => { setHero(id); try { localStorage.setItem(HERO_KEY, id) } catch { /* sem localStorage */ } }
  // só no computador (npm run dev): /odyssey?level=3 já abre na fase 3, liberada, pra testar
  const [levelIdx, setLevelIdx] = useState(() => (DEV_LEVEL != null ? DEV_LEVEL : Math.min(clearedCount(), LEVELS.length - 1)))
  const [cleared, setCleared] = useState(() => Math.max(clearedCount(), DEV_LEVEL ?? 0))
  const start = (idx = levelIdx) => { unlock(); setLevelIdx(idx); setRun((r) => r + 1); setScreen('play') }
  // na primeira vez, a historinha em quadrinhos antes da fase 1 (depois, só pelo botão Story do menu)
  const play = () => { unlock(); if (levelIdx === 0 && !storySeen()) { setScreen('story'); return } start() }
  const storyDone = () => { markStorySeen(); start() }
  const onCleared = (idx) => { const n = Math.max(clearedCount(), idx + 1); saveCleared(n); setCleared(n) }

  return (
    <div className="dash-page">
      <SoundToggle className="sound-fixed" />
      {screen === 'menu' && <DashMenu hero={hero} onPick={pick} onStart={play} onStory={() => { unlock(); setScreen('story') }}
        levelIdx={levelIdx} onLevel={setLevelIdx} cleared={cleared} />}
      {screen === 'story' && <DashStory onDone={storyDone} />}
      {screen === 'play' && <DashPlay key={run} hero={hero} levelIdx={levelIdx} onMenu={() => setScreen('menu')} onAgain={() => start(levelIdx)}
        onNext={levelIdx + 1 < LEVELS.length ? () => start(levelIdx + 1) : null} onCleared={onCleared} />}
    </div>
  )
}

function DashMenu({ hero, onPick, onStart, onStory, levelIdx, onLevel, cleared }) {
  const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1)
  return (
    <div className="dash-menu">
      <a className="dash-back" href="/play">← Back to Pyth Bomb</a>
      {/* tela de título: o templo de Delfos ao fundo (public/dash/title.webp); o título fica no céu e os botões embaixo */}
      <div className="dash-menu-top">
        <h1 className="dash-title">PYTH <span>ODYSSEY</span></h1>
        <p className="dash-tagline">The price must flow.</p>
        <p className="dash-sub dash-menu-sub">Kronos, the Stale Titan, froze the Purple Realm. Wake the shrines, deliver the price and bring the color back.</p>
      </div>
      <div className="dash-menu-card">
        <p className="dash-label">Choose your hero</p>
        <div className="dash-heroes" role="radiogroup" aria-label="Choose your hero">
          {HEROES.map((h) => (
            <button key={h.id} type="button" role="radio" aria-checked={hero === h.id} aria-label={h.label}
              className={`dash-hero${hero === h.id ? ' is-on' : ''}`} onClick={() => onPick(h.id)}>
              <img src={`/solo/pixel/${h.id}-right1.png`} alt="" />
            </button>
          ))}
        </div>
        <div className="dash-levels" role="radiogroup" aria-label="Choose the level">
          {LEVELS.map((L, i) => {
            const locked = i > cleared
            return (
              <button key={L.id} type="button" role="radio" aria-checked={levelIdx === i} disabled={locked}
                className={`dash-level-btn${levelIdx === i ? ' is-on' : ''}`} onClick={() => onLevel(i)}>
                <b>1-{i + 1}</b> {locked ? 'Locked' : L.name}{i < cleared ? ' \u2713' : ''}
              </button>
            )
          })}
        </div>
        <div className="dash-menu-btns">
          <button type="button" className="dash-btn dash-btn-go" onClick={onStart}>Play</button>
          <button type="button" className="dash-btn dash-btn-story" onClick={onStory}>Story</button>
        </div>
        <p className="dash-keys">{TOUCH ? '◀ ▶ to run · big button to jump (hold = higher)' : '← → or A D to run · Space or ↑ to jump (hold = higher) · Esc = menu'}</p>
        <p className="dash-odds"><span className="dash-emoji" aria-hidden="true">🎲</span> Chests are drawn with Pyth Entropy · {ODDS.map((o) => `${cap(o.rarity)} ${o.chance}%`).join(' · ')}</p>
      </div>
    </div>
  )
}

function DashPlay({ hero, levelIdx = 0, onMenu, onAgain, onNext, onCleared }) {
  const wrapRef = useRef(null)
  const canvasRef = useRef(null)
  const input = useRef({ left: false, right: false, jump: false })
  const [hud, setHud] = useState(null)
  const [chests, setChests] = useState([]) // prêmios que saíram (pra tela do fim)
  const [runInfo, setRunInfo] = useState(null)
  const [reveal, setReveal] = useState(null)
  const runRef = useRef(null)
  const level = LEVELS[levelIdx]
  const clearedRef = useRef(onCleared)
  useEffect(() => { clearedRef.current = onCleared }, [onCleared])
  const menuRef = useRef(onMenu) // (num ref: trocar a função não reinicia a partida)
  useEffect(() => { menuRef.current = onMenu }, [onMenu])

  useEffect(() => {
    const g = createGame(level)
    const runP = startRun() // pega o sorteio do Pyth Entropy pra esta partida (não trava o começo)
    runRef.current = runP
    let alive = true
    runP.then((r) => { if (alive) setRunInfo(r) })
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

    // baú aberto: pede o prêmio ao servidor (Pyth Entropy) e abre quando chegar
    const askChest = (n) => {
      const t0 = performance.now()
      chestLoot(runP, n).then((loot) => {
        const wait = Math.max(0, CHEST_MIN_MS - (performance.now() - t0))
        setTimeout(() => {
          if (!alive) return
          openChest(g, n, loot)
          for (const ev of g.events.splice(0)) if (SFX[ev]) play(SFX[ev])
          setChests((c) => [...c, { n, ...loot }])
        }, wait)
      })
    }

    let revealed = false
    const frame = (now) => {
      acc += Math.min(0.1, (now - last) / 1000); last = now
      while (acc >= DT) {
        step(g, input.current, DT)
        for (const ev of g.events) if (SFX[ev]) play(SFX[ev])
        acc -= DT
      }
      while (g.chestAsks.length) askChest(g.chestAsks.shift())
      if (g.status === 'won' && !revealed) { revealed = true; clearedRef.current?.(levelIdx); revealRun(runP).then((r) => { if (alive) setReveal(r) }) }
      drawGame(ctx, g, canvas.width, canvas.height, hero, cam)
      const st = starsOf(g)
      const h = {
        coins: g.coinsTaken + g.bonusCoins, total: st.total, time: Math.floor(g.time), lives: g.lives, status: g.status,
        done: g.status === 'won' && g.statusT > 2.2, stars: st, gems: g.gemsTaken, pubs: g.publishers.filter((p) => p.on).length,
        npubs: g.publishers.length, shield: g.player.shield, lazer: Math.ceil(g.player.lazer),
      }
      const key = JSON.stringify(h)
      if (key !== hudKey) { hudKey = key; setHud(h) }
      if (import.meta.env.DEV) window.__dash = g // só no desenvolvimento: pros testes
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => {
      alive = false
      cancelAnimationFrame(raf); ro.disconnect()
      window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur)
    }
  }, [hero, level, levelIdx])

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
        <span className="dash-hud-world">1-{levelIdx + 1} · {level.name}</span>
        <span title="Price updates">🪙 {hud?.coins ?? 0}</span>
        <span title="Confidence Gems" className="dash-hud-gems">◆ {hud?.gems ?? 0}/{hud?.stars?.gems ?? 3}</span>
        <span title="Publishers online">📡 {hud?.pubs ?? 0}/{hud?.npubs ?? 3}</span>
        <span>⏱ {fmt(hud?.time ?? 0)}</span>
        <span>{'❤'.repeat(Math.max(0, hud?.lives ?? 3))}{hud?.shield ? ' 🛡' : ''}{hud?.lazer ? ` ⚡${hud.lazer}` : ''}</span>
        <button type="button" className="dash-hud-menu" onClick={onMenu}>Menu</button>
      </div>
      <div className="dash-stage" ref={wrapRef}>
        <canvas ref={canvasRef} className="dash-canvas" />
        <div className="dash-title-card" aria-hidden="true">
          <p>WORLD 1-{levelIdx + 1}</p>
          <h2>{level.name}</h2>
          <span>The price must flow.</span>
        </div>
        {hud?.done && <DashResult hud={hud} level={level} won chests={chests} runInfo={runInfo} reveal={reveal} onAgain={onAgain} onMenu={onMenu} onNext={onNext} />}
        {hud?.status === 'gameover' && <DashResult hud={hud} level={level} chests={chests} runInfo={runInfo} onAgain={onAgain} onMenu={onMenu} />}
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

// confere o sorteio: sha256(segredo) tem que ser o commit que foi pra blockchain antes do número sair
function useCommitCheck(reveal) {
  const [ok, setOk] = useState(null)
  useEffect(() => {
    if (!reveal?.secret || !reveal?.proof?.commit) return
    const bytes = new Uint8Array(reveal.secret.slice(2).match(/../g).map((h) => parseInt(h, 16)))
    crypto.subtle.digest('SHA-256', bytes).then((d) => {
      const hex = '0x' + [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('')
      setOk(hex.toLowerCase() === String(reveal.proof.commit).toLowerCase())
    }).catch(() => setOk(null))
  }, [reveal])
  return ok
}

function DashResult({ hud, level, won, chests, runInfo, reveal, onAgain, onMenu, onNext }) {
  const s = hud.stars
  const got = won ? [s.finished, s.allGems, s.fast].filter(Boolean).length : 0
  const via = runInfo?.via
  const proof = runInfo?.proof
  const check = useCommitCheck(reveal)
  return (
    <div className="dash-result" role="dialog" aria-label={won ? 'Price delivered' : 'Game over'}>
      <h2>{won ? 'Price delivered!' : 'Out of lives'}</h2>
      {won && (
        <>
          <p className="dash-sub">The Oracle Beacon is back online. {level.name} is purple again.</p>
          <p className="dash-stars" aria-label={`${got} of 3 stars`}>{[0, 1, 2].map((i) => <span key={i} className={i < got ? 'is-on' : ''}>★</span>)}</p>
          <ul className="dash-goals">
            <li className={s.finished ? 'is-on' : ''}>Deliver the price to the Oracle Beacon</li>
            <li className={s.allGems ? 'is-on' : ''}>Find all Confidence Gems ({hud.gems}/{s.gems})</li>
            <li className={s.fast ? 'is-on' : ''}>Finish in {fmt(level.par)} ({fmt(hud.time)})</li>
          </ul>
          <p className="dash-coins">🪙 {hud.coins} price updates</p>
        </>
      )}
      {!won && <p className="dash-sub">The lag bugs got you. Try again!</p>}
      {chests.length > 0 && (
        <div className="dash-loot">
          <p className="dash-label">Chests</p>
          <ul>
            {chests.map((c) => (
              <li key={c.n}><b style={{ color: RARITY[c.rarity] }}>{c.rarity}</b> {lootLabel(c)}</li>
            ))}
          </ul>
          {via === 'entropy' && proof?.tx ? (
            <p className="dash-proof">
              🎲 Drawn with Pyth Entropy ({proof.chainName}) · <a href={`${proof.explorer}/tx/${proof.tx}`} target="_blank" rel="noreferrer">Verify ↗</a>
              {check === true && <span className="dash-proof-ok"> · secret matches ✓</span>}
              {check === false && <span className="dash-proof-bad"> · secret does not match ✗</span>}
            </p>
          ) : (
            <p className="dash-proof">{via === 'server' ? 'Drawn by the game server (Pyth Entropy was busy)' : 'Drawn on this device (game server offline)'}</p>
          )}
        </div>
      )}
      <div className="dash-result-btns">
        {won && onNext && <button type="button" className="dash-btn dash-btn-go" onClick={onNext}>Next level ▶</button>}
        <button type="button" className={`dash-btn${won && onNext ? '' : ' dash-btn-go'}`} onClick={onAgain}>{won ? 'Play again' : 'Try again'}</button>
        <button type="button" className="dash-btn" onClick={onMenu}>Menu</button>
      </div>
    </div>
  )
}

// ---- história em quadrinhos da abertura (5 quadros, só imagem + uma frase). Toque/Espaço/Enter avança; Skip pula.
const STORY = [
  { img: '/dash/story/1.webp', text: 'In Delphi, Nysa the Oracle kept the Purple Realm alive. Fresh prices flowed from every shrine.' },
  { img: '/dash/story/2.webp', text: 'Then Kronos, the Stale Titan, rose from the past.' },
  { img: '/dash/story/3.webp', text: 'He stole the Genesis Flame. The whole world froze in old prices.' },
  { img: '/dash/story/4.webp', text: 'With the last light of her orb, Nysa called the Data Runners.' },
  { img: '/dash/story/5.webp', text: 'The price must flow.' },
]
const STORY_KEY = 'pb_dash_story'
function storySeen() { try { return localStorage.getItem(STORY_KEY) === '1' } catch { return false } }
function markStorySeen() { try { localStorage.setItem(STORY_KEY, '1') } catch { /* sem localStorage */ } }

function DashStory({ onDone }) {
  const [i, setI] = useState(0)
  const doneRef = useRef(onDone)
  useEffect(() => { doneRef.current = onDone }, [onDone])
  useEffect(() => { for (const s of STORY) { const im = new Image(); im.src = s.img } }, [])
  const iRef = useRef(0)
  const next = () => {
    if (iRef.current + 1 >= STORY.length) { doneRef.current(); return }
    iRef.current += 1; setI(iRef.current)
  }
  useEffect(() => {
    const key = (e) => {
      if (e.code === 'Escape') { doneRef.current(); return }
      if (['Space', 'Enter', 'ArrowRight', 'KeyD'].includes(e.code)) { e.preventDefault(); next() }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [])
  const s = STORY[i]
  return (
    <div className="dash-story" onClick={next} role="dialog" aria-label="Story">
      <img key={s.img} className="dash-story-img" src={s.img} alt="" />
      <div className="dash-story-bar">
        <p key={s.text} className="dash-story-text">{s.text}</p>
        <div className="dash-story-dots" aria-hidden="true">{STORY.map((_, k) => <span key={k} className={k === i ? 'is-on' : ''} />)}</div>
        <span className="dash-story-hint">{i + 1 < STORY.length ? 'Tap or press Space ▶' : 'Tap or press Space to play ▶'}</span>
      </div>
      <button type="button" className="dash-story-skip" onClick={(e) => { e.stopPropagation(); onDone() }}>Skip ⏭</button>
    </div>
  )
}

// fases liberadas: quantas já foram vencidas (a próxima abre quando você entrega o preço na anterior)
const CLEARED_KEY = 'pb_dash_cleared'
function clearedCount() { try { return Math.max(0, Number(localStorage.getItem(CLEARED_KEY)) || 0) } catch { return 0 } }
function saveCleared(n) { try { localStorage.setItem(CLEARED_KEY, String(n)) } catch { /* sem localStorage */ } }
