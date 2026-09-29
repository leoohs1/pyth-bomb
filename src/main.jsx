import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import Landing from './Landing.jsx'
import ArenaPreview from './ArenaPreview.jsx'
import GameArenaHarness from './GameArenaHarness.jsx'

const path = window.location.pathname
// rotas separadas, só pra testar ideias visualmente — não fazem parte do jogo
// de verdade, ninguém chega nelas sem saber o link exato
const page = path.startsWith('/arena-preview') ? <ArenaPreview />
  : path.startsWith('/game-arena-preview') ? <GameArenaHarness />
  : path.startsWith('/play') ? <App />
  : <Landing />

createRoot(document.getElementById('root')).render(
  <StrictMode>{page}</StrictMode>,
)