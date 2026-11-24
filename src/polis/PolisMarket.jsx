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

// faixa de preços embaixo da tela (G06): preço REAL da Pyth em dólar, rolando como letreiro de bolsa.
// Ouro e oliva (a oliva segue o petróleo Brent); mais ativos entram depois. Sem preço ao vivo, avisa "live price soon".
const ICON = { gold: '🪙', olive: '🫒' }
const NAME = { gold: 'Gold', olive: 'Olive' }
const usd = (n) => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export function PolisTicker({ ticker }) {
  if (!ticker?.length) return null
  const items = ticker.map((x) => {
    const up = x.change > 0, down = x.change < 0
    return (
      <span key={x.kind} className="po-tick">
        <span className="po-emoji" aria-hidden="true">{ICON[x.kind] ?? '•'}</span>
        <b>{(NAME[x.kind] ?? x.label).toUpperCase()}</b>
        {NAME[x.kind] && NAME[x.kind] !== x.label && <span className="po-tick-pair">{x.label}</span>}
        {x.usd != null ? <span className="po-tick-usd">{usd(x.usd)}</span> : <span className="po-tick-soon">live price soon</span>}
        {x.change != null && <span className={up ? 'is-up' : down ? 'is-down' : ''}>{up ? '▲' : down ? '▼' : '•'} {Math.abs(x.change).toFixed(2)}%</span>}
        {x.usd != null && !x.live && <span className="po-tick-soon">last price</span>}
      </span>
    )
  })
  const note = <span className="po-tick po-tick-note">Market prices in the polis follow the real price of gold · olives follow oil</span>
  const brand = <span className="po-tick po-tick-brand">● Prices by Pyth Network</span>
  const row = <>{items}{note}{brand}</>
  return (
    <div className="po-ticker" role="marquee" aria-label="Real prices from Pyth">
      <div className="po-ticker-track">
        <div className="po-ticker-row">{row}{row}</div>
        <div className="po-ticker-row" aria-hidden="true">{row}{row}</div>
      </div>
    </div>
  )
}
