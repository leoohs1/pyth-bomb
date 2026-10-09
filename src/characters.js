// Nomes oficiais dos 20 personagens (definidos pela Halls). Mesma ordem de AVATARS em
// GameArenaV2.jsx: o 1º jogador a entrar na sala é o personagem 1, e assim por diante.
export const CHARACTER_NAMES = [
  { file: '/oracle-pilot-calm.webp', name: 'Nysa' },
  { file: '/hephaestus-sit-calm.webp', name: 'Hepa' },
  { file: '/artemis-sit-calm.webp', name: 'Mis' },
  { file: '/hermes-sit-calm.webp', name: 'Herms' },
  { file: '/nymph-sit-calm.webp', name: 'Nym' },
  { file: '/hoplite-sit-calm.webp', name: 'Plite' },
  { file: '/demeter-sit-calm.webp', name: 'Meteria' },
  { file: '/whip-sit-calm.webp', name: 'Gal' },
  { file: '/apollo-sit-calm.webp', name: 'Polo' },
  { file: '/athena-sit-calm.webp', name: 'Thena' },
  { file: '/pythagoras-sit-calm.webp', name: 'Thagor' },
  { file: '/naiad-sit-calm.webp', name: 'Wata' },
  { file: '/boy-sit-calm.webp', name: 'Boyd' },
  { file: '/blossom-sit-calm.webp', name: 'Blom' },
  { file: '/amazon-sit-calm.webp', name: 'Zon' },
  { file: '/faun-sit-calm.webp', name: 'Faun' },
  { file: '/sage-sit-calm.webp', name: 'Sag' },
  { file: '/cyclops-sit-calm.webp', name: 'Clon' },
  { file: '/owl-sit-calm.webp', name: 'Owlu' },
  { file: '/minotaur-sit-calm.webp', name: 'Minos' },
]

// nome do personagem a partir do arquivo da imagem (ex.: '/oracle-pilot-calm.webp' -> 'Nysa')
export function characterName(file) {
  return CHARACTER_NAMES.find((c) => c.file === file)?.name ?? ''
}
