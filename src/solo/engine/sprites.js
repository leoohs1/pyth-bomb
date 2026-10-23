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
  nysa: { idle: '/solo/nysa.webp', walk: { down: ['/solo/nysa-walk1.webp', '/solo/nysa-walk2.webp'] } },
}
const PLAYER = 'pirb' // quem o jogador controla (a Nysa ficou guardada pra depois)

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

// ---- ESTILO DA ARTE: 'pixel' (pixel art, o PADRÃO — decisão da Halls) ou 'painted' (pintado, o original).
// Troca pelo botão no topo da tela (fica guardado no navegador) ou por /solo?style=pixel.
// No estilo pixel, cada imagem que tiver versão em PIXEL_FILES aparece em pixel; o resto
// continua com a arte pintada. Arte pixel é desenhada no tamanho nativo:
// PX_TILE pixels da arte = 1 casinha.
export const PX_TILE = 48
const STYLE_KEY = 'solo-art-style'
export const STYLE = (() => {
  try {
    const q = new URLSearchParams(window.location.search).get('style')
    if (q === 'pixel' || q === 'painted') { localStorage.setItem(STYLE_KEY, q); return q }
    return localStorage.getItem(STYLE_KEY) === 'painted' ? 'painted' : 'pixel'
  } catch { return 'pixel' }
})()
export function setStyle(style) {
  try { localStorage.setItem(STYLE_KEY, style) } catch { /* sem localStorage: só nesta visita */ }
}

// versões pixel (mesmos nomes de FILES). Vai crescendo conforme as artes chegam.
const PIXEL_FILES = {
  player: '/solo/pixel/pirb.png',
  walk_down_1: '/solo/pixel/pirb-down1.png',
  walk_down_2: '/solo/pixel/pirb-down2.png',
  walk_right_1: '/solo/pixel/pirb-right1.png',
  walk_right_2: '/solo/pixel/pirb-right2.png',
  walk_left_1: '/solo/pixel/pirb-left1.png',
  walk_left_2: '/solo/pixel/pirb-left2.png',
  walk_up_1: '/solo/pixel/pirb-up1.png',
  walk_up_2: '/solo/pixel/pirb-up2.png',
  bomb: '/solo/pixel/bomb.png',
  pu_bomb: '/solo/pixel/pu-bomb.png',
  pu_fire: '/solo/pixel/pu-fire.png',
  pu_speed: '/solo/pixel/pu-speed.png',
  door_military_closed: '/solo/pixel/door-closed.png',
  door_military_open: '/solo/pixel/door-open.png',
  chest_closed: '/solo/pixel/chest-closed.png',
  chest_open: '/solo/pixel/chest-open.png',
  deco_vent: '/solo/pixel/deco-vent.png',
  deco_sign: '/solo/pixel/deco-sign.png',
  deco_crack: '/solo/pixel/deco-crack.png',
  deco_pipes: '/solo/pixel/deco-pipes.png',
  floor_military: '/solo/pixel/floor-military.png',
  wall_military: '/solo/pixel/wall-military.png',
  block_military_0: '/solo/pixel/crate-military.png',
  enemy_marine: '/solo/pixel/marine.png',
  enemy_sarge: '/solo/pixel/sarge.png',
  floor_deck_0: '/solo/pixel/floor-deck-0.png', // convés de navio pirata (fase 2): sem rachadura, rachadura pequena, rachadura grande
  floor_deck_1: '/solo/pixel/floor-deck-1.png',
  floor_deck_2: '/solo/pixel/floor-deck-2.png',
  enemy_skeleton: '/solo/pixel/skeleton.png',
  enemy_crab: '/solo/pixel/crab.png',
}
// enquanto o Pirb pixel só tem a imagem parada, não usa os passos pintados
const PIXEL_DROPS = STYLE === 'pixel' && !PIXEL_FILES.walk_down_1
  ? Object.keys(FILES).filter((k) => k.startsWith('walk_'))
  : []
// peça com variações (caixotes): se já tem a versão pixel da primeira, as outras variações
// pintadas saem (o jogo repete a pixel até chegarem as outras)
const VARIANT_DROPS = STYLE === 'pixel'
  ? Object.keys(PIXEL_FILES).filter((k) => k.endsWith('_0')).flatMap((k) => {
    const base = k.slice(0, -1)
    return Object.keys(FILES).filter((f) => f.startsWith(base) && f !== k && !PIXEL_FILES[f])
  })
  : []
if (STYLE === 'pixel') {
  for (const k of [...PIXEL_DROPS, ...VARIANT_DROPS]) delete FILES[k]
  Object.assign(FILES, PIXEL_FILES)
}
const pixelImgs = new WeakSet()
// essa imagem é pixel art? (desenhar sem suavizar e no tamanho nativo)
export const isPixel = (img) => !!img && pixelImgs.has(img)

const images = {}

