// Imagens do modo Solo. Enquanto uma imagem não carregou (ou não existe ainda), o jogo
// continua desenhando o quadradinho de antes — dá pra ir trocando a arte aos poucos.

// Personagens jogáveis: parado + 2 passos de caminhada (opcionais; sem eles, só o pulinho).
// noFlip: nunca espelhar a imagem (o Pirb tem o logo P da Pyth no capacete — espelhado
// ficaria ao contrário, e a regra da Pyth é não alterar a máscara).
const CHARACTERS = {
  pirb: { idle: '/solo/pirb.webp', walk1: '/solo/pirb-walk1.webp', walk2: '/solo/pirb-walk2.webp', noFlip: true },
  nysa: { idle: '/solo/nysa.webp', walk1: '/solo/nysa-walk1.webp', walk2: '/solo/nysa-walk2.webp' },
}
const PLAYER = 'pirb' // quem o jogador controla (a Nysa ficou guardada pra depois)

const me = CHARACTERS[PLAYER]
export const playerCanFlip = !me.noFlip
const FILES = {
  player: me.idle,
  ...(me.walk1 && me.walk2 ? { playerWalk1: me.walk1, playerWalk2: me.walk2 } : {}),
  floor: '/solo/floor.webp',
  wall: '/solo/wall.webp',
  block: '/solo/block.webp',
}

const images = {}

export function loadSprites() {
  for (const [name, src] of Object.entries(FILES)) {
    if (images[name]) continue
    const img = new Image()
    img.decoding = 'async'
    img.src = src
    images[name] = img
  }
}

// devolve a imagem pronta pra desenhar, ou null
export function sprite(name) {
  const img = images[name]
  return img && img.complete && img.naturalWidth > 0 ? img : null
}
