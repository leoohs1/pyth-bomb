// JOYSTICK FLUTUANTE (estilo Free Fire) pro celular, só no PVP.
// Encostou o dedo em qualquer lugar da metade esquerda da tela: o joystick aparece ali; arrastou, o herói anda.
// Como o jogo anda em casas, o arrasto vira cima/baixo/esquerda/direita (com folga pra não ficar trocando sozinho).
// Fala com o jogo pelos MESMOS press()/release() do teclado (controls).
import { useEffect, useRef, useState } from 'react'

const RADIUS = 52     // até onde a bolinha vai (px)
const DEAD = 14       // perto do centro: parado
const SWITCH = 1.3    // pra trocar de eixo, o outro eixo precisa ganhar por 30%

const buzz = () => { try { navigator.vibrate?.(8) } catch { /* sem vibração */ } }

export default function Joystick({ controls }) {
  const [stick, setStick] = useState(null) // { ox, oy, kx, ky } em px da tela, ou null (sem dedo)
  const finger = useRef(null)
  const cur = useRef(null)

  const setDir = (d) => {
    if (d === cur.current) { if (d) controls.press(d); return }
    if (cur.current) controls.release(cur.current)
    cur.current = d
    if (d) { controls.press(d); buzz() }
  }

  const aim = (e, origin) => {
    const dx = e.clientX - origin.ox, dy = e.clientY - origin.oy
    const len = Math.hypot(dx, dy)
    const k = len > RADIUS ? RADIUS / len : 1
    setStick({ ...origin, kx: origin.ox + dx * k, ky: origin.oy + dy * k })
    if (len < DEAD) { setDir(null); return }
    const ax = Math.abs(dx), ay = Math.abs(dy)
    const h = dx > 0 ? 'right' : 'left', v = dy > 0 ? 'down' : 'up'
    const c = cur.current
    if (c === 'left' || c === 'right') setDir(ay > ax * SWITCH ? v : h)
    else if (c === 'up' || c === 'down') setDir(ax > ay * SWITCH ? h : v)
    else setDir(ax > ay ? h : v)
  }

  const originRef = useRef(null)
  const down = (e) => {
    if (finger.current != null) return
    finger.current = e.pointerId
    try { e.currentTarget.setPointerCapture?.(e.pointerId) } catch { /* ok */ }
    const o = { ox: e.clientX, oy: e.clientY }
    originRef.current = o
    setStick({ ...o, kx: o.ox, ky: o.oy })
  }
  const move = (e) => { if (e.pointerId === finger.current && originRef.current) aim(e, originRef.current) }
  const up = (e) => {
    if (e.pointerId !== finger.current) return
    finger.current = null
    originRef.current = null
    setStick(null)
    setDir(null)
  }
  useEffect(() => () => { if (cur.current) controls.release(cur.current) }, [controls])

  return (
    <div className="pv-joy-zone" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
      onContextMenu={(e) => e.preventDefault()} aria-label="Joystick: touch and drag to move">
      {stick ? (
        <>
          <span className="pv-joy-base" style={{ left: stick.ox, top: stick.oy }} />
          <span className="pv-joy-knob" style={{ left: stick.kx, top: stick.ky }} />
        </>
      ) : (
        <span className="pv-joy-hint" aria-hidden="true"><span /></span>
      )}
    </div>
  )
}
