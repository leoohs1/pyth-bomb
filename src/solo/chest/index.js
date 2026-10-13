// O BAÚ do fim de cada fase — peça TROCÁVEL.
//
// O jogo só chama openChest() e recebe { win, amount, token, demo }. Hoje quem responde é o
// baú FALSO (sorteio no navegador, prêmio de mentira). Mais tarde, troca-se só este arquivo
// por uma versão que pede pro SERVIDOR, e o servidor usa o Pyth Entropy.
//
// IMPORTANTE pra versão de verdade: o navegador nunca decide prêmio. O servidor confere que a
// fase foi mesmo concluída, permite 1 baú por fase e aplica o limite diário.
import { openFakeChest } from './fakeChest.js'

export const CHEST_IS_DEMO = true

/**
 * @param {{ level: number, boss: boolean }} info  fase (1, 2, ...) e se era fase de chefe
 * @returns {Promise<{ win: boolean, amount: number, token: string, demo: boolean }>}
 */
export function openChest(info) {
  return openFakeChest(info)
}
