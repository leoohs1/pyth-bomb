// Servidor de jogo do Pyth Bomb PVP: Node + WebSocket, "autoridade no servidor".
// O navegador só manda teclas; o servidor roda as regras (src/pvp/engine) 60 vezes por segundo
// e manda o estado da sala 20 vezes por segundo pra quem está jogando ou assistindo.
// Lobby, torneios e partidas ficam só na memória (se o servidor reiniciar, os torneios em andamento acabam).
//
// Rodar no computador:  node server/index.js   (porta 8787; o site em dev conecta em ws://localhost:8787)
// Variáveis (no painel do Railway): PORT (o Railway põe sozinho), SUPABASE_URL, SUPABASE_ANON_KEY,
//   ALLOWED_ORIGINS (opcional, sites que podem conectar, separados por vírgula).
import http from 'node:http'
import { randomInt } from 'node:crypto'
import { WebSocketServer } from 'ws'
import { Tournament, cleanName, cleanHero } from './tournament.js'
import { verifyToken, authReady, supabaseConfig } from './auth.js'
import { startKeepAlive } from './keepalive.js'
import { matchInit, matchSnap } from '../src/pvp/engine/snapshot.js'
import { STEP } from '../src/pvp/engine/constants.js'

const PORT = Number(process.env.PORT) || 8787
const ON_RAILWAY = !!process.env.RAILWAY_ENVIRONMENT
const TEST_BOTS = process.env.ALLOW_TEST_BOTS ? process.env.ALLOW_TEST_BOTS === '1' : !ON_RAILWAY // botão "add test bot" só fora do Railway
const DEV_AUTH = process.env.PVP_DEV_AUTH === '1' && !ON_RAILWAY // só pra testes automáticos no computador
const MAX_TOURNAMENTS = 50
const SNAP_EVERY = 3     // a cada 3 passos (60/3 = 20 por segundo)
const SUMMARY_EVERY = 15 // resumo do torneio: até 4 por segundo (só quando muda)

const ORIGINS = (process.env.ALLOWED_ORIGINS || 'https://pythbomb.com,https://www.pythbomb.com').split(',').map((s) => s.trim()).filter(Boolean)
function originOk(origin) {
  if (!origin) return !ON_RAILWAY // sem Origin = não é navegador (teste local)
  if (ORIGINS.includes(origin)) return true
  try {
    const u = new URL(origin)
    return u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname.endsWith('.vercel.app')
  } catch { return false }
}

const tournaments = new Map() // código -> Tournament
const userSocket = new Map()  // id do usuário -> socket (uma conexão por pessoa)
let now = 0                   // relógio do servidor (segundos de simulação)

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
function newCode() {
  for (;;) {
    let c = ''
    for (let i = 0; i < 6; i++) c += CODE_CHARS[randomInt(0, CODE_CHARS.length)]
    if (!tournaments.has(c)) return c
  }
}

const send = (ws, obj) => { if (ws.readyState === 1) ws.send(typeof obj === 'string' ? obj : JSON.stringify(obj)) }
const fail = (ws, error) => send(ws, { t: 'error', error })

function socketsOf(code) {
  const out = []
  for (const ws of wss.clients) if (ws.pv?.code === code) out.push(ws)
  return out
}

function attach(ws, t) {
  ws.pv.code = t.code
  ws.pv.initRoom = null
  ws.pv.watch = null
  t._last = null // manda o resumo de novo pra todo mundo
}

async function onMessage(ws, msg) {
  const pv = ws.pv
  if (msg.t === 'hello') {
    let id = await verifyToken(msg.token)
    if (!id && DEV_AUTH && typeof msg.devId === 'string') id = 'dev-' + msg.devId.slice(0, 40)
    if (!id) return fail(ws, authReady ? 'Login check failed. Reload the page.' : 'Server login is not configured')
    pv.user = id
    const old = userSocket.get(id)
    if (old && old !== ws) { send(old, { t: 'kicked' }); old.close() }
    userSocket.set(id, ws)
    send(ws, { t: 'hello', id, testBots: TEST_BOTS })
    return
  }
  if (!pv.user) return fail(ws, 'Say hello first')
  const t = pv.code ? tournaments.get(pv.code) : null

  switch (msg.t) {
    case 'create': {
      if (tournaments.size >= MAX_TOURNAMENTS) return fail(ws, 'Too many tournaments right now. Try again later.')
      if (t) t.leave(pv.user, now)
      const code = newCode()
      const nt = new Tournament(code, pv.user, now)
      nt.join(pv.user, { name: cleanName(msg.name) || 'Host', hero: cleanHero(msg.hero) }, now)
      tournaments.set(code, nt)
      attach(ws, nt)
      send(ws, { t: 'joined', code })
      return
    }
    case 'join': {
      const code = String(msg.code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
      const jt = tournaments.get(code)
      if (!jt) return fail(ws, 'Tournament not found. Check the code.')
      if (t && t !== jt) t.leave(pv.user, now)
      const r = jt.join(pv.user, { name: msg.name, hero: msg.hero }, now)
      if (!r.ok) return fail(ws, r.error)
      attach(ws, jt)
      send(ws, { t: 'joined', code, spectator: !!r.spectator })
      return
    }
    case 'hero': if (t) t.setHero(pv.user, msg.hero); return
    case 'start': {
      if (!t) return
      const r = t.start(pv.user, now)
      if (!r.ok) fail(ws, r.error)
      return
    }
    case 'bot': if (t && TEST_BOTS && t.hostId === pv.user) t.addTestBot(now); return
    case 'fill': if (t) t.setFill(pv.user, msg.on); return
    case 'in': if (t) t.input(pv.user, msg); return
    case 'watch': pv.watch = typeof msg.room === 'string' ? msg.room : null; return
    case 'leave': {
      if (t) t.leave(pv.user, now)
      pv.code = null
      pv.initRoom = null
      send(ws, { t: 'left' })
      return
    }
    case 'ping': send(ws, { t: 'pong', at: msg.at }); return
    default: return
  }
}

const server = http.createServer((req, res) => {
  // página simples pra saber se o servidor está de pé (o Railway usa pra checar a saúde)
  res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'access-control-allow-origin': '*' })
  res.end(`Pyth Bomb PVP server ok · ${tournaments.size} tournaments · ${wss.clients.size} connected\n`)
})