export function loadSprites() {
  for (const [name, src] of Object.entries(FILES)) {
    if (images[name]) continue
    const img = new Image()
    img.decoding = 'async'
    img.src = src
    if (STYLE === 'pixel' && PIXEL_FILES[name] === src) pixelImgs.add(img)
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

// chão alternativo da fase (levels.js `floor`, ex.: 'deck'), com 3 variações; null se ainda não carregou (ou no estilo pintado)
export const floorVariants = (name) => {
  const list = [0, 1, 2].map((i) => sprite(`floor_${name}_${i}`))
  return list.every(Boolean) ? list : null
}

// Cópia do desenho com o AZUL trocado por outra cor (delta = quantos graus girar a cor: +135 vira vermelho,
// +188 vira amarelo). Só mexe no que é azul de verdade: a estrela branca, as listras amarelas e os contornos
// escuros ficam como estão. light clareia (+) ou escurece (-) o resultado; sat multiplica a cor viva
// (0.7 = 30% menos viva, cara de desgastado). Fica guardada pra não refazer.
const hueCache = new WeakMap()
export function hueShifted(img, delta, light = 0, sat = 1) {
  if (!img || typeof document === 'undefined') return img
  const key = `${delta}|${light}|${sat}`
  let byKey = hueCache.get(img)
  if (!byKey) hueCache.set(img, byKey = new Map())
  if (byKey.has(key)) return byKey.get(key)
  const w = img.naturalWidth, h = img.naturalHeight
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d', { willReadFrequently: true })
  g.drawImage(img, 0, 0)
  const data = g.getImageData(0, 0, w, h)
  const px = data.data
  for (let i = 0; i < px.length; i += 4) {
    if (!px[i + 3]) continue
    const r = px[i] / 255, gr = px[i + 1] / 255, b = px[i + 2] / 255
    const max = Math.max(r, gr, b), min = Math.min(r, gr, b), d = max - min
    const l = (max + min) / 2
    const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1))
    let hue = 0
    if (d) hue = 60 * (max === r ? ((gr - b) / d + 6) % 6 : max === gr ? (b - r) / d + 2 : (r - gr) / d + 4)
    if (s < 0.25 || hue < 180 || hue > 270) continue // só o azul
    const nh = (hue + delta) % 360, nl = Math.max(0, Math.min(1, l + light)), ns = Math.min(1, s * sat)
    const ch = (1 - Math.abs(2 * nl - 1)) * ns, x = ch * (1 - Math.abs(((nh / 60) % 2) - 1)), m = nl - ch / 2
    const [r2, g2, b2] = nh < 60 ? [ch, x, 0] : nh < 120 ? [x, ch, 0] : nh < 180 ? [0, ch, x] : nh < 240 ? [0, x, ch] : nh < 300 ? [x, 0, ch] : [ch, 0, x]
    px[i] = Math.round((r2 + m) * 255)
    px[i + 1] = Math.round((g2 + m) * 255)
    px[i + 2] = Math.round((b2 + m) * 255)
  }
  g.putImageData(data, 0, 0)
  c.naturalWidth = w
  c.naturalHeight = h
  if (pixelImgs.has(img)) pixelImgs.add(c)
  byKey.set(key, c)
  return c
}

// ---- ANDAR em pixel (sem girar nem esticar a imagem, que é o que fazia parecer papel): o desenho do
// inimigo é cortado em partes e cada parte pula de pixel em pixel, quadro a quadro, como num sprite de
// verdade. src = [x, y, largura, altura] em pixels da arte. off[quadro] = [passo, dy]: dy sobe/desce a
// parte (negativo = sobe) e passo é o quanto ela vai pra frente, na direção em que o inimigo anda.
// fps = quadros por segundo; idle = quadro usado quando está parado.
export const RIGS = {
  // esqueleto 31x47: tronco/cabeça de um lado; as duas pernas (do joelho pra baixo) levantam uma de cada vez
  skeleton: {
    fps: 8, idle: 1,
    parts: [
      { src: [0, 0, 31, 39], off: [[0, 0], [0, 1], [0, 0], [0, 1]] },
      { src: [0, 39, 16, 8], off: [[1, -2], [0, 0], [0, 0], [0, 0]] },
      { src: [16, 39, 15, 8], off: [[0, 0], [0, 0], [1, -2], [0, 0]] },
    ],
  },
  // caranguejo 44x32: casco e garras balançam rápido; as pernas andam em dois grupos (esquerda+direita, depois o meio)
  crab: {
    fps: 13, idle: 1,
    parts: [
      { src: [0, 0, 44, 28], off: [[0, 1], [0, 0], [0, 1], [0, 0]] },
      { src: [0, 28, 14, 4], off: [[1, -1], [0, 0], [0, 0], [0, 0]] },
      { src: [14, 28, 16, 4], off: [[0, 0], [0, 0], [1, -1], [0, 0]] },
      { src: [30, 28, 14, 4], off: [[1, -1], [0, 0], [0, 0], [0, 0]] },
    ],
  },
}

// Cópia do desenho com o tom trocado (mesma forma e mesmo brilho; só a cor muda): color = 'rgb(...)',
// alpha de 0 a 1 = o quanto a cor nova manda. Pixel art continua pixel art. Fica guardada pra não refazer a cada quadro.
// mode: 'color' (troca a cor, mantém o claro/escuro) ou 'screen' (clareia).
const tintCache = new WeakMap()
export function tinted(img, color, alpha = 1, mode = 'color') {
  if (!img || typeof document === 'undefined') return img
  const key = `${color}|${alpha}|${mode}`
  let byKey = tintCache.get(img)
  if (!byKey) tintCache.set(img, byKey = new Map())
  if (byKey.has(key)) return byKey.get(key)
  const w = img.naturalWidth, h = img.naturalHeight
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d')
  g.drawImage(img, 0, 0)
  g.globalCompositeOperation = mode
  g.globalAlpha = alpha
  g.fillStyle = color
  g.fillRect(0, 0, w, h)
  g.globalAlpha = 1
  g.globalCompositeOperation = 'destination-in' // devolve o recorte original (a cor não vaza pra fora do desenho)
  g.drawImage(img, 0, 0)
  c.naturalWidth = w // o resto do jogo mede as imagens por naturalWidth/Height
  c.naturalHeight = h
  if (pixelImgs.has(img)) pixelImgs.add(c)
  byKey.set(key, c)
  return c
}
