// Pyth Polis: o que é cada coisa (nomes, textos, posições nas artes). Tudo o que muda o jogo de verdade fica no
// Supabase (supabase/polis/G01 + G02); aqui é só o que a tela precisa pra mostrar.

export const RES = [
  { id: 'grain', label: 'Grain', icon: '🌾', field: 'Grain Field' },
  { id: 'wood', label: 'Wood', icon: '🪵', field: 'Olive Grove' },
  { id: 'marble', label: 'Marble', icon: '🪨', field: 'Marble Quarry' },
  { id: 'bronze', label: 'Bronze', icon: '⚒️', field: 'Bronze Mine' },
]
export const RES_BY = Object.fromEntries(RES.map((r) => [r.id, r]))
export const CYCLE_LABEL = { 1800: '30 min', 3600: '1 h', 21600: '6 h', 43200: '12 h', 86400: '24 h' }

export const TRIBES = {
  spartan: { name: 'Spartans', tag: 'Warriors', icon: '🛡️', color: '#c0392b', text: 'The strongest soldiers. Train fast and hit hard.' },
  athenian: { name: 'Athenians', tag: 'Traders', icon: '⚖️', color: '#2e6fd8', text: 'Masters of trade. More production and cheaper deals.' },
  delphian: { name: 'Delphians', tag: 'Guardians', icon: '🔮', color: '#8e44ad', text: 'Keepers of the oracle. Strong walls and the favor of the gods.' },
}

// prédios da Cidade: nome, frase curta e o que faz em cada nível
export const BUILDINGS = {
  agora: { name: 'Agora', text: 'The heart of your polis. Every level makes construction faster.', effect: (l) => `Construction ${Math.min(45, 5 * (l - 1))}% faster` },
  storehouse: { name: 'Storehouse', text: 'Keeps your wood, marble and bronze.', effect: (l) => `Holds ${cap(l).toLocaleString('en-US')} of each` },
  granary: { name: 'Granary', text: 'Keeps your grain. Soldiers will eat from it.', effect: (l) => `Holds ${cap(l).toLocaleString('en-US')} grain` },
  cellar: { name: 'Hidden Cellar', text: 'Hides part of your resources from raiders.', effect: () => 'Protection arrives with the first raids' },
  barracks: { name: 'Barracks', text: 'Where your tribe trains its soldiers.', effect: () => 'Troops arrive in the next update' },
  market: { name: 'Market', text: 'Trade resources with other players.', effect: () => 'Trading arrives in a coming update' },
  temple: { name: 'Temple of Apollo', text: 'The oracle does not create the truth. It carries it.', effect: () => 'Divine Favor arrives in a coming update' },
  agoge: { name: 'Agoge', text: 'The Spartan school of war.', effect: () => 'Faster training, unlocks the Spartiate' },
  harbor: { name: 'Piraeus Harbor', text: 'The Athenian gateway to the sea.', effect: () => 'Cheaper trade and more production' },
  sanctuary: { name: 'Oracle Sanctuary', text: 'Where the Delphians listen to the oracle.', effect: () => 'More Favor and early warnings' },
}
const cap = (l) => (l <= 0 ? 800 : Math.round(1200 * 1.5 ** (l - 1)))
export const capFor = cap

// arte do prédio por nível: 1-3 madeira, 4-7 pedra, 8-10 mármore e dourado
export const tierOf = (level) => (level >= 8 ? 3 : level >= 4 ? 2 : 1)
export const buildingImg = (kind, level) => `/polis/b/${kind}-${tierOf(Math.max(1, level))}.webp`

// posições nas artes (1672 x 941), em %: os 14 lotes da tela de Recursos e as 14 bases da Cidade
const W = 1672, H = 941
const pct = ([x, y]) => ({ x: (x / W) * 100, y: (y / H) * 100 })
export const PLOT_POS = [
  [350, 245], [590, 190], [840, 190], [1095, 190], [1330, 245], [205, 350], [1465, 350],
  [185, 490], [1500, 495], [300, 630], [540, 690], [830, 670], [1125, 690], [1375, 615],
].map(pct)
export const PAD_POS = [
  [585, 222], [835, 195], [1140, 222], [300, 355], [612, 333], [1057, 333], [1365, 355],
  [290, 540], [612, 535], [1057, 535], [1380, 540], [500, 660], [838, 670], [1167, 660],
].map(pct)
export const SCENE_RATIO = `${W} / ${H}`

export const fmtTime = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000))
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : m ? `${m}m ${String(x).padStart(2, '0')}s` : `${x}s`
}
export const fmtNum = (n) => Math.floor(Number(n) || 0).toLocaleString('en-US')
