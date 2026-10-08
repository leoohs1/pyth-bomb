import { useEffect, useRef, useState } from 'react'
import {
  play, unlock, getSoundState, subscribeSound,
  setMusicMuted, setMusicVolume, setSfxMuted, setSfxVolume,
} from './sound.js'

// Botão de som: ao clicar abre um painelzinho com DOIS controles — Música ambiente e Sons do
// jogo — cada um com mudo e volume. Lembra a escolha no navegador (sound.js).
// `className` extra no invólucro: "sound-fixed" fixa o botão no canto das telas fora da arena.
function Row({ label, muted, volume, onMute, onVolume, onRelease }) {
  const pct = Math.round(volume * 100)
  return (
    <div className="snd-row">
      <div className="snd-row-head">
        <span className="snd-label">{label}</span>
        <button type="button" className={`snd-mute${muted ? ' is-off' : ''}`} onClick={onMute}
          aria-pressed={muted} aria-label={`${muted ? 'Turn on' : 'Turn off'} ${label}`}>
          {muted ? 'Off' : 'On'}
        </button>
      </div>
      <div className="snd-slider">
        <span aria-hidden="true">{muted || volume === 0 ? '🔇' : '🔈'}</span>
        <input type="range" min="0" max="100" step="1" value={pct} disabled={muted}
          aria-label={`${label} volume`}
          onChange={(e) => onVolume(Number(e.target.value) / 100)}
          onPointerUp={onRelease} onKeyUp={onRelease} />
        <span className="snd-pct" aria-hidden="true">{muted ? '—' : `${pct}%`}</span>
      </div>
    </div>
  )
}

export default function SoundToggle({ className = '' }) {
  const [st, setSt] = useState(getSoundState())
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)
  useEffect(() => subscribeSound(setSt), [])

  // fecha clicando fora ou com Esc
  useEffect(() => {
    if (!open) return
    const onDown = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const allOff = st.musicMuted && st.sfxMuted
  return (
    <div className={`snd-wrap ${className}`.trim()} ref={wrapRef}>
      <button type="button" className="ga-chip ga-sound"
        onClick={() => { unlock(); setOpen((o) => !o) }}
        aria-haspopup="dialog" aria-expanded={open}
        aria-label="Sound settings" title="Sound settings">
        {allOff ? '🔇' : '🔊'}
      </button>
      {open && (
        <div className="snd-pop" role="dialog" aria-label="Sound settings">
          <Row label="Ambient music" muted={st.musicMuted} volume={st.musicVolume}
            onMute={() => setMusicMuted(!st.musicMuted)} onVolume={setMusicVolume} />
          <Row label="Game sounds" muted={st.sfxMuted} volume={st.sfxVolume}
            onMute={() => { unlock(); setSfxMuted(!st.sfxMuted) }} onVolume={setSfxVolume}
            onRelease={() => play('bomb_pass')} />
        </div>
      )}
    </div>
  )
}
