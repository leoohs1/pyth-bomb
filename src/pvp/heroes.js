// Os heróis jogáveis do Pyth Bomb PVP: os mesmos do Solo (pixel). `img` é o quadro parado e
// w/h o tamanho dele em pixels de arte, pra todos aparecerem na mesma escala (o Derrpu é
// mais alto que o Pirb, por exemplo). Dois jogadores podem escolher o mesmo herói: no jogo
// o que diferencia é o anel colorido do canto + o nome embaixo dos pés.
export const HEROES = [
  { id: 'pirb', label: 'Pirb', img: '/solo/pixel/pirb.png', w: 27, h: 53 },
  { id: 'derrpu', label: 'Derrpu', img: '/solo/pixel/derrpu.png', w: 28, h: 61 },
  { id: 'boryso', label: 'Boryso', img: '/solo/pixel/boryso.png', w: 32, h: 60 },
  { id: 'plancky', label: 'Plancky', img: '/solo/pixel/plancky.png', w: 30, h: 57 },
  { id: 'ricardinho', label: 'Ricardinho', img: '/solo/pixel/ricardinho.png', w: 36, h: 58 },
  { id: 'deepi', label: 'Deepi', img: '/solo/pixel/deepi.png', w: 27, h: 58 },
  { id: 'icey', label: 'Icey', img: '/solo/pixel/icey.png', w: 31, h: 58 },
  { id: 'shark', label: 'Shark', img: '/solo/pixel/shark.png', w: 27, h: 58 }, // nome provisório: a Halls ainda vai dizer o nome dele
]

export const heroById = (id) => HEROES.find((h) => h.id === id) ?? HEROES[0]

// os 4 cantos da sala (quem nasce em cada um) e a cor do anel de cada canto
export const CORNERS = [
  { id: 'tl', label: 'Top left', color: '#e5484d' },
  { id: 'tr', label: 'Top right', color: '#3e8bff' },
  { id: 'bl', label: 'Bottom left', color: '#22a860' },
  { id: 'br', label: 'Bottom right', color: '#f0a81e' },
]
