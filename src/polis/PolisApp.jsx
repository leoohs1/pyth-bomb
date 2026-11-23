// PYTH POLIS (nome provisório) — vila grega lenta pra comunidade da Pyth (ideia da Halls, 2026-11-23).
// v1: login com usuário e senha, a vila, os 4 recursos (grão, madeira, mármore, bronze), ciclos de coleta
// (30 min a 24 h), armazém e melhorias. Quartel e templo vêm depois.
// Tudo é decidido no Supabase (supabase/polis/G01_polis.sql): o navegador só pede e mostra. As contagens regressivas
// correm aqui no aparelho (sem perguntar ao servidor a cada segundo); o estado é recarregado a cada 30 s e nas ações.
import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase, ensureSession } from '../supabaseClient'
import './polis.css'
import { mockRpc, mockNow } from './mockPolis'
import PolisWorld, { Spot } from './PolisWorld'

// só no computador: ?mock=1 usa a imitação na memória (mockPolis.js) em vez do Supabase
const MOCK = import.meta.env.DEV && new URLSearchParams(window.location.search).get('mock') === '1'

const RES = [
  { id: 'grain', label: 'Grain', icon: '🌾', field: 'Grain Field', blurb: 'Feeds your people and, soon, your soldiers.' },
  { id: 'wood', label: 'Wood', icon: '🪵', field: 'Olive Grove', blurb: 'Timber for houses, ships and walls.' },
  { id: 'marble', label: 'Marble', icon: '🪨', field: 'Marble Quarry', blurb: 'The stone of temples and great buildings.' },
  { id: 'bronze', label: 'Bronze', icon: '⚒️', field: 'Bronze Forge', blurb: 'Weapons and armour for the hoplites.' },
]
const RES_BY = Object.fromEntries(RES.map((r) => [r.id, r]))
const CYCLE_LABEL = { 1800: '30 min', 3600: '1 h', 21600: '6 h', 43200: '12 h', 86400: '24 h' }
const NAME = { ...Object.fromEntries(RES.map((r) => [r.id, r.field])), warehouse: 'Storehouse' }

const fmtTime = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000))
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : m ? `${m}m ${String(x).padStart(2, '0')}s` : `${x}s`
}
const fmtNum = (n) => Math.floor(Number(n) || 0).toLocaleString('en-US')

// chama uma função polis_* do Supabase; erros viram texto pra mostrar
async function rpc(fn, args) {
  const { data, error } = MOCK ? await mockRpc(fn, args) : await supabase.rpc(fn, args)
  if (error) throw new Error(error.message.replace(/^.*?:\s(?=[A-Z])/, ''))
  if (data?.error) throw new Error(data.error)
  return data
}

export default function PolisApp() {
  const [state, setState] = useState(null)
  const [err, setErr] = useState('')
  const [offset, setOffset] = useState(0) // relógio do servidor - relógio daqui
  const [now, setNow] = useState(Date.now())

  const take = useCallback((s) => {
    if (!s) return
    if (s.now) setOffset(Date.parse(s.now) - Date.now())
    setState(s)
  }, [])
  const refresh = useCallback(async () => {
    try { take(await rpc('polis_state')); setErr('') } catch (e) { setErr(e.message) }
  }, [take])

  useEffect(() => {
    let alive = true
    ;(async () => {
      try { if (!MOCK) await ensureSession(); if (alive) await refresh() } catch (e) { if (alive) setErr(e.message || 'Could not connect') }
    })()
    const poll = setInterval(refresh, 30000)
    const vis = () => { if (document.visibilityState === 'visible') refresh() }
    document.addEventListener('visibilitychange', vis)
    return () => { alive = false; clearInterval(poll); document.removeEventListener('visibilitychange', vis) }
  }, [refresh])
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id) }, [])
  useEffect(() => { const old = document.title; document.title = 'Pyth Polis · Pyth Bomb'; return () => { document.title = old } }, [])

  // hora do jogo aqui no aparelho (a do servidor, acertada); na imitação, o relógio acelerado dela
  const t = MOCK ? mockNow() : now + offset

  // quando um ciclo ou uma construção termina, busca o estado novo na hora
  const due = useRef(new Set())
  useEffect(() => {
    if (!state?.logged_in) return
    const ends = [state.village.build_until, ...state.fields.map((f) => f.ends_at)].filter(Boolean)
    for (const e of ends) if (Date.parse(e) <= t && !due.current.has(e)) { due.current.add(e); refresh() }
  }, [t, state, refresh])

  return (
    <div className="po-page">
      {!state ? <div className="po-center"><p className="po-loading">{err || 'Opening the gates…'}</p></div>
        : !state.logged_in ? <PolisLogin onDone={take} />
          : <PolisVillage s={state} t={t} onState={take} onLogout={async () => take(await rpc('polis_logout'))} />}
    </div>
  )
}

