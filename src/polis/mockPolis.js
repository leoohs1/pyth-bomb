// SÓ NO COMPUTADOR (npm run dev + ?mock=1): imita as funções polis_* do Supabase na memória, com as mesmas regras do
// supabase/polis/G01 + G02 + G03 + G04 + G05, pra testar as telas sem criar nada no banco de verdade. ?mock=1&fast=60 = o tempo passa
// 60x mais rápido (30 min viram 30 s). Nunca entra no site publicado.
const QS = new URLSearchParams(window.location.search)
const FAST = Math.max(1, Number(QS.get('fast')) || 1)
const t0 = Date.now()
const clock = () => t0 + (Date.now() - t0) * FAST
export const mockNow = () => clock()
const iso = (ms) => new Date(ms).toISOString()

const PLOT_KIND = ['grain', 'wood', 'bronze', 'wood', 'grain', 'marble', 'marble', 'grain', 'grain', 'wood', 'bronze', 'marble', 'bronze', 'wood']
const KINDS = ['agora', 'storehouse', 'granary', 'docks', 'cellar', 'barracks', 'market', 'temple', 'agoge', 'harbor', 'sanctuary']
const RES = ['grain', 'wood', 'marble', 'bronze']
const rate = (l) => (l <= 0 ? 0 : Math.round(40 * 1.35 ** (l - 1)))
const MULT = { 1800: 2.6, 3600: 2.3, 21600: 1.6, 43200: 1.25, 86400: 1.0 }
const cap = (l) => (l <= 0 ? 800 : Math.round(1200 * 1.5 ** (l - 1)))
const BASE = {
  grain: [20, 70, 50, 20], wood: [40, 30, 60, 30], marble: [40, 70, 20, 40], bronze: [50, 60, 60, 10],
  storehouse: [30, 90, 110, 40], granary: [40, 100, 80, 30], docks: [60, 120, 60, 50], agora: [70, 90, 120, 60], cellar: [40, 60, 90, 20],
  barracks: [90, 120, 80, 130], market: [80, 110, 90, 60], temple: [120, 100, 200, 90],
}
// G05: tudo custa OURO = a soma dos materiais antigos (mesma curva)
const cost = (kind, to) => {
  const f = to <= 1 ? 0.5 : 1.6 ** (to - 2), b = BASE[kind] ?? [120, 150, 150, 150]
  return { gold: Math.round(b.reduce((x, y) => x + y, 0) * f), secs: to <= 1 ? 60 : Math.round(120 * 1.7 ** (to - 2)) }
}
// Market (G05): preço base de cada mercadoria + um passeio aleatório pra imitar o preço ao vivo da Pyth
const MKT = [['grain', 'Wheat', 0.8], ['wood', 'Cotton', 0.9], ['marble', 'Aluminium', 1.0], ['bronze', 'Copper', 1.2], ['fish', 'Live cattle', 1.1]]
const drift = Object.fromEntries(MKT.map(([k]) => [k, 1]))
setInterval(() => { for (const k in drift) drift[k] = Math.min(1.3, Math.max(0.75, drift[k] * (1 + (Math.random() - 0.5) * 0.01))) }, 3000)
const priceOf = (k) => Math.round(MKT.find((m) => m[0] === k)[2] * drift[k] * 1000) / 1000
let db = null
// pesca (G03): 1 barco sem docas, 2/3/4 com docas nível 1/4/8; 45 peixes/h por barco, +10% por nível de docas, atenienses +20%
// herói (G04): nível L precisa de 25·L·(L-1) XP; aventuras 30 min / 2 h / 8 h
const ADVS = [{ kind: 0, secs: 1800, xp: 10, loot: 150 }, { kind: 1, secs: 7200, xp: 35, loot: 480 }, { kind: 2, secs: 28800, xp: 120, loot: 1500 }]
const heroLevel = (xp) => Math.min(20, Math.floor((1 + Math.sqrt(1 + (8 * xp) / 50)) / 2))
const xpFor = (l) => 25 * l * (l - 1)
const heroJson = () => {
  const h = db.hero, l = heroLevel(h.xp)
  return { name: h.name, color: h.color, xp: h.xp, level: l, xp_level: xpFor(l), xp_next: l < 20 ? xpFor(l + 1) : null, loot_mult: Math.round((1 + 0.1 * (l - 1)) * 100) / 100,
    adventure: h.adv ? { kind: h.adv.kind, started_at: iso(h.adv.started_at), ends_at: iso(h.adv.ends_at), loot: h.adv.loot } : null, adventures: ADVS }
}
const boatCount = (d) => 1 + (d >= 1) + (d >= 4) + (d >= 8)
const fishRate = (d, tribe) => Math.round(45 * (1 + 0.1 * d) * (tribe === 'athenian' ? 1.2 : 1))
let logged = false
const lvl = (kind) => db.buildings.find((b) => b.kind === kind)?.level ?? 0
const needs = (kind) => {
  if (['agora', 'storehouse', 'granary', 'docks'].includes(kind)) return null
  if (['cellar', 'barracks'].includes(kind)) return lvl('agora') >= 3 ? null : 'Agora level 3'
  if (kind === 'market') return lvl('agora') >= 5 ? null : 'Agora level 5'
  if (kind === 'temple') return lvl('agora') >= 7 ? null : 'Agora level 7'
  const own = { agoge: 'spartan', harbor: 'athenian', sanctuary: 'delphian' }[kind]
  if (own !== db.tribe) return "Another tribe's building"
  return lvl('barracks') >= 5 ? null : 'Barracks level 5'
}
function settle() {
  const v = db.v
  if (!v.build_kind || v.build_until > clock()) return
  const [type, n] = v.build_target.split(':')
  if (type === 'plot') db.plots[n].level = v.build_level
  else { const b = db.buildings.find((x) => x.pad === Number(n)); if (b) b.level = v.build_level; else db.buildings.push({ pad: Number(n), kind: v.build_kind, level: v.build_level }) }
  Object.assign(v, { build_kind: null, build_level: null, build_until: null, build_target: null })
}
function state() {
  if (!logged || !db) return { logged_in: false, now: iso(clock()) }
  settle()
  const v = db.v
  return {
    logged_in: true, now: iso(clock()), user: db.user, tribe: db.tribe,
    village: {
      name: v.name, grain: Math.floor(v.grain), wood: Math.floor(v.wood), marble: Math.floor(v.marble), bronze: Math.floor(v.bronze), fish: Math.floor(v.fish), gold: Math.floor(v.gold),
      store_cap: cap(lvl('storehouse')), granary_cap: cap(lvl('granary')),
      build_kind: v.build_kind, build_level: v.build_level, build_until: v.build_until ? iso(v.build_until) : null, build_target: v.build_target,
    },
    plots: db.plots.map((p, idx) => ({ idx, kind: p.kind, level: p.level, rate: rate(p.level), cycle_secs: p.cycle_secs, started_at: p.started_at ? iso(p.started_at) : null, ends_at: p.ends_at ? iso(p.ends_at) : null, harvest: p.harvest, next: p.level < 10 ? cost(p.kind, p.level + 1) : null, next_rate: rate(p.level + 1) })),
    boats: Array.from({ length: boatCount(lvl('docks')) }, (_, i) => { const b = db.boats[i] ?? {}; return { boat: i, cycle_secs: b.cycle_secs ?? null, started_at: b.started_at ? iso(b.started_at) : null, ends_at: b.ends_at ? iso(b.ends_at) : null, catch: b.catch ?? 0 } }),
    hero: heroJson(),
    market: MKT.map(([kind, label, base]) => ({ kind, label, base, price: priceOf(kind), change: Math.round((drift[kind] - 1) * 10000) / 100, live: true })),
    fishing: { rate: fishRate(lvl('docks'), db.tribe), docks: lvl('docks'), next_boat_at: lvl('docks') < 1 ? 1 : lvl('docks') < 4 ? 4 : lvl('docks') < 8 ? 8 : null },
    buildings: [...db.buildings].sort((a, b) => a.pad - b.pad).map((b) => ({ ...b, next: b.level < 10 ? cost(b.kind, b.level + 1) : null })),
    catalog: KINDS.map((k) => ({ kind: k, cost: cost(k, 1), needs: needs(k), built: db.buildings.some((b) => b.kind === k) })),
    cycles: Object.entries(MULT).map(([secs, mult]) => ({ secs: Number(secs), mult })),
  }
}
const fail = (message) => ({ data: null, error: { message } })
const ok = (data) => ({ data, error: null })
function queue(target, kind, to) {
  const v = db.v
  if (v.build_kind) return 'Your builders are busy. Wait for the current construction'
  if (to > 10) return 'Already at the top level'
  const c = cost(kind, to)
  if (v.gold < c.gold) return 'Not enough gold. Sell goods at the Market'
  v.gold -= c.gold
  const secs = Math.round(c.secs * (1 - Math.min(0.45, 0.05 * Math.max(0, (lvl('agora') || 1) - 1))))
  Object.assign(v, { build_kind: kind, build_level: to, build_target: target, build_until: clock() + secs * 1000 })
  return null
}

