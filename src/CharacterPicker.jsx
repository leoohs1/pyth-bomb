import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { CHARACTER_NAMES, avatarIndex } from './characters.js'

// Janela "Escolha seu personagem" (lobby). Mostra os 20; os que outros jogadores já escolheram
// ficam apagados com o apelido de quem pegou. Os nomes oficiais dos personagens NÃO aparecem
// (decisão da Halls); só as imagens. Vai pro <body> (portal) porque o cartão da arena tem
// transform e "prenderia" uma janela fixa dentro dele.
export default function CharacterPicker({ players, me, onPick, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const myIdx = me ? avatarIndex(me, players) : -1
  const takenBy = new Map()
  for (const p of players) if (p.id !== me?.id) takenBy.set(avatarIndex(p, players), p.nickname)

  return createPortal(
    <div className="cp-backdrop" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="cp-modal" role="dialog" aria-label="Choose your character">
        <div className="cp-head">
          <h2 className="cp-title">Choose your character</h2>
          <button type="button" className="cp-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="cp-grid">
          {CHARACTER_NAMES.map((c, i) => {
            const owner = takenBy.get(i)
            const mine = i === myIdx
            return (
              <button key={c.file} type="button"
                className={`cp-tile${mine ? ' is-mine' : ''}${owner ? ' is-taken' : ''}`}
                disabled={!!owner} aria-pressed={mine}
                aria-label={owner ? `Taken by ${owner}` : mine ? 'Your character' : 'Pick this character'}
                onClick={() => { if (!mine) onPick(i); onClose() }}>
                <img src={c.file} alt="" loading="lazy" />
                {mine && <span className="cp-badge">You</span>}
                {owner && <span className="cp-badge cp-owner">{owner}</span>}
              </button>
            )
          })}
        </div>
        <p className="cp-hint">Pick one that isn't taken. You can change it until the game starts.</p>
      </div>
    </div>,
    document.body
  )
}
