// UM TORNEIO do Pyth Bomb PVP, guardado na memória do servidor.
//
// Regras (Halls, 2026-11-08/09):
// - um código por torneio; todos entram no mesmo lobby; quem criou aperta Start (máximo 20 lutadores);
// - a 1ª rodada divide todo mundo em salas o mais parelho possível (bracket.js: 5 viram 3+2, nunca sala de 1);
// - as rodadas seguintes se formam AOS POUCOS: quem ganha a sala espera só os vencedores que faltam pra encher a
//   próxima sala planejada (ex.: 20 lutadores = 5 salas; os 3 primeiros vencedores já formam uma sala de 3, os 2
//   seguintes formam a de 2, e a final de 2 espera essas duas);
// - quem perde assiste; quem cai da internet fica parado e é eliminado se não voltar em 15 s;
// - bot nunca é campeão: se um bot ganhar a sala, passa o último humano vivo (bots de verdade = fase 2).
import { randomInt } from 'node:crypto'
import { createMatch, step, eliminate } from '../src/pvp/engine/match.js'
import { createBot } from '../src/pvp/engine/bot.js'
import { pickRoomMap, MAPS } from '../src/pvp/engine/maps.js'
import { makeRng, shuffle } from '../src/pvp/engine/rng.js'
import { planRounds } from '../src/pvp/bracket.js'
import { RECONNECT_GRACE } from '../src/pvp/engine/constants.js'

export const MAX_PLAYERS = 20
export const DRAW_FIRST = 6 // segundos mostrando o sorteio antes da 1ª rodada
export const DRAW_NEXT = 4  // segundos mostrando "sua sala" antes das salas seguintes
const HEROES = ['pirb', 'derrpu', 'boryso', 'plancky']

// A SORTE do torneio sai daqui (salas, cantos, mapa e a semente de cada sala).
// Fase 2: trocar por Pyth Entropy misturado com um segredo do servidor (commit-reveal).
export const drawSeed = () => randomInt(0, 2 ** 32)

export const cleanName = (s) => String(s ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 16)
export const cleanHero = (h) => (HEROES.includes(h) ? h : 'pirb')

export class Tournament {
  constructor(code, hostId, now = 0) {
    this.code = code
    this.hostId = hostId
    this.status = 'lobby' // 'lobby' | 'running' | 'done'
    this.players = new Map() // id -> { id, name, hero, bot, connected, goneAt, status, roomId, reached }
    this.rooms = new Map()   // id -> sala
    this.rounds = []         // [{ final, sizes, formed, waiting: [ids], rooms: [roomIds] }]
    this.champion = null
    this.createdAt = now
    this.endedAt = null
    this.lastActive = now
    this.roomSeq = 0
    this.botSeq = 0
  }

  join(id, { name, hero, bot = false }, now = 0) {
    const had = this.players.get(id)
    if (had) {
      had.connected = true
      had.goneAt = null
      if (this.status === 'lobby') { if (name) had.name = cleanName(name) || had.name; if (hero) had.hero = cleanHero(hero) }
      return { ok: true }
    }
    const nm = cleanName(name) || 'Player'
    if (this.status !== 'lobby') {
      // torneio já começou: entra só pra assistir
      this.players.set(id, { id, name: nm, hero: cleanHero(hero), bot, connected: true, goneAt: null, status: 'spectator', roomId: null, reached: -1 })
      return { ok: true, spectator: true }
    }
    if (this.lobbyCount() >= MAX_PLAYERS) return { ok: false, error: 'This tournament is full (20 fighters)' }
    this.players.set(id, { id, name: nm, hero: cleanHero(hero), bot, connected: true, goneAt: null, status: 'lobby', roomId: null, reached: 0 })
    this.lastActive = now
    return { ok: true }
  }

  addTestBot(now = 0) {
    if (this.status !== 'lobby' || this.lobbyCount() >= MAX_PLAYERS) return false
    const n = ++this.botSeq
    const hero = HEROES[(n - 1) % HEROES.length]
    this.join(`bot-${n}`, { name: `Bot ${n}`, hero, bot: true }, now)
    return true
  }

  lobbyCount() { let n = 0; for (const p of this.players.values()) if (p.status === 'lobby') n++; return n }

  setHero(id, hero) {
    const p = this.players.get(id)
    if (p && this.status === 'lobby' && !p.bot) p.hero = cleanHero(hero)
  }

  // caiu (ou voltou) da internet
  setConnected(id, on, now = 0) {
    const p = this.players.get(id)
    if (!p || p.bot) return
    p.connected = on
    p.goneAt = on ? null : now
    if (on) this.lastActive = now
  }

  // saiu de propósito (botão Leave): no lobby sai da lista; no meio do torneio conta como eliminado na hora
  leave(id, now = 0) {
    const p = this.players.get(id)
    if (!p) return
    if (this.status === 'lobby' || p.status === 'spectator' || p.status === 'out') {
      if (this.status === 'lobby') this.players.delete(id)
      else p.connected = false
      if (id === this.hostId) this.passHost()
      return
    }
    p.connected = false
    p.goneAt = now - RECONNECT_GRACE - 1
  }

  passHost() {
    const next = [...this.players.values()].find((p) => !p.bot && p.connected && p.id !== this.hostId)
    if (next) this.hostId = next.id
  }

  start(byId, now = 0) {
    if (byId !== this.hostId) return { ok: false, error: 'Only the host can start' }
    if (this.status !== 'lobby') return { ok: false, error: 'Already started' }
    const ids = [...this.players.values()].filter((p) => p.status === 'lobby' && p.connected).map((p) => p.id)
    if (ids.length < 2) return { ok: false, error: 'You need at least 2 fighters' }
    // quem estava no lobby mas caiu da internet fica de fora
    for (const p of [...this.players.values()]) if (p.status === 'lobby' && !p.connected) this.players.delete(p.id)
    const plan = planRounds(ids.length)
    this.rounds = plan.map((r) => ({ final: r.final, sizes: [...r.rooms], formed: 0, waiting: [], rooms: [] }))
    const rng = makeRng(drawSeed())
    const order = shuffle([...ids], rng)
    let at = 0
    for (const size of this.rounds[0].sizes) {
      this.formRoom(0, order.slice(at, at + size), now)
      at += size
    }
    this.status = 'running'
    return { ok: true }
  }

  formRoom(roundIdx, ids, now) {
    const R = this.rounds[roundIdx]
    const seed = drawSeed()
    const rng = makeRng(seed ^ 0xa5a5a5a5)
    const order = shuffle([...ids], rng) // quem fica em cada canto
    const room = {
      id: `r${++this.roomSeq}`,
      round: roundIdx,
      index: R.formed++,
      final: R.final,
      map: pickRoomMap(R.final, rng),
      seed,
      ids: order,
      status: 'draw', // 'draw' (mostrando a sala) | 'playing' | 'done'
      startAt: now + (roundIdx === 0 ? DRAW_FIRST : DRAW_NEXT),
      match: null,
      inputs: {},
      bots: {},
      winner: null,
      places: null,
    }
    this.rooms.set(room.id, room)
    R.rooms.push(room.id)
    for (const id of order) {
      const p = this.players.get(id)
      p.status = 'playing'
      p.roomId = room.id
      p.reached = roundIdx
    }
    return room
  }

  tryForm(roundIdx, now) {
    const R = this.rounds[roundIdx]
    if (!R) return
    while (R.formed < R.sizes.length && R.waiting.length >= R.sizes[R.formed]) {
      this.formRoom(roundIdx, R.waiting.splice(0, R.sizes[R.formed]), now)
    }
  }

  // tecla de alguém (dir: direção segurada ou null; bomb/detonate: toques)
  input(id, msg) {
    const p = this.players.get(id)
    if (!p || p.status !== 'playing') return
    const room = this.rooms.get(p.roomId)
    if (!room || room.status !== 'playing') return
    const inp = room.inputs[id] ?? (room.inputs[id] = { dir: null, bomb: false, detonate: false })
    if ('d' in msg) inp.dir = ['up', 'down', 'left', 'right'].includes(msg.d) ? msg.d : null
    if (msg.b) inp.bomb = true
    if (msg.x) inp.detonate = true
  }

