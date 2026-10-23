// Lista das fases do modo Solo. Pra criar uma fase nova, é só acrescentar uma linha aqui.
// - enemies: quantos de cada tipo (tipos em enemies.js)
// - powerups: itens GARANTIDOS escondidos debaixo dos blocos ('bomb' +1 bomba, 'fire' +1 alcance, 'speed' mais
//   rápido, 'shield' aguenta 1 batida, 'kick' chuta bombas, 'detonator' explode na tecla E). Assim todo mundo chega
//   no chefe com uma força parecida (justo pra quem joga valendo prêmio).
// - bonus: mais alguns itens SORTEADOS da lista pool (repetir um item na lista = mais chance dele).
//   O sorteio é feito uma vez por fase; se morrer, a fase volta com os mesmos itens (menos os que você já pegou).
// - blockChance: quantos blocos quebráveis (0 a 1)
// - boss: fase de chefe numa arena aberta (a porta só aparece quando o chefe morre)
// - tagline: frase curta que aparece embaixo do nome da fase
// - arrival: frase da tela de fase concluída da fase ANTERIOR (a história de como se chega nesta)
// - tileset: cenário ('temple' = templo grego, o padrão; 'military' = quartel)
// - wallMix: os blocos fixos (contêineres azuis) misturam cores: uns azuis, uns amarelos, uns vermelhos
// - puddles: quantas poças d'água animadas no chão (só enfeite), espalhadas pelo mapa; puddleCracks: true = cada poça tem uma rachadura grande ao lado
// - wall: blocos fixos próprios da fase ('hull' = casco de navio antigo: 4 desenhos misturados por posição)
// - decor: decoração da borda ('hull' = escotilhas, portas de canhão, lampiões e rachaduras com energia roxa)
// - door: porta de saída própria da fase ('hull' = escotilha no convés, descendo pro casco antigo)
// - floor: chão próprio da fase ('deck' = convés de navio pirata, em sprites.js); sem isso, o chão do cenário
// - crateTone: cor dos caixotes quebráveis ('wood' = madeira num tom padrão; sem isso, a cor do cenário)
// - mood: clima por cima do cenário ('bear' = tom vermelho do Bear Market: chão/paredes avermelhados, fundo e luzes vermelhos)
export const LEVELS = [
  { name: 'Blue Barracks', tagline: 'The Blue Marines are on patrol', tileset: 'military', wallMix: true, crateTone: 'wood', enemies: { marine: 3, sarge: 2 }, powerups: ['bomb', 'fire', 'bomb', 'fire', 'speed'], bonus: { count: 2, pool: ['bomb', 'fire', 'speed', 'shield'] }, blockChance: 0.5 },
  { name: 'Bear Market', tagline: 'Below deck, the old hull is leaking', arrival: 'down the hatch, into the old hull', tileset: 'military', mood: 'bear', floor: 'deck', wall: 'hull', decor: 'hull', door: 'hull', puddles: 3, puddleCracks: true, crateTone: 'wood', enemies: { skeleton: 3, crab: 3 }, powerups: ['bomb', 'fire', 'kick'], bonus: { count: 3, pool: ['bomb', 'fire', 'speed', 'speed', 'shield'] }, blockChance: 0.55 },
  { name: 'Rug Row', tagline: 'Watch your step', enemies: { skeleton: 2, crab: 3, rug: 3 }, powerups: ['bomb', 'fire', 'detonator'], bonus: { count: 3, pool: ['bomb', 'fire', 'speed', 'shield', 'shield'] }, blockChance: 0.6 },
  { name: "The Whale's Lair", tagline: 'The Whale awaits', boss: 'whale', enemies: {}, powerups: [] },
]
