import HowToPlay from './modes/HowToPlay'

// Texto do "como jogar" do Pyth Bomb Classic (aparece no lobby). Regras: 2 vidas; quem está com a bomba
// responde uma pergunta no tempo; erro = tenta de novo (o 5º erro custa 1 vida); tempo esgotado = 1 vida.
const ROWS = [
  { icon: '💣', text: <>A bomb is passed around. When it lands on you, a <b>trivia question</b> pops up.</> },
  { icon: '✅', text: <>Answer <b>correctly</b> before the timer runs out and the bomb goes to someone else.</> },
  { icon: '❌', text: <>Wrong answer? <b>Try again!</b> But your <b>5th wrong answer</b> costs you a life.</> },
  { icon: '⏱', text: <>If the <b>time runs out</b>, you lose a life right away.</> },
  { icon: '❤️', text: <>Everyone starts with <b>2 lives</b>. Lose both and you're out.</> },
  { icon: '🏆', text: <>The <b>last player standing</b> wins!</> },
]

export default function ClassicHowTo() {
  return <HowToPlay id="classic" rows={ROWS} light />
}
