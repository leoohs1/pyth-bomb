import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import Landing from './Landing.jsx'

const isGame = window.location.pathname.startsWith('/play')

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {isGame ? <App /> : <Landing />}
  </StrictMode>,
)