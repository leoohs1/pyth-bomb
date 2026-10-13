// Baú FALSO: sorteio comum no navegador, prêmio de mentira (só pra testar a diversão).
// A espera imita o tempo que o servidor/Pyth Entropy vai levar pra responder.

const ODDS = {
  normal: { winChance: 0.4, amounts: [1, 2, 3, 5] },
  boss: { winChance: 0.75, amounts: [10, 20, 50] },
}

export function openFakeChest({ boss }) {
  const { winChance, amounts } = boss ? ODDS.boss : ODDS.normal
  const win = Math.random() < winChance
  const amount = win ? amounts[Math.floor(Math.random() * amounts.length)] : 0
  return new Promise((resolve) => {
    setTimeout(() => resolve({ win, amount, token: 'PYTH', demo: true }), 1200)
  })
}
