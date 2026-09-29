import { useEffect, useRef, useState } from 'react'
import './BombPovFlash.css'

// só a Oracle tem o recorte de mãos pronto por enquanto — os outros
// personagens usam essa arte até termos a versão própria de cada um
// (pendência: um POV por personagem, ver conversa com o Halls)
const POV_HANDS = '/seat-oracle.webp'

// Sequência curta que toca quando EU (e só eu) viro o novo dono da bomba:
// 1) "incoming" — a bomba cresce vindo em direção à câmera (~0.42s)
// 2) "impact"   — flash em primeira pessoa, "YOU HAVE THE BOMB!" (~0.9s)
// 3) "out"      — fade rápido de volta pra arena normal (~0.26s)
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
    setPhase('incoming')
    const t1 = setTimeout(() => { if (seqRef.current === seq) setPhase('impact') }, 420)
    const t2 = setTimeout(() => { if (seqRef.current === seq) setPhase('out') }, 420 + 900)
    const t3 = setTimeout(() => {
      if (seqRef.current === seq) { setPhase(null); onDone?.() }
    }, 420 + 900 + 260)
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
  }, [playKey])

  if (!phase) return null

  return (
    <div className={`pov-flash pov-${phase}`} aria-hidden="true">
      <div className="pov-backdrop" />

      <div className="pov-approach">
        <img src="/bomb-laurel.webp" alt="" />
      </div>

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

        <div className="pov-hands">
          <img src={POV_HANDS} alt="" />
        </div>
      </div>
    </div>
  )
}
