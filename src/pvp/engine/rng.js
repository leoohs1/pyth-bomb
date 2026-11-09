// Sorteio com SEMENTE: a mesma semente sempre dá a mesma sequência de números.
// Assim o servidor decide tudo a partir de um número só (e na fase 2 esse número vem do Pyth Entropy
// misturado com um segredo do servidor). É o único lugar de onde a regra tira sorte.

// mulberry32: pequeno, rápido e bom o bastante pra jogo (não é pra criptografia)
export function makeRng(seed) {
  let a = seed >>> 0
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return next
}

// semente qualquer pra testes locais (no servidor ela vem de crypto)
export const randomSeed = () => Math.floor(Math.random() * 2 ** 32)

export function shuffle(a, rng) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export const pick = (list, rng) => list[Math.floor(rng() * list.length)]
