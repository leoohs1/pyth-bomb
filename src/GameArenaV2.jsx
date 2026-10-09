import { useEffect, useRef, useState } from 'react'
import './GameArenaV2.css'
import BombPovFlash from './BombPovFlash.jsx'
import { play } from './sound.js'
import { setMusicDuck } from './music.js'
import { CHARACTER_NAMES, avatarIndex } from './characters.js'
import SoundToggle from './SoundToggle.jsx'
import RuggedOverlay from './RuggedOverlay.jsx'
import Confetti from './Confetti.jsx'
import LeaveButton from './LeaveButton.jsx'
import GameCompact from './GameCompact.jsx'

const QUESTION_MS = 10000 // tem que ser igual ao intervalo em deal_question (supabase/007_timers2.sql)

// elenco sentado (entregue por Halls) — se um dia tiver mais gente que isso,
// repete. Visual da arte atual (banco embutido batendo com o degrau) foi
// pausado — ver decisão "New visual pipeline": a Arena 2.0 vai ganhar fundo
// em camadas + elenco novo desenhado pro sistema, e só depois disso volta
// pra calibração. Esse array continua sendo só o MAPEAMENTO índice→arquivo,
// independente de qual arte está por trás de cada nome.
// Elenco aprovado (20), na ordem de ENTRADA na sala por padrão; cada jogador pode escolher
// outro no lobby (players.avatar_idx). A lista fica em characters.js (fonte única).
const AVATARS = CHARACTER_NAMES.map((c) => c.file)

