import { useEffect, useRef, useState } from 'react'
import './SoloMap.css'
import { LEVELS } from './engine/levels.js'
import { play } from '../sound'

// TELA DO MAPA do Solo (mapa do tesouro, estilo "mapa-múndi" de Mario): aparece antes da corrida e entre as fases.
// O mapa é uma imagem de 418x235 pixels (public/solo/pixel/map.png) ampliada sem borrar; os X's, o brilho e o
// rostinho do personagem são desenhados por cima, em pixels do mesmo tamanho. Os textos e o botão são HTML por cima.
const W = 418, H = 235
const MAP_SRC = '/solo/pixel/map.png'
const BOAT_SRC = ['/solo/pixel/map-boat-1.png', '/solo/pixel/map-boat-2.png'] // o barquinho do herói (2 quadros: balança nas ondas), de proa pra direita

// o caminho dourado do desenho (pontos em pixels do mapa) e em qual ponto fica cada fase
const ROUTE = [[114, 177], [123, 176], [136, 175], [153, 175], [165, 173], [179, 168], [186, 161], [191, 149], [196, 142], [208, 137],
  [215, 136], [235, 134], [270, 131], [288, 129], [297, 127], [308, 122], [311, 111], [307, 106], [298, 99], [297, 92],
  [300, 87], [311, 84], [325, 82], [335, 77], [337, 74]]
const NODE_AT = [0, 11, 24] // fase 1 = o barco no cais da taverna, fase 2 = o naufrágio no recife, fase 3 = a beira do redemoinho
const NODES = NODE_AT.map((i) => ROUTE[i])
// onde fica a plaquinha com o nome de cada fase (a da taverna vai pro cantinho de baixo, longe do botão)
const LABEL_AT = [[66, 214], [243, 150], [337, 90]]

// PROGRESSO no pontilhado do desenho: bolinhas douradas com contorno escuro, uma a cada 7 pixels, só por onde você já andou
const SPACING = 7
const ROUTE_D = (() => { const d = [0]; for (let i = 1; i < ROUTE.length; i++) d.push(d[i - 1] + Math.hypot(ROUTE[i][0] - ROUTE[i - 1][0], ROUTE[i][1] - ROUTE[i - 1][1])); return d })()
const NODE_D = NODE_AT.map((i) => ROUTE_D[i])
function pointAt(d) {
  for (let i = 1; i < ROUTE.length; i++) {
    if (d <= ROUTE_D[i] || i === ROUTE.length - 1) {
      const t = Math.max(0, Math.min(1, (d - ROUTE_D[i - 1]) / (ROUTE_D[i] - ROUTE_D[i - 1] || 1)))
      return [ROUTE[i - 1][0] + (ROUTE[i][0] - ROUTE[i - 1][0]) * t, ROUTE[i - 1][1] + (ROUTE[i][1] - ROUTE[i - 1][1]) * t]
    }
  }
  return ROUTE[ROUTE.length - 1]
}
function drawTrail(ctx, doneUntil, t) {
  // o desenho já tem o pontilhado dourado; por cima eu só acendo (em dourado vivo) o pedaço que você já andou
  const shift = (t * 5) % SPACING
  for (let d = shift; d <= doneUntil; d += SPACING) {
    const [x, y] = pointAt(d)
    ctx.fillStyle = '#1f0f04'
    ctx.fillRect(Math.round(x) - 2, Math.round(y) - 2, 4, 4)
    ctx.fillStyle = '#ffe27a'
    ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 2, 2)
  }
}

// o rostinho anda de uma fase até a outra seguindo o caminho (0 = saiu, 1 = chegou)
function along(from, to, k) {
  const pts = ROUTE.slice(NODE_AT[from], NODE_AT[to] + 1)
  const lens = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]))
  const total = lens.reduce((a, b) => a + b, 0)
  let d = k * total
  for (let i = 0; i < lens.length; i++) {
    if (d <= lens[i] || i === lens.length - 1) {
      const t = lens[i] ? Math.min(1, d / lens[i]) : 1
      return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t]
    }
    d -= lens[i]
  }
  return pts[pts.length - 1]
}

// X em pixels: contorno escuro grosso e miolo de cor, raio r
function drawX(ctx, cx, cy, r, fill, edge) {
  ctx.fillStyle = edge
  for (let i = -r; i <= r; i++) { ctx.fillRect(cx + i - 2, cy + i - 2, 4, 4); ctx.fillRect(cx + i - 2, cy - i - 2, 4, 4) }
  ctx.fillStyle = fill
  for (let i = -r; i <= r; i++) { ctx.fillRect(cx + i - 1, cy + i - 1, 2, 2); ctx.fillRect(cx + i - 1, cy - i - 1, 2, 2) }
}

// anel de pixels que cresce e some, em volta do X da fase atual
function drawPulse(ctx, cx, cy, t) {
  const k = (t * 0.9) % 1
  const r = 8 + k * 9
  ctx.fillStyle = `rgba(255, 120, 90, ${0.75 * (1 - k)})`
  for (let a = 0; a < 40; a++) {
    const ang = (a / 40) * Math.PI * 2
    ctx.fillRect(Math.round(cx + Math.cos(ang) * r), Math.round(cy + Math.sin(ang) * r * 0.8), 1, 1)
  }
}

// onde o barquinho fica em relação ao ponto do caminho (em pixels do mapa): o casco um pouco acima do X
const BOAT_DX = 12, BOAT_DY = -4

const COLORS = {
  done: ['#ffd24a', '#3a2000'], // fase vencida: dourado
  current: ['#ff4b3a', '#2a0600'], // onde você está: vermelho vivo
  next: ['#a8683a', '#2a1408'], // ainda não chegou: apagado
}

