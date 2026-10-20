import HowToPlay from '../modes/HowToPlay'

// Texto do "como jogar" do Guess the Song (aparece no lobby)
const ROWS = [
  { icon: '🎧', text: <>A <b>30-second clip</b> plays for everyone at the same time.</> },
  { icon: '🎤', text: <>Type the <b>artist</b>, the <b>song name</b>, or both, in the same box.</> },
  { icon: '⚡', text: <>The <b>faster</b> you answer, the more points you get. Find both first for a <b>+250 FIRST</b> bonus!</> },
  { icon: '✍️', text: <><b>Spelling counts:</b> no typos. Capital letters, accents and punctuation don't matter.</> },
  { icon: '🏆', text: <><b>10 songs.</b> Most points wins!</> },
]

export default function SongHowTo() {
  return <HowToPlay id="song" rows={ROWS} note="No sound? Tap the screen once." />
}
