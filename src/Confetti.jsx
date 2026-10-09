// Confete caindo na tela do vencedor. Posições e tempos fixos por peça (nada de sorteio a cada
// renderização), só CSS: não pesa. Fica por cima de tudo, mas sem bloquear cliques.
const COLORS = ['#f8de8e', '#dcae40', '#8f62e6', '#c9a2ff', '#ffffff', '#ff7aa8', '#7bd8ff']
const PIECES = Array.from({ length: 72 }, (_, i) => ({
  left: `${((i * 37) % 101)}%`,
  delay: `${(((i * 0.37) % 4)).toFixed(2)}s`,
  dur: `${(3.4 + ((i * 0.53) % 2.6)).toFixed(2)}s`,
  w: 6 + ((i * 5) % 7),
  h: 10 + ((i * 7) % 9),
  sway: `${(((i * 13) % 160) - 80)}px`,
  rot: `${360 + ((i * 47) % 540)}deg`,
  color: COLORS[i % COLORS.length],
  round: i % 5 === 0,
}))

export default function Confetti() {
  return (
    <div className="cf-wrap" aria-hidden="true">
      {PIECES.map((p, i) => (
        <span key={i} className="cf-piece"
          style={{
            left: p.left, width: p.w, height: p.round ? p.w : p.h, background: p.color,
            borderRadius: p.round ? '50%' : '2px',
            animationDelay: p.delay, animationDuration: p.dur,
            '--sway': p.sway, '--rot': p.rot,
          }} />
      ))}
    </div>
  )
}