const LEAVE_MS = 1200 // zarpar: o barquinho sai navegando e o mapa some devagar (depois disso a fase abre)

export default function SoloMap({ mode, current, from, to, title, text, extra, button, onGo, departRef }) {
  const canvasRef = useRef(null)
  const departAt = useRef(null) // quando apertou "Set sail"
  const timer = useRef(0)
  const [leaving, setLeaving] = useState(false)
  // apertar o botão (ou Enter/Espaço, que o jogo manda pra cá): no mapa de ANTES da corrida o barquinho zarpa; nos outros, segue direto
  const depart = () => {
    if (mode !== 'start') { onGo(); return }
    if (departAt.current != null) return
    departAt.current = performance.now()
    setLeaving(true)
    play('solo_sail')
    timer.current = setTimeout(onGo, LEAVE_MS)
  }
  useEffect(() => { if (departRef) departRef.current = depart })
  useEffect(() => () => { clearTimeout(timer.current); if (departRef) departRef.current = null }, [departRef])
  const stateRef = useRef({ mode, current, from, to })
  useEffect(() => { stateRef.current = { mode, current, from, to } }, [mode, current, from, to])

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    ctx.imageSmoothingEnabled = false
    const map = new Image(); map.src = MAP_SRC
    const boats = BOAT_SRC.map((src) => { const im = new Image(); im.src = src; return im })
    let raf = 0
    const t0 = performance.now()
    const frame = (now) => {
      const t = (now - t0) / 1000
      const { mode: m, current: cur, from: f, to: tt } = stateRef.current
      ctx.clearRect(0, 0, W, H)
      if (map.complete && map.naturalWidth) ctx.drawImage(map, 0, 0)
      // andando de uma fase pra outra (depois de vencer): 0,7 s parado no X antigo, 2,2 s andando
      const travel = m === 'cleared' ? Math.max(0, Math.min(1, (t - 0.7) / 2.2)) : 0
      // zarpando (só no mapa de antes da corrida): sai do cais e vai ganhando velocidade pelo caminho
      const sail = departAt.current == null ? 0 : Math.min(1, (now - departAt.current) / LEAVE_MS)
      const sailK = 0.32 * sail * sail
      const arrived = m !== 'cleared' || travel >= 1
      const here = m === 'cleared' ? (arrived ? tt : f) : cur // onde o rostinho está parado
      // até onde o pontilhado já está dourado: até a fase atual (ou até onde o rostinho chegou, andando)
      const doneUntil = m === 'cleared' ? NODE_D[f] + (NODE_D[tt] - NODE_D[f]) * travel * travel * (3 - 2 * travel) : m === 'won' ? 1e9 : NODE_D[cur] + (sail > 0 ? (NODE_D[1] - NODE_D[0]) * sailK : 0)
      drawTrail(ctx, doneUntil, t)
      NODES.forEach(([nx, ny], i) => {
        const done = m === 'won' ? true : m === 'cleared' ? i <= f : i < cur // fases já vencidas: douradas
        const isHere = m === 'cleared' ? arrived && i === tt : m !== 'won' && i === cur // a fase de agora: vermelha e pulsando
        const [fill, edge] = isHere ? COLORS.current : done ? COLORS.done : COLORS.next
        if (isHere) drawPulse(ctx, nx, ny, t)
        drawX(ctx, nx, ny, isHere ? 6 : 5, fill, edge)
      })
      // o barquinho do herói balança parado na fase atual (ou navega pelo caminho, virando pro lado em que vai)
      if (m !== 'won' && boats.every((b) => b.complete && b.naturalWidth)) {
        const walking = (m === 'cleared' && !arrived) || sail > 0
        const ease = travel * travel * (3 - 2 * travel)
        const [hx, hy] = sail > 0 ? along(0, 1, sailK) : walking ? along(f, tt, ease) : NODES[here]
        const flip = sail === 0 && walking && along(f, tt, Math.min(1, ease + 0.03))[0] < hx - 0.05
        const boat = boats[Math.floor(t * (walking ? 5 : 2.2)) % 2]
        const w = boat.naturalWidth, h = boat.naturalHeight
        const x = Math.round(hx + BOAT_DX), y = Math.round(hy - h + BOAT_DY)
        ctx.save()
        if (flip) { ctx.translate(x, 0); ctx.scale(-1, 1); ctx.drawImage(boat, Math.round(-w * 0.55), y) } else ctx.drawImage(boat, Math.round(x - w * 0.55), y)
        ctx.restore()
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [])

  const pct = ([x, y]) => ({ left: `${(x / W) * 100}%`, top: `${(y / H) * 100}%` })

  return (
    <div className={`solo-map${leaving ? ' is-leaving' : ''}`} role="dialog" aria-label="Level map">
      <a className="solo-map-back" href="/play">← Back</a>
      <div className="solo-map-stage">
        <canvas ref={canvasRef} width={W} height={H} className="solo-map-canvas" />
        {NODES.map((n, i) => (
          <span key={i} className="solo-map-label" style={pct(LABEL_AT[i] ?? [n[0], n[1] + 8])}>
            <b>{i + 1}</b> {LEVELS[i].name}
          </span>
        ))}
        <div className="solo-map-title">
          <h2>{title}</h2>
          {text && <p>{text}</p>}
        </div>
        <div className="solo-map-bottom">
          {extra && <p className="solo-map-extra">{extra}</p>}
          <button type="button" className="solo-btn solo-map-go" onClick={depart} disabled={leaving} autoFocus>{leaving ? 'Sailing…' : button}</button>
          <p className="solo-map-foot">or press Enter / Space</p>
        </div>
      </div>
    </div>
  )
}