// === ARENA 2.0 — geometria do MUNDO (onde cada assento fica na tela) ===
// Separada de propósito da geometria do AVATAR (onde a bomba/nome ficam
// dentro do PNG de cada personagem, ver AVATAR_GEOMETRY abaixo) — um
// personagem pode sentar em qualquer assento, mas os pés/mãos dele
// continuam no mesmo lugar dentro do próprio PNG, não dependem do assento.
// === APROVADO pela Halls como base da Arena 2.0 (9 esquerda + 9 direita +
// CROWN + LOCAL_PLAYER) — depois de duas rodadas de calibração em cima do
// fundo ATUAL (arena-seats-bg-v3.webp). Essas coordenadas são agora a
// referência pra desenhar a arte de fundo nova: a arte nova deve ser
// desenhada EM CIMA desses 19 pontos (não o contrário). Se a arte mudar,
// estes x/y/scale podem precisar de um recalibre fino, mas a ESTRUTURA
// (9+9+1) está travada — não redesenhar de novo sem pedido explícito.
// Histórico: v1 era 7+6+6 numa fileira só e tinha assento embaixo do card
// (T_L1/T_C/T_R1 ficavam escondidos) — por isso a troca pra duas "asas"
// simétricas de 3x3 + 1 assento especial no fundo/centro (CROWN), acima do
// card, sem nenhum assento normal atrás dele.
// Recalibrado em cima da arte nova (arena2-bg-v1.webp) — medi os degraus
// reais pixel a pixel (tread 1≈40%, tread 2≈51%, tread 3≈60% da altura da
// imagem) e o topo real do altar central (≈25% da altura, x centralizado).
// x praticamente não mudou (a curva das escadas ficou quase idêntica à
// arte anterior); o que mudou mesmo foi o "y" de cada fileira, que estava
// um pouco alto demais (flutuando acima dos degraus de verdade), e o CROWN,
// que agora senta em cima do altar em vez de flutuar no céu.
//
// PAUSADO → FASE DE TESTE DE FORMATOS (plano combinado com a Halls):
// 1) travar direção (feito: elenco novo sempre olhando pra ESQUERDA —
//    por isso quem senta na ala DIREITA usa a arte original, sem
//    espelhar, e quem senta na ala ESQUERDA usa `ga-mirror`); 2) mapear
//    6-8 assentos de amostra (ESTE bloco agora); 3) testar esses 6-8 com
//    personagens de formatos diferentes; 4) só DEPOIS mapear os 13
//    assentos restantes; 5) gerar/refazer o elenco completo.
// Os 6 assentos abaixo foram medidos PIXEL A PIXEL direto em
// arena2-bg-v2.webp (1500x912) — 3 fileiras (fundo/meio/frente) × 2
// lados, cada um num bloco de mármore retangular real e bem definido.
// `y` é sempre a BORDA DA FRENTE do bloco (onde as pernas penduram pra
// fora — mesmo critério usado no piloto aprovado da Oracle, que
// corresponde exatamente ao assento "meio" aqui). `namePlateY` é logo
// abaixo da borda da frente do mesmo bloco (borda + ~0.5%) — a placa
// pequena fica colada no bloco sem cobrir os pés do personagem. Lado direito medido independente (não é só espelho
// matemático do esquerdo) — a arte tem boa simetria, mas confirmei nos
// dois lados em vez de assumir.
const ARENA2_SEATS = [
  // --- esquerda (ga-mirror ativo automaticamente, x<50) ---
  // fundo: topo x≈97-180px/y≈330-348, face frontal y≈348-380, borda y≈380
  { id: 'L_BACK', x: 8.1, y: 41.1, scale: 0.95, zIndex: 10, namePlateY: 41.60, lipY: 38.9, blockX: [5.1, 11.1] },
  // meio: topo x≈95-195px/y≈455-465, face frontal y≈465-498, borda y≈498
  { id: 'L_MID', x: 8.55, y: 54.85, scale: 1.17, zIndex: 20, namePlateY: 55.35, lipY: 52, blockX: [4.5, 12.6] },
  // frente: topo x≈75-195px/y≈580-598, face frontal y≈598-628, borda y≈628
  { id: 'L_FRONT', x: 9.15, dx: 0.7, y: 68.9, scale: 1.35, zIndex: 30, namePlateY: 69.40, lipY: 66.1, blockX: [5.1, 13.2] },

  // --- direita (sem mirror, x>=50 — arte já olha pro centro "de graça") ---
  { id: 'R_BACK', x: 92.2, dx: -0.35, y: 41.1, scale: 0.95, zIndex: 10, namePlateY: 41.60, lipY: 38.9, blockX: [89.4, 95] },
  // (igual ao piloto aprovado: x=90.8, y=54.3 — mantidos exatamente)
  { id: 'R_MID', x: 91.55, dx: -0.35, y: 54.85, scale: 1.17, zIndex: 20, namePlateY: 55.35, lipY: 52, blockX: [87.6, 95.5] },
  { id: 'R_FRONT', x: 90.95, dx: -0.35, y: 68.9, scale: 1.35, zIndex: 30, namePlateY: 69.40, lipY: 66.1, blockX: [86.9, 95] },

  // --- TESTE 16 assentos: 2º e 3º bloco de cada fileira (indo pro centro).
  // Medidos a olho no fundo (±0.5%) — a fileira da frente sobe em direção
  // ao centro (U). Direita = espelho da esquerda (100 - x).
  { id: 'L_BACK2', x: 16.35, y: 41.9, scale: 0.95, zIndex: 10, namePlateY: 42.40, lipY: 39.5, blockX: [12.7, 20] },
  { id: 'L_MID2', x: 17.85, y: 54.8, scale: 1.17, zIndex: 20, namePlateY: 55.30, lipY: 52.1, blockX: [14, 21.7] },
  { id: 'L_FRONT2', x: 19.1, dx: 0.7, y: 66.95, scale: 1.35, zIndex: 30, namePlateY: 67.45, lipY: 64.3, blockX: [15.2, 23] },
  { id: 'R_BACK2', x: 83.05, dx: -0.35, y: 41.9, scale: 0.95, zIndex: 10, namePlateY: 42.40, lipY: 39.5, blockX: [80.1, 86] },
  { id: 'R_MID2', x: 82.25, dx: -0.35, y: 54.8, scale: 1.17, zIndex: 20, namePlateY: 55.30, lipY: 52.1, blockX: [78.5, 86] },
  { id: 'R_FRONT2', x: 81.35, dx: -0.35, y: 66.95, scale: 1.35, zIndex: 30, namePlateY: 67.45, lipY: 64.3, blockX: [77.3, 85.4] },
  { id: 'L_MID3', x: 26.75, y: 54.8, scale: 1.17, zIndex: 20, namePlateY: 55.30, lipY: 52.2, blockX: [23.3, 30.2] },
  { id: 'L_FRONT3', x: 28.25, dx: 0.7, y: 66.6, scale: 1.35, zIndex: 30, namePlateY: 67.10, lipY: 64, blockX: [24.5, 32] },
  { id: 'R_MID3', x: 73.4, dx: -0.35, y: 54.8, scale: 1.17, zIndex: 20, namePlateY: 55.30, lipY: 52.2, blockX: [69.8, 77] },
  { id: 'R_FRONT3', x: 71.8, dx: -0.35, y: 66.6, scale: 1.35, zIndex: 30, namePlateY: 67.10, lipY: 64, blockX: [68, 75.6] },
  // 17º e 18º assentos: bloco de trás (fundo) mais perto do centro, de cada lado
  { id: 'L_BACK3', x: 24.95, y: 42, scale: 0.95, zIndex: 10, namePlateY: 42.50, lipY: 40, blockX: [21.4, 28.5] },
  { id: 'R_BACK3', x: 75.2, dx: -0.35, y: 42, scale: 0.95, zIndex: 10, namePlateY: 42.50, lipY: 40, blockX: [71.6, 78.8] },

  // Os outros 13 assentos (CROWN incluso) e o restante da ala — ainda NÃO
  // mapeados nessa arte nova. Entram só depois que esses 6 passarem no
  // teste de formatos (passo 4 do plano).
]

// ordem em que os assentos enchem: de baixo pra cima (frente → meio →
// fundo) e alternando esquerda/direita, de fora pra dentro — com poucos
// jogadores a plateia já fica equilibrada dos dois lados.
const SEAT_FILL_ORDER = [
  'L_FRONT', 'R_FRONT', 'L_FRONT2', 'R_FRONT2', 'L_FRONT3', 'R_FRONT3',
  'L_MID', 'R_MID', 'L_MID2', 'R_MID2', 'L_MID3', 'R_MID3',
  'L_BACK', 'R_BACK', 'L_BACK2', 'R_BACK2', 'L_BACK3', 'R_BACK3',
]

// jogador local: slot explícito próprio, fora dos 19 — nunca consome um
// assento da plateia (spec item 7, última linha).
const LOCAL_PLAYER = { id: 'LOCAL_PLAYER', x: 50, y: 78, widthCqw: 9.3, zIndex: 50 }

