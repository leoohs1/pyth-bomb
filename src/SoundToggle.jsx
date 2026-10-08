import { useEffect, useState } from 'react'
import { unlock, getSoundState, setMuted, subscribeSound } from './sound.js'

// botão de mutar/ligar TODO o som (efeitos + música). Lembra a escolha no navegador.
// `className` extra: "sound-fixed" fixa o botão no canto das telas fora da arena.
export default function SoundToggle({ className = '' }) {
  const [st, setSt] = useState(getSoundState())
  useEffect(() => subscribeSound(setSt), [])
  return (
    <button type="button" className={`ga-chip ga-sound ${className}`.trim()}
      onClick={() => { unlock(); setMuted(!st.muted) }}
      aria-label={st.muted ? 'Turn sound on' : 'Mute sound'} title={st.muted ? 'Sound off' : 'Sound on'}>
      {st.muted ? '🔇' : '🔊'}
    </button>
  )
}
