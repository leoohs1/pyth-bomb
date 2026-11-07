import HowToPlay from '../modes/HowToPlay'

// Texto do "como jogar" do Guess the Person (aparece no lobby)
const ROWS = [
  { icon: '📸', text: <>A <b>photo of a person</b> shows up, very pixelated. Everyone sees it at the same time.</> },
  { icon: '🔍', text: <>It gets <b>sharper</b> every few seconds. Type their <b>name</b> as soon as you know!</> },
  { icon: '⚡', text: <>The <b>sooner</b> you get it, the more points. Be the <b>first</b> and win a <b>+250 FIRST</b> bonus!</> },
  { icon: '✍️', text: <><b>Spelling counts:</b> no typos. Capital letters, accents and punctuation don't matter.</> },
  { icon: '🏆', text: <><b>10 people.</b> Most points wins!</> },
]

export default function PersonHowTo() {
  return <HowToPlay id="person" rows={ROWS} />
}