// ---------------------------------------------------------------- login / criar conta
function PolisLogin({ onDone }) {
  const [mode, setMode] = useState('login') // 'login' | 'create'
  const [user, setUser] = useState('')
  const [pass, setPass] = useState('')
  const [village, setVillage] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (e) => {
    e.preventDefault()
    setBusy(true); setErr('')
    try {
      onDone(mode === 'login' ? await rpc('polis_login', { p_username: user, p_password: pass })
        : await rpc('polis_register', { p_username: user, p_password: pass, p_village: village }))
    } catch (e2) { setErr(e2.message) } finally { setBusy(false) }
  }
  return (
    <div className="po-center po-login-wrap">
      <div className="po-hero">
        <h1 className="po-title">PYTH <span>POLIS</span></h1>
        <p className="po-tagline">Build your village in the Purple Realm.</p>
      </div>
      <form className="po-card po-login" onSubmit={submit}>
        <div className="po-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={mode === 'login'} className={mode === 'login' ? 'is-on' : ''} onClick={() => { setMode('login'); setErr('') }}>Log in</button>
          <button type="button" role="tab" aria-selected={mode === 'create'} className={mode === 'create' ? 'is-on' : ''} onClick={() => { setMode('create'); setErr('') }}>Create account</button>
        </div>
        <label className="po-field">Username
          <input value={user} onChange={(e) => setUser(e.target.value)} autoComplete="username" maxLength={16} placeholder="3 to 16 letters or numbers" required />
        </label>
        <label className="po-field">Password
          <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={6} maxLength={72} placeholder="at least 6 characters" required />
        </label>
        {mode === 'create' && (
          <label className="po-field">Village name
            <input value={village} onChange={(e) => setVillage(e.target.value)} maxLength={24} placeholder="e.g. New Delphi" required />
          </label>
        )}
        {err && <p className="po-err" role="alert">{err}</p>}
        <button type="submit" className="po-btn po-btn-go" disabled={busy}>{busy ? '…' : mode === 'login' ? 'Enter the polis' : 'Found my village'}</button>
        {mode === 'create' && <p className="po-note">Write your password down: there is no email to recover it yet.</p>}
      </form>
    </div>
  )
}

