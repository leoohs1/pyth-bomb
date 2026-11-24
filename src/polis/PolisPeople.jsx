// Gente na vila (só desenho, nada vai pro servidor): os camponeses andam do portão até o lote que você mandou trabalhar,
// trabalham lá (enxada / machado / picareta), acenam quando a colheita fica pronta e voltam carregando quando você coleta.
// O herói passeia pela praça da Cidade. Tudo é calculado no aparelho a partir da hora em que o ciclo começou, então
// 100 jogadores = 100 navegadores animando a própria vila, e o banco nem fica sabendo.
import { useEffect, useLayoutEffect, useRef, useState } from 'react'

const C = '/polis/c/'
export const ANIM = {
  walk: { src: C + 'peasant-walk.webp', n: 4, ms: 150 },
  hoe: { src: C + 'peasant-hoe.webp', n: 2, ms: 420 },
  axe: { src: C + 'peasant-axe.webp', n: 2, ms: 380 },
  pick: { src: C + 'peasant-pick.webp', n: 2, ms: 400 },
  carry: { src: C + 'peasant-carry.webp', n: 1 },
  wave: { src: C + 'peasant-wave.webp', n: 1 },
  heroWalk: { src: C + 'hero-walk.webp', n: 4, ms: 160 },
  heroIdle: { src: C + 'hero-idle.webp', n: 2, ms: 700 },
  heroWin: { src: C + 'hero-win.webp', n: 1 },
}
export const WORK_OF = { grain: 'hoe', wood: 'axe', marble: 'pick', bronze: 'pick' }
export const GATE = { x: 50, y: 53.5 } // portão da vilinha na tela de Recursos (em % da arte)
export const WALK_MS = 4000
export const BACK_MS = 3500
const spotOf = (p) => ({ x: p.x + 4.4, y: p.y + 2.2 }) // ao lado da bolinha do lote

// um bonequinho: tira de quadros animada por CSS (leve: nada de JavaScript a cada quadro)
export function Sprite({ anim, hero, flip, bob, className = '' }) {
  const a = ANIM[anim]
  return (
    <span className={`po-sprite${hero ? ' is-hero' : ''}${bob ? ' is-bob' : ''} ${className}`}
      style={{
        backgroundImage: `url(${a.src})`, backgroundSize: `${a.n * 100}% 100%`,
        animation: a.n > 1 ? `po-strip ${a.ms * a.n}ms steps(${a.n}, jump-none) infinite` : undefined,
        transform: flip ? 'scaleX(-1)' : undefined,
      }} />
  )
}

// anda de "from" até "to" em "ms" (começou em startAt): posição inicial calculada pelo relógio e depois CSS transition
function Walker({ from, to, startAt, ms, anim, now }) {
  const ref = useRef(null)
  const p0 = Math.min(1, Math.max(0, (now - startAt) / ms))
  const left = ms - (now - startAt)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.transition = 'none'
    el.style.left = `${from.x + (to.x - from.x) * p0}%`
    el.style.top = `${from.y + (to.y - from.y) * p0}%`
    const id = requestAnimationFrame(() => requestAnimationFrame(() => {
      el.style.transition = `left ${Math.max(0, left)}ms linear, top ${Math.max(0, left)}ms linear`
      el.style.left = `${to.x}%`; el.style.top = `${to.y}%`
    }))
    return () => cancelAnimationFrame(id)
  }, []) // só ao nascer (a chave muda quando começa outra caminhada)
  return <span ref={ref} className="po-person"><Sprite anim={anim} flip={to.x < from.x} /></span>
}

// os camponeses da tela de Recursos
export function Peasants({ plots, pos, t, returns }) {
  return (
    <>
      {plots.filter((p) => p.started_at).map((p) => {
        const spot = spotOf(pos[p.idx])
        const start = Date.parse(p.started_at)
        const ready = Date.parse(p.ends_at) <= t
        if (!ready && t - start < WALK_MS) {
          return <Walker key={`go-${p.idx}-${p.started_at}`} from={GATE} to={spot} startAt={start} ms={WALK_MS} anim="walk" now={t} />
        }
        return (
          <span key={`at-${p.idx}`} className="po-person" style={{ left: `${spot.x}%`, top: `${spot.y}%` }}>
            <Sprite anim={ready ? 'wave' : WORK_OF[p.kind]} flip={spot.x > GATE.x} bob={ready} />
          </span>
        )
      })}
      {returns.filter((r) => Date.now() - r.at < BACK_MS).map((r) => ( // a volta é só animação local: relógio real
        <Walker key={`back-${r.idx}-${r.at}`} from={spotOf(pos[r.idx])} to={GATE} startAt={r.at} ms={BACK_MS} anim="carry" now={Date.now()} />
      ))}
    </>
  )
}

// o herói passeia pela praça da Cidade (pontos em volta da fonte); clique nele -> onClick
const STROLL = [{ x: 50, y: 52 }, { x: 43, y: 47 }, { x: 57, y: 47 }, { x: 46, y: 58 }, { x: 55, y: 59 }, { x: 50, y: 41 }]
export function HeroStroll({ onClick }) {
  const [at, setAt] = useState(STROLL[0])
  const [walking, setWalking] = useState(null) // { to, ms }
  const [flip, setFlip] = useState(false)
  useEffect(() => {
    let alive = true
    let timer
    const next = () => {
      if (!alive) return
      setAt((cur) => {
        const options = STROLL.filter((p) => p !== cur)
        const to = options[Math.floor(Math.random() * options.length)]
        const ms = Math.hypot(to.x - cur.x, (to.y - cur.y) * 0.56) * 260 // ~ passo calmo
        setFlip(to.x < cur.x)
        setWalking({ to, ms })
        timer = setTimeout(() => { if (!alive) return; setWalking(null); timer = setTimeout(next, 4000 + Math.random() * 5000) }, ms)
        return to
      })
    }
    timer = setTimeout(next, 2500)
    return () => { alive = false; clearTimeout(timer) }
  }, [])
  return (
    <button type="button" className="po-person po-hero-btn" aria-label="Your hero"
      style={{ left: `${at.x}%`, top: `${at.y}%`, transition: walking ? `left ${walking.ms}ms linear, top ${walking.ms}ms linear` : 'none' }}
      onClick={onClick}>
      <Sprite anim={walking ? 'heroWalk' : 'heroIdle'} hero flip={flip} />
    </button>
  )
}