const wss = new WebSocketServer({
  server,
  maxPayload: 4096,
  verifyClient: ({ origin }) => originOk(origin),
})

wss.on('connection', (ws) => {
  ws.pv = { user: null, code: null, watch: null, initRoom: null, msgs: 0, second: 0 }
  ws.isAlive = true
  ws.on('pong', () => { ws.isAlive = true })
  ws.on('message', (data) => {
    // limite de mensagens por segundo (ninguém derruba o servidor apertando tecla)
    const sec = Math.floor(Date.now() / 1000)
    if (sec !== ws.pv.second) { ws.pv.second = sec; ws.pv.msgs = 0 }
    if (++ws.pv.msgs > 80) { if (ws.pv.msgs > 300) ws.close(); return }
    let msg
    try { msg = JSON.parse(data.toString()) } catch { return }
    if (!msg || typeof msg !== 'object') return
    onMessage(ws, msg).catch((e) => console.error('message error', e))
  })
  ws.on('close', () => {
    const { user, code } = ws.pv
    if (user && userSocket.get(user) === ws) {
      userSocket.delete(user)
      tournaments.get(code)?.setConnected(user, false, now)
    }
  })
})

// quem está conectado de novo (mesmo usuário em outra conexão) volta a "ligado" no torneio
function syncConnections(t) {
  for (const p of t.players.values()) {
    if (p.bot) continue
    const ws = userSocket.get(p.id)
    const on = !!ws && ws.pv.code === t.code
    if (on !== p.connected) t.setConnected(p.id, on, now)
  }
}

// a sala que esta conexão deve ver agora: a própria (jogando) ou a escolhida pra assistir
function roomFor(ws, t) {
  const me = t.players.get(ws.pv.user)
  if (me?.status === 'playing') {
    const r = t.rooms.get(me.roomId)
    if (r?.status === 'playing') return r
  }
  const w = ws.pv.watch && t.rooms.get(ws.pv.watch)
  return w && w.status === 'playing' ? w : null
}

// ---- o laço do jogo: passo fixo, igual em qualquer máquina
let stepCount = 0
let last = performance.now()
let acc = 0
setInterval(() => {
  const t0 = performance.now()
  acc += Math.min(0.25, (t0 - last) / 1000)
  last = t0
  while (acc >= STEP) {
    acc -= STEP
    now += STEP
    stepCount++
    for (const t of tournaments.values()) t.tick(now)
    if (stepCount % SNAP_EVERY === 0) broadcastSnaps()
    if (stepCount % SUMMARY_EVERY === 0) broadcastSummaries()
  }
}, 4)

function broadcastSnaps() {
  for (const t of tournaments.values()) {
    if (t.status === 'lobby') continue
    const cache = new Map()
    for (const ws of socketsOf(t.code)) {
      const room = roomFor(ws, t)
      if (!room) {
        if (ws.pv.initRoom) { ws.pv.initRoom = null; send(ws, { t: 'noroom' }) }
        continue
      }
      if (ws.pv.initRoom !== room.id) {
        ws.pv.initRoom = room.id
        send(ws, { t: 'init', ...matchInit(room.match, room.id) })
      }
      if (!cache.has(room.id)) cache.set(room.id, JSON.stringify({ t: 'snap', room: room.id, ...matchSnap(room.match) }))
      send(ws, cache.get(room.id))
    }
    for (const room of t.rooms.values()) if (room.match) room.match.events = [] // os avisos já foram com o snap
  }
}

function broadcastSummaries() {
  for (const t of tournaments.values()) {
    syncConnections(t)
    const str = JSON.stringify({ t: 'tour', ...t.summary(now) })
    if (str === t._last) continue
    t._last = str
    for (const ws of socketsOf(t.code)) send(ws, str)
  }
}

// limpeza: conexões mortas e torneios velhos
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue }
    ws.isAlive = false
    ws.ping()
  }
  for (const [code, t] of tournaments) {
    const anyone = socketsOf(code).length > 0
    if (anyone) t.lastActive = now
    const idle = now - t.lastActive
    if ((t.status === 'done' && now - t.endedAt > 15 * 60) || idle > 10 * 60) tournaments.delete(code)
  }
}, 30_000)

if (ON_RAILWAY) startKeepAlive(supabaseConfig) // só no Railway (no computador não precisa)

server.listen(PORT, () => {
  console.log(`Pyth Bomb PVP server on port ${PORT} · login check ${authReady ? 'on' : 'OFF (no Supabase settings)'} · test bots ${TEST_BOTS ? 'on' : 'off'}`)
})
