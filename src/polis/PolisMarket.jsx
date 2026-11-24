// Aba Market (G05): vende o que você colheu e recebe OURO, a moeda do jogo. Cada mercadoria segue um preço REAL da
// Pyth (trigo, algodão, alumínio, cobre, boi gordo), dividido pelo preço real do ouro. O servidor do Railway atualiza
// 1x por minuto; sem preço ao vivo, vale o preço base.
import { useState } from 'react'
import { RES_BY, fmtNum } from './polisData'

const fmtPrice = (n) => (Number(n) * 100).toLocaleString('en-US', { maximumFractionDigits: 1 })

export function MarketScreen({ s, busy, err, onSell }) {
  const v = s.village
  const market = s.market ?? []
  const anyLive = market.some((m) => m.live)
  return (
    <div className="po-market">
      <div className="po-market-head">
        <div>
          <h2>⚖️ Market</h2>
          <p className="po-sub">Sell what you harvest for <b>🪙 gold</b>, the money of the polis. Every good follows a <b>real price from Pyth</b>, divided by the real price of gold.</p>
        </div>
        <span className={`po-live${anyLive ? ' is-on' : ''}`}>{anyLive ? '● Live prices by Pyth' : '○ Base prices (live prices soon)'}</span>
      </div>
      {err && <p className="po-err" role="alert">{err}</p>}
      <div className="po-goods">
        {market.map((m) => <Good key={m.kind} m={m} have={Math.floor(v[m.kind] ?? 0)} busy={busy} onSell={onSell} />)}
      </div>
      <p className="po-note">Prices move with the real markets. Wheat, cotton and cattle trade on weekdays; on weekends the market shows the last price.</p>
    </div>
  )
}

function Good({ m, have, busy, onSell }) {
  const r = RES_BY[m.kind]
  const [amount, setAmount] = useState('')
  const n = Math.max(0, Math.min(have, Math.floor(Number(amount) || 0)))
  const gold = Math.floor(n * Number(m.price))
  const up = m.change > 0, down = m.change < 0
  return (
    <div className="po-good">
      <div className="po-good-top">
        <span className="po-good-icon po-emoji" aria-hidden="true">{r.icon}</span>
        <div className="po-good-name"><b>{r.label}</b><small>follows {m.label}</small></div>
        <div className="po-good-price">
          <b>100 = 🪙 {fmtPrice(m.price)}</b>
          <small className={up ? 'is-up' : down ? 'is-down' : ''}>
            {m.change == null ? (m.live ? 'live' : 'base price') : `${up ? '▲' : down ? '▼' : '•'} ${Math.abs(m.change).toFixed(2)}% today`}
            {m.live === false && m.change != null ? ' · closed' : ''}
          </small>
        </div>
      </div>
      <div className="po-good-sell">
        <span className="po-good-have">You have <b>{fmtNum(have)}</b></span>
        <div className="po-good-quick">
          {[[0.25, '25%'], [0.5, '50%'], [1, 'All']].map(([f, l]) => (
            <button key={l} type="button" className="po-chip" disabled={!have} onClick={() => setAmount(String(Math.floor(have * f)))}>{l}</button>
          ))}
        </div>
        <input className="po-good-input" inputMode="numeric" value={amount} placeholder="0" aria-label={`How much ${r.label.toLowerCase()} to sell`}
          onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, '').slice(0, 7))} />
        <button type="button" className="po-btn po-btn-go" disabled={busy || n < 1 || gold < 1}
          onClick={async () => { if (await onSell(m.kind, n)) setAmount('') }}>
          Sell{n ? ` for 🪙 ${fmtNum(gold)}` : ''}
        </button>
      </div>
    </div>
  )
}
