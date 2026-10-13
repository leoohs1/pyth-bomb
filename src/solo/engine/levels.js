// Lista das fases do modo Solo. Pra criar uma fase nova, é só acrescentar uma linha aqui.
// - enemies: quantos de cada tipo (tipos em enemies.js)
// - powerups: o que fica escondido debaixo dos blocos ('bomb' +1 bomba, 'fire' +1 alcance, 'speed' mais rápido)
// - blockChance: quantos blocos quebráveis (0 a 1)
// - boss: fase de chefe numa arena aberta (a porta só aparece quando o chefe morre)
// - tagline: frase curta que aparece embaixo do nome da fase
export const LEVELS = [
  { name: 'Blue Barracks', tagline: 'The Blue Marines are on patrol', enemies: { marine: 2, sarge: 1 }, powerups: ['bomb', 'fire'], blockChance: 0.5 },
  { name: 'Bear Market', tagline: 'Bears everywhere', enemies: { fud: 2, bear: 2 }, powerups: ['bomb', 'fire', 'speed'], blockChance: 0.55 },
  { name: 'Rug Row', tagline: 'Watch your step', enemies: { fud: 1, bear: 2, rug: 2 }, powerups: ['bomb', 'fire', 'speed', 'fire'], blockChance: 0.6 },
  { name: "The Whale's Lair", tagline: 'The Whale awaits', boss: 'whale', enemies: {}, powerups: [] },
]
