import './Landing.css'

function Laurel({ flip = false }) {
  return (
    <svg
      className="pb-leaf"
      viewBox="0 0 40 24"
      aria-hidden="true"
      style={flip ? { transform: 'scaleX(-1)' } : undefined}
    >
      <g fill="#B8871C">
        <path d="M38 12 Q26 12 14 20 Q24 10 38 12Z" />
        <path d="M30 10 Q22 4 12 6 Q22 2 30 10Z" />
        <path d="M22 14 Q14 20 4 18 Q14 12 22 14Z" />
        <path d="M16 8 Q10 2 2 4 Q10 0 16 8Z" />
      </g>
    </svg>
  )
}

export default function Landing() {
  return (
    <main className="pb-stage">
      <div className="pb-bg" role="img" aria-label="Marble arena with the Pyth emblem on the floor" />
      <div className="pb-veil" />
      <div className="pb-glow" />

      <div className="pb-embers" aria-hidden="true">
        {Array.from({ length: 6 }).map((_, i) => (
          <span key={i} className="pb-ember" />
        ))}
      </div>

      <header className="pb-header">
        <p className="pb-kicker">Myths ✦ Friends ✦ Mayhem</p>
        <h1 className="pb-title">Pyth Bomb</h1>
        <div className="pb-laurel">
          <Laurel />
          <div className="pb-soon">Coming soon</div>
          <Laurel flip />
        </div>
        <p className="pb-tag">Answer fast. Pass the bomb. Don't get rugged.</p>
      </header>

      <div className="pb-cast">
        <div className="pb-bomb" aria-hidden="true">
          <div className="pb-aura" />
          <img src="/bomb.webp" alt="" />
          <svg className="pb-spark" viewBox="-20 -20 40 40">
            <path d="M0-18 L4-4 L18 0 L4 4 L0 18 L-4 4 L-18 0 L-4-4Z" fill="#FFE59A" />
            <path d="M0-9 L2-2 L9 0 L2 2 L0 9 L-2 2 L-9 0 L-2-2Z" fill="#fff" />
          </svg>
        </div>
        <img
          className="pb-cast-img"
          src="/cast.webp"
          alt="Nysa the Oracle, Mino the Minotaur about to catch the bomb, and Alex the Hoplite"
        />
      </div>
    </main>
  )
}
