import './Home.css'   // fundo, painel de mármore, personagens (compartilhados)
import './Modes.css'
import SoundToggle from './SoundToggle.jsx'

const MODES = [
  {
    id: 'classic',
    icon: '💣',
    title: 'Pyth Bomb Classic',
    sub: 'Answer fast, pass the bomb, don\'t get rugged. Up to 20 players.',
    locked: false,
  },
  {
    id: 'solo',
    icon: '🕹️',
    title: 'Solo',
    sub: 'A real Bomberman-style dungeon run. Movement, power-ups, bosses.',
    locked: true,
  },
  {
    id: 'arena',
    icon: '⚔️',
    title: 'Arena',
    sub: 'Real-time PvP. Still just an idea — a long way down the road.',
    locked: true,
  },
]

// Escolha de modo de jogo: a "porta de entrada" do /play, antes do Classic.
// Só visual: a navegação (ir pro Classic) chega por props do App.jsx.
export default function Modes({ onSelectClassic }) {
  return (
    <main className="hm-stage">
      <SoundToggle className="sound-fixed" />
      <div className="hm-bg" role="img" aria-label="Marble arena above a night city with the Pyth emblem on the floor" />
      <div className="hm-shade" />

      <div className="hm-scroll">
        <section className="hm-panel md-panel">
          <div className="hm-bomb" aria-hidden="true">
            <div className="hm-aura" />
            <img src="/bomb-laurel.webp" alt="" width="1254" height="1254" />
          </div>

          <h1 className="hm-title">
            <img src="/logo.webp" alt="Pyth Bomb" width="2000" height="667" />
          </h1>
          <p className="hm-sub"><span>Choose your game mode</span></p>

          <div className="md-modes">
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                className={`md-mode${m.locked ? ' is-locked' : ''}`}
                disabled={m.locked}
                onClick={m.id === 'classic' ? onSelectClassic : undefined}
              >
                <span className="md-mode-icon" aria-hidden="true">{m.icon}</span>
                <span className="md-mode-text">
                  <span className="md-mode-title">
                    {m.title}
                    {m.locked && <span className="md-mode-badge">Coming soon</span>}
                  </span>
                  <span className="md-mode-sub">{m.sub}</span>
                </span>
              </button>
            ))}
          </div>
        </section>

        <div className="hm-chars" aria-hidden="true">
          <img className="hm-char hm-oracle" src="/oracle.webp" alt="" />
          <img className="hm-char hm-cyclops" src="/cyclops.webp" alt="" />
        </div>
      </div>
    </main>
  )
}
