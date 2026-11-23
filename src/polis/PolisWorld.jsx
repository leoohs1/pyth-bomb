// O MUNDO da vila: uma arte só (public/polis/world.webp) com a cidade murada no meio e os campos em volta.
// A "câmera" desliza entre dois focos (ideia da Halls, 2026-11-23):
//  · Cidade: chega perto da cidade; os campos ficam nas bordas, menores e desfocados (longe);
//  · Campos: afasta e mostra o anel de campos; a cidade fica pequena e desfocada no meio.
// Dá pra arrastar com o dedo/mouse pra olhar em volta. Os pontos clicáveis (SPOTS) ficam em % da arte, então
// trocar a arte só pede pra acertar as posições aqui.
import { useEffect, useLayoutEffect, useRef, useState } from 'react'

export const WORLD_IMG = '/polis/world.webp'
export const WORLD_W = 1536
export const WORLD_H = 1024

// onde cada coisa está na arte (x, y em % da largura/altura) e a qual foco pertence
export const SPOTS = {
  temple: { x: 57, y: 27, area: 'city' },
  warehouse: { x: 48, y: 46, area: 'city' },
  barracks: { x: 66, y: 53, area: 'city' },
  marble: { x: 15, y: 26, area: 'fields' },
  wood: { x: 14, y: 62, area: 'fields' },
  bronze: { x: 83, y: 31, area: 'fields' },
  grain: { x: 78, y: 88, area: 'fields' },
}

// focos da câmera: centro (em % da arte) e zoom (1 = a arte inteira cabendo na largura/altura da tela)
const CAM = {
  city: { x: 53, y: 38, zoom: 2.0 },
  fields: { x: 50, y: 50, zoom: 1.0 },
}

export default function PolisWorld({ mode, onMode, children }) {
  const vpRef = useRef(null)
  const [vp, setVp] = useState({ w: 1000, h: 600 })
  const [drag, setDrag] = useState({ dx: 0, dy: 0 })
  const dragRef = useRef(null)
  const [moving, setMoving] = useState(false)

  useLayoutEffect(() => {
    const el = vpRef.current
    const fit = () => setVp({ w: el.clientWidth, h: el.clientHeight })
    fit()
    const ro = new ResizeObserver(fit); ro.observe(el)
    return () => ro.disconnect()
  }, [])
  // trocou o foco: volta o arrasto pro zero e anima a câmera
  useEffect(() => { setDrag({ dx: 0, dy: 0 }); setMoving(true); const id = setTimeout(() => setMoving(false), 1100); return () => clearTimeout(id) }, [mode])

  const cam = CAM[mode]
  const cover = Math.max(vp.w / WORLD_W, vp.h / WORLD_H) // a arte cobre a tela toda
  // celular em pé, nos Campos: afasta até caber a largura toda (os campos ficam nos 4 cantos); sobra céu/mar em cima e embaixo
  const tall = vp.h > vp.w
  const s = mode === 'fields' && tall ? (vp.w / WORLD_W) * 1.04 : cover * cam.zoom
  const mw = WORLD_W * s, mh = WORLD_H * s
  // menor que a tela: centraliza; maior: não deixa aparecer borda vazia
  const clampX = (x) => (mw <= vp.w ? (vp.w - mw) / 2 : Math.min(0, Math.max(vp.w - mw, x)))
  const clampY = (y) => (mh <= vp.h ? (vp.h - mh) / 2 : Math.min(0, Math.max(vp.h - mh, y)))
  const tx = clampX(vp.w / 2 - (cam.x / 100) * mw + drag.dx)
  const ty = clampY(vp.h / 2 - (cam.y / 100) * mh + drag.dy)

  const down = (e) => {
    if (e.target.closest('button')) return
    dragRef.current = { x: e.clientX, y: e.clientY, dx: drag.dx, dy: drag.dy, tx, ty }
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }
  const move = (e) => {
    const d = dragRef.current
    if (!d) return
    // segura o arrasto dentro da arte (não deixa aparecer borda vazia)
    const nx = clampX(d.tx + (e.clientX - d.x)) - (d.tx - d.dx)
    const ny = clampY(d.ty + (e.clientY - d.y)) - (d.ty - d.dy)
    setDrag({ dx: nx, dy: ny })
  }
  const up = () => { dragRef.current = null }

  return (
    <div className={`po-world is-${mode}${tall ? ' is-tall' : ''}${moving ? ' is-moving' : ''}`} ref={vpRef}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
      <div className={`po-map${dragRef.current ? ' is-dragging' : ''}`}
        style={{ width: WORLD_W, height: WORLD_H, transform: `translate(${tx}px, ${ty}px) scale(${s})` }}>
        <img className="po-map-img" src={WORLD_IMG} alt="" draggable="false" />
        {/* os pontos ficam dentro da arte (crescem com o zoom); o tamanho do texto é desfeito do zoom pra ficar legível */}
        <div className="po-map-spots" style={{ '--inv': 1 / s }}>{children}</div>
      </div>
      {/* "foco de câmera": desfoca o que está longe (as bordas na cidade; o meio nos campos) */}
      <div className="po-dof" aria-hidden="true" />
      <div className="po-camnav" role="tablist" aria-label="Camera">
        <button type="button" role="tab" aria-selected={mode === 'city'} className={mode === 'city' ? 'is-on' : ''} onClick={() => onMode('city')}>
          <span className="po-emoji" aria-hidden="true">🏛️</span> City
        </button>
        <button type="button" role="tab" aria-selected={mode === 'fields'} className={mode === 'fields' ? 'is-on' : ''} onClick={() => onMode('fields')}>
          <span className="po-emoji" aria-hidden="true">🌾</span> Fields
        </button>
      </div>
    </div>
  )
}

// um ponto clicável na arte: plaquinha com nome, nível e o estado (contagem, pronto pra coletar...)
export function Spot({ id, mode, icon, name, level, state, pct, ready, locked, onClick }) {
  const sp = SPOTS[id]
  const far = sp.area !== mode
  return (
    <button type="button" className={`po-spot${far ? ' is-far' : ''}${ready ? ' is-ready' : ''}${locked ? ' is-locked' : ''}`}
      style={{ left: `${sp.x}%`, top: `${sp.y}%` }} onClick={onClick} disabled={locked && !far}
      aria-label={`${name}${level ? ` level ${level}` : ''}: ${state}`}>
      {ready && <span className="po-spot-pop po-emoji" aria-hidden="true">{icon}</span>}
      <span className="po-spot-tag">
        <span className="po-spot-name"><span className="po-emoji" aria-hidden="true">{icon}</span><span className="po-spot-label"> {name}{level ? <em> Lv {level}</em> : null}</span></span>
        <span className="po-spot-state">{state}</span>
        {pct != null && <span className="po-spot-bar"><i style={{ width: `${pct}%` }} /></span>}
      </span>
    </button>
  )
}
