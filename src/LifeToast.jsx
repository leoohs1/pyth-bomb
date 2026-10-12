// Aviso de "perdeu uma vida": faixa pequena no alto da tela (e um clarão vermelho quando é VOCÊ).
// A explosão grande ("got rugged!!!") só acontece quando a última vida acaba (RuggedOverlay).
export default function LifeToast({ lifeFlash }) {
  if (!lifeFlash) return null
  return (
    <div key={lifeFlash.key} className={`ga-lifeflash${lifeFlash.mine ? ' is-mine' : ''}`} role="status">
      {lifeFlash.mine && <div className="ga-lifeflash-vignette" aria-hidden="true" />}
      <p className="ga-lifeflash-text">
        💔 {lifeFlash.mine ? 'You lost a life!' : `${lifeFlash.name} lost a life!`}
      </p>
    </div>
  )
}
