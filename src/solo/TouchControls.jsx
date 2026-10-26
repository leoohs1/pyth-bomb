import { useEffect, useRef, useState } from 'react'
import './TouchControls.css'

// Controles na tela do celular: um direcional em cruz (esquerda) e os botões de bomba, detonador e pausa (direita).
// Eles falam com o jogo pelos MESMOS press()/release() do teclado (engine/input.js): o jogo não sabe de onde veio.

const DEAD = 0.22 // o meio do direcional (fração do raio) não move
const SWITCH = 1.3 // pra virar de uma direção pra outra, o outro eixo precisa ganhar por 30% (o dedo no meio não fica tremendo)

const ARROWS = { up: '▲', left: '◀', right: '▶', down: '▼' }

// uma batidinha no celular (só Android; no resto não faz nada)
const buzz = () => { try { navigator.vibrate?.(10) } catch { /* sem vibração */ } }

export function TouchPad({ controls }) {
  const ref = useRef(null)
  const cur = useRef(null) // direção apertada agora
  const finger = useRef(null) // qual dedo está no direcional
  const [dir, setDir] = useState(null)

  const set = (d) => {
    if (d !== cur.current) {
      if (cur.current) controls.release(cur.current)
      cur.current = d
      setDir(d)
    }
    if (d) controls.press(d) // sempre: se o jogo soltou tudo (pausa, fase nova) com o dedo ainda lá, volta a andar
  }

  const aim = (e) => {
    const r = ref.current.getBoundingClientRect()
    const dx = e.clientX - (r.left + r.width / 2)
    const dy = e.clientY - (r.top + r.height / 2)
    if (Math.hypot(dx, dy) < (r.width / 2) * DEAD) { set(null); return }
    const ax = Math.abs(dx), ay = Math.abs(dy)
    const h = dx > 0 ? 'right' : 'left', v = dy > 0 ? 'down' : 'up'
    const c = cur.current
    if (c === 'left' || c === 'right') set(ay > ax * SWITCH ? v : h)
    else if (c === 'up' || c === 'down') set(ax > ay * SWITCH ? h : v)
    else set(ax > ay ? h : v)
  }

  const down = (e) => {
    if (finger.current != null) return
    finger.current = e.pointerId
    e.currentTarget.setPointerCapture?.(e.pointerId)
    aim(e)
  }
  const move = (e) => { if (e.pointerId === finger.current) aim(e) }
  const up = (e) => {
    if (e.pointerId !== finger.current) return
    finger.current = null
    set(null)
  }
  useEffect(() => () => { if (cur.current) controls.release(cur.current) }, [controls])

  return (
    <div className="solo-pad" ref={ref} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
      onContextMenu={(e) => e.preventDefault()}>
      {['up', 'left', 'right', 'down'].map((d) => (
        <b key={d} className={`is-${d}${dir === d ? ' is-on' : ''}`}>{ARROWS[d]}</b>
      ))}
      <i />
    </div>
  )
}

export function TouchButtons({ controls, detonator, onPause }) {
  const tap = (action) => (e) => { e.preventDefault(); buzz(); controls.press(action) }
  return (
    <div className="solo-tbtns">
      <button type="button" className="solo-tbtn is-pause" aria-label="Pause" onPointerDown={(e) => { e.preventDefault(); onPause() }}>❚❚</button>
      {detonator && (
        <button type="button" className="solo-tbtn is-det" aria-label="Detonate" onPointerDown={tap('detonate')}>🧨</button>
      )}
      <button type="button" className="solo-tbtn is-bomb" aria-label="Drop bomb" onPointerDown={tap('bomb')}>
        <b>💣</b><span>BOMB</span>
      </button>
    </div>
  )
}
