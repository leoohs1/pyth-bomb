import './Home.css'

function Leaf({ flip = false }) {
  return (
    <svg className="hm-leaf" viewBox="0 0 40 24" aria-hidden="true"
      style={flip ? { transform: 'scaleX(-1)' } : undefined}>
      <g fill="currentColor">
        <path d="M38 12 Q26 12 14 20 Q24 10 38 12Z" />
        <path d="M30 10 Q22 4 12 6 Q22 2 30 10Z" />
        <path d="M22 14 Q14 20 4 18 Q14 12 22 14Z" />
        <path d="M16 8 Q10 2 2 4 Q10 0 16 8Z" />
      </g>
    </svg>
  )
}

const PersonIcon = () => (
  <svg className="hm-icon" viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="8" r="4" fill="currentColor" />
    <path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7z" fill="currentColor" />
  </svg>
)

const HashIcon = () => (
  <svg className="hm-icon" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M9 3 7.5 21M16.5 3 15 21M4 9h17M3 15h17" stroke="currentColor"
      strokeWidth="2.4" strokeLinecap="round" fill="none" />
  </svg>
)

// Tela de entrada: criar sala ou entrar por código.
// Só visual: a lógica (criar/entrar) continua no App.jsx e chega por props.
export default function Home({ nickname, setNickname, codeInput, setCodeInput, onCreate, onJoin, error }) {
  return (
    <main className="hm-stage">
      <div className="hm-bg" role="img" aria-label="Marble arena above a night city with the Pyth emblem on the floor" />
      <div className="hm-shade" />

      <div className="hm-chars" aria-hidden="true">
        <img className="hm-char hm-oracle" src="/oracle.webp" alt="" />
        <img className="hm-char hm-cyclops" src="/cyclops.webp" alt="" />
      </div>

      <div className="hm-scroll">
        <section className="hm-panel">
          <div className="hm-bomb" aria-hidden="true">
            <div className="hm-aura" />
            <img src="/bomb-laurel.webp" alt="" />
          </div>

          <h1 className="hm-title">Pyth Bomb</h1>
          <p className="hm-sub"><span>Enter the arena</span></p>

          <label className="hm-field">
            <PersonIcon />
            <input
              placeholder="your nickname"
              aria-label="Your nickname"
              maxLength={20}
              autoComplete="off"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
            />
          </label>

          <button type="button" className="hm-btn hm-create" onClick={onCreate}>
            <Leaf /> <span>Create room</span> <Leaf flip />
          </button>

          <p className="hm-or"><span>or</span></p>

          <form className="hm-join" onSubmit={(e) => { e.preventDefault(); onJoin() }}>
            <label className="hm-field">
              <HashIcon />
              <input
                placeholder="room code"
                aria-label="Room code"
                maxLength={8}
                autoComplete="off"
                autoCapitalize="characters"
                value={codeInput}
                onChange={(e) => setCodeInput(e.target.value)}
              />
            </label>
            <button type="submit" className="hm-btn hm-joinbtn">Join</button>
          </form>

          {error && <p className="hm-error" role="alert">{error}</p>}
        </section>
      </div>
    </main>
  )
}
