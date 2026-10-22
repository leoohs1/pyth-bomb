// Baú FALSO: sorteio comum no navegador, prêmio de mentira (só pra testar a diversão).
// A espera imita o tempo que o servidor/Pyth Entropy vai levar pra responder.

const ODDS = {
  normal: { winChance: 0.4, amounts: [1, 2, 3, 5] },
  boss: { winChance: 0.75, amounts: [10, 20, 50] },
}

export function openFakeChest({ boss, force }) {
  const { winChance, amounts } = boss ? ODDS.boss : ODDS.normal
  // force: só pro atalho de teste (/solo?chest=win ou ?chest=empty); no jogo normal não existe
  const win = force === 'win' ? true : force === 'empty' ? false : Math.random() < winChance
  const amount = win ? amounts[Math.floor(Math.random() * amounts.length)] : 0
  return new Promise((resolve) => {
    setTimeout(() => resolve({ win, amount, token: 'PYTH', demo: true }), 1200)
  })
}
