import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './music.js' // música de fundo (começa no primeiro clique)
import App from './App.jsx'
import Landing from './Landing.jsx'
import PlayGate from './PlayGate.jsx'
import ArenaPreview from './ArenaPreview.jsx'
import GameArenaV2Harness from './GameArenaV2Harness.jsx'
import SoloGame from './solo/SoloGame.jsx'
import SoloSounds from './solo/SoloSounds.jsx'
import PriceApp from './price/PriceApp.jsx'
import PricePreview from './price/PricePreview.jsx'
import SongApp from './song/SongApp.jsx'
import SongPreview from './song/SongPreview.jsx'
import PersonApp from './person/PersonApp.jsx'
import PersonPreview from './person/PersonPreview.jsx'
import PokerApp from './poker/PokerApp.jsx'
import PokerPreview from './poker/PokerPreview.jsx'

const path = window.location.pathname
// rotas separadas, só pra testar ideias visualmente — não fazem parte do jogo
// de verdade, ninguém chega nelas sem saber o link exato. (A rota do protótipo
// V1 da arena saiu: o CSS dela usa as mesmas classes .ga-* da Arena 2.0 e
// sobrescrevia o fundo quando entrava no mesmo bundle.)
const page = path.startsWith('/arena-preview') ? <ArenaPreview />
  : path.startsWith('/game-arena-v2-preview') ? <GameArenaV2Harness />
  : path.startsWith('/solo-sons') ? <PlayGate><SoloSounds /></PlayGate> // tela pra ouvir os sons do Solo (sem jogar)
  : path.startsWith('/solo') ? <PlayGate><SoloGame /></PlayGate> // modo Solo (protótipo, fechado como o /play)
  : path.startsWith('/price-preview') ? <PricePreview /> // prévia do visual do Guess the Price (dados de mentira)
  : path.startsWith('/price') ? <PlayGate><PriceApp /></PlayGate> // Guess the Price (fechado como o /play)
  : path.startsWith('/song-preview') ? <SongPreview /> // prévia do visual do Guess the Song (dados de mentira)
  : path.startsWith('/song') ? <PlayGate><SongApp /></PlayGate> // Guess the Song (fechado como o /play)
  : path.startsWith('/person-preview') ? <PersonPreview /> // prévia do visual do Guess the Person (dados de mentira)
  : path.startsWith('/person') ? <PlayGate><PersonApp /></PlayGate> // Guess the Person (fechado como o /play)
  : path.startsWith('/poker-preview') ? <PokerPreview /> // prévia do visual do Pyth Poker (dados de mentira)
  : path.startsWith('/poker') ? <PlayGate><PokerApp /></PlayGate> // Pyth Poker (fechado como o /play)
  : path.startsWith('/play') ? <PlayGate><App /></PlayGate>
  : <Landing href="/play" /> // página inicial: o "Play now" leva pro /play

createRoot(document.getElementById('root')).render(
  <StrictMode>{page}</StrictMode>,
)