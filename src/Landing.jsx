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
          <svg className="pb-fx" viewBox="-60 -80 220 240" aria-hidden="true">
            <defs>
              <filter id="pbGlow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
            </defs>
            <g className="pb-shards" fill="#5A1E9E" stroke="#B58CFF" strokeWidth="0.8" strokeLinejoin="round">
              <path className="pb-shard pb-s0" d="M-20.1 92.3L-38.5 109.6L-13.4 106.6Z"/>
              <path className="pb-shard pb-s1" d="M-25.5 62.1L-46.5 69.0L-25.5 75.9Z"/>
              <path className="pb-shard pb-s2" d="M-11.5 28.5L-35.4 24.4L-18.6 41.9Z"/>
              <path className="pb-shard pb-s3" d="M114.3 103.8L138.4 105.3L120.0 89.7Z"/>
              <path className="pb-shard pb-s4" d="M123.7 56.0L142.2 43.9L120.1 42.6Z"/>
              <path className="pb-shard pb-s5" d="M14.3 -8.0L0.6 -21.1L3.8 -2.4Z"/>
              <path className="pb-shard pb-s6" d="M94.9 1.1L99.0 -18.5L84.1 -5.1Z"/>
              <path className="pb-shard pb-s7" d="M15.9 140.2L15.3 160.2L27.7 144.4Z"/>
            </g>
            <g className="pb-bolts" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <g className="pb-bolt pb-b0"><path d="M95 58 L112 50 L106 64 L126 60 L118 74 L136 72" stroke="#A56BFF" strokeWidth="4.5" opacity=".55" filter="url(#pbGlow)"/><path d="M95 58 L112 50 L106 64 L126 60 L118 74 L136 72" stroke="#F7EEFF" strokeWidth="1.7"/></g>
              <g className="pb-bolt pb-b1"><path d="M90 96 L108 104 L100 114 L122 122 L114 132" stroke="#A56BFF" strokeWidth="4.5" opacity=".55" filter="url(#pbGlow)"/><path d="M90 96 L108 104 L100 114 L122 122 L114 132" stroke="#F7EEFF" strokeWidth="1.7"/></g>
              <g className="pb-bolt pb-b2"><path d="M3 80 L-14 72 L-8 90 L-28 88 L-22 104" stroke="#A56BFF" strokeWidth="4.5" opacity=".55" filter="url(#pbGlow)"/><path d="M3 80 L-14 72 L-8 90 L-28 88 L-22 104" stroke="#F7EEFF" strokeWidth="1.7"/></g>
              <g className="pb-bolt pb-b3"><path d="M80 26 L96 14 L94 30 L112 22" stroke="#A56BFF" strokeWidth="4.5" opacity=".55" filter="url(#pbGlow)"/><path d="M80 26 L96 14 L94 30 L112 22" stroke="#F7EEFF" strokeWidth="1.7"/></g>
              <g className="pb-bolt pb-b4"><path d="M14 40 L0 30 L6 22 L-10 14" stroke="#A56BFF" strokeWidth="4.5" opacity=".55" filter="url(#pbGlow)"/><path d="M14 40 L0 30 L6 22 L-10 14" stroke="#F7EEFF" strokeWidth="1.7"/></g>
            </g>
            <g className="pb-flame" filter="url(#pbGlow)">
              <path fill="#B98CFF" opacity=".85" d="M42 8 C28 -2 32 -20 44 -28 C40 -15 46 -10 50 -15 C47 -32 58 -46 54 -66 C70 -50 76 -30 67 -14 C73 -18 77 -27 75 -36 C89 -16 80 5 60 9 Z"/>
              <path fill="#E7D2FF" d="M45 7 C36 -1 39 -14 47 -20 C45 -11 50 -8 53 -12 C52 -24 59 -34 57 -48 C68 -35 71 -19 64 -8 C68 -11 70 -16 70 -21 C78 -8 72 4 58 8 Z"/>
              <path fill="#FFFFFF" d="M49 6 C44 0 46 -8 50 -11 C51 -6 54 -5 55 -8 C55 -15 59 -21 58 -29 C65 -19 65 -6 58 6 Z"/>
            </g>
          </svg>
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
