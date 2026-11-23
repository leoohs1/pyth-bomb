// PYTH POLIS (nome provisório) — vila grega calma pra comunidade da Pyth (Halls, 2026-11-23).
// v2, no formato do Travian mas limpo e "Colheita Feliz": menu em cima, tela de Recursos (14 lotes em volta da
// vilinha) e tela da Cidade (14 bases de mármore onde os prédios aparecem). As outras abas mostram "Soon".
// Tudo é decidido no Supabase (supabase/polis/G01 + G02): o navegador só pede e mostra. As contagens regressivas
// correm aqui no aparelho; o estado é recarregado a cada 30 s, quando algo termina e depois de cada ação.
import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase, ensureSession } from '../supabaseClient'
import './polis.css'
import { mockRpc, mockNow } from './mockPolis'
import {
  RES, RES_BY, CYCLE_LABEL, TRIBES, BUILDINGS, buildingImg, tierOf, PLOT_POS, PAD_POS, SCENE_RATIO, fmtTime, fmtNum,
} from './polisData'

// só no computador: ?mock=1 usa a imitação na memória (mockPolis.js) em vez do Supabase
const MOCK = import.meta.env.DEV && new URLSearchParams(window.location.search).get('mock') === '1'

async function rpc(fn, args) {
  const { data, error } = MOCK ? await mockRpc(fn, args) : await supabase.rpc(fn, args)
  if (error) throw new Error(error.message.replace(/^.*?:\s(?=[A-Z])/, ''))
  if (data?.error) throw new Error(data.error)
  return data
}

export default function PolisApp() {
  const [state, setState] = useState(null)
  const [err, setErr] = useState('')
  const [offset, setOffset] = useState(0)
  const [now, setNow] = useState(Date.now())
  const take = useCallback((s) => { if (!s) return; if (s.now) setOffset(Date.parse(s.now) - Date.now()); setState(s) }, [])
  const refresh = useCallback(async () => {
    try { take(await rpc('polis_state')); setErr('') } catch (e) { setErr(e.message) }
  }, [take])

  useEffect(() => {
    let alive = true
    ;(async () => { try { if (!MOCK) await ensureSession(); if (alive) await refresh() } catch (e) { if (alive) setErr(e.message || 'Could not connect') } })()
    const poll = setInterval(refresh, 30000)
    const vis = () => { if (document.visibilityState === 'visible') refresh() }
    document.addEventListener('visibilitychange', vis)
    return () => { alive = false; clearInterval(poll); document.removeEventListener('visibilitychange', vis) }
  }, [refresh])
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id) }, [])
  useEffect(() => { const old = document.title; document.title = 'Pyth Polis · Pyth Bomb'; return () => { document.title = old } }, [])

  const t = MOCK ? mockNow() : now + offset
  // quando uma colheita ou construção termina, busca o estado novo na hora
  const due = useRef(new Set())
  useEffect(() => {
    if (!state?.logged_in) return
    const ends = [state.village.build_until, ...(state.plots ?? []).map((p) => p.ends_at)].filter(Boolean)
    for (const e of ends) if (Date.parse(e) <= t && !due.current.has(e)) { due.current.add(e); refresh() }
  }, [t, state, refresh])

  return (
    <div className="po-page">
      {!state ? <div className="po-center"><p className="po-loading">{err || 'Opening the gates…'}</p></div>
        : !state.logged_in ? <PolisLogin onDone={take} />
          : !state.tribe ? <div className="po-center po-login-wrap"><TribePicker onPick={async (tr) => take(await rpc('polis_set_tribe', { p_tribe: tr }))} /></div>
            : <PolisGame s={state} t={t} onState={take} onLogout={async () => take(await rpc('polis_logout'))} />}
    </div>
  )
}

// ---------------------------------------------------------------- entrar / criar conta (com a tribo)
function PolisLogin({ onDone }) {
  const [mode, setMode] = useState('login')
  const [user, setUser] = useState('')
  const [pass, setPass] = useState('')
  const [village, setVillage] = useState('')
  const [tribe, setTribe] = useState(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (e) => {
    e.preventDefault()
    if (mode === 'create' && !tribe) { setErr('Pick your tribe'); return }
    setBusy(true); setErr('')
    try {
      onDone(mode === 'login' ? await rpc('polis_login', { p_username: user, p_password: pass })
        : await rpc('polis_register', { p_username: user, p_password: pass, p_village: village, p_tribe: tribe }))
    } catch (e2) { setErr(e2.message) } finally { setBusy(false) }
  }
  return (
    <div className="po-center po-login-wrap">
      <div className="po-hero">
        <h1 className="po-title">PYTH <span>POLIS</span></h1>
        <p className="po-tagline">Build your village. Take care of it.</p>
      </div>
      <form className={`po-card po-login${mode === 'create' ? ' is-wide' : ''}`} onSubmit={submit}>
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
          <>
            <label className="po-field">Village name
              <input value={village} onChange={(e) => setVillage(e.target.value)} maxLength={24} placeholder="e.g. New Delphi" required />
            </label>
            <p className="po-label">Choose your tribe</p>
            <TribeCards value={tribe} onChange={setTribe} />
          </>
        )}
        {err && <p className="po-err" role="alert">{err}</p>}
        <button type="submit" className="po-btn po-btn-go" disabled={busy}>{busy ? '…' : mode === 'login' ? 'Enter the polis' : 'Found my village'}</button>
        {mode === 'create' && <p className="po-note">Write your password down: there is no email to recover it yet. Your tribe can&apos;t be changed later.</p>}
      </form>
    </div>
  )
}

function TribeCards({ value, onChange }) {
  return (
    <div className="po-tribes" role="radiogroup" aria-label="Tribe">
      {Object.entries(TRIBES).map(([id, tr]) => (
        <button key={id} type="button" role="radio" aria-checked={value === id} className={`po-tribe${value === id ? ' is-on' : ''}`}
          style={{ '--tribe': tr.color }} onClick={() => onChange(id)}>
          <span className="po-tribe-icon po-emoji" aria-hidden="true">{tr.icon}</span>
          <b>{tr.name}</b>
          <em>{tr.tag}</em>
          <small>{tr.text}</small>
        </button>
      ))}
    </div>
  )
}

// conta antiga (da v1) sem tribo: escolhe uma vez
function TribePicker({ onPick }) {
  const [tribe, setTribe] = useState(null)
  const [busy, setBusy] = useState(false)
  return (
    <div className="po-card po-login is-wide">
      <h2 className="po-pick-title">Choose your tribe</h2>
      <p className="po-note">Your village is safe. Pick the people you belong to (this can&apos;t be changed later).</p>
      <TribeCards value={tribe} onChange={setTribe} />
      <button type="button" className="po-btn po-btn-go" disabled={!tribe || busy} onClick={async () => { setBusy(true); try { await onPick(tribe) } finally { setBusy(false) } }}>Join the {tribe ? TRIBES[tribe].name : 'tribe'}</button>
    </div>
  )
}

// ---------------------------------------------------------------- o jogo
const NAV = [
  { id: 'resources', icon: '🌾', label: 'Resources' },
  { id: 'city', icon: '🏛️', label: 'City' },
  { id: 'map', icon: '🗺️', label: 'Map', soon: true },
  { id: 'reports', icon: '📜', label: 'Reports', soon: true },
  { id: 'ranking', icon: '🏆', label: 'Ranking', soon: true },
  { id: 'missions', icon: '⚡', label: 'Missions', soon: true },
  { id: 'hero', icon: '🦸', label: 'Hero', soon: true },
]

function PolisGame({ s, t, onState, onLogout }) {
  const v = s.village
  const tribe = TRIBES[s.tribe]
  const [tab, setTab] = useState('resources')
  const [open, setOpen] = useState(null) // { plot: idx } | { pad: n }
  const [soon, setSoon] = useState(null)
  const [toast, setToast] = useState(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(null), 3200); return () => clearTimeout(id) }, [toast])
  useEffect(() => { setErr('') }, [open])
  // celular: a cena é mais larga que a tela (arrasta pro lado); abre centralizada na vila
  const scrollRef = useRef(null)
  useEffect(() => { const el = scrollRef.current; if (el) el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2 }, [tab])

  const act = async (fn, args, msg, close) => {
    setBusy(true); setErr('')
    try {
      const r = await rpc(fn, args)
      onState(r)
      const c = r.collected
      if (c) setToast(`+${fmtNum(c.amount)} ${RES_BY[c.kind].label.toLowerCase()}${c.left > 0 ? ` (${fmtNum(c.left)} wait: storage full)` : ''}`)
      else if (msg) setToast(msg)
      if (close) setOpen(null)
      return true
    } catch (e) { setErr(e.message); return false } finally { setBusy(false) }
  }
  const plotState = (p) => (p.level < 1 ? 'empty' : !p.started_at ? 'idle' : Date.parse(p.ends_at) <= t ? 'ready' : 'working')
  const ready = s.plots.filter((p) => plotState(p) === 'ready')
  const idle = s.plots.filter((p) => plotState(p) === 'idle')
  const building = v.build_kind ? {
    name: v.build_target?.startsWith('plot:') ? RES_BY[v.build_kind].field : BUILDINGS[v.build_kind]?.name ?? v.build_kind,
    level: v.build_level, left: Date.parse(v.build_until) - t,
  } : null
  const capOf = (k) => (k === 'grain' ? v.granary_cap : v.store_cap)

  return (
    <div className="po-game" style={{ '--tribe': tribe.color }}>
      {/* ---- menu de cima, como no Travian: brasão/vila, as abas e a barra de recursos */}
      <header className="po-topbar">
        <div className="po-crest" title={tribe.name}>
          <span className="po-crest-badge po-emoji" aria-hidden="true">{tribe.icon}</span>
          <span className="po-crest-text"><b>{v.name}</b><small>{s.user} · {tribe.name}</small></span>
        </div>
        <nav className="po-nav" aria-label="Sections">
          {NAV.map((n) => (
            <button key={n.id} type="button" className={`po-nav-btn${tab === n.id ? ' is-on' : ''}${n.soon ? ' is-soon' : ''}`}
              onClick={() => (n.soon ? setSoon(n) : setTab(n.id))} aria-current={tab === n.id ? 'page' : undefined}>
              <span className="po-emoji" aria-hidden="true">{n.icon}</span>
              <span className="po-nav-label">{n.label}</span>
            </button>
          ))}
        </nav>
        <button type="button" className="po-btn po-btn-ghost po-logout" onClick={onLogout}>Log out</button>
        <div className="po-resbar">
          {RES.map((r) => {
            const amt = v[r.id], cap = capOf(r.id), full = amt >= cap
            return (
              <div key={r.id} className={`po-res${full ? ' is-full' : ''}`} title={`${r.label}: ${fmtNum(amt)} / ${fmtNum(cap)}`}>
                <span className="po-emoji" aria-hidden="true">{r.icon}</span>
                <span className="po-res-num">{fmtNum(amt)}</span>
                <span className="po-res-cap">/ {fmtNum(cap)}</span>
                <span className="po-res-bar"><i style={{ width: `${Math.min(100, (amt / cap) * 100)}%` }} /></span>
              </div>
            )
          })}
        </div>
      </header>

      <div className="po-body">
        <main className="po-stage">
          <div className="po-scroll" ref={scrollRef}>
            {tab === 'resources' && (
              <div className="po-scene" style={{ aspectRatio: SCENE_RATIO }}>
                <img className="po-scene-img" src="/polis/resources.webp" alt="" draggable="false" />
                <button type="button" className="po-village-btn" style={{ left: '50%', top: '44%' }} onClick={() => setTab('city')} aria-label="Go to the city">
                  <span>🏛️ City</span>
                </button>
                {s.plots.map((p) => {
                  const st = plotState(p), pos = PLOT_POS[p.idx], r = RES_BY[p.kind]
                  const pctDone = st === 'working' ? Math.min(100, ((t - Date.parse(p.started_at)) / (p.cycle_secs * 1000)) * 100) : st === 'ready' ? 100 : 0
                  return (
                    <button key={p.idx} type="button" className={`po-plot is-${st}`} style={{ left: `${pos.x}%`, top: `${pos.y}%`, '--p': `${pctDone}%` }}
                      onClick={() => setOpen({ plot: p.idx })} aria-label={`${r.field}, level ${p.level}, ${st}`}>
                      {st === 'ready' && <span className="po-plot-pop po-emoji" aria-hidden="true">{r.icon}</span>}
                      <span className="po-plot-ring"><span className="po-plot-lvl">{st === 'empty' ? '+' : p.level}</span></span>
                      {st === 'working' && <span className="po-plot-time">{fmtTime(Date.parse(p.ends_at) - t)}</span>}
                      {st === 'idle' && <span className="po-plot-time is-idle">Start</span>}
                    </button>
                  )
                })}
              </div>
            )}
            {tab === 'city' && (
              <div className="po-scene" style={{ aspectRatio: SCENE_RATIO }}>
                <img className="po-scene-img" src="/polis/city.webp" alt="" draggable="false" />
                {PAD_POS.map((pos, pad) => {
                  const b = s.buildings.find((x) => x.pad === pad)
                  const target = v.build_target === `pad:${pad}`
                  return (
                    <button key={pad} type="button" className={`po-pad${b ? ' is-built' : ' is-empty'}${target ? ' is-building' : ''}`}
                      style={{ left: `${pos.x}%`, top: `${pos.y}%` }} onClick={() => setOpen({ pad })}
                      aria-label={b ? `${BUILDINGS[b.kind]?.name} level ${b.level}` : 'Empty place: build here'}>
                      {b ? (
                        <>
                          <img className={`po-bimg is-t${tierOf(b.level)}`} src={buildingImg(b.kind, b.level)} alt="" draggable="false" />
                          <span className="po-pad-lvl">{b.level}</span>
                        </>
                      ) : target ? (
                        <img className="po-bimg is-t1 is-ghost" src={buildingImg(v.build_kind, 1)} alt="" draggable="false" />
                      ) : <span className="po-pad-plus">+</span>}
                      {target && <span className="po-pad-time">🔨 {fmtTime(Date.parse(v.build_until) - t)}</span>}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </main>

        {/* ---- painéis do lado: a vila, a obra e o dia */}
        <aside className="po-side">
          <section className="po-panel">
            <p className="po-label">Construction</p>
            {building ? <p className="po-panel-row">🔨 <b>{building.name}</b> → Lv {building.level}<span>{fmtTime(building.left)}</span></p>
              : <p className="po-panel-row">🔨 Builders are free</p>}
          </section>
          <section className="po-panel">
            <p className="po-label">Your day</p>
            {ready.length > 0 && (
              <button type="button" className="po-btn po-btn-go po-pulse" disabled={busy} onClick={async () => {
                for (const p of ready) if (!(await act('polis_plot_collect', { p_idx: p.idx }))) break
              }}>Collect all ({ready.length})</button>
            )}
            <p className="po-panel-row">✨ Ready to collect<span>{ready.length}</span></p>
            <p className="po-panel-row">⏳ Growing<span>{s.plots.filter((p) => plotState(p) === 'working').length}</span></p>
            <p className="po-panel-row">💤 Waiting for you<span>{idle.length}</span></p>
          </section>
          <section className="po-panel">
            <p className="po-label">Production per hour</p>
            {RES.map((r) => (
              <p key={r.id} className="po-panel-row"><span className="po-emoji" aria-hidden="true">{r.icon}</span> {r.label}
                <span>{fmtNum(s.plots.filter((p) => p.kind === r.id).reduce((a, p) => a + Number(p.rate), 0))}</span></p>
            ))}
            <p className="po-note">The base rate of all your plots. Short cycles pay more per hour.</p>
          </section>
        </aside>
      </div>

      {open && (
        <div className="po-sheet-back" onClick={() => setOpen(null)}>
          <div className="po-sheet" role="dialog" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="po-sheet-x" aria-label="Close" onClick={() => setOpen(null)}>×</button>
            {'plot' in open
              ? <PlotPanel p={s.plots.find((x) => x.idx === open.plot)} v={v} cycles={s.cycles} st={plotState(s.plots.find((x) => x.idx === open.plot))} t={t} busy={busy} err={err}
                cap={capOf(s.plots.find((x) => x.idx === open.plot).kind)}
                onStart={(secs) => act('polis_plot_start', { p_idx: open.plot, p_secs: secs }, `Started: ${CYCLE_LABEL[secs]}`)}
                onCollect={() => act('polis_plot_collect', { p_idx: open.plot })}
                onUpgrade={() => act('polis_plot_upgrade', { p_idx: open.plot }, 'Construction started')} />
              : <PadPanel pad={open.pad} s={s} busy={busy} err={err}
                onBuild={(kind) => act('polis_build', { p_pad: open.pad, p_kind: kind }, 'Construction started', true)} />}
          </div>
        </div>
      )}
      {soon && (
        <div className="po-sheet-back" onClick={() => setSoon(null)}>
          <div className="po-sheet po-soon" role="dialog" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="po-sheet-x" aria-label="Close" onClick={() => setSoon(null)}>×</button>
            <span className="po-soon-icon po-emoji" aria-hidden="true">{soon.icon}</span>
            <h2>{soon.label}</h2>
            <p className="po-sub">Coming soon. For now, take care of your fields and build your city.</p>
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
const blockReason = (c, v) => (v.build_kind ? 'Builders are busy' : !canPay(c, v) ? 'Not enough resources' : '')

function PlotPanel({ p, v, cycles, st, t, busy, err, cap, onStart, onCollect, onUpgrade }) {
  const r = RES_BY[p.kind]
  const [pick, setPick] = useState(3600)
  const upgrading = v.build_target === `plot:${p.idx}`
  return (
    <>
      <h2><span className="po-emoji" aria-hidden="true">{r.icon}</span> {r.field} <em>{p.level ? `Lv ${p.level}` : 'empty plot'}</em></h2>
      {st === 'empty' && <p className="po-sub">An empty plot. Build a {r.field.toLowerCase()} here to start producing {r.label.toLowerCase()}.</p>}
      {st !== 'empty' && <p className="po-sub">Makes <b>{fmtNum(p.rate)} {r.label.toLowerCase()}/hour</b>.</p>}
      {st === 'idle' && (
        <>
          <p className="po-label">How long should it work?</p>
          <div className="po-cycles">
            {cycles.map((c) => (
              <button key={c.secs} type="button" className={`po-cycle${pick === c.secs ? ' is-on' : ''}`} onClick={() => setPick(c.secs)}>
                <b>{CYCLE_LABEL[c.secs]}</b><span>+{fmtNum(Math.round(p.rate * (c.secs / 3600) * c.mult))}</span>
              </button>
            ))}
          </div>
          <p className="po-note">Short cycles pay more per hour if you come back often. Long cycles keep working while you sleep.</p>
          <button type="button" className="po-btn po-btn-go" disabled={busy} onClick={() => onStart(pick)}>Start · {CYCLE_LABEL[pick]}</button>
        </>
      )}
      {st === 'working' && (
        <div className="po-run">
          <p>Growing ({CYCLE_LABEL[p.cycle_secs]}) · <b>+{fmtNum(p.harvest)}</b> {r.label.toLowerCase()}</p>
          <div className="po-run-bar"><i style={{ width: `${Math.min(100, ((t - Date.parse(p.started_at)) / (p.cycle_secs * 1000)) * 100)}%` }} /></div>
          <p className="po-note">Ready in {fmtTime(Date.parse(p.ends_at) - t)} (at {new Date(Date.parse(p.ends_at)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}).</p>
        </div>
      )}
      {st === 'ready' && (
        <div className="po-run">
          <p>Harvest ready: <b>+{fmtNum(p.harvest)}</b> {r.label.toLowerCase()}</p>
          <button type="button" className="po-btn po-btn-go po-pulse" disabled={busy} onClick={onCollect}>Collect</button>
          {v[p.kind] >= cap && <p className="po-err">Your {p.kind === 'grain' ? 'granary' : 'storehouse'} is full. Spend some or upgrade it.</p>}
        </div>
      )}
      {err && <p className="po-err" role="alert">{err}</p>}
      {p.next && (
        <div className="po-upgrade">
          <p className="po-label">{p.level ? `Upgrade to Lv ${p.level + 1}` : `Build a ${r.field}`}</p>
          <p className="po-gain">{p.level ? `${fmtNum(p.rate)} → ${fmtNum(p.next_rate)} per hour` : `${fmtNum(p.next_rate)} ${r.label.toLowerCase()} per hour`}</p>
          <Cost c={p.next} v={v} />
          <button type="button" className="po-btn" disabled={busy || upgrading || !!blockReason(p.next, v)} onClick={onUpgrade}>
            {upgrading ? 'Under construction…' : blockReason(p.next, v) || (p.level ? 'Upgrade' : 'Build')}
          </button>
        </div>
      )}
    </>
  )
}

function PadPanel({ pad, s, busy, err, onBuild }) {
  const v = s.village
  const b = s.buildings.find((x) => x.pad === pad)
  const target = v.build_target === `pad:${pad}`
  if (b) {
    const meta = BUILDINGS[b.kind] ?? { name: b.kind, text: '', effect: () => '' }
    return (
      <>
        <div className="po-bhead">
          <img src={buildingImg(b.kind, b.level)} alt="" />
          <div><h2>{meta.name} <em>Lv {b.level}</em></h2><p className="po-sub">{meta.text}</p></div>
        </div>
        <p className="po-gain">{meta.effect(b.level)}</p>
        {err && <p className="po-err" role="alert">{err}</p>}
        {b.next ? (
          <div className="po-upgrade">
            <p className="po-label">Upgrade to Lv {b.level + 1}</p>
            <p className="po-gain">{meta.effect(b.level + 1)}</p>
            <Cost c={b.next} v={v} />
            <button type="button" className="po-btn" disabled={busy || target || !!blockReason(b.next, v)} onClick={() => onBuild(b.kind)}>
              {target ? 'Under construction…' : blockReason(b.next, v) || 'Upgrade'}
            </button>
          </div>
        ) : <p className="po-note">Top level reached.</p>}
      </>
    )
  }
  if (target) return <><h2>Under construction</h2><p className="po-sub">Your builders are working here.</p></>
  const list = s.catalog.filter((c) => !c.built && !(c.needs ?? '').startsWith('Another tribe'))
  return (
    <>
      <h2>Build here</h2>
      <p className="po-sub">Choose what to build on this place.</p>
      {err && <p className="po-err" role="alert">{err}</p>}
      <div className="po-buildlist">
        {list.map((c) => {
          const meta = BUILDINGS[c.kind]
          const why = c.needs ? `Needs ${c.needs}` : blockReason(c.cost, v)
          return (
            <div key={c.kind} className={`po-buildcard${c.needs ? ' is-locked' : ''}`}>
              <img src={buildingImg(c.kind, 1)} alt="" />
              <div className="po-buildcard-text">
                <b>{meta?.name ?? c.kind}</b>
                <small>{meta?.text}</small>
                <Cost c={c.cost} v={v} />
              </div>
              <button type="button" className="po-btn" disabled={busy || !!why} onClick={() => onBuild(c.kind)}>{why || 'Build'}</button>
            </div>
          )
        })}
        {list.length === 0 && <p className="po-note">You built everything available. More buildings come in the next updates.</p>}
      </div>
    </>
  )
}
