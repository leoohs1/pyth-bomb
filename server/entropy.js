// Pyth Entropy no servidor do PVP: um pedido por torneio, no contrato PythBombDraw (server/entropy/).
//
// Variáveis (painel do Railway):
//   PVP_WALLET_KEY     chave da carteira SÓ do servidor (a Halls cola; nunca vai pro GitHub nem pro chat)
//   PVP_CHAIN          'base-sepolia' (teste, padrão) ou 'base' (de verdade)
//   PVP_DRAW_CONTRACT  endereço do contrato PythBombDraw. Se não tiver, o servidor publica um sozinho na primeira vez
//                      e escreve o endereço no registro (aí é só copiar pra essa variável).
//   PVP_RPC_URL        (opcional) outro "portão" pra rede; o padrão é o público da Base
// Sem PVP_WALLET_KEY o Entropy fica desligado e o torneio usa o sorteio normal do servidor (marcado como "sem Entropy").
import { createHash, randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { JsonRpcProvider, Wallet, Contract, ContractFactory, formatEther } from 'ethers'

const ART = JSON.parse(readFileSync(new URL('./entropy/PythBombDraw.json', import.meta.url), 'utf8'))

// endereços públicos do Entropy (docs.pyth.network/entropy/chainlist, conferido em 2026-11-09)
export const CHAINS = {
  'base-sepolia': { name: 'Base Sepolia', rpc: 'https://sepolia.base.org', entropy: '0x41c9e39574f40ad34c79f1c99b66a45efb830d4c', explorer: 'https://sepolia.basescan.org' },
  base: { name: 'Base', rpc: 'https://mainnet.base.org', entropy: '0x6e7d74fa7d5c90fef9f0512987605a6d546181bb', explorer: 'https://basescan.org' },
}

const sha256 = (...parts) => createHash('sha256').update(Buffer.concat(parts.map((p) => (typeof p === 'string' ? Buffer.from(p) : p)))).digest()
const hex = (buf) => '0x' + Buffer.from(buf).toString('hex')
const unhex = (h) => Buffer.from(String(h).replace(/^0x/, ''), 'hex')

// ---- a mistura (commit-reveal): igual pra qualquer um que quiser conferir
export const newSecret = () => randomBytes(32)
export const commitOf = (secret) => hex(sha256(secret))                        // impressão digital do segredo
export const seedOf = (secret, random) => sha256(secret, unhex(random))        // semente do torneio
export const seedNumber = (seed, label) => sha256(seed, String(label)).readUInt32BE(0) // número de 32 bits pra cada coisa
export { hex }

export function createEntropy({ env = process.env, log = console.log } = {}) {
  const chainId = env.PVP_CHAIN || 'base-sepolia'
  const base = CHAINS[chainId] ?? { name: chainId, rpc: '', entropy: '', explorer: '' }
  const chain = { id: chainId, ...base, rpc: env.PVP_RPC_URL || base.rpc, entropy: env.PVP_ENTROPY_ADDRESS || base.entropy }
  const state = { enabled: false, ready: false, chain, contract: env.PVP_DRAW_CONTRACT || null, wallet: null, error: null }
  if (!env.PVP_WALLET_KEY) {
    log('Entropy: off (no PVP_WALLET_KEY) — tournaments use the server draw')
    return { ...api(), state }
  }
  state.enabled = true
  const provider = new JsonRpcProvider(chain.rpc)
  let wallet
  try { wallet = new Wallet(env.PVP_WALLET_KEY.trim(), provider) } catch { state.enabled = false; state.error = 'bad wallet key'; log('Entropy: off (PVP_WALLET_KEY is not a valid key)'); return { ...api(), state } }
  state.wallet = wallet.address
  let contract = null
  let queue = Promise.resolve() // um pedido por vez (a carteira não pode mandar dois ao mesmo tempo)

  const ready = (async () => {
    const bal = await provider.getBalance(wallet.address)
    log(`Entropy: ${chain.name} · server wallet ${wallet.address} · balance ${formatEther(bal)} ETH`)
    if (state.contract) {
      contract = new Contract(state.contract, ART.abi, wallet)
    } else {
      log('Entropy: no PVP_DRAW_CONTRACT yet — publishing the PythBombDraw contract once…')
      const factory = new ContractFactory(ART.abi, ART.bytecode, wallet)
      const c = await factory.deploy(chain.entropy)
      await c.waitForDeployment()
      state.contract = await c.getAddress()
      contract = c
      log(`Entropy: CONTRACT PUBLISHED at ${state.contract} — set Railway variable PVP_DRAW_CONTRACT=${state.contract}`)
    }
    state.ready = true
  })().catch((e) => { state.error = e.shortMessage || e.message; log('Entropy: setup failed: ' + state.error) })

  // pede um número pro Entropy com a impressão digital do segredo; espera a resposta (até timeoutMs)
  async function draw(commit, timeoutMs = 25000) {
    const run = async () => {
      await ready
      if (!contract) throw new Error(state.error || 'Entropy not ready')
      const t0 = Date.now()
      const fee = await contract.fee()
      const tx = await contract.request(commit, { value: fee + fee / 5n }) // 20% de folga: o troco volta
      const rc = await tx.wait()
      const ev = rc.logs.map((l) => { try { return contract.interface.parseLog(l) } catch { return null } }).find((p) => p?.name === 'Requested')
      if (!ev) throw new Error('no Requested event')
      const seq = ev.args.sequence
      for (;;) {
        const r = await contract.randomOf(seq)
        if (r && BigInt(r) !== 0n) {
          return { random: r, sequence: seq.toString(), tx: tx.hash, contract: state.contract, chain: chain.id, chainName: chain.name, explorer: chain.explorer, ms: Date.now() - t0 }
        }
        if (Date.now() - t0 > timeoutMs) throw new Error('Entropy did not answer in time')
        await new Promise((res) => setTimeout(res, 1200))
      }
    }
    const p = queue.then(run, run)
    queue = p.catch(() => {})
    return p
  }

  function api() {
    return { state, draw: async () => { throw new Error('Entropy off') }, ready: Promise.resolve() }
  }
  return { state, draw, ready }
}
