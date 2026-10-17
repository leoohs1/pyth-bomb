import './modes.css'

// Placar geral dos modos de rodada (pontos somados): no fim, os 5 primeiros; na revelação
// (compact), os 3 primeiros. Se eu estiver fora do topo, apareço no fim com a minha posição.
export default function ScoreList({ players, me, compact = false }) {
  const sorted = [...players].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
  const top = sorted.slice(0, compact ? 3 : 5)
  const myPos = sorted.findIndex((p) => p.id === me?.id)
  if (myPos >= top.length) top.push(sorted[myPos])
  return (
    <div className={`rm-scores${compact ? ' is-compact' : ''}`}>
      <p className="rm-scores-title">{compact ? 'Leaders' : 'Final score'}</p>
      <ol>
        {top.map((p) => (
          <li key={p.id} className={p.id === me?.id ? 'is-me' : ''}>
            <span>{sorted.indexOf(p) + 1}. {p.nickname}</span>
            <b>{(p.score ?? 0).toLocaleString('en-US')}</b>
          </li>
        ))}
      </ol>
    </div>
  )
}
