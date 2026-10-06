import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import Landing from './Landing.jsx'
import ArenaPreview from './ArenaPreview.jsx'
import GameArenaV2Harness from './GameArenaV2Harness.jsx'

const path = window.location.pathname
// rotas separadas, só pra testar ideias visualmente — não fazem parte do jogo
// de verdade, ninguém chega nelas sem saber o link exato. (A rota do protótipo
// V1 da arena saiu: o CSS dela usa as mesmas classes .ga-* da Arena 2.0 e
// sobrescrevia o fundo quando entrava no mesmo bundle.)
const page = path.startsWith('/arena-preview') ? <ArenaPreview />
  : path.startsWith('/game-arena-v2-preview') ? <GameArenaV2Harness />
  : path.startsWith('/play') ? <App />
  : <Landing />

createRoot(document.getElementById('root')).render(
  <StrictMode>{page}</StrictMode>,
)