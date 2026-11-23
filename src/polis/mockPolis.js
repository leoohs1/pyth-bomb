// SÓ NO COMPUTADOR (npm run dev + ?mock=1): imita as funções polis_* do Supabase na memória, com as mesmas regras do
// supabase/polis/G01_polis.sql, pra testar as telas sem criar nada no banco de verdade. ?mock=1&fast=60 = o tempo
// passa 60x mais rápido (30 min viram 30 s). Nunca entra no site publicado.
const QS = new URLSearchParams(window.location.search)
const FAST = Math.max(1, Number(QS.get('fast')) || 1)
const t0 = Date.now()
const clock = () => t0 + (Date.now() - t0) * FAST
const iso = (ms) => new Date(ms).toISOString()

const rate = (l) => Math.round(40 * 1.35 ** (Math.max(1, l) - 1))
const MULT = { 1800: 2.6, 3600: 2.3, 21600: 1.6, 43200: 1.25, 86400: 1.0 }
const cap = (l) => Math.round(1200 * 1.5 ** (Math.max(1, l) - 1))
const BASE = {
  grain: { grain: 20, wood: 70, marble: 50, bronze: 20 }, wood: { grain: 40, wood: 30, marble: 60, bronze: 30 },
  marble: { grain: 40, wood: 70, marble: 20, bronze: 40 }, bronze: { grain: 50, wood: 60, marble: 60, bronze: 10 },
  warehouse: { grain: 30, wood: 90, marble: 110, bronze: 40 },
}
const cost = (kind, to) => {
  const f = 1.6 ** (Math.max(2, to) - 2), b = BASE[kind]
  return { grain: Math.round(b.grain * f), wood: Math.round(b.wood * f), marble: Math.round(b.marble * f), bronze: Math.round(b.bronze * f), secs: Math.round(120 * 1.7 ** (Math.max(2, to) - 2)) }
}
const KINDS = ['grain', 'wood', 'marble', 'bronze']
let db = null // { user, v: {...}, fields: {kind: {...}} }
let logged = false

function settle() {
  const v = db.v
  if (!v.build_kind || v.build_until > clock()) return
  if (v.build_kind === 'warehouse') v.warehouse = v.build_level
  else db.fields[v.build_kind].level = v.build_level
  v.build_kind = v.build_level = v.build_until = null
}
function state() {
  if (!logged || !db) return { logged_in: false, now: iso(clock()) }
  settle()
  const v = db.v
  return {
    logged_in: true, now: iso(clock()), user: db.user,
    village: {
      name: v.name, grain: Math.floor(v.grain), wood: Math.floor(v.wood), marble: Math.floor(v.marble), bronze: Math.floor(v.bronze),
      warehouse: v.warehouse, capacity: cap(v.warehouse), warehouse_next: v.warehouse < 10 ? cost('warehouse', v.warehouse + 1) : null,
      capacity_next: v.warehouse < 10 ? cap(v.warehouse + 1) : null, build_kind: v.build_kind, build_level: v.build_level, build_until: v.build_until ? iso(v.build_until) : null,
    },
    fields: KINDS.map((k) => { const f = db.fields[k]; return { kind: k, level: f.level, rate: rate(f.level), cycle_secs: f.cycle_secs, started_at: f.started_at ? iso(f.started_at) : null, ends_at: f.ends_at ? iso(f.ends_at) : null, harvest: f.harvest, next: f.level < 10 ? cost(k, f.level + 1) : null, next_rate: f.level < 10 ? rate(f.level + 1) : null } }),
    cycles: Object.entries(MULT).map(([secs, mult]) => ({ secs: Number(secs), mult })),
  }
}
const fail = (message) => ({ data: null, error: { message } })
const ok = (data) => ({ data, error: null })

export async function mockRpc(fn, a = {}) {
  await new Promise((r) => setTimeout(r, 120))
  const now = clock()
  switch (fn) {
    case 'polis_state': return ok(state())
    case 'polis_register': {
      if (!/^[a-z0-9_]{3,16}$/.test((a.p_username || '').trim().toLowerCase())) return fail('Username: 3 to 16 letters, numbers or _')
      if ((a.p_password || '').length < 6) return fail('Password: at least 6 characters')
      if ((a.p_village || '').trim().length < 2) return fail('Give your village a name (2 to 24 characters)')
      db = { user: a.p_username.trim(), pass: a.p_password, v: { name: a.p_village.trim().slice(0, 24), grain: 500, wood: 500, marble: 500, bronze: 500, warehouse: 1, build_kind: null, build_level: null, build_until: null }, fields: Object.fromEntries(KINDS.map((k) => [k, { level: 1, cycle_secs: null, started_at: null, ends_at: null, harvest: 0 }])) }
      logged = true
      return ok(state())
    }
    case 'polis_login':
      if (!db || db.user.toLowerCase() !== (a.p_username || '').trim().toLowerCase() || db.pass !== a.p_password) return ok({ logged_in: false, error: 'Wrong username or password' })
      logged = true; return ok(state())
    case 'polis_logout': logged = false; return ok(state())
    case 'polis_start': {
      if (!logged) return fail('Log in first')
      settle()
      const f = db.fields[a.p_kind], m = MULT[a.p_secs]
      if (!f) return fail('Unknown field'); if (!m) return fail('Pick a cycle: 30 min, 1 h, 6 h, 12 h or 24 h')
      if (f.started_at) return fail('This field is already working')
      Object.assign(f, { cycle_secs: a.p_secs, started_at: now, ends_at: now + a.p_secs * 1000, harvest: Math.round(rate(f.level) * (a.p_secs / 3600) * m) })
      return ok(state())
    }
    case 'polis_collect': {
      if (!logged) return fail('Log in first')
      settle()
      const f = db.fields[a.p_kind], v = db.v
      if (!f?.started_at) return fail('Nothing to collect here'); if (f.ends_at > now) return fail('Not ready yet')
      const moved = Math.min(Math.max(0, cap(v.warehouse) - v[a.p_kind]), f.harvest)
      if (moved <= 0) return fail('Your warehouse is full. Spend some or upgrade it')
      v[a.p_kind] += moved
      const left = f.harvest - moved
      if (left > 0) f.harvest = left; else Object.assign(f, { cycle_secs: null, started_at: null, ends_at: null, harvest: 0 })
      return ok({ ...state(), collected: { kind: a.p_kind, amount: moved, left } })
    }
    case 'polis_upgrade': {
      if (!logged) return fail('Log in first')
      settle()
      const v = db.v
      if (v.build_kind) return fail('Your builders are busy. Wait for the current construction')
      const lvl = a.p_kind === 'warehouse' ? v.warehouse : db.fields[a.p_kind]?.level
      if (!lvl) return fail('Unknown building'); if (lvl >= 10) return fail('Already at the top level')
      const c = cost(a.p_kind, lvl + 1)
      if (KINDS.some((k) => v[k] < c[k])) return fail('Not enough resources')
      for (const k of KINDS) v[k] -= c[k]
      Object.assign(v, { build_kind: a.p_kind, build_level: lvl + 1, build_until: now + c.secs * 1000 })
      return ok(state())
    }
    default: return fail('unknown ' + fn)
  }
}

// relógio da imitação (pra contagem regressiva da tela andar na mesma velocidade)
export const mockNow = () => clock()
