import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import Landing from './Landing.jsx'
import ArenaPreview from './ArenaPreview.jsx'

const path = window.location.pathname
// rota separada, só pra testar a ideia da arquibancada visualmente — não faz parte
// do jogo de verdade, ninguém chega nela sem saber o link exato
const page = path.startsWith('/arena-preview') ? <ArenaPreview />
  : path.startsWith('/play') ? <App />
  : <Landing />

createRoot(document.getElementById('root')).render(
  <StrictMode>{page}</StrictMode>,
)