// Aba Herói (G04): retrato grande, nível e XP, nome e cor da capa, e as aventuras (30 min / 2 h / 8 h) que trazem
// recursos misturados + XP. O sorteio do saque acontece no servidor quando ele sai; aqui é só mostrar.
import { useEffect, useState } from 'react'
import { Sprite } from './PolisPeople'
import { BAR, fmtNum, fmtTime } from './polisData'

export const HERO_COLORS = [
  { id: 'purple', label: 'Purple', css: '#8e44ad' }, { id: 'red', label: 'Red', css: '#c0392b' }, { id: 'blue', label: 'Blue', css: '#2e6fd8' },
  { id: 'green', label: 'Green', css: '#27ae60' }, { id: 'gold', label: 'Gold', css: '#f1c40f' }, { id: 'white', label: 'White', css: '#ecf0f1' },
]
export const heroFace = (color) => `/polis/c/hero-face${color && color !== 'purple' ? `-${color}` : ''}.webp`

// 2 histórias por aventura, trocam a cada dia (só o texto; as regras são as mesmas)
const STORIES = [
  [{ title: 'Olive Thieves', text: 'Chase the thieves raiding the olive groves.' }, { title: 'Wolves at the Fold', text: 'Scare the wolves away from the sheep.' }],
  [{ title: "The Shepherd's Flock", text: 'Find the flock lost in the mountains.' }, { title: 'The Broken Bridge', text: 'Help the villagers rebuild the old bridge.' }],
  [{ title: 'Cave of Echoes', text: 'Explore the old cave beyond the hills.' }, { title: 'The Sunken Shrine', text: 'Dive for the treasures of a forgotten shrine.' }],
]
export const storyOf = (kind, at) => STORIES[kind][Math.floor((at ? Date.parse(at) : Date.now()) / 86400000) % 2]
const DUR = { 1800: '30 min', 7200: '2 h', 28800: '8 h' }

export const heroState = (h, t) => (!h?.adventure ? 'home' : Date.parse(h.adventure.ends_at) <= t ? 'back' : 'away')

export function HeroScreen({ s, t, busy, err, onSave, onGo, onCollect }) {
  const h = s.hero
  const st = heroState(h, t)
  const [name, setName] = useState(h.name)
  const [color, setColor] = useState(h.color)
  useEffect(() => { setName(h.name); setColor(h.color) }, [h.name, h.color])
  const changed = name.trim() !== h.name || color !== h.color
  const span = (h.xp_next ?? h.xp) - h.xp_level
  const adv = h.adventure
  return (
    <div className="po-hero">
      <section className="po-hero-card">
        <div className="po-hero-stage" style={{ '--cape': HERO_COLORS.find((c) => c.id === color)?.css }}>
          {st === 'home'
            ? <span className="po-hero-big"><Sprite anim="heroIdle" hero color={color} /></span>
            : <span className="po-hero-away"><span className="po-emoji" aria-hidden="true">{st === 'back' ? '🎒' : '🗺️'}</span>{st === 'back' ? 'Back home!' : 'Away on an adventure'}</span>}
        </div>
        <h2>{h.name}</h2>
        <p className="po-hero-lvl"><b>Level {h.level}</b>{h.xp_next ? <span>{fmtNum(h.xp)} / {fmtNum(h.xp_next)} XP</span> : <span>Top level</span>}</p>
        <div className="po-run-bar"><i style={{ width: `${h.xp_next ? Math.min(100, ((h.xp - h.xp_level) / Math.max(1, span)) * 100) : 100}%` }} /></div>
        <p className="po-note">Every level makes the loot of adventures 10% bigger (now ×{Number(h.loot_mult).toFixed(1)}).</p>

        <p className="po-label">Appearance</p>
        <label className="po-field"><span>Name</span>
          <input value={name} maxLength={16} onChange={(e) => setName(e.target.value)} placeholder="e.g. Achilleus" />
        </label>
        <div className="po-swatches" role="radiogroup" aria-label="Cape color">
          {HERO_COLORS.map((c) => (
            <button key={c.id} type="button" role="radio" aria-checked={color === c.id} aria-label={c.label} title={c.label}
              className={`po-swatch${color === c.id ? ' is-on' : ''}`} onClick={() => setColor(c.id)}>
              <img src={heroFace(c.id)} alt="" /><i style={{ background: c.css }} />
            </button>
          ))}
        </div>
        <button type="button" className="po-btn po-btn-go" disabled={busy || !changed || name.trim().length < 2} onClick={() => onSave(name.trim(), color)}>Save</button>
      </section>

      <section className="po-hero-advs">
        <h2>Adventures</h2>
        <p className="po-sub">Send your hero away. He comes back with a sack of resources and experience.</p>
        {err && <p className="po-err" role="alert">{err}</p>}
        {st === 'back' && (
          <div className="po-hero-back">
            <p><b>{h.name} is back from “{storyOf(adv.kind, adv.started_at).title}”!</b></p>
            <div className="po-loot">
              {BAR.map((r) => <span key={r.id}><span className="po-emoji" aria-hidden="true">{r.icon}</span>+{fmtNum(adv.loot[r.id])}</span>)}
              <span>⭐ +{adv.loot.xp} XP</span>
            </div>
            <button type="button" className="po-btn po-btn-go po-pulse" disabled={busy} onClick={onCollect}>Collect the loot</button>
            <p className="po-note">What does not fit in your storehouse or granary stays behind.</p>
          </div>
        )}
        {h.adventures.map((a) => {
          const story = storyOf(a.kind, adv?.kind === a.kind ? adv.started_at : null)
          const running = st === 'away' && adv.kind === a.kind
          return (
            <div key={a.kind} className={`po-adv${running ? ' is-on' : ''}`}>
              <div className="po-adv-text">
                <b>{story.title}</b>
                <small>{story.text}</small>
                <span className="po-adv-meta">⏱ {DUR[a.secs]} · ⭐ {a.xp} XP · 🎒 about {fmtNum(a.loot * h.loot_mult)} resources</span>
                {running && (
                  <>
                    <span className="po-run-bar"><i style={{ width: `${Math.min(100, ((t - Date.parse(adv.started_at)) / (a.secs * 1000)) * 100)}%` }} /></span>
                    <span className="po-adv-meta">Back in {fmtTime(Date.parse(adv.ends_at) - t)}</span>
                  </>
                )}
              </div>
              {st === 'home' && <button type="button" className="po-btn po-btn-go" disabled={busy} onClick={() => onGo(a.kind)}>Send</button>}
            </div>
          )
        })}
        {st !== 'home' && <p className="po-note">One adventure at a time.</p>}
      </section>
    </div>
  )
}