// ---------------------------------------------------------------- a vila
function PolisVillage({ s, t, onState, onLogout }) {
  const v = s.village
  const [open, setOpen] = useState(null) // 'grain' | ... | 'warehouse'
  const [cam, setCam] = useState('city') // foco da câmera: 'city' | 'fields'
  const [toast, setToast] = useState(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const act = async (fn, args, msg) => {
    setBusy(true); setErr('')
    try {
      const r = await rpc(fn, args)
      onState(r)
      const c = r.collected
      if (c) setToast(`+${fmtNum(c.amount)} ${RES_BY[c.kind].label.toLowerCase()}${c.left > 0 ? ` (${fmtNum(c.left)} wait in the field: storehouse full)` : ''}`)
      else if (msg) setToast(msg)
      return true
    } catch (e) { setErr(e.message); return false } finally { setBusy(false) }
  }
  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(null), 3200); return () => clearTimeout(id) }, [toast])

  const fieldState = (f) => !f.started_at ? 'idle' : Date.parse(f.ends_at) <= t ? 'ready' : 'working'
  const building = v.build_kind ? { name: NAME[v.build_kind], level: v.build_level, left: Date.parse(v.build_until) - t } : null
  const readyCount = s.fields.filter((f) => fieldState(f) === 'ready').length

  return (
    <div className="po-village">
      <header className="po-top">
        <div className="po-top-name"><b>{v.name}</b><span>{s.user}</span></div>
        <div className="po-res">
          {RES.map((r) => {
            const amt = v[r.id], full = amt >= v.capacity
            return (
              <div key={r.id} className={`po-res-item${full ? ' is-full' : ''}`} title={`${r.label}: ${fmtNum(amt)} / ${fmtNum(v.capacity)}`}>
                <span className="po-emoji" aria-hidden="true">{r.icon}</span>
                <span className="po-res-num">{fmtNum(amt)}</span>
                <span className="po-res-bar"><i style={{ width: `${Math.min(100, (amt / v.capacity) * 100)}%` }} /></span>
              </div>
            )
          })}
        </div>
        <button type="button" className="po-btn po-btn-ghost" onClick={onLogout}>Log out</button>
      </header>


      <div className="po-play">
        <PolisWorld mode={cam} onMode={setCam}>
          {s.fields.map((f) => {
            const r = RES_BY[f.kind], st = fieldState(f)
            const pct = st === 'working' ? Math.min(100, ((t - Date.parse(f.started_at)) / (f.cycle_secs * 1000)) * 100) : null
            const label = st === 'idle' ? 'Idle · tap to start' : st === 'working' ? `⏳ ${fmtTime(Date.parse(f.ends_at) - t)}` : `Collect +${fmtNum(f.harvest)}`
            return <Spot key={f.kind} id={f.kind} mode={cam} icon={r.icon} name={r.field} level={f.level} state={label} pct={pct} ready={st === 'ready'}
              onClick={() => (cam === 'fields' ? setOpen(f.kind) : setCam('fields'))} />
          })}
          <Spot id="warehouse" mode={cam} icon="🏺" name="Storehouse" level={v.warehouse} state={`${fmtNum(v.capacity)} each`}
            onClick={() => (cam === 'city' ? setOpen('warehouse') : setCam('city'))} />
          <Spot id="temple" mode={cam} icon="🏛️" name="Temple" state="Coming soon" locked onClick={() => setCam('city')} />
          <Spot id="barracks" mode={cam} icon="⚔️" name="Barracks" state="Coming soon" locked onClick={() => setCam('city')} />
        </PolisWorld>

        {/* "Seu dia": tudo o que está pronto ou correndo, pra resolver rápido */}
        <aside className="po-day" aria-label="Your day">
          <p className="po-label">Your day</p>
          {readyCount > 0 && (
            <button type="button" className="po-btn po-btn-go po-pulse" disabled={busy} onClick={async () => {
              for (const f of s.fields) if (fieldState(f) === 'ready') { if (!(await act('polis_collect', { p_kind: f.kind }))) break }
            }}>Collect all ({readyCount})</button>
          )}
          <ul>
            {s.fields.map((f) => {
              const r = RES_BY[f.kind], st = fieldState(f)
              return (
                <li key={f.kind} className={`is-${st}`}>
                  <button type="button" onClick={() => { setCam('fields'); setOpen(f.kind) }}>
                    <span className="po-emoji" aria-hidden="true">{r.icon}</span>
                    <span className="po-day-name">{r.label}</span>
                    <span className="po-day-state">{st === 'idle' ? 'Idle' : st === 'working' ? fmtTime(Date.parse(f.ends_at) - t) : `Ready +${fmtNum(f.harvest)}`}</span>
                  </button>
                </li>
              )
            })}
            <li className={building ? 'is-working' : 'is-idle'}>
              <button type="button" onClick={() => setCam('city')}>
                <span className="po-emoji" aria-hidden="true">🔨</span>
                <span className="po-day-name">{building ? building.name : 'Builders'}</span>
                <span className="po-day-state">{building ? `Lv ${building.level} · ${fmtTime(building.left)}` : 'Free'}</span>
              </button>
            </li>
          </ul>
        </aside>
      </div>

      {open && (
        <div className="po-sheet-back" onClick={() => setOpen(null)}>
          <div className="po-sheet" role="dialog" aria-label={NAME[open]} onClick={(e) => e.stopPropagation()}>
            <button type="button" className="po-sheet-x" aria-label="Close" onClick={() => setOpen(null)}>×</button>
            {open === 'warehouse'
              ? <WarehousePanel v={v} t={t} busy={busy} err={err} onUpgrade={() => act('polis_upgrade', { p_kind: 'warehouse' }, 'Construction started')} />
              : <FieldPanel f={s.fields.find((x) => x.kind === open)} v={v} cycles={s.cycles} st={fieldState(s.fields.find((x) => x.kind === open))} t={t} busy={busy} err={err}
                onStart={(secs) => act('polis_start', { p_kind: open, p_secs: secs }, `${RES_BY[open].field}: working for ${CYCLE_LABEL[secs]}`)}
                onCollect={() => act('polis_collect', { p_kind: open })}
                onUpgrade={() => act('polis_upgrade', { p_kind: open }, 'Construction started')} />}
          </div>
        </div>
      )}
      {toast && <div className="po-toast" role="status">{toast}</div>}
    </div>
  )
}

