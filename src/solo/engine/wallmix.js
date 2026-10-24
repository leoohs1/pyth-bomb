// Qual dos 4 desenhos de bloco fixo (levels.js `wall`: 'hull' ou 'tavern') fica na casa (x, y). O sorteio é fixo pela
// posição: o mesmo lugar sempre tem o mesmo bloco (o desenho usa isso pra pintar, e o jogo pra saber onde tem barril).
// Na taverna: 0 = pilha de barris, 1 = barril com torneira, 2 = adega de vinhos, 3 = pilar de pedra (~20%).
export function hullWallOf(x, y) {
  const h = ((x * 83492791) ^ (y * 73856093)) >>> 0
  return h % 100 < 20 ? 3 : (h >>> 8) % 3
}
export const TAVERN_KEG = 1 // o barril com torneira (a cerveja escorre dali)
export const TAVERN_BARREL = 0

// Parede da BORDA da arena na taverna (levels.js `wallBorder`): 0 e 1 = tábuas lisas, 2 e 3 = com uma viga em pé (~28%).
// A decoração (janela, lampião, prateleira...) fica presa nela, por isso a borda é de um tipo só (não barril, adega e pilar).
export function borderWallOf(x, y) {
  const h = ((x * 73856093) ^ (y * 19349663)) >>> 0
  return h % 100 < 28 ? 2 + ((h >>> 8) % 2) : (h >>> 8) % 2
}