// liga/desliga os marcadores de calibração (cruz + ID do assento + caixa
// aproximada do personagem + âncora do nome + âncora da bomba). Só visual —
// não muda nenhum layout, é pra tirar print e calibrar as posições.
const SHOW_SEAT_DEBUG = false
// debug de ancoragem (spec: "grounding debug mode") — mostra uma linha
// horizontal na altura do assento/degrau e um ponto no supportAnchorY do
// avatar. Como os dois agora usam a MESMA --ga-seat-anchor pra se
// posicionar, eles têm que cair exatamente um em cima do outro sempre —
// se não caírem, é sinal de supportAnchorY medido errado pra aquele PNG.
const SHOW_GROUND_DEBUG = false

// === TESTE "SENTAR NO MÁRMORE" (só no preview, via query string) ===
// ?stage=0 → comportamento antigo (pé na borda de baixo da face do bloco)
// ?stage=1 → só geometria nova: `seatContactY` do avatar (corpo/bumbum)
//            encosta no TAMPO do bloco (seat.lipY - TOP_DEPTH)
// ?stage=2 → stage 1 + sombra de contato no tampo
// ?stage=3 → stage 2 + oclusão (a borda de mármore por cima da base do
//            personagem; só pra avatares com `occlude: true`)
// ?debug=1 → linhas/pontos de calibração
// Só avatares com `seatContactY` entram no modo novo; o resto não muda.
const QS = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams()
// padrão = 2 (decisão da Halls: seatContactY + sombra de contato é a base).
// ?stage=0 volta ao comportamento antigo, só pra comparar.
const STAGE = Math.max(0, Math.min(3, parseInt(QS.get('stage') ?? '2', 10) || 0))
const CONTACT_DEBUG = QS.get('debug') === '1'
// quão "pra dentro" do tampo (em % da altura da arena, a partir da borda
// da frente) o corpo apoia — o tampo é raso, então é pouco.
const TOP_DEPTH = 0.8

// === geometria do AVATAR (por PNG, não por assento) ===
// `anchor` (pose do corpo) e `bomb` (onde a bomba aparece) continuam como
// antes. O que muda agora é COMO posicionamos o personagem no mundo: não é
// mais o `anchor` do corpo que decide isso.
//
// `supportAnchorY` — NOVO, e é ele quem passa a decidir a posição no mundo.
// Esses assets já vêm com um banquinho/base de mármore embutido no próprio
// PNG — então o ponto de contato real com o degrau não são os PÉS do
// personagem (que ficam pousados EM CIMA do banco, não no chão), é a BASE
// do banco. `supportAnchorY` é a fração da altura do PNG onde essa base
// encosta — medi isso pixel a pixel (pixel não-transparente mais baixo de
// cada imagem, varrendo a largura toda) pra cada um dos 16 personagens, em
// vez de continuar chutando um `seatYOffset` no olho. O assento
// (ARENA2_SEATS) representa a SUPERFÍCIE do degrau; aqui garantimos que
// `supportAnchorY` do avatar caia exatamente nessa superfície:
//   avatar.supportAnchorY (mundo) === seat.y
const DEFAULT_GEOMETRY = {
  anchor: { calm: 0.74, panic: 0.74 },
  supportAnchorY: 0.97,
  bomb: { calm: { x: 50, y: -22, scale: 1 }, panic: { x: 50, y: -20, scale: 0.68 } },
  // multiplicador de TAMANHO por personagem (pedido da Halls) — em cima
  // do `scale` do ASSENTO (que é só profundidade/fileira: fundo menor,
  // frente maior). Existe porque dois personagens no mesmo assento, na
  // mesma largura de cqw, podem "parecer" tamanhos diferentes conforme
  // quanto da própria arte cada um preenche (um pássaro compacto vs um
  // minotauro largo, por exemplo) — isso corrige só essa percepção,
  // sem mexer no assento. Tamanho final = seat.scale * sizeMultiplier.
  sizeMultiplier: 1,
}
const AVATAR_GEOMETRY = {
  // Um item por personagem do elenco (chave = arquivo calm; o panic é
  // <chave>-panic). Todos no canvas padrão 1145x1374, transparente.
  //   supportAnchorY: fração da altura do PNG onde ficam os pés (o ponto mais
  //     baixo) — usado no modo antigo (stage 0) e no debug.
  //   seatContactY: fração da altura onde o CORPO (quadril/barra da saia)
  //     encosta no assento — medido a olho com régua. Propriedade do AVATAR;
  //     o assento só diz onde está o mármore (lipY/blockX).
  //   panicDy: alguns panics foram desenhados mais altos que o calm; é a
  //     fração da altura que o panic desce pra base do corpo ficar no mesmo
  //     lugar (medido comparando o perfil de linhas das duas imagens).
  //   sizeMultiplier / occlude: ajustes opcionais (tamanho; stage 3).
  '/oracle-pilot-calm.webp': { supportAnchorY: 0.9753, sizeMultiplier: 1, seatContactY: 0.69 },
  '/hoplite-sit-calm.webp': { supportAnchorY: 0.99, seatContactY: 0.77 },
  '/owl-sit-calm.webp': { supportAnchorY: 0.938, seatContactY: 0.81 },
  '/minotaur-sit-calm.webp': { supportAnchorY: 0.974, seatContactY: 0.77 },
  '/athena-sit-calm.webp': { supportAnchorY: 0.982, seatContactY: 0.78 },
  '/blossom-sit-calm.webp': { supportAnchorY: 0.977, seatContactY: 0.74 },
  '/faun-sit-calm.webp': { supportAnchorY: 0.984, seatContactY: 0.77 },
  '/naiad-sit-calm.webp': { supportAnchorY: 0.983, seatContactY: 0.76 },
  '/cyclops-sit-calm.webp': { supportAnchorY: 0.965, seatContactY: 0.77 },
  '/boy-sit-calm.webp': { supportAnchorY: 0.953, seatContactY: 0.72 },
  '/nymph-sit-calm.webp': { supportAnchorY: 0.966, seatContactY: 0.73 },
  '/demeter-sit-calm.webp': { supportAnchorY: 0.979, seatContactY: 0.8 },
  '/hermes-sit-calm.webp': { supportAnchorY: 0.979, seatContactY: 0.74 },
  '/apollo-sit-calm.webp': { supportAnchorY: 0.98, seatContactY: 0.79 },
  '/amazon-sit-calm.webp': { supportAnchorY: 0.99, seatContactY: 0.77, panicDy: 0.033 },
  '/sage-sit-calm.webp': { supportAnchorY: 0.98, seatContactY: 0.78 },
  '/whip-sit-calm.webp': { supportAnchorY: 0.97, seatContactY: 0.77, panicDy: 0.016 },
  '/artemis-sit-calm.webp': { supportAnchorY: 0.97, seatContactY: 0.77, panicDy: 0.056 },
  '/hephaestus-sit-calm.webp': { supportAnchorY: 0.97, seatContactY: 0.77, panicDy: 0.044 },
  '/pythagoras-sit-calm.webp': { supportAnchorY: 0.97, seatContactY: 0.78, panicDy: 0.043 },
}
// AJUSTE MICRO ISOLADO — mecanismo mantido (nudge aditivo, só pra um
// arquivo, não mexe em supportAnchorY nem em ARENA2_SEATS), mas o valor
// que tinha (dx:0.2, dy:0.35) foi medido em cima do fundo ANTERIOR
// (arena2-bg-v1.webp) — não faz sentido reaproveitar num fundo diferente.
// Zerado até ver se a arte nova (com a posição do L_B1 já remedida do
// zero) precisa de algum nudge extra.
const TEST_NUDGE = {}
function getAvatarGeometry(src) {
  const g = AVATAR_GEOMETRY[src]
  return {
    anchor: { ...DEFAULT_GEOMETRY.anchor, ...(g?.anchor ?? {}) },
    bomb: { ...DEFAULT_GEOMETRY.bomb, ...(g?.bomb ?? {}) },
    supportAnchorY: g?.supportAnchorY ?? DEFAULT_GEOMETRY.supportAnchorY,
    sizeMultiplier: g?.sizeMultiplier ?? DEFAULT_GEOMETRY.sizeMultiplier,
    seatContactY: g?.seatContactY ?? null,
    occlude: !!g?.occlude,
    panicDy: g?.panicDy ?? 0,
  }
}

