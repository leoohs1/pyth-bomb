// Imagens do modo Solo. Enquanto uma imagem não carregou (ou não existe ainda), o jogo
// continua desenhando o quadradinho de antes — dá pra ir trocando a arte aos poucos.

// Personagens jogáveis: imagem parada (de frente) + 2 passos de caminhada por direção.
// Tudo opcional: direção sem imagem usa a de frente (down); sem nenhuma, só o pulinho.
// noFlip: nunca espelhar a imagem (o Pirb tem o logo P da Pyth no capacete — espelhado
// ficaria ao contrário, e a regra da Pyth é não alterar a máscara).
const CHARACTERS = {
  pirb: {
    idle: '/solo/pirb.webp',
    walk: {
      down: ['/solo/pirb-walk1.webp', '/solo/pirb-walk2.webp'],
      right: ['/solo/pirb-right1.webp', '/solo/pirb-right2.webp'],
      left: ['/solo/pirb-left1.webp', '/solo/pirb-left2.webp'],
      // up: ['/solo/pirb-up1.webp', '/solo/pirb-up2.webp'],
    },
    noFlip: true,
  },
  nysa: { idle: '/solo/nysa.webp', walk: { down: ['/solo/nysa-walk1.webp', '/solo/nysa-walk2.webp'] } },
}
const PLAYER = 'pirb' // quem o jogador controla (a Nysa ficou guardada pra depois)

const me = CHARACTERS[PLAYER]
export const playerCanFlip = !me.noFlip
const FILES = {
  player: me.idle,
  ...Object.fromEntries(Object.entries(me.walk ?? {}).flatMap(([dir, [a, b]]) => [
    [`walk_${dir}_1`, a], [`walk_${dir}_2`, b],
  ])),
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

// os 2 passos de caminhada de uma direção ('up' | 'down' | 'left' | 'right'), ou null
export function walkFrames(dir) {
  const a = sprite(`walk_${dir}_1`), b = sprite(`walk_${dir}_2`)
  return a && b ? [a, b] : null
}
