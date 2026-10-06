import { useEffect, useRef, useState } from 'react'
import './BombPovFlash.css'

// Sequência curta que toca quando EU (e só eu) viro o novo dono da bomba:
// 1) "impact" — flash em primeira pessoa, "YOU HAVE THE BOMB!" (~0.9s)
// 2) "out"    — fade rápido de volta pra arena normal (~0.26s)
// (a fase da bomba gigante vindo pra câmera foi removida a pedido da Halls:
// ficava uma bomba enorme na tela antes da cena final.)
// `playKey` muda (qualquer valor truthy novo) toda vez que deve tocar de novo.
export default function BombPovFlash({ playKey, onDone }) {
  const [phase, setPhase] = useState(null)
  const seqRef = useRef(0)

  useEffect(() => {
    if (!playKey) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      onDone?.()
      return
    }
    const seq = ++seqRef.current
    // monta invisível ('pre') e logo em seguida vira 'impact' pra o fade-in rodar
    setPhase('pre')
    const t1 = setTimeout(() => { if (seqRef.current === seq) setPhase('impact') }, 30)
    const t2 = setTimeout(() => { if (seqRef.current === seq) setPhase('out') }, 30 + 900)
    const t3 = setTimeout(() => {
      if (seqRef.current === seq) { setPhase(null); onDone?.() }
    }, 30 + 900 + 260)
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
  }, [playKey])

  if (!phase) return null

  return (
    <div className={`pov-flash pov-${phase}`} aria-hidden="true">
      <div className="pov-backdrop" />

      <div className="pov-scene">
        <p className="pov-title">YOU HAVE THE BOMB!</p>

        <div className="pov-bombwrap">
          <div className="pov-glow" />
          <div className="pov-ring" />
          <span className="pov-spark" style={{ '--sx': '-2.2cqw', '--sy': '-3.8cqw' }} />
          <span className="pov-spark" style={{ '--sx': '2.5cqw', '--sy': '-4.2cqw', animationDelay: '0.22s' }} />
          <span className="pov-spark" style={{ '--sx': '0.3cqw', '--sy': '-4.8cqw', animationDelay: '0.44s' }} />
          <img className="pov-bomb" src="/bomb-laurel.webp" alt="" />
        </div>
      </div>
    </div>
  )
}
