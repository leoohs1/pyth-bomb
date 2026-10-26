import { useEffect, useRef, useState } from 'react'
import './SoloGame.css'
import SoundToggle from '../SoundToggle.jsx'
import { setMusicSilenced, setMusicStartFade, setMusicTrack } from '../music'
import { setSoundTheme } from '../sound'
import { createSoloSfx } from './sfx.js'
import { COLS, ROWS, STEP, START_LIVES, PLAYER_SPEED, SPEED_STEP, MAX_BOMBS, MAX_RANGE, MAX_SPEED } from './engine/constants.js'
import { LEVELS } from './engine/levels.js'
import {
  createGame, nextLevel, retryLevel, restartLevel, update, enemiesLeft, doorOpen, levelInfo, placeTestChest,
  chestNear, chestDone, beginChest, finishChest, dismissChest, isPaused,
} from './engine/game.js'
import { openChest, CHEST_IS_DEMO } from './chest/index.js'
import { createControls, bindKeyboard } from './engine/input.js'
import { BOSS } from './engine/boss.js'
import { draw } from './engine/render.js'
import SoloMap from './SoloMap.jsx'
import { TouchPad, TouchButtons } from './TouchControls.jsx'
import { LAUNCHED, BETA_KEY } from '../PlayGate.jsx'
import { loadSprites, STYLE, setStyle, PX_TILE } from './engine/sprites.js'
import * as FX from './engine/fx.js'

// Modo Solo (Bomberman) — protótipo com quadradinhos (inimigos, power-ups, porta, baú, chefe).
// O React só cuida da moldura (placar, avisos). O jogo roda num laço próprio,
// ~60 vezes por segundo, fora do React, e desenha direto no <canvas>.

// atalho de teste: /solo?level=4 começa direto na fase 4
const START_LEVEL = (Number(new URLSearchParams(window.location.search).get('level')) || 1) - 1
// atalho de teste: /solo?chest=1 começa sem inimigos, com o baú ao lado de você (?chest=win ou ?chest=empty força o resultado)
const TEST_CHEST = new URLSearchParams(window.location.search).get('chest')
// a corrida abre no MAPA (SoloMap.jsx), com o jogo parado por baixo; os atalhos de teste (?level=N, ?chest=, ?nomap=1) pulam o mapa
// atalho de teste: /solo?win=1 abre direto a tela de vitória (como se o chefe já tivesse morrido); "Play again" segue normal
let testWinPending = new URLSearchParams(window.location.search).has('win')
const MAP_BASE = !new URLSearchParams(window.location.search).has('level') && !TEST_CHEST && !new URLSearchParams(window.location.search).has('nomap')
const mapOn = () => MAP_BASE && !testWinPending // no atalho ?win=1 a tela da vitória abre sem mapa antes; depois do "Play again" o mapa volta
const newRun = () => {
  const g = createGame(Math.random, testWinPending ? LEVELS.length - 1 : START_LEVEL)
  if (TEST_CHEST) placeTestChest(g)
  if (testWinPending) { g.status = 'won'; g.loot = 3; g.runTime = 187 }
  return g
}

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

const FRAME_PAD = 12 // espessura da moldura de metal (px) se o CSS não disser (o certo vem do padding de .solo-frame)

// celular/tablet (toque, sem mouse): ganha os controles na tela (TouchControls.jsx).
// ?touch=1 força (pra testar no computador), ?touch=0 desliga.
const TOUCH = (() => {
  const v = new URLSearchParams(window.location.search).get('touch')
  if (v === '1') return true
  if (v === '0') return false
  return window.matchMedia('(hover: none) and (pointer: coarse)').matches
})()

