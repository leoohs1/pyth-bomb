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
      up: ['/solo/pirb-up1.webp', '/solo/pirb-up2.webp'],
    },
    noFlip: true,
  },
  // TESTE pixel art: /solo?char=pixel (ainda só a imagem parada, de frente)
  pirbPixel: { idle: '/solo/pixel/pirb.png', noFlip: true, pixelArt: true },
  nysa: { idle: '/solo/nysa.webp', walk: { down: ['/solo/nysa-walk1.webp', '/solo/nysa-walk2.webp'] } },
}
const CHAR_TEST = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('char') === 'pixel'
const PLAYER = CHAR_TEST ? 'pirbPixel' : 'pirb' // quem o jogador controla (a Nysa ficou guardada pra depois)

// Inimigos com arte (uma imagem de frente; o jogo faz a marchinha e espelha pro lado).
// Tipo sem imagem aqui continua com o desenho provisório.
const ENEMY_ART = {
  marine: '/solo/marine.webp',
  sarge: '/solo/sarge.webp',
}

// Cenários: cada fase escolhe um em levels.js (tileset). Sem escolher, usa o templo grego.
// Uma peça pode ter variações (lista): o jogo sorteia uma por casa, sempre a mesma pro mesmo lugar.
const TILESETS = {
  temple: { floor: '/solo/floor.webp', wall: '/solo/wall.webp', block: '/solo/block.webp' },
  military: {
    floor: '/solo/military-floor.webp',
    wall: '/solo/military-wall.webp',
    block: ['/solo/military-crate.webp', '/solo/military-crate-2.webp', '/solo/military-crate-3.webp', '/solo/military-crate-4.webp'],
  },
}

// Decoração das paredes da borda (quartel): ventilação, canos, placa e rachadura roxa
const DECOR = {
  vent: '/solo/deco-vent.webp',
  pipes: '/solo/deco-pipes.webp',
  sign: '/solo/deco-sign.webp',
  crack: '/solo/deco-crack.webp',
}

const me = CHARACTERS[PLAYER]
export const playerCanFlip = !me.noFlip
export const playerIsPixelArt = !!me.pixelArt // desenhar sem suavizar (pixels quadrados)
const FILES = {
  player: me.idle,
  ...Object.fromEntries(Object.entries(me.walk ?? {}).flatMap(([dir, [a, b]]) => [
    [`walk_${dir}_1`, a], [`walk_${dir}_2`, b],
  ])),
  ...Object.fromEntries(Object.entries(ENEMY_ART).map(([type, src]) => [`enemy_${type}`, src])),
  bomb: '/solo/bomb.webp', // a bomba do logo do Pyth Bomb
  // fichas de power-up, baú (vale pra todas as fases) e porta (só a do quartel, por enquanto)
  pu_bomb: '/solo/pu-bomb.webp',
  pu_fire: '/solo/pu-fire.webp',
  pu_speed: '/solo/pu-speed.webp',
  chest_closed: '/solo/chest-closed.webp',
  chest_open: '/solo/chest-open.webp',
  door_military_closed: '/solo/door-closed.webp',
  door_military_open: '/solo/door-open.webp',
  ...Object.fromEntries(Object.entries(TILESETS).flatMap(([set, t]) =>
    Object.entries(t).flatMap(([kind, src]) => (Array.isArray(src)
      ? src.map((one, i) => [`${kind}_${set}_${i}`, one])
      : [[`${kind}_${set}`, src]])))),
  ...Object.fromEntries(Object.entries(DECOR).map(([name, src]) => [`deco_${name}`, src])),
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

// peça do cenário ('floor' | 'wall' | 'block') do conjunto da fase; cai no templo se faltar.
// variant escolhe entre as variações da peça (se ela tiver).
export function tileSprite(set, kind, variant = 0) {
  const list = TILESETS[set]?.[kind]
  if (Array.isArray(list)) return sprite(`${kind}_${set}_${variant % list.length}`) ?? sprite(`${kind}_${set}_0`)
  return sprite(`${kind}_${set}`) ?? sprite(`${kind}_temple`)
}

export const decoSprite = (name) => sprite(`deco_${name}`)
