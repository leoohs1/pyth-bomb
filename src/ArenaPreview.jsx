import { useEffect, useState } from 'react'
import './ArenaPreview.css'

// PROTÓTIPO — não é o jogo de verdade, é só um teste visual da ideia da
// "arquibancada" (assentos fixos, personagens visíveis, brilho em quem tem a bomba).
// Tudo aqui é estático/inventado: nicks, avatares, pergunta. Vive isolado do resto
// do app (nada em App.jsx/Game.jsx foi tocado) — se não ficar bom, é só apagar
// este arquivo e o ArenaPreview.css que nada muda no jogo real.

// elenco sentado (entregue por Halls) — se um dia tiver mais gente que isso, repete
const AVATARS = [
  '/seat-oracle.webp', '/seat-athena.webp', '/seat-cyclops2.webp', '/seat-spartan.webp',
  '/seat-minotaur2.webp', '/seat-owl.webp', '/seat-amphora.webp', '/seat-boy.webp',
  '/seat-nymph.webp', '/seat-blossom.webp', '/seat-faun.webp', '/seat-statue.webp',
  '/seat-raven.webp', '/seat-pegasus.webp', '/seat-naiad.webp', '/seat-ram.webp',
]

// linha (0 = banco de baixo, mais perto/maior ... 2 = banco de cima, mais longe/
// menor), posição horizontal (%). O novo fundo tem bancos retos de ponta a
// ponta, então as linhas 0 e 1 usam a largura toda. Só a linha 2 divide a altura
// com o cartão (que fica lá no alto), por isso ela evita o centro (~30%-70%).
const SEATS = [
  { row: 0, left: 2, name: 'Dion' },
  { row: 0, left: 19, name: 'Nico', holder: true },
  { row: 0, left: 36, name: 'Aria' },
  { row: 0, left: 64, name: 'Selene' },
  { row: 0, left: 81, name: 'Vale' },
  { row: 0, left: 98, name: 'Pippa' },
  { row: 1, left: 6, name: 'Kai' },
  { row: 1, left: 22, name: 'Luna' },
  { row: 1, left: 38, name: 'Midas', out: true },
  { row: 1, left: 62, name: 'Brotaur' },
  { row: 1, left: 78, name: 'Rhea' },
  { row: 1, left: 94, name: 'Talos' },
  { row: 2, left: 8, name: 'Zephyra' },
  { row: 2, left: 24, name: 'Neridus' },
  { row: 2, left: 76, name: 'Athenaaa' },
  { row: 2, left: 92, name: 'Ophira' },
]

// troca pra uma segunda arte (expressão de pânico) quando o personagem está com a
// bomba. Convenção de nome: "seat-oracle.webp" -> "seat-oracle-panic.webp". Se
// esse arquivo ainda não existir, cai sozinho de volta pro padrão — sem quebrar
// nada. Assim que Halls entregar a versão "-panic" de alguém, já funciona sozinho.
function SeatAvatar({ src, isHolder }) {
  const panicSrc = src.replace('.webp', '-panic.webp')
  const [shown, setShown] = useState(isHolder ? panicSrc : src)

  useEffect(() => {
    setShown(isHolder ? panicSrc : src)
  }, [isHolder, src, panicSrc])

  return (
    <img
      className="ar-avatar"
      src={shown}
      alt=""
      onError={() => setShown(src)}  // "-panic" não existe ainda: usa a padrão
    />
  )
}

export default function ArenaPreview() {
  const alive = SEATS.filter((s) => !s.out).length

  return (
    <main className="ar-stage">
      <div className="ar-bg" />
      <div className="ar-shade" />

      <div className="ar-hud">
        <span className="ar-chip">👥 {alive}/20 players</span>
        <span className="ar-chip">Round 3 · Classic</span>
      </div>

      <div className="ar-seats">
        {SEATS.map((s, i) => (
          <div
            key={i}
            className={`ar-seat ar-row-${s.row}${s.holder ? ' is-holder' : ''}${s.out ? ' is-out' : ''}`}
            style={{ left: `${s.left}%` }}
          >
            {s.holder && <div className="ar-glow" />}
            <SeatAvatar src={AVATARS[i % AVATARS.length]} isHolder={!!s.holder} />
            {s.holder && <span className="ar-bomb" aria-hidden="true">💣</span>}
            <span className="ar-name">{s.name}</span>
          </div>
        ))}
      </div>

      <section className="ar-card">
        <p className="ar-qnum">Question 3</p>
        <p className="ar-qtext">Which ancient wonder was located in the city of Rhodes?</p>
        <div className="ar-time">
          <div className="ar-track"><div className="ar-fill" /></div>
          <span>7s</span>
        </div>
        <div className="ar-answer">
          <input placeholder="type your answer…" disabled />
          <button type="button" disabled>Answer</button>
        </div>
        <p className="ar-note">protótipo estático — layout only</p>
      </section>
    </main>
  )
}
