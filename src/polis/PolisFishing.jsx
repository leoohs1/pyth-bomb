// Pesca (G03): o cais na tela de Recursos. Cada barco sai remando do cais até um ponto no mar, pesca lá (vara parada,
// vara envergada), volta quando a pescaria termina e o pescador mostra o peixe até você coletar. Só desenho a partir
// dos horários que o servidor já mandou: nenhuma chamada a mais.
import { useState } from 'react'
import { Sprite, Walker } from './PolisPeople'
import { CYCLE_LABEL, fmtNum, fmtTime } from './polisData'

const W = 1672, H = 941
const pct = ([x, y]) => ({ x: (x / W) * 100, y: (y / H) * 100 })
export const PIER = pct([282, 800]) // o píer de madeira na arte de Recursos
const SLOTS = [[150, 872], [384, 890], [262, 925], [452, 908]].map(pct) // onde cada barco fica amarrado
const SPOTS = [[92, 926], [318, 941], [175, 941], [440, 941]].map(pct) // onde cada barco pesca (mar aberto, longe das pedras)
export const ROW_MS = 6000

export const boatState = (b, t) => (!b.started_at ? 'pier' : Date.parse(b.ends_at) <= t ? 'ready' : 'sea')

export function Boats({ boats, t }) {
  return boats.map((b) => {
    const st = boatState(b, t), slot = SLOTS[b.boat], spot = SPOTS[b.boat]
    const start = Date.parse(b.started_at), end = Date.parse(b.ends_at)
    if (st === 'sea' && t - start < ROW_MS) {
      return <Walker key={`out-${b.boat}-${b.started_at}`} cls="po-person po-boat" from={slot} to={spot} startAt={start} ms={ROW_MS} anim="boatRow" now={t} />
    }
    if (st === 'ready' && t - end < ROW_MS) {
      return <Walker key={`in-${b.boat}-${b.ends_at}`} cls="po-person po-boat" from={spot} to={slot} startAt={end} ms={ROW_MS} anim="boatRow" now={t} />
    }
    const at = st === 'sea' ? spot : slot
    return (
      <span key={`b-${b.boat}`} className={`po-person po-boat${st === 'sea' ? ' is-floating' : ''}`} style={{ left: `${at.x}%`, top: `${at.y}%` }}>
        <Sprite anim={st === 'sea' ? 'boatFish' : st === 'ready' ? 'boatProud' : 'boatEmpty'} flip={st === 'sea' && spot.x < slot.x} />
      </span>
    )
  })
}

export function FishPanel({ s, t, busy, err, onSail, onCollect }) {
  const [pick, setPick] = useState(3600)
  const f = s.fishing, v = s.village
  const anyPier = s.boats.some((b) => boatState(b, t) === 'pier')
  return (
    <>
      <h2><span className="po-emoji" aria-hidden="true">🐟</span> Fishing Pier <em>{s.boats.length} {s.boats.length === 1 ? 'boat' : 'boats'}</em></h2>
      <p className="po-sub">Each boat brings <b>{fmtNum(f.rate)} fish/hour</b>. Fish is food: it goes to your granary and will feed your army.</p>
      {anyPier && (
        <>
          <p className="po-label">How long at sea?</p>
          <div className="po-cycles">
            {s.cycles.map((c) => (
              <button key={c.secs} type="button" className={`po-cycle${pick === c.secs ? ' is-on' : ''}`} onClick={() => setPick(c.secs)}>
                <b>{CYCLE_LABEL[c.secs]}</b><span>+{fmtNum(Math.round(f.rate * (c.secs / 3600) * c.mult + 1e-9))}</span>
              </button>
            ))}
          </div>
        </>
      )}
      <div className="po-boats">
        {s.boats.map((b) => {
          const st = boatState(b, t)
          return (
            <div key={b.boat} className={`po-boatrow is-${st}`}>
              <span className="po-boatrow-pic"><Sprite anim={st === 'pier' ? 'boatEmpty' : st === 'sea' ? 'boatFish' : 'boatProud'} /></span>
              <div className="po-boatrow-info">
                <b>Boat {b.boat + 1}</b>
                {st === 'pier' && <span>At the pier</span>}
                {st === 'sea' && (
                  <>
                    <span>At sea · +{fmtNum(b.catch)} fish · back in {fmtTime(Date.parse(b.ends_at) - t)}</span>
                    <span className="po-run-bar"><i style={{ width: `${Math.min(100, ((t - Date.parse(b.started_at)) / (b.cycle_secs * 1000)) * 100)}%` }} /></span>
                  </>
                )}
                {st === 'ready' && <span>Back with <b>+{fmtNum(b.catch)} fish</b></span>}
              </div>
              {st === 'pier' && <button type="button" className="po-btn po-btn-go" disabled={busy} onClick={() => onSail(b.boat, pick)}>Sail · {CYCLE_LABEL[pick]}</button>}
              {st === 'ready' && <button type="button" className="po-btn po-btn-go po-pulse" disabled={busy} onClick={() => onCollect(b.boat)}>Collect</button>}
            </div>
          )
        })}
      </div>
      {v.fish >= v.granary_cap && <p className="po-err">Your granary is full of fish. Spend some or upgrade it.</p>}
      {err && <p className="po-err" role="alert">{err}</p>}
      <p className="po-note">
        {f.next_boat_at ? `Build the Docks in the City${f.docks ? ` up to level ${f.next_boat_at}` : ''} for another boat. ` : ''}
        Every Docks level adds 10% fish.{s.tribe === 'athenian' ? ' Athenians fish 20% more.' : ''}
      </p>
    </>
  )
}
