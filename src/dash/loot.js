// Prêmios dos baús do Pyth Dash (o servidor e o jogo usam esta mesma tabela; as chances aparecem na tela).
// O número sorteado (32 bits, do Pyth Entropy) vira 0..99,99 e cai numa faixa.
export const LOOT_TABLE = [
  { upTo: 55, loot: { kind: 'coins', amount: 5, rarity: 'common' } },
  { upTo: 82, loot: { kind: 'coins', amount: 10, rarity: 'uncommon' } },
  { upTo: 97, loot: { kind: 'shield', rarity: 'rare' } },
  { upTo: 100, loot: { kind: 'lazer', rarity: 'legendary' } },
]

export function lootFor(n) {
  const roll = (n % 10000) / 100
  return { ...LOOT_TABLE.find((r) => roll < r.upTo).loot, roll: Math.round(roll * 100) / 100 }
}

export const ODDS = LOOT_TABLE.map((r, i) => ({ ...r.loot, chance: r.upTo - (LOOT_TABLE[i - 1]?.upTo ?? 0) }))