  // um passinho fixo (STEP) do torneio inteiro. now = relógio do servidor em segundos
  tick(now) {
    if (this.status === 'lobby') {
      // quem caiu da internet no lobby e não voltou em 15 s sai da lista
      for (const p of [...this.players.values()]) {
        if (!p.bot && !p.connected && now - p.goneAt >= RECONNECT_GRACE) {
          this.players.delete(p.id)
          if (p.id === this.hostId) this.passHost()
        }
      }
      return
    }
    for (const room of this.rooms.values()) {
      if (room.status === 'draw' && now >= room.startAt) this.startMatch(room)
      if (room.status !== 'playing') continue
      const s = room.match
      for (const mp of s.players) {
        const tp = this.players.get(mp.id)
        if (!tp || tp.bot) continue
        mp.connected = tp.connected
        if (!tp.connected) {
          const inp = room.inputs[mp.id]
          if (inp) { inp.dir = null; inp.bomb = false; inp.detonate = false }
          if (mp.alive && now - tp.goneAt >= RECONNECT_GRACE) eliminate(s, mp.id, 'left')
        }
      }
      for (const [id, think] of Object.entries(room.bots)) room.inputs[id] = think(s)
      step(s, room.inputs)
      if (s.status === 'over') this.finishRoom(room, now)
    }
  }

  startMatch(room) {
    const players = room.ids.map((id) => { const p = this.players.get(id); return { id, name: p.name, hero: p.hero, bot: p.bot } })
    room.match = createMatch({ players, map: room.map, seed: room.seed })
    for (const p of players) {
      room.inputs[p.id] = { dir: null, bomb: false, detonate: false }
      if (p.bot) room.bots[p.id] = createBot(p.id, makeRng(room.seed + p.id.length * 7919 + this.botSeq))
    }
    room.status = 'playing'
  }

  finishRoom(room, now) {
    const res = room.match.result
    room.places = res.places
    let winner = res.winner
    // bot nunca passa de fase: vai o humano que ficou mais tempo vivo
    if (this.players.get(winner)?.bot) {
      const human = res.places.find((id) => !this.players.get(id)?.bot)
      if (human) winner = human
    }
    room.winner = winner
    room.status = 'done'
    for (const id of room.ids) {
      const p = this.players.get(id)
      if (!p) continue
      if (id !== winner) { p.status = 'out'; continue }
      if (room.final) {
        p.status = 'champion'
        this.champion = id
        this.status = 'done'
        this.endedAt = now
      } else {
        p.status = 'waiting'
        this.rounds[room.round + 1].waiting.push(id)
        this.tryForm(room.round + 1, now)
      }
    }
  }

  activeRooms() { return [...this.rooms.values()].filter((r) => r.status === 'playing') }

  // resumo pra mandar pra todo mundo (lobby, chaves do torneio, quem está onde)
  summary(now = 0) {
    return {
      code: this.code,
      status: this.status,
      host: this.hostId,
      champion: this.champion,
      max: MAX_PLAYERS,
      players: [...this.players.values()].map((p) => ({ id: p.id, name: p.name, hero: p.hero, bot: p.bot, on: p.connected, st: p.status, room: p.roomId, rd: p.reached })),
      rounds: this.rounds.map((R) => ({
        final: R.final,
        sizes: R.sizes,
        waiting: R.waiting,
        rooms: R.rooms.map((rid) => {
          const r = this.rooms.get(rid)
          return {
            id: r.id, index: r.index, map: r.map, mapName: MAPS[r.map]?.name ?? r.map, st: r.status, ids: r.ids, winner: r.winner,
            startIn: r.status === 'draw' ? Math.ceil(Math.max(0, r.startAt - now)) : null,
            alive: r.match ? r.match.players.filter((p) => p.alive).length : r.ids.length,
          }
        }),
      })),
    }
  }
}
