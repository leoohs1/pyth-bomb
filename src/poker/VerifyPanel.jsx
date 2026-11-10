import { useEffect, useState } from 'react'
import { verifyHand, shortHex } from './fair'
import { Card } from './cards'

// Tela "Verify": mostra a prova do embaralhamento da mão que acabou e confere tudo no navegador.
// (o texto fica em inglês, como o resto do jogo)
function Row({ label, value, href, full }) {
  return (
    <div className="pk-vrow">
      <span className="pk-vlabel">{label}</span>
      {href
        ? <a className="pk-vval" href={href} target="_blank" rel="noreferrer" title={full ?? value}>{value}</a>
        : <span className="pk-vval" title={full ?? value}>{value}</span>}
    </div>
  )
}

export default function VerifyPanel({ hand, onClose }) {
  const { result, myCards } = hand
  const fair = result.fair
  const [state, setState] = useState(null) // null | 'checking' | { checks, allOk, deck }
  const [showDeck, setShowDeck] = useState(false)
  const entropy = fair.via === 'entropy'
  const ex = fair.explorer

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function run() {
    setState('checking')
    try { setState(await verifyHand(result, myCards)) } catch (e) { setState({ checks: [{ label: 'Check failed: ' + e.message, ok: false }], allOk: false }) }
  }

  return (
    <div className="pk-vback" role="dialog" aria-modal="true" aria-label={`Verify hand #${result.hand_no}`} onClick={onClose}>
      <div className="pk-verify" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="pk-vclose" onClick={onClose} aria-label="Close">×</button>
        <h3>Verify hand #{result.hand_no}</h3>
        {entropy ? (
          <p className="pk-vintro">
            This deck was shuffled with <b>Pyth Entropy</b>. Before the random number existed, the server locked a
            fingerprint of its secret on-chain. Now the secret is revealed, so anyone can rebuild the deck.
          </p>
        ) : (
          <p className="pk-vintro is-warn">
            This hand used the <b>server shuffle</b> (Pyth Entropy was not ready in time). The deck still matches the seed below,
            but it is not provable on-chain.
          </p>
        )}

        <div className="pk-vgrid">
          {entropy && <>
            <Row label="Network" value={fair.chain_name || fair.chain} />
            <Row label="Contract" value={shortHex(fair.contract)} full={fair.contract} href={ex ? `${ex}/address/${fair.contract}` : null} />
            <Row label="Sequence" value={String(fair.sequence)} />
            <Row label="Request tx" value={shortHex(fair.tx)} full={fair.tx} href={ex && fair.tx ? `${ex}/tx/${fair.tx}` : null} />
            <Row label="Commit" value={shortHex(fair.commit)} full={fair.commit} />
            <Row label="Entropy number" value={shortHex(fair.random)} full={fair.random} />
            <Row label="Secret (revealed)" value={shortHex(fair.secret)} full={fair.secret} />
          </>}
          <Row label="Seed" value={shortHex(fair.seed)} full={fair.seed} />
        </div>

        {state === null && <button type="button" className="pk-btn is-call pk-vgo" onClick={run}>Check it</button>}
        {state === 'checking' && <p className="pk-vstatus">Checking…</p>}
        {state && state !== 'checking' && (
          <>
            <ul className="pk-vchecks">
              {state.checks.map((c, i) => (
                <li key={i} className={c.ok === true ? 'is-ok' : c.ok === false ? 'is-bad' : 'is-unknown'}>
                  <span aria-hidden="true">{c.ok === true ? '✓' : c.ok === false ? '✗' : '?'}</span>
                  {c.label}{c.ok == null ? ' (could not check now)' : ''}
                </li>
              ))}
            </ul>
            {(() => {
              const bad = state.checks.some((c) => c.ok === false)
              const unknown = state.checks.some((c) => c.ok == null)
              return (
                <p className={`pk-vverdict ${bad ? 'is-bad' : 'is-ok'}`}>
                  {bad ? '✗ Something did not match' : unknown ? '✓ matches (on-chain part: try again later)' : '✓ matches'}
                </p>
              )
            })()}
            {state.deck && (
              <button type="button" className="pk-vlink" onClick={() => setShowDeck((v) => !v)}>
                {showDeck ? 'Hide the deck' : 'Show the whole deck'}
              </button>
            )}
            {showDeck && state.deck && (
              <div className="pk-vdeck" aria-label="The whole deck, in order">
                {state.deck.map((c, i) => <Card key={i} c={c} size="sm" />)}
              </div>
            )}
          </>
        )}
        <p className="pk-vfoot">How it is built: seed = sha256(secret + Entropy number); deck = Fisher-Yates using sha256(seed + index).</p>
      </div>
    </div>
  )
}