function Cost({ c, v }) {
  return (
    <span className="po-cost">
      {RES.map((r) => <span key={r.id} className={v[r.id] < c[r.id] ? 'is-short' : ''}><span className="po-emoji" aria-hidden="true">{r.icon}</span>{fmtNum(c[r.id])}</span>)}
      <span>⏱ {fmtTime(c.secs * 1000)}</span>
    </span>
  )
}
const canPay = (c, v) => RES.every((r) => v[r.id] >= c[r.id])

function UpgradeBox({ title, gain, c, v, busy, onUpgrade }) {
  if (!c) return <p className="po-note">Top level reached.</p>
  const blocked = v.build_kind ? 'Builders are busy' : !canPay(c, v) ? 'Not enough resources' : ''
  return (
    <div className="po-upgrade">
      <p className="po-label">{title}</p>
      <p className="po-gain">{gain}</p>
      <Cost c={c} v={v} />
      <button type="button" className="po-btn" disabled={busy || !!blocked} onClick={onUpgrade}>{blocked || 'Upgrade'}</button>
    </div>
  )
}

function FieldPanel({ f, v, cycles, st, t, busy, err, onStart, onCollect, onUpgrade }) {
  const r = RES_BY[f.kind]
  const [pick, setPick] = useState(3600)
  return (
    <>
      <h2><span className="po-emoji" aria-hidden="true">{r.icon}</span> {r.field} <em>Lv {f.level}</em></h2>
      <p className="po-sub">{r.blurb} Makes <b>{fmtNum(f.rate)} {r.label.toLowerCase()}/hour</b>.</p>
      {st === 'idle' && (
        <>
          <p className="po-label">How long should it work?</p>
          <div className="po-cycles">
            {cycles.map((c) => (
              <button key={c.secs} type="button" className={`po-cycle${pick === c.secs ? ' is-on' : ''}`} onClick={() => setPick(c.secs)}>
                <b>{CYCLE_LABEL[c.secs]}</b>
                <span>+{fmtNum(Math.round(f.rate * (c.secs / 3600) * c.mult))}</span>
              </button>
            ))}
          </div>
          <p className="po-note">Short cycles pay more per hour if you come back often. Long cycles keep working while you sleep.</p>
          <button type="button" className="po-btn po-btn-go" disabled={busy} onClick={() => onStart(pick)}>Start · {CYCLE_LABEL[pick]}</button>
        </>
      )}
      {st === 'working' && (
        <div className="po-run">
          <p>Working ({CYCLE_LABEL[f.cycle_secs]}) · <b>+{fmtNum(f.harvest)}</b> {r.label.toLowerCase()}</p>
          <div className="po-run-bar"><i style={{ width: `${Math.min(100, ((t - Date.parse(f.started_at)) / (f.cycle_secs * 1000)) * 100)}%` }} /></div>
          <p className="po-note">Ready in {fmtTime(Date.parse(f.ends_at) - t)} (at {new Date(Date.parse(f.ends_at)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}).</p>
        </div>
      )}
      {st === 'ready' && (
        <div className="po-run">
          <p>Harvest ready: <b>+{fmtNum(f.harvest)}</b> {r.label.toLowerCase()}</p>
          <button type="button" className="po-btn po-btn-go po-pulse" disabled={busy} onClick={onCollect}>Collect</button>
          {v[f.kind] >= v.capacity && <p className="po-err">Your storehouse is full of {r.label.toLowerCase()}. Spend some or upgrade it.</p>}
        </div>
      )}
      {err && <p className="po-err" role="alert">{err}</p>}
      <UpgradeBox title={`Upgrade to Lv ${f.level + 1}`} gain={f.next_rate ? `${fmtNum(f.rate)} → ${fmtNum(f.next_rate)} per hour` : ''} c={f.next} v={v} busy={busy} onUpgrade={onUpgrade} />
    </>
  )
}

function WarehousePanel({ v, busy, err, onUpgrade }) {
  return (
    <>
      <h2><span className="po-emoji" aria-hidden="true">🏺</span> Storehouse <em>Lv {v.warehouse}</em></h2>
      <p className="po-sub">Holds up to <b>{fmtNum(v.capacity)}</b> of each resource. A harvest that doesn&apos;t fit waits in its field.</p>
      {err && <p className="po-err" role="alert">{err}</p>}
      <UpgradeBox title={`Upgrade to Lv ${v.warehouse + 1}`} gain={v.capacity_next ? `${fmtNum(v.capacity)} → ${fmtNum(v.capacity_next)} of each` : ''} c={v.warehouse_next} v={v} busy={busy} onUpgrade={onUpgrade} />
    </>
  )
}
