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
  '/seat-nymph.webp', '/seat-blossom.webp',
]

// linha (0 = mais perto/maior, 2 = mais longe/menor), posição horizontal (%), nick.
// o cartão da pergunta ocupa o meio-baixo da tela: as linhas 0 e 1 (mais perto,
// maiores) não podem ter ninguém entre ~26%-74%, senão fica escondido atrás dele.
// só a linha 2 (mais longe, no alto) pode ocupar o centro com segurança.
const SEATS = [
  { row: 0, left: 2, name: 'Dion' },
  { row: 0, left: 14, name: 'Nico', holder: true },
  { row: 0, left: 86, name: 'Selene' },
  { row: 0, left: 98, name: 'Vale' },
  { row: 1, left: 6, name: 'Luna' },
  { row: 1, left: 20, name: 'Midas', out: true },
  { row: 1, left: 80, name: 'Athenaaa' },
  { row: 1, left: 94, name: 'Neridus' },
  { row: 2, left: 15, name: 'Brotaur' },
  { row: 2, left: 32, name: 'Zephyra' },
  { row: 2, left: 50, name: 'Aria' },
  { row: 2, left: 68, name: 'Kai' },
  { row: 2, left: 85, name: 'Rhea' },
]

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
            <img className="ar-avatar" src={AVATARS[i % AVATARS.length]} alt="" />
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