// painel pequeno do herói, sempre à vista (coluna da esquerda em tela grande, topo da coluna da direita nas menores):
// acompanha a aventura enquanto você olha Recursos, Cidade etc. (Halls, 2026-11-24)
export function HeroSide({ s, t, busy, onGo, onCollect, onOpen, className = '' }) {
  const h = s.hero
  const st = heroState(h, t)
  const adv = h.adventure
  const span = (h.xp_next ?? h.xp) - h.xp_level
  return (
    <section className={`po-panel po-heroside ${className}`} style={{ '--cape': HERO_COLORS.find((c) => c.id === h.color)?.css }}>
      <p className="po-label">Your hero</p>
      <button type="button" className="po-heroside-top" onClick={onOpen} title="Open your hero">
        <span className="po-heroside-pic">
          {st === 'home' ? <Sprite anim="heroIdle" hero color={h.color} /> : <span className="po-emoji" aria-hidden="true">{st === 'back' ? '🎒' : '🗺️'}</span>}
        </span>
        <span className="po-heroside-name"><b>{h.name}</b><small>Level {h.level} · {fmtNum(h.xp)}{h.xp_next ? ` / ${fmtNum(h.xp_next)}` : ''} XP</small>
          <span className="po-run-bar"><i style={{ width: `${h.xp_next ? Math.min(100, ((h.xp - h.xp_level) / Math.max(1, span)) * 100) : 100}%` }} /></span>
        </span>
      </button>
      {st === 'away' && (
        <div className="po-heroside-adv">
          <p>🗺️ <b>{storyOf(adv.kind, adv.started_at).title}</b></p>
          <span className="po-run-bar"><i style={{ width: `${Math.min(100, ((t - Date.parse(adv.started_at)) / (Date.parse(adv.ends_at) - Date.parse(adv.started_at))) * 100)}%` }} /></span>
          <p className="po-heroside-time">Back in <b>{fmtTime(Date.parse(adv.ends_at) - t)}</b></p>
        </div>
      )}
      {st === 'back' && (
        <div className="po-heroside-adv is-back">
          <p>🎒 <b>Back from {storyOf(adv.kind, adv.started_at).title}!</b></p>
          <div className="po-loot">
            {BAR.map((r) => <span key={r.id}><span className="po-emoji" aria-hidden="true">{r.icon}</span>+{fmtNum(adv.loot[r.id])}</span>)}
            <span>⭐ +{adv.loot.xp}</span>
          </div>
          <button type="button" className="po-btn po-btn-go po-pulse" disabled={busy} onClick={onCollect}>Collect the loot</button>
        </div>
      )}
      {st === 'home' && (
        <div className="po-heroside-list">
          {h.adventures.map((a) => (
            <div key={a.kind} className="po-heroside-row">
              <span><b>{storyOf(a.kind).title}</b><small>⏱ {DUR[a.secs]} · 🎒 ~{fmtNum(a.loot * h.loot_mult)} · ⭐ {a.xp}</small></span>
              <button type="button" className="po-btn po-btn-go" disabled={busy} onClick={() => onGo(a.kind)}>Send</button>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