// placa de nome presa na FACE do próprio bloco: centrada no bloco (blockX) e
// na parte de baixo da face, abaixo dos pés de quem senta (os pés pendem uns
// 70% da face). Antes ficava na parede ENTRE as fileiras, em cima da cabeça
// de quem senta na fileira de baixo — parecia o nome dele.
const PLATE_ABOVE_EDGE = 0.75
function plateX(s) { return s.blockX ? (s.blockX[0] + s.blockX[1]) / 2 : s.x }
function plateY(s) { return s.blockX ? s.y - PLATE_ABOVE_EDGE : s.namePlateY }

// como o personagem é posicionado neste assento: modo novo (corpo no tampo)
// só se stage>=1, o avatar tem seatContactY e o assento tem lipY.
function placeOnSeat(geo, s) {
  const contact = STAGE >= 1 && geo.seatContactY != null && s.lipY != null
  return {
    contact,
    anchor: contact ? geo.seatContactY : geo.supportAnchorY,
    top: contact ? s.lipY - TOP_DEPTH : s.y,
  }
}

const PencilIcon = () => (
  <svg className="ga-icon" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4" stroke="currentColor" strokeWidth="2.2"
      strokeLinejoin="round" strokeLinecap="round" fill="none" />
  </svg>
)


// troca pra uma segunda arte (expressão de pânico) quando o personagem está com
// a bomba — mesmo mecanismo do GameArena.jsx original.
function SeatAvatar({ src, isHolder, imgRef }) {
  const panicSrc = src.replace('.webp', '-panic.webp')
  const [shown, setShown] = useState(isHolder ? panicSrc : src)

  useEffect(() => {
    setShown(isHolder ? panicSrc : src)
  }, [isHolder, src, panicSrc])

  return (
    <img
      className="ga-avatar"
      src={shown}
      alt=""
      ref={imgRef}
      onError={() => setShown(src)}
    />
  )
}

// V2 do GameArena: mesma lógica/props de sempre (nada de jogo real tocado),
// só a composição visual (fundo novo + card maior + clusters em vez de
// fileiras retas) — protótipo isolado pra aprovar antes de virar o principal.
// celular em pé (ou tablet pequeno em pé): a arena larga não cabe e o teclado estraga tudo,
// então usamos um layout próprio (GameCompact). ?compact=1 força, pra testar no computador.
const COMPACT_QUERY = '(orientation: portrait) and (max-width: 900px)'
function useCompact() {
  const forced = QS.get('compact') === '1'
  const [on, setOn] = useState(() => forced || !!window.matchMedia?.(COMPACT_QUERY).matches)
  useEffect(() => {
    if (forced) return
    const mq = window.matchMedia?.(COMPACT_QUERY)
    if (!mq) return
    const h = () => setOn(mq.matches)
    h()
    mq.addEventListener('change', h)
    return () => mq.removeEventListener('change', h)
  }, [forced])
  return on
}

