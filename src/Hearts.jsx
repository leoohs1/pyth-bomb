// Vidas de um jogador (2 corações: cheio = vida que sobra, apagado = vida perdida).
export default function Hearts({ lives, max = 2, className = 'ga-hearts' }) {
  const n = Math.max(0, Math.min(max, lives ?? 0))
  return (
    <span className={className} role="img" aria-label={`${n} of ${max} lives`}>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={i < n ? 'is-full' : 'is-empty'}>♥</span>
      ))}
    </span>
  )
}
