import HowToPlay from '../modes/HowToPlay'

// Texto do "como jogar" do Pyth Poker (aparece no lobby)
const ROWS = [
  { icon: '🃏', text: <><b>Texas Hold&apos;em tournament.</b> Everyone starts with the same chips. The last player with chips wins.</> },
  { icon: '💜', text: <><b>Play chips only:</b> no money, no crypto, no prizes. Chips are not saved after the game.</> },
  { icon: '⏫', text: <>The <b>blinds go up</b> every few minutes, so the game always ends.</> },
  { icon: '⏱️', text: <>You have <b>20 seconds</b> per move. Time runs out: you <b>check</b> (or <b>fold</b> if there is a bet). Miss twice and you are marked <b>away</b>.</> },
  { icon: '👥', text: <><b>2 to 9 players</b> per table. Out of chips? Stay and watch, or open another table.</> },
]

export default function PokerHowTo() {
  return <HowToPlay id="poker" rows={ROWS} />
}
