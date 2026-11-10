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
import { randomBytes } from 'node:crypto'
import { newSecret, commitOf, seedOf, seedNumber, hex } from './entropy.js'
import { createMatch, step, eliminate } from '../src/pvp/engine/match.js'
import { createBot } from '../src/pvp/engine/bot.js'
import { pickRoomMap, MAPS } from '../src/pvp/engine/maps.js'
import { makeRng, shuffle } from '../src/pvp/engine/rng.js'
import { planRounds } from '../src/pvp/bracket.js'
import { RECONNECT_GRACE } from '../src/pvp/engine/constants.js'

export const MAX_PLAYERS = 20
export const DRAW_FIRST = 6 // segundos mostrando o sorteio antes da 1ª rodada
export const DRAW_NEXT = 4  // segundos mostrando "sua sala" antes das salas seguintes
const HEROES = ['pirb', 'derrpu', 'boryso', 'plancky', 'ricardinho', 'deepi', 'icey', 'chopaa']

export const DRAW_TIMEOUT = 25 // segundos esperando o Pyth Entropy; depois disso vale o plano B (sorteio do servidor)

// A SORTE do torneio (salas, cantos, mapa, baús, itens da final, desempates) sai de UMA semente:
//   semente = sha256(segredo do servidor || número do Pyth Entropy)
// A impressão digital do segredo (sha256) vai pro contrato junto com o pedido, ANTES de o número sair; o segredo é
// revelado no fim do torneio. Assim ninguém prevê a sorte e o servidor não consegue escolher (ver server/entropy.js).

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
    this.fillBots = false // opção do lobby: completar as salas com bots (menos a final)
    this.chat = []        // chat do torneio (as últimas mensagens; só na memória)
    this.chatSeq = 0
  }

  setFill(byId, on) {
    if (byId === this.hostId && this.status === 'lobby') this.fillBots = !!on
  }

  // bot que completa sala: herói que ainda não está na sala (se der) e nome 'Bot <herói>'
  makeFillBot(roomIds) {
    const used = roomIds.map((id) => this.players.get(id)?.hero)
    const hero = HEROES.find((h) => !used.includes(h)) ?? HEROES[this.botSeq % HEROES.length]
    const label = hero.charAt(0).toUpperCase() + hero.slice(1)
    const names = roomIds.map((id) => this.players.get(id)?.name)
    let name = `Bot ${label}`
    for (let n = 2; names.includes(name); n++) name = `Bot ${label} ${n}`
    const id = `bot-${++this.botSeq}`
    this.players.set(id, { id, name, hero, bot: true, connected: true, goneAt: null, status: 'playing', roomId: null, reached: 0 })
    return id
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

  start(byId, now = 0, entropy = null) {
    if (byId !== this.hostId) return { ok: false, error: 'Only the host can start' }
    if (this.status !== 'lobby') return { ok: false, error: 'Already started' }
    const ids = [...this.players.values()].filter((p) => p.status === 'lobby' && p.connected).map((p) => p.id)
    if (ids.length < 2) return { ok: false, error: 'You need at least 2 fighters' }
    // quem estava no lobby mas caiu da internet fica de fora
    for (const p of [...this.players.values()]) if (p.status === 'lobby' && !p.connected) this.players.delete(p.id)
    // sorteio: guarda o segredo, manda a impressão digital pro Pyth Entropy e espera o número (status 'drawing')
    this.drawIds = ids
    this.secret = newSecret()
    this.proof = { via: 'pending', commit: commitOf(this.secret) }
    this.status = 'drawing'
    this.drawStartedAt = now
    this.drawResult = null
    if (entropy?.state?.enabled) {
      entropy.draw(this.proof.commit, DRAW_TIMEOUT * 1000)
        .then((r) => { if (this.status === 'drawing') this.drawResult = { ok: true, ...r } })
        .catch((e) => { if (this.status === 'drawing') this.drawResult = { ok: false, error: e.message } })
    } else {
      this.drawResult = { ok: false, error: 'Entropy is off on this server' }
    }
    return { ok: true }
  }

  // o número chegou (ou o tempo acabou): monta a semente e a 1ª rodada
  finishDraw(now) {
    const r = this.drawResult ?? { ok: false, error: 'Entropy did not answer in time' }
    const random = r.ok ? r.random : hex(randomBytes(32)) // plano B: número do próprio servidor (sem prova pública)
    this.proof = {
      via: r.ok ? 'entropy' : 'server', commit: this.proof.commit, random,
      sequence: r.sequence ?? null, tx: r.tx ?? null, contract: r.contract ?? null,
      chain: r.chain ?? null, chainName: r.chainName ?? null, explorer: r.explorer ?? null, note: r.ok ? null : r.error,
    }
    this.seed = seedOf(this.secret, random)
    const ids = this.drawIds.filter((id) => this.players.has(id))
    const plan = planRounds(ids.length)
    this.rounds = plan.map((p) => ({ final: p.final, sizes: [...p.rooms], formed: 0, waiting: [], rooms: [] }))
    const order = shuffle([...ids], makeRng(seedNumber(this.seed, 'draw')))
    let at = 0
    for (const size of this.rounds[0].sizes) {
      this.formRoom(0, order.slice(at, at + size), now)
      at += size
    }
    this.status = 'running'
  }

  formRoom(roundIdx, ids, now) {
    const R = this.rounds[roundIdx]
    // opção 'Fill rooms with bots': salas normais vão até 4 com bots (a final fica só com quem ganhou)
    if (this.fillBots && !R.final) { ids = [...ids]; while (ids.length < 4) ids.push(this.makeFillBot(ids)) }
    const seed = seedNumber(this.seed, `room:${this.roomSeq + 1}`) // cada sala tem a sua parte da semente do torneio
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
    if (this.status === 'drawing') {
      if (this.drawResult || now - this.drawStartedAt > DRAW_TIMEOUT + 2) this.finishDraw(now)
      return
    }
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
      fill: this.fillBots,
      // prova do sorteio: o segredo só aparece quando o torneio acaba
      proof: this.proof ? { ...this.proof, secret: this.status === 'done' ? hex(this.secret) : null } : null,
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
            id: r.id, index: r.index, map: r.map, mapName: MAPS[r.map]?.name ?? r.map, st: r.status, ids: r.ids, winner: r.winner, places: r.places,
            startIn: r.status === 'draw' ? Math.ceil(Math.max(0, r.startAt - now)) : null,
            alive: r.match ? r.match.players.filter((p) => p.alive).length : r.ids.length,
          }
        }),
      })),
    }
  }
}