export async function mockRpc(fn, a = {}) {
  await new Promise((r) => setTimeout(r, 100))
  const now = clock()
  if (logged && db) settle()
  switch (fn) {
    case 'polis_state': return ok(state())
    case 'polis_register': {
      if (!/^[a-z0-9_]{3,16}$/.test((a.p_username || '').trim().toLowerCase())) return fail('Username: 3 to 16 letters, numbers or _')
      if ((a.p_password || '').length < 6) return fail('Password: at least 6 characters')
      if ((a.p_village || '').trim().length < 2) return fail('Give your village a name (2 to 24 characters)')
      if (!['spartan', 'athenian', 'delphian'].includes(a.p_tribe)) return fail('Pick a tribe')
      db = {
        user: a.p_username.trim(), pass: a.p_password, tribe: a.p_tribe,
        v: { name: a.p_village.trim().slice(0, 24), grain: 100, wood: 100, marble: 100, bronze: 100, fish: 0, gold: 500, build_kind: null, build_level: null, build_until: null, build_target: null },
        plots: PLOT_KIND.map((kind, i) => ({ kind, level: [0, 1, 2, 5].includes(i) ? 1 : 0, cycle_secs: null, started_at: null, ends_at: null, harvest: 0 })),
        buildings: [{ pad: 1, kind: 'agora', level: 1 }, { pad: 4, kind: 'storehouse', level: 1 }],
        boats: [],
        hero: { name: 'Hero', color: 'purple', xp: 0, adv: null },
      }
      logged = true
      return ok(state())
    }
    case 'polis_login':
      if (!db || db.user.toLowerCase() !== (a.p_username || '').trim().toLowerCase() || db.pass !== a.p_password) return ok({ logged_in: false, error: 'Wrong username or password' })
      logged = true; return ok(state())
    case 'polis_logout': logged = false; return ok(state())
    case 'polis_set_tribe': if (!db.tribe) db.tribe = a.p_tribe; return ok(state())
    case 'polis_plot_start': {
      const p = db.plots[a.p_idx], m = MULT[a.p_secs]
      if (!p) return fail('Unknown plot'); if (!m) return fail('Pick a cycle')
      if (p.level < 1) return fail('Build this plot first'); if (p.started_at) return fail('This plot is already working')
      Object.assign(p, { cycle_secs: a.p_secs, started_at: now, ends_at: now + a.p_secs * 1000, harvest: Math.round(rate(p.level) * (a.p_secs / 3600) * m) })
      return ok(state())
    }
    case 'polis_plot_collect': {
      const p = db.plots[a.p_idx], v = db.v
      if (!p?.started_at) return fail('Nothing to collect here'); if (p.ends_at > now) return fail('Not ready yet')
      const c = p.kind === 'grain' ? cap(lvl('granary')) : cap(lvl('storehouse'))
      const moved = Math.min(Math.max(0, c - v[p.kind]), p.harvest)
      if (moved <= 0) return fail(p.kind === 'grain' ? 'Your granary is full. Spend some or upgrade it' : 'Your storehouse is full. Spend some or upgrade it')
      v[p.kind] += moved
      const left = p.harvest - moved
      if (left > 0) p.harvest = left; else Object.assign(p, { cycle_secs: null, started_at: null, ends_at: null, harvest: 0 })
      return ok({ ...state(), collected: { kind: p.kind, amount: moved, left } })
    }
    case 'polis_fish_start': {
      const m = MULT[a.p_secs]
      if (!m) return fail('Pick a cycle: 30 min, 1 h, 6 h, 12 h or 24 h')
      if (!(a.p_boat >= 0 && a.p_boat < boatCount(lvl('docks')))) return fail('Build the Docks to get more boats')
      const b = (db.boats[a.p_boat] ??= {})
      if (b.started_at) return fail('This boat is already at sea')
      Object.assign(b, { cycle_secs: a.p_secs, started_at: now, ends_at: now + a.p_secs * 1000, catch: Math.round(fishRate(lvl('docks'), db.tribe) * (a.p_secs / 3600) * m + 1e-9) })
      return ok(state())
    }
    case 'polis_fish_collect': {
      const b = db.boats[a.p_boat], v = db.v
      if (!b?.started_at) return fail('This boat is at the pier'); if (b.ends_at > now) return fail('Still fishing')
      const moved = Math.min(Math.max(0, cap(lvl('granary')) - v.fish), b.catch)
      if (moved <= 0) return fail('Your granary is full of fish. Spend some or upgrade it')
      v.fish += moved
      const left = b.catch - moved
      if (left > 0) b.catch = left; else Object.assign(b, { cycle_secs: null, started_at: null, ends_at: null, catch: 0 })
      return ok({ ...state(), collected: { kind: 'fish', amount: moved, left } })
    }
    case 'polis_sell': {
      if (!['grain', 'wood', 'marble', 'bronze', 'fish'].includes(a.p_kind)) return fail('You cannot sell that')
      const have = Math.floor(db.v[a.p_kind]), n = Math.floor(a.p_amount || 0)
      if (n < 1) return fail('Choose how much to sell'); if (n > have) return fail(`You only have ${have} of that`)
      const price = priceOf(a.p_kind), got = Math.floor(n * price)
      if (got < 1) return fail('Sell a bit more: that is worth less than 1 gold')
      db.v[a.p_kind] -= n; db.v.gold += got
      return ok({ ...state(), sold: { kind: a.p_kind, amount: n, gold: got, price } })
    }
    case 'polis_hero_set': {
      const n = (a.p_name || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 16)
      if (n.length < 2) return fail('Give your hero a name (2 to 16 characters)')
      if (!['purple', 'red', 'blue', 'green', 'gold', 'white'].includes(a.p_color)) return fail('Pick a color')
      Object.assign(db.hero, { name: n, color: a.p_color }); return ok(state())
    }
    case 'polis_hero_go': {
      const adv = ADVS[a.p_kind]; if (!adv) return fail('Unknown adventure')
      if (db.hero.adv) return fail('Your hero is already on an adventure')
      const total = adv.loot * (1 + 0.1 * (heroLevel(db.hero.xp) - 1)), w = RES.concat('fish').map(() => 0.4 + Math.random()), sw = w.reduce((x, y) => x + y)
      const loot = Object.fromEntries(RES.concat('fish').map((k, i) => [k, Math.round((total * w[i]) / sw)])); loot.xp = adv.xp
      db.hero.adv = { kind: adv.kind, started_at: now, ends_at: now + adv.secs * 1000, loot }; return ok(state())
    }
    case 'polis_hero_collect': {
      const h = db.hero, v = db.v
      if (!h.adv) return fail('Your hero is at home'); if (h.adv.ends_at > now) return fail('Your hero is still away')
      const got = {}; let lost = 0
      for (const k of RES.concat('fish')) { const c = k === 'grain' || k === 'fish' ? cap(lvl('granary')) : cap(lvl('storehouse')); got[k] = Math.min(h.adv.loot[k], Math.max(0, c - v[k])); v[k] += got[k]; lost += h.adv.loot[k] - got[k] }
      const before = heroLevel(h.xp), xp = h.adv.loot.xp; h.xp += xp; h.adv = null
      return ok({ ...state(), collected: { kind: 'hero', loot: got, xp, level_up: heroLevel(h.xp) > before, lost } })
    }
    case 'polis_plot_upgrade': { const p = db.plots[a.p_idx]; const e = queue(`plot:${a.p_idx}`, p.kind, p.level + 1); return e ? fail(e) : ok(state()) }
    case 'polis_build': {
      const b = db.buildings.find((x) => x.pad === a.p_pad)
      if (b) { const e = queue(`pad:${a.p_pad}`, b.kind, b.level + 1); return e ? fail(e) : ok(state()) }
      if (!KINDS.includes(a.p_kind)) return fail('Unknown building')
      if (db.buildings.some((x) => x.kind === a.p_kind)) return fail('You already have this building')
      const n = needs(a.p_kind); if (n) return fail(`Needs ${n}`)
      const e = queue(`pad:${a.p_pad}`, a.p_kind, 1); return e ? fail(e) : ok(state())
    }
    default: return fail('unknown ' + fn)
  }
}
