import './Landing.css'
import SoundToggle from './SoundToggle.jsx'

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
      <SoundToggle className="sound-fixed" />
      <div className="pb-bg" role="img" aria-label="Marble arena with the Pyth emblem on the floor" />
      <div className="pb-veil" />
      <div className="pb-glow" />

      <div className="pb-embers" aria-hidden="true">
        {Array.from({ length: 6 }).map((_, i) => (
          <span key={i} className="pb-ember" />
        ))}
      </div>

      <header className="pb-header">
        <h1 className="pb-title">
          <img className="pb-logo" src="/logo.webp" alt="Pyth Bomb" width="2000" height="667" />
        </h1>
        <div className="pb-laurel">
          <Laurel />
          <div className="pb-soon pb-play">Play now</div>
          <Laurel flip />
        </div>
        <p className="pb-tag">Answer fast. Pass the bomb. Don't get rugged.</p>
      </header>

      <div className="pb-cast">
        <div className="pb-bomb" aria-hidden="true">
          <div className="pb-aura" />
          <img src="/bomb-laurel.webp" alt="" width="1254" height="1254" />
        </div>
        <img
          className="pb-cast-img"
          src="/cast.webp"
          alt="Nysa the Oracle, Minos the Minotaur about to catch the bomb, and Plite the Hoplite"
        />
      </div>
    </main>
  )
}