export default function GameArenaV2({
  room, players, alive, danger, questionMs,
  answer, setAnswer, answerRef, onSubmit, error,
  myPlayerId, povFlash, onPovFlashDone,
  // explosão ("fulano got rugged!") e aviso de resposta errada, vindos do App
  flash = null, feedback = null,
  // novo (spec da Halls, só a parte visual por enquanto): quantos erros o
  // holder atual já tem nessa bomba (0-5, vira 5 bolinhas discretas no
  // card) — a contagem de verdade é Step 4 (App.jsx), aqui é só exibição.
  mistakes = 0,
  // telas fora da partida usam a mesma arena: 'lobby' / 'finished' trocam o
  // cartão da pergunta por `panel` (conteúdo vindo do App). No fim, o vencedor
  // ocupa o centro (centerId) e o resto da turma continua sentado.
  phase = 'playing', panel = null, centerId = null,
  // botão "Leave" do topo: sai da sala e volta pra tela de criar/entrar
  onLeave = null,
}) {
  const inGame = phase === 'playing'
  const compact = useCompact()
  const pct = Math.max(0, Math.min(100, (questionMs / QUESTION_MS) * 100))
  const secs = Math.ceil(questionMs / 1000)
  const urgent = questionMs <= 3000

  // "eu" (myPlayerId) não senta na plateia — fico sozinho no centro vazio
  // (visão em 1ª pessoa: cada jogador se vê ali, e vê todo mundo sentado).
  // Sem myPlayerId (ex.: usos futuros sem "quem sou eu" definido), ninguém
  // é tirado da plateia — comportamento igual ao V1.
  const focusId = centerId ?? myPlayerId
  const myIndex = focusId ? players.findIndex((p) => p.id === focusId) : -1
  const me = myIndex >= 0 ? players[myIndex] : null
  const crowd = focusId ? players.filter((p) => p.id !== focusId) : players
  const isWinnerStage = phase === 'finished' && !!me
  const iAmHolder = inGame && !!me && me.id === room.bomb_holder_id
  const iAmEliminated = inGame && !!me && !me.alive
  const holder = players.find((p) => p.id === room.bomb_holder_id)
  // personagem do jogador = posição dele na lista (ordem de entrada)
  const avatarOf = (p) => AVATARS[avatarIndex(p, players)]

  // atribuição ESTÁVEL jogador → assento (spec item 7): uma vez que alguém
  // ganha um assento, ele fica com ele a partida inteira inteira — pânico,
  // segurar a bomba, ser eliminado, ou a eliminação de QUALQUER outra
  // pessoa nunca move ninguém. Guardado num ref (sobrevive a re-renders) e
  // indexado por ID de jogador, nunca por posição no array — então mesmo
  // que `players` seja reordenado por um update de realtime, quem já tem
  // assento não se mexe. (Isso é estável durante a vida deste componente;
  // pra sobreviver a um F5 no jogo real, precisa persistir em algum lugar
  // — sala/estado do backend — quando isso for ligado ao App.jsx de verdade.)
  const seatAssignmentRef = useRef(new Map()) // playerId -> seatId
  for (const p of crowd) {
    if (seatAssignmentRef.current.size >= ARENA2_SEATS.length) break
    if (!seatAssignmentRef.current.has(p.id)) {
      const used = new Set(seatAssignmentRef.current.values())
      const freeId = SEAT_FILL_ORDER.find((id) => !used.has(id))
      const free = ARENA2_SEATS.find((s) => s.id === freeId)
      if (free) seatAssignmentRef.current.set(p.id, free.id)
    }
  }
  const seated = crowd
    .filter((p) => seatAssignmentRef.current.has(p.id))
    .map((p) => ({ player: p, seat: ARENA2_SEATS.find((s) => s.id === seatAssignmentRef.current.get(p.id)) }))
    // defesa contra hot-reload em dev: se ARENA2_SEATS mudar de forma
    // (IDs diferentes) enquanto o componente já está montado, o ref pode
    // guardar um ID de assento que não existe mais na array nova — um
    // reload completo da página resolve, isso só evita a tela quebrar
    // até lá.
    .filter(({ seat }) => !!seat)

  const avatarRefs = useRef({})
  const prevHolderRef = useRef(null)
  const flightSeqRef = useRef(0)
  const flightTimerRef = useRef(null)
  const [flight, setFlight] = useState(null)
  const [povSeq, setPovSeq] = useState(0)

  useEffect(() => {
    if (povFlash != null) setPovSeq((n) => n + 1)
  }, [povFlash])

  useEffect(() => {
    const prevId = prevHolderRef.current
    const nextId = room.bomb_holder_id
    prevHolderRef.current = nextId

    if (!prevId || !nextId || prevId === nextId) return

    const prevPlayer = players.find((p) => p.id === prevId)
    if (!prevPlayer || !prevPlayer.alive) return

    // sons: a bomba chegou em mim / voou entre outros / saiu de mim (acertei)
    if (myPlayerId && nextId === myPlayerId) play('bomb_received')
    else play('bomb_pass')
    if (myPlayerId && prevId === myPlayerId) play('correct')

    if (myPlayerId && nextId === myPlayerId) {
      setPovSeq((n) => n + 1)
    }

    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return

    const fromEl = avatarRefs.current[prevId]
    const toEl = avatarRefs.current[nextId]
    if (!fromEl || !toEl) return

    const a = fromEl.getBoundingClientRect()
    const b = toEl.getBoundingClientRect()
    const x0 = a.left + a.width / 2, y0 = a.top + a.height / 2
    const x1 = b.left + b.width / 2, y1 = b.top + b.height / 2

    const seq = ++flightSeqRef.current
    setFlight({
      seq,
      id: nextId,
      vars: {
        '--x0': `${x0}px`, '--y0': `${y0}px`,
        '--x1': `${x1}px`, '--y1': `${y1}px`,
        '--xm': `${(x0 + x1) / 2}px`, '--ym': `${Math.min(y0, y1) - 60}px`,
      },
    })
    // o timer NÃO pode morrer com o cleanup do effect: se 'players' mudar
    // (resposta certa atualiza a lista quase junto) a bomba ficava presa na tela
    clearTimeout(flightTimerRef.current)
    flightTimerRef.current = setTimeout(() => {
      setFlight((f) => (f && f.seq === seq ? null : f))
    }, 600)
  }, [room.bomb_holder_id, players, myPlayerId])

  useEffect(() => () => clearTimeout(flightTimerRef.current), [])

  // música de fundo: abaixa durante a partida pra o coração da bomba e os efeitos aparecerem
  useEffect(() => {
    setMusicDuck(inGame)
    return () => setMusicDuck(false)
  }, [inGame])

  // ---- sons do jogo ----
  const prevDangerRef = useRef(danger)
  useEffect(() => {
    if (danger > prevDangerRef.current && danger > 1) play('danger_up', { level: danger })
    prevDangerRef.current = danger
  }, [danger])

  // pulso de bomba enquanto EU seguro ela: acelera conforme o perigo sobe
  useEffect(() => {
    if (!iAmHolder || iAmEliminated) return
    const ms = { 1: 1000, 2: 720, 3: 400, 4: 300 }[danger] ?? 1000
    const id = setInterval(() => play('tick', { level: danger }), ms)
    return () => clearInterval(id)
  }, [iAmHolder, iAmEliminated, danger])

  // tique de relógio enquanto OUTRO jogador segura a bomba (mesmo ritmo por perigo)
  const someoneElseHolds = inGame && !!room.bomb_holder_id && !iAmHolder
  useEffect(() => {
    if (!someoneElseHolds) return
    const ms = { 1: 1000, 2: 720, 3: 400, 4: 300 }[danger] ?? 1000
    const id = setInterval(() => play('clock_tick', { level: danger }), ms)
    return () => clearInterval(id)
  }, [someoneElseHolds, danger])

  useEffect(() => { if (flash) play('explosion') }, [flash])
  useEffect(() => { if (feedback) play('wrong') }, [feedback])
  // a risada entra DEPOIS do estrondo (senão um abafa o outro) e toca pra TODO MUNDO quando alguém
  // explode. Ligada ao aviso de explosão (flash), não ao estado 'eliminado': assim não repete
  // quando alguém já eliminado recarrega a página.
  useEffect(() => {
    if (!flash) return
    const id = setTimeout(() => play('eliminated'), 900)
    return () => clearTimeout(id)
  }, [flash])

  if (compact) {
    return (
      <GameCompact
        room={room} players={players} alive={alive} phase={phase} panel={panel} centerId={centerId}
        danger={danger} pct={pct} secs={secs} urgent={urgent}
        answer={answer} setAnswer={setAnswer} answerRef={answerRef} onSubmit={onSubmit}
        error={error} feedback={feedback} mistakes={mistakes} flash={flash}
        myPlayerId={myPlayerId} holder={holder} iAmHolder={iAmHolder} iAmEliminated={iAmEliminated}
        avatarOf={avatarOf} avatarRefs={avatarRefs} flight={flight} bombSeq={povSeq}
        questionMax={QUESTION_MS / 1000} onLeave={onLeave}
      />
    )
  }

  return (
    <main className="ga-stage">
      <div className="ga-arena">
        <div className="ga-bg" />
        <div className="ga-shade" />

        <div className="ga-hud">
          <span className="ga-chip">👥 {inGame ? (alive?.length ?? 0) : players.length}/{ARENA2_SEATS.length} players</span>
          <div className="ga-hud-right">
            <LeaveButton onLeave={onLeave} inGame={inGame} />
            <SoundToggle />
            <span className="ga-chip">
              {inGame ? `Round ${room.round_number} · Classic` : phase === 'lobby' ? 'Lobby · Classic' : 'Game over'}
            </span>
          </div>
        </div>

        {flight && (
          <img key={flight.seq} className="ga-flying-bomb" src="/bomb-laurel.webp" alt="" aria-hidden="true" style={flight.vars} />
        )}

        <div className="ga-seats">
          {seated.map(({ player: p, seat: s }) => {
            const isHolder = p.id === room.bomb_holder_id
            const isOut = !p.alive
            const src = avatarOf(p)
            const geo = getAvatarGeometry(src)
            const pose = isHolder ? 'panic' : 'calm'
            const bomb = geo.bomb[pose]
            const z = isHolder ? 100 : s.zIndex
            // vira de frente pro centro (spec: ala esquerda olha pra
            // direita, ala direita olha pra esquerda) — CROWN (x:50) não
            // entra nessa conta, fica de frente igual sempre.
            const faceMirror = s.x < 50
            const nudge = TEST_NUDGE[src]
            const place = placeOnSeat(geo, s)
            return (
              <div key={p.id}
                className={`ga-seat${isHolder ? ` is-holder dl-${danger}` : ''}${isOut ? ' is-out' : ''}${faceMirror ? ' ga-mirror' : ''}${place.contact ? ` has-contact st-${STAGE}` : ''}`}
                style={{
                  left: `${s.x + (s.dx ?? 0) + (nudge?.dx ?? 0)}%`, top: `${place.top + (nudge?.dy ?? 0)}%`, zIndex: z,
                  // posição no mundo: ponto de apoio do avatar (seatContactY
                  // no modo novo, supportAnchorY no antigo).
                  '--ga-seat-anchor': place.anchor,
                  '--ga-panic-dy': geo.panicDy,
                  // assento (profundidade/fileira) × personagem (percepção
                  // de tamanho individual) — ver DEFAULT_GEOMETRY.sizeMultiplier.
                  '--ga-seat-scale': s.scale * geo.sizeMultiplier,
                }}>
                <div className="ga-seat-shadow" aria-hidden="true" />
                {SHOW_GROUND_DEBUG && (
                  <>
                    <span className="ga-ground-line" aria-hidden="true" />
                    <span className="ga-ground-dot" aria-hidden="true" />
                  </>
                )}
                {CONTACT_DEBUG && (
                  <>
                    <span className="ga-dbg-dot ga-dbg-contact" aria-hidden="true"
                      style={{ top: `${place.anchor * 100}%` }} />
                    <span className="ga-dbg-dot ga-dbg-feet" aria-hidden="true"
                      style={{ top: `${geo.supportAnchorY * 100}%` }} />
                  </>
                )}
                {isHolder && (
                  <>
                    <div className="ga-glow" />
                    <div className="ga-ring" />
                    <div className="ga-sparks" aria-hidden="true">
                      <span /><span /><span /><span />
                    </div>
                  </>
                )}
                <SeatAvatar
                  src={src}
                  isHolder={isHolder}
                  imgRef={(el) => {
                    if (el) avatarRefs.current[p.id] = el
                    else delete avatarRefs.current[p.id]
                  }}
                />
                {isHolder && (
                  <div className="ga-bomb-float" aria-hidden="true"
                    style={{ left: `${bomb.x}%`, top: `${bomb.y}%`, '--ga-bomb-local-scale': bomb.scale }}>
                    <img src="/bomb-laurel.webp" alt="" width="1254" height="1254" />
                  </div>
                )}
                {SHOW_SEAT_DEBUG && (
                  <span className="ga-debug-dot ga-debug-dot-bomb" aria-hidden="true"
                    style={{ left: `${bomb.x}%`, top: `${bomb.y}%` }} />
                )}
              </div>
            )
          })}

          {/* stage 3: a borda/face do bloco (recorte do próprio fundo) por
              cima da base de quem tem `occlude`, alinhada ao fundo pq usa o
              mesmo background-size e o mesmo recorte em % da arena */}
          {STAGE >= 3 && seated.map(({ player: p, seat: s }) => {
            const geo = getAvatarGeometry(avatarOf(p))
            if (!geo.occlude || !placeOnSeat(geo, s).contact) return null
            const [x0, x1] = s.blockX
            const y0 = s.lipY, y1 = s.y
            return (
              <div key={`occ-${p.id}`} className="ga-occluder" aria-hidden="true"
                style={{
                  zIndex: s.zIndex,
                  clipPath: `polygon(${x0}% ${y0}%, ${x1}% ${y0}%, ${x1}% ${y1}%, ${x0}% ${y1}%)`,
                }} />
            )
          })}

          {CONTACT_DEBUG && seated.map(({ player: p, seat: s }) => (
            <span key={`dbg-${p.id}`} aria-hidden="true">
              <span className="ga-dbg-line ga-dbg-top" style={{ left: `${s.blockX[0]}%`, width: `${s.blockX[1] - s.blockX[0]}%`, top: `${s.lipY - TOP_DEPTH}%` }} />
              <span className="ga-dbg-line ga-dbg-lip" style={{ left: `${s.blockX[0]}%`, width: `${s.blockX[1] - s.blockX[0]}%`, top: `${s.lipY}%` }} />
              <span className="ga-dbg-line ga-dbg-edge" style={{ left: `${s.blockX[0]}%`, width: `${s.blockX[1] - s.blockX[0]}%`, top: `${s.y}%` }} />
            </span>
          ))}
        </div>

        {/* plaquinhas de nome numa camada própria, sempre por cima de
            QUALQUER avatar — sem isso, quem senta na frente (maior, com
            z-index mais alto) tampa o nome de quem senta atrás. A âncora
            do nome usa SEMPRE a geometria "calm" (spec item 5: calmo →
            pânico nunca pode mover a placa de nome).
            Quando o assento define `namePlateY` (posição medida da face
            frontal do bloco de mármore — ver ARENA2_SEATS), a placa vira
            uma "plaqueta entalhada" presa no bloco, numa posição fixa do
            MUNDO, independente da altura do personagem. Sem isso, cai no
            comportamento antigo (balão flutuando acima da cabeça) — ainda
            não recalibrado pros outros 18 assentos. */}
        <div className="ga-seats">
          {seated.map(({ player: p, seat: s }) => {
            const src = avatarOf(p)
            const geo = getAvatarGeometry(src)
            if (s.namePlateY != null) {
              return (
                <div key={p.id}
                  className={`ga-seat-plaque${!p.alive ? ' is-out' : ''}`}
                  style={{ left: `${plateX(s)}%`, top: `${plateY(s)}%`, zIndex: s.zIndex + 1 }}>
                  {p.nickname}
                </div>
              )
            }
            return (
              <div key={p.id}
                className={`ga-seat-name${!p.alive ? ' is-out' : ''}`}
                style={{
                  left: `${s.x}%`, top: `${s.y}%`, zIndex: s.zIndex,
                  '--ga-seat-anchor': geo.supportAnchorY,
                  '--ga-seat-scale': s.scale * geo.sizeMultiplier,
                }}>
                <span className="ga-name">{p.nickname}</span>
                {SHOW_SEAT_DEBUG && <span className="ga-debug-dot ga-debug-dot-name" aria-hidden="true" />}
              </div>
            )
          })}
        </div>

        {me && (
          <div className={`ga-me-stage${iAmHolder ? ` is-holder dl-${danger}` : ''}${iAmEliminated ? ' is-out' : ''}${isWinnerStage ? ' is-winner' : ''}`}
            style={{
              left: `${LOCAL_PLAYER.x}%`, top: `${LOCAL_PLAYER.y}%`,
              width: `${LOCAL_PLAYER.widthCqw}cqw`, marginLeft: `${-LOCAL_PLAYER.widthCqw / 2}cqw`,
              zIndex: iAmHolder ? 200 : LOCAL_PLAYER.zIndex,
            }}>
            {iAmHolder && (
              <>
                <div className="ga-glow" />
                <div className="ga-ring" />
                <div className="ga-sparks" aria-hidden="true">
                  <span /><span /><span /><span />
                </div>
              </>
            )}
            <SeatAvatar
              src={avatarOf(me)}
              isHolder={iAmHolder}
              imgRef={(el) => {
                if (el) avatarRefs.current[me.id] = el
                else delete avatarRefs.current[me.id]
              }}
            />
            {iAmHolder && (
              <div className="ga-bomb-float" aria-hidden="true">
                <img src="/bomb-laurel.webp" alt="" width="1254" height="1254" />
              </div>
            )}
            {isWinnerStage && <span className="ga-crown" role="img" aria-label="Winner">👑</span>}
            <span className="ga-name">{me.nickname}</span>
          </div>
        )}

        {!inGame && (
          <>
            <section className={`ga-card ga-panel ga-panel-${phase}`}>{panel}</section>
          </>
        )}

        {inGame && (
        <section className={`ga-card dl-${danger}`}>
          <img className="ga-logo" src="/logo.webp" alt="Pyth Bomb" width="2000" height="667" />
          <p className="ga-qnum">Question</p>
          <p className="ga-qtext">{room.current_question_text}</p>

          <div className="ga-time">
            <div className="ga-track" role="progressbar" aria-label="Time left for this question"
              aria-valuemin={0} aria-valuemax={QUESTION_MS / 1000} aria-valuenow={secs}>
              <div className={`ga-fill${urgent ? ' is-urgent' : ''}`} style={{ width: `${pct}%` }} />
            </div>
            <span className={`ga-secs${urgent ? ' is-urgent' : ''}`}>{secs}s</span>
          </div>

          {/* só quem tem a bomba responde — todo mundo vê a pergunta, mas o
              campo só fica ativo pra quem está segurando (spec item 4) */}
          {iAmEliminated ? (
            <p className="ga-status ga-status-out">ELIMINATED — WATCHING</p>
          ) : iAmHolder ? (
            <form className="ga-answer" onSubmit={onSubmit}>
              <label className="ga-field">
                <PencilIcon />
                <input
                  ref={answerRef}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  aria-label="Your answer"
                  placeholder="type your answer…"
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                />
              </label>
              <button type="submit" className="ga-send">Answer</button>
            </form>
          ) : (
            <p className="ga-status">{holder?.nickname ?? '...'} HAS THE BOMB</p>
          )}

          {/* 5 bolinhas discretas — erros do holder atual nessa bomba (spec
              item 7). So aparece pra quem tem a bomba, onde importa de verdade. */}
          {iAmHolder && !iAmEliminated && (
            <div className="ga-mistakes" aria-label={`${mistakes} of 5 mistakes`}>
              {Array.from({ length: 5 }, (_, i) => (
                <span key={i} className={`ga-mistake-dot${i < mistakes ? ' is-filled' : ''}`} />
              ))}
            </div>
          )}

          {feedback && <p className="ga-error" role="alert">{feedback}</p>}
          {error && <p className="ga-error" role="alert">{error}</p>}
        </section>
        )}

        {/* overlay de calibração (spec item 2) — mostra os 19 assentos do
            blueprint, ocupados ou não, com cruz no ponto exato (x%, y%) e
            uma caixa aproximada do tamanho do personagem (largura base ×
            o `scale` do assento). Só visual, pointer-events:none, não
            entra no fluxo de layout de ninguém. */}
        {SHOW_SEAT_DEBUG && (
          <div className="ga-debug" aria-hidden="true">
            {ARENA2_SEATS.map((s) => {
              const boxW = 4.55 * s.scale
              const boxH = boxW * (1374 / 1145)
              return (
                <div key={s.id} className="ga-debug-slot" style={{ left: `${s.x}%`, top: `${s.y}%`, zIndex: s.zIndex }}>
                  <div className="ga-debug-box" style={{ width: `${boxW}cqw`, height: `${boxH}cqw` }} />
                  <span className="ga-debug-cross" />
                  <span className="ga-debug-label">{s.id}</span>
                </div>
              )
            })}
          </div>
        )}

        <RuggedOverlay flash={flash} />

        {povSeq > 0 && <BombPovFlash playKey={povSeq} onDone={onPovFlashDone} />}
      </div>
      {phase === 'finished' && <Confetti />}
    </main>
  )
}
