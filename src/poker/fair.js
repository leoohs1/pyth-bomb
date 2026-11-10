// Conferência do embaralhamento (tela Verify), feita no navegador de quem quiser:
//   1. sha256(segredo) == commit, e o commit está gravado no contrato (commitOf(sequence)) desde antes do sorteio
//   2. o número do Entropy é o do contrato (randomOf(sequence))
//   3. semente = sha256(segredo || número)
//   4. baralho = Fisher-Yates com sha256(semente || índice em texto) — igual a poker_deck_from_seed (K02)
//   5. as cartas da mesa, as abertas no showdown e as minhas batem com o baralho
//      (jogador k recebe as posições k e k+n; a mesa começa na posição 2n, com n = jogadores que receberam cartas)

const RPC = { 'base-sepolia': 'https://sepolia.base.org', base: 'https://mainnet.base.org' }
const SEL = { commitOf: '0x75c274a2', randomOf: '0x597b4124' } // commitOf(uint64) / randomOf(uint64)

export const hexToBytes = (h) => {
  const s = String(h || '').replace(/^0x/, '')
  const out = new Uint8Array(s.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.substr(i * 2, 2), 16)
  return out
}
export const bytesToHex = (b) => '0x' + Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
const concat = (...parts) => {
  const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0))
  let o = 0
  for (const p of parts) { out.set(p, o); o += p.length }
  return out
}
export async function sha256(...parts) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', concat(...parts)))
}
const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase()

export async function deckFromSeed(seed) {
  const d = Array.from({ length: 52 }, (_, i) => i)
  const enc = new TextEncoder()
  for (let i = 51; i >= 1; i--) {
    const h = await sha256(seed, enc.encode(String(i)))
    const n = ((h[0] << 24) >>> 0) + (h[1] << 16) + (h[2] << 8) + h[3]
    const j = n % (i + 1)
    ;[d[i], d[j]] = [d[j], d[i]]
  }
  return d
}

// lê commitOf / randomOf do contrato direto na blockchain (rede pública da Base)
async function readContract(fair, fn) {
  const rpc = RPC[fair.chain]
  if (!rpc || !fair.contract || fair.sequence == null) return null
  const data = SEL[fn] + BigInt(fair.sequence).toString(16).padStart(64, '0')
  const res = await fetch(rpc, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to: fair.contract, data }, 'latest'] }),
  })
  const j = await res.json()
  if (j.error) throw new Error(j.error.message)
  return j.result
}

const pairOk = (deck, n, cards) => {
  for (let k = 0; k < n; k++) if (deck[k] === cards[0] && deck[k + n] === cards[1]) return true
  return false
}

// devolve a lista de conferências { label, ok } (ok = true | false | null quando não deu pra conferir)
export async function verifyHand(result, myCards) {
  const fair = result?.fair
  if (!fair?.seed) return { checks: [{ label: 'No shuffle proof for this hand', ok: false }], allOk: false }
  const checks = []
  const add = (label, ok) => checks.push({ label, ok })
  const seed = hexToBytes(fair.seed)

  if (fair.via === 'entropy') {
    const secret = hexToBytes(fair.secret)
    add('Secret matches the commit: sha256(secret) = commit', same(bytesToHex(await sha256(secret)), fair.commit))
    let onCommit = null, onRandom = null
    try {
      const [c, r] = await Promise.all([readContract(fair, 'commitOf'), readContract(fair, 'randomOf')])
      onCommit = c == null ? null : same(c, fair.commit)
      onRandom = r == null ? null : same(r, fair.random)
    } catch { /* sem internet pra rede: fica "could not check" */ }
    add('Commit was recorded on-chain before the draw', onCommit)
    add('Random number is the one Pyth Entropy sent to the contract', onRandom)
    add('Seed = sha256(secret + random number)', same(bytesToHex(await sha256(secret, hexToBytes(fair.random))), fair.seed))
  }

  const deck = await deckFromSeed(seed)
  const n = Number(fair.dealt) || 0
  const board = result.board ?? []
  add(`Table cards (${board.length}) match the deck`, n > 0 && board.every((c, i) => deck[2 * n + i] === c))
  const shown = (result.players ?? []).filter((p) => Array.isArray(p.cards) && p.cards.length === 2)
  if (shown.length) add(`Shown hands (${shown.length}) match the deck`, n > 0 && shown.every((p) => pairOk(deck, n, p.cards)))
  if (myCards?.hand_no === result.hand_no && myCards.cards?.length === 2) add('Your cards match the deck', pairOk(deck, n, myCards.cards))

  const allOk = checks.every((c) => c.ok === true)
  return { checks, allOk, deck }
}

export const shortHex = (h, a = 10, b = 8) => (!h ? '—' : h.length <= a + b + 3 ? h : `${h.slice(0, a)}…${h.slice(-b)}`)