// aviso curto embaixo do placar, guiando o jogador
function hintOf(s) {
  if (s.status !== 'playing') return null
  if (s.time < s.noteUntil) return s.note
  if (s.player.detonator && s.bombs.some((b) => b.remote)) return TOUCH ? 'Tap 🧨 to detonate your bomb' : 'Press E to detonate your bomb'
  const c = s.chest
  if (c?.state === 'closed') return chestNear(s) ? `Step onto the chest (or ${TOUCH ? 'tap' : 'click'} it) to open it!` : 'A chest appeared! Walk over it to open it'
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
  skeleton: ['Dead sailors tell no tales.', 'The drowned sailor says hi.'],
  crab: ['Pinched by a pirate crab.', 'Crabs walk sideways. You walked into it.'],
  rug: ['Rug pulled. Classic.', 'Never trust a rug.'],
  water: ['Swept away by the tide.', 'Wet floor. Very wet.', 'CHOP sends the tide to collect.', 'The sea wants its money back.'],
  boss: ['CHOP collected.', 'Margin called by a shark.', 'You owed CHOP. The interest was brutal.', 'CHOP says: pay up.'],
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
    mood: s.mood ?? null,
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
  const wrapRef = useRef(null)
  const canvasRef = useRef(null)
  const controlsRef = useRef(null) // os controles (teclado e toque) ficam aqui pra o direcional da tela alcançar
  if (!controlsRef.current) controlsRef.current = createControls()
  const actionsRef = useRef({ advance() {}, dismissChest() {} })
  const mapDepartRef = useRef(null) // o mapa de antes da corrida registra aqui a animação de zarpar
  const [hud, setHud] = useState(null)
  const [mapOpen, setMapOpen] = useState(mapOn) // o mapa de antes da corrida está na tela?

  // Enquanto o jogo está fechado pro público, a chave do beta fica no endereço. Motivo: no iPhone, "Adicionar à Tela de
  // Início" guarda o endereço de agora, e o ícone tem armazenamento próprio (não herda a chave do Safari): sem a chave no
  // endereço o ícone abria só o "Coming soon".
  useEffect(() => {
    if (LAUNCHED) return
    try {
      const u = new URL(window.location.href)
      if (!u.searchParams.has('beta')) { u.searchParams.set('beta', BETA_KEY); window.history.replaceState(null, '', u) }
    } catch { /* sem isso o jogo funciona igual */ }
  }, [])

  // O Solo tem o próprio som: efeitos 8 bits (src/solo/sfx.js) e música própria (public/music/solo.mp3, baixinha,
  // por baixo dos efeitos). Enquanto a música do Solo não estiver valendo, silêncio: a do Pyth Bomb (Athens)
  // nunca toca aqui. Ao sair, tudo volta ao normal nos outros modos.
  // Cada fase pode ter a própria música (levels.js `music`); sem isso, toca a padrão do Solo.
  const [ownMusic, setOwnMusic] = useState(false)
  const levelNo = hud?.level ?? START_LEVEL + 1
  const track = LEVELS[levelNo - 1]?.music ?? '/music/solo.mp3'
  useEffect(() => {
    setSoundTheme('solo')
    setMusicStartFade(120) // a música entra quase na hora: não engole a abertura (batidas do começo)
    return () => { setSoundTheme(null); setMusicStartFade(null); setMusicTrack() }
  }, [])
  useEffect(() => {
    let on = true
    setMusicTrack(track).then((ok) => { if (on) setOwnMusic(ok) })
    return () => { on = false }
  }, [track])
  useEffect(() => {
    setMusicSilenced(!ownMusic)
    return () => setMusicSilenced(false)
  }, [ownMusic])

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d', { willReadFrequently: POSTER }) // o teste de pixel lê a imagem toda a cada quadro
    loadSprites()
    const controls = controlsRef.current
    let game = newRun()
    let tilePx = 40
    let dpr = window.devicePixelRatio || 1
    let raf = 0
    let last = performance.now()
    let hudKey = ''

    const sfx = createSoloSfx() // toca os sons do jogo (só escuta, não muda regra nenhuma)
    let freeze = 0 // micro-pausa ("hit-stop") quando um inimigo é derrotado
    let paused = false // pausa (P/Esc, ou sozinha quando a aba some ou a janela perde o foco)
    let held = mapOn() // jogo parado enquanto o mapa de antes da corrida está na tela
    const start = (g) => { game = g; controls.clear(); FX.reset(); freeze = 0; paused = false }
    const setPaused = (v) => { paused = v; controls.clear() }
    // só pausa no meio da fase (nas telas de morte, fase concluída e baú o jogo já está parado)
    const pauseNow = () => { if (!held && game.status === 'playing' && !isPaused(game)) setPaused(true) }
    const showMap = (on) => { held = on && mapOn(); controls.clear(); setMapOpen(held) }
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
      if (held) { if (mapDepartRef.current) mapDepartRef.current(); else showMap(false) } // no mapa: zarpa (e a corrida começa quando a animação acaba)
      else if (game.chest?.state === 'opened' && !game.chest.dismissed) dismissChest(game)
      else if (game.status === 'dead') start(retryLevel(game))
      else if (game.status === 'cleared') start(nextLevel(game))
      else if (game.status === 'gameover') { start(restartLevel(game)); showMap(true) } // acabaram as vidas: a mesma fase de novo (passou, passou)
      else if (game.status === 'won') { testWinPending = false; start(newRun()); showMap(true) }
    }
    // no mapa, Enter ou Espaço seguem em frente (e a tecla não vira ação no jogo: Espaço não solta bomba)
    const onMapKey = (e) => {
      if ((!held && game.status !== 'cleared' && game.status !== 'won') || (e.code !== 'Enter' && e.code !== 'Space') || e.altKey || e.ctrlKey || e.metaKey) return
      e.preventDefault()
      e.stopImmediatePropagation()
      if (!e.repeat) advance()
    }
    window.addEventListener('keydown', onMapKey, true)
    actionsRef.current = { advance, dismissChest: () => dismissChest(game), resume: () => setPaused(false), pause: pauseNow, closeMap: () => showMap(false) }
    if (import.meta.env.DEV) window.__soloGame = () => game // só no desenvolvimento: deixa os testes mexerem no jogo (some do site)

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
    // abre o baú (clicando nele de perto, ou só passando por cima: ver o laço do jogo)
    const openChestNow = (g, byWalking) => {
      if (!beginChest(g)) {
        if (!byWalking) { g.note = 'Get closer to the chest first!'; g.noteUntil = g.time + 1.6 }
        return
      }
      openChest({ level: g.levelIndex + 1, boss: !!g.boss, force: TEST_CHEST })
        .then((result) => finishChest(g, result))
        .catch(() => finishChest(g, { win: false, amount: 0, token: 'PYTH', demo: true, error: true }))
    }
    const onClick = (e) => {
      if (!onChest(e) || game.chest.state !== 'closed') return
      openChestNow(game, false)
    }
    const onMove = (e) => {
      canvas.style.cursor = onChest(e) && game.chest.state === 'closed' ? 'pointer' : ''
    }
    canvas.addEventListener('click', onClick)
    canvas.addEventListener('mousemove', onMove)

    const unbind = bindKeyboard(controls, (e) => {
      if (e.code === 'Enter') advance()
      else if (e.code === 'KeyR') { testWinPending = false; start(newRun()); showMap(true) } // recomeça a corrida do zero
      else if (e.code === 'KeyP' || e.code === 'Escape') pauseNow()
    })

    // o tamanho da casa acompanha o tamanho da janela, e o canvas é redesenhado nítido
    const fit = () => {
      const r = wrapRef.current.getBoundingClientRect()
      // desconta a moldura de metal em volta (no celular ela é mais fina)
      const pad = parseFloat(getComputedStyle(canvas.parentElement).paddingLeft) || FRAME_PAD
      tilePx = Math.max(16, Math.floor(Math.min((r.width - pad * 2) / COLS, (r.height - pad * 2) / ROWS)))
      dpr = window.devicePixelRatio || 1
      canvas.style.width = `${tilePx * COLS}px`
      canvas.style.height = `${tilePx * ROWS}px`
      // a arte tem PX_TILE pixels por casa; se a casa na tela tem menos pixels que isso (celular pequeno), reduzir "no seco"
      // come detalhes, então aí suaviza; do contrário (o normal) mantém os pixels bem marcados
      canvas.style.imageRendering = PIXEL && tilePx * dpr < PIXEL ? 'auto' : ''
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
      if (paused || held) { /* parado (pausa ou mapa na tela): só redesenha */ }
      else if (freeze > 0) freeze -= dt
      else for (let i = 0; i < n; i++) update(game, controls, dt / n)
      // pisou em cima do baú: abre sozinho (não precisa clicar)
      const ch = game.chest
      if (!paused && !held && ch?.state === 'closed' && game.status === 'playing' && game.player.alive &&
        Math.abs(game.player.x - ch.x) < 0.55 && Math.abs(game.player.y - ch.y) < 0.55) openChestNow(game, true)
      if (game.events.some((ev) => ev.type === 'enemyHit' && ev.killed)) freeze = 0.06
      sfx(game) // antes do FX.consumeEvents, que limpa os avisos
      FX.consumeEvents(game)
      if (!paused && !held) FX.update(game, dt)
      if (PIXEL) { draw(ctx, game, PIXEL, 1); if (POSTER) posterize(ctx) } else draw(ctx, game, tilePx, dpr)
      const h = hudOf(game, paused)
      const key = JSON.stringify(h)
      if (key !== hudKey) { hudKey = key; setHud(h) }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf); ro.disconnect(); unbind(); sfx.stop()
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('blur', pauseNow)
      window.removeEventListener('keydown', onResumeKey, true)
      window.removeEventListener('keydown', onMapKey, true)
      canvas.removeEventListener('click', onClick)
      canvas.removeEventListener('mousemove', onMove)
    }
  }, [])

  const time = hud ? `${Math.floor(hud.secs / 60)}:${String(hud.secs % 60).padStart(2, '0')}` : '0:00'

  return (
    <div className={`solo-page is-${hud?.tileset ?? 'temple'}${hud?.mood ? ` is-mood-${hud.mood}` : ''}${PIXEL ? ' is-pixel' : ''}${TOUCH ? ' is-touch' : ''}`}
      style={TOUCH ? { '--cols': COLS, '--rows': ROWS } : undefined}>
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
          <span title="Level" className="solo-hud-wide">Level {hud?.level ?? 1}/{LEVELS.length}</span>
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
          <span className="solo-hud-wide" title={CHEST_IS_DEMO ? 'Chest prizes (demo, not real)' : 'Chest prizes'}>
            🎁 <Bump v={hud?.loot ?? 0} /> PYTH{CHEST_IS_DEMO && <small className="solo-demo">demo</small>}
          </span>
        </div>
      </header>


      {hud?.boss && (
        <div className="solo-boss" title={`${hud.boss.name}: ${hud.boss.hp}/${hud.boss.max}`}>
          <span>🦈 {hud.boss.name}</span>
          <div className="solo-boss-bar">
            <div style={{ width: `${(hud.boss.hp / hud.boss.max) * 100}%` }} />
          </div>
        </div>
      )}

      <div className="solo-body">
      {TOUCH && <TouchPad controls={controlsRef.current} />}
      <div className="solo-stage" ref={wrapRef}>
        <div className="solo-frame">
          <canvas ref={canvasRef} className="solo-canvas" />
          <i className="solo-lamp is-tl" /><i className="solo-lamp is-tr" />
          <i className="solo-lamp is-bl" /><i className="solo-lamp is-br" />
        </div>
        {hud?.intro && !mapOpen && (
          <div className="solo-banner" key={hud.level}>
            <span>Level {hud.level}</span>
            <strong>{hud.levelName}</strong>
            {hud.tagline && <em>{hud.tagline}</em>}
            {hud.firstLevel && (TOUCH ? (
              <ul className="solo-controls">
                <li><kbd>Pad</kbd> Move</li>
                <li><kbd>💣</kbd> Drop bomb</li>
                <li><kbd>Walk onto</kbd> / <kbd>Tap</kbd> Open chest</li>
              </ul>
            ) : (
              <ul className="solo-controls">
                <li><kbd>WASD</kbd> / <kbd>Arrows</kbd> Move</li>
                <li><kbd>Space</kbd> Drop bomb</li>
                <li><kbd>Walk onto</kbd> / <kbd>Click</kbd> Open chest</li>
                <li><kbd>P</kbd> Pause</li>
              </ul>
            ))}
          </div>
        )}
        {hud?.hint && <div className="solo-hint">{hud.hint}</div>}
        {hud?.chest && <ChestModal chest={hud.chest} onClose={() => actionsRef.current.dismissChest()} />}
        {hud?.status === 'dead' && (
          <Overlay title="You got rugged!" line={hud.deathLine} button="Try again"
            text={`${hud.lives} ${hud.lives === 1 ? 'life' : 'lives'} left · You lose your power-ups`} onClick={() => actionsRef.current.advance()} />
        )}
        {hud?.status === 'gameover' && (
          <Overlay title="Game over" line={hud.deathLine} button="Retry level"
            text={`Level ${hud.level} again with ${START_LIVES} lives. You keep the levels you cleared`} onClick={() => actionsRef.current.advance()} />
        )}
        {hud?.paused && (
          <Overlay pause title="Paused" button="Continue" text="Take your time. The enemies are frozen too."
            foot={TOUCH ? null : 'Press any key to continue'} onClick={() => actionsRef.current.resume()} />
        )}
        {hud?.status === 'cleared' && (
          <SoloMap mode="cleared" from={hud.level - 1} to={hud.level} title={`Level ${hud.level} clear!`}
            text={`Next: ${LEVELS[hud.level].name}${LEVELS[hud.level].arrival ? ` — ${LEVELS[hud.level].arrival}` : ''}`}
            extra={`Prizes so far: ${hud.loot} PYTH${CHEST_IS_DEMO ? ' (demo)' : ''}`}
            button="Next level" onGo={() => actionsRef.current.advance()} />
        )}
        {mapOpen && hud?.status === 'playing' && (
          <SoloMap mode="start" current={hud.level - 1} title={hud.level === 1 ? 'Dungeon Run' : `Level ${hud.level}`}
            text={hud.level === 1 ? "Sail from the tavern to the shark's lair" : `${LEVELS[hud.level - 1].name}${LEVELS[hud.level - 1].tagline ? ` — ${LEVELS[hud.level - 1].tagline}` : ''}`}
            button="Set sail" departRef={mapDepartRef} onGo={() => actionsRef.current.closeMap()} />
        )}
        {hud?.status === 'won' && (
          <SoloMap mode="won" current={hud.level - 1} title="You escaped the dungeon!"
            text={`CHOP is beaten! All ${LEVELS.length} levels in ${time}`}
            extra={`Prizes: ${hud.loot} PYTH${CHEST_IS_DEMO ? ' (demo)' : ''}`}
            button="Play again" onGo={() => actionsRef.current.advance()} />
        )}
      </div>
      {TOUCH && <TouchButtons controls={controlsRef.current} detonator={!!hud?.detonator} onPause={() => actionsRef.current.pause?.()} />}
      </div>

    </div>
  )
}

function Overlay({ title, line, text, button, onClick, win = false, pause = false, foot = TOUCH ? null : 'or press Enter' }) {
  return (
    <div className={`solo-over${win ? ' is-win' : ''}${pause ? ' is-pause' : ''}`}>
      <h2>{title}</h2>
      {line && <p className="solo-line">{line}</p>}
      <p className="solo-sub">{text}</p>
      <button type="button" className="solo-btn" onClick={onClick}>{button}</button>
      {foot && <p className="solo-sub">{foot}</p>}
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
      {!TOUCH && <p className="solo-sub">or press Enter</p>}
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
