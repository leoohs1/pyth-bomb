// arte do deboche quando EU exploda (Oráculo rindo do Minotauro chamuscado) e a arte pequena
// que aparece quando OUTRA pessoa explode. Troque os arquivos em public/ pra mudar.
const RUGGED_IMG_MINE = '/rugged-taunt.webp'
const RUGGED_IMG_OTHER = '/minotaur.webp'

// aviso de explosão: "X got rugged!" pra todo mundo; pra quem explodiu, a tela
// toda treme, fica vermelha e a arte debocha ("HA HA HA")
export default function RuggedOverlay({ flash }) {
  if (!flash) return null
  return (
    <div key={flash.name + (flash.mine ? 'm' : '')} className={`ga-rugged${flash.mine ? ' is-mine' : ''}`} role="status">
      <div className="ga-rugged-body">
        <div className="ga-rugged-art">
          <img src={flash.mine ? RUGGED_IMG_MINE : RUGGED_IMG_OTHER} alt="" />
        </div>
        <p className="ga-rugged-text">{flash.mine ? 'You got rugged!' : `${flash.name} got rugged!`}</p>
      </div>
    </div>
  )
}
