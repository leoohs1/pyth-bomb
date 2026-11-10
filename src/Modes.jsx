import { useState } from 'react'
import './Home.css'   // fundo, painel de mármore, personagens (compartilhados)
import './Modes.css'
import SoundToggle from './SoundToggle.jsx'

// Pyth Recap Month (alternativas A/B/C/D): só aparece com ?recap=1 no endereço, até o SQL 038 estar rodado e o modo liberado.
// Pra abrir pra todo mundo: troque o valor de RECAP_OPEN pra true.
const RECAP_OPEN = false
let recapUrl = false
try { recapUrl = new URLSearchParams(window.location.search).get('recap') === '1' } catch { /* tudo bem */ }

// Guess the Person (foto pixelada que clareia, digitar o nome): só aparece com ?person=1 no endereço, até o SQL
// supabase/person/W01 estar rodado, as fotos subidas e o modo liberado. Pra abrir pra todo mundo: PERSON_OPEN = true.
const PERSON_OPEN = true
let personUrl = false
try { personUrl = new URLSearchParams(window.location.search).get('person') === '1' } catch { /* tudo bem */ }

// Pyth Poker (Texas Hold'em, fichas de brincadeira): aberto pra todo mundo desde 2026-11-10.
// Pra esconder de novo (só com ?poker=1 no endereço): POKER_OPEN = false.
const POKER_OPEN = true
let pokerUrl = false
try { pokerUrl = new URLSearchParams(window.location.search).get('poker') === '1' } catch { /* tudo bem */ }

// Pyth Bomb PVP (torneio estilo Bomberman, servidor de jogo no Railway): só aparece com ?pvp=1 no endereço até a arte do
// card (public/modes/pvp.webp) chegar. Pra abrir pra todo mundo: PVP_OPEN = true.
const PVP_OPEN = true
let pvpUrl = false
try { pvpUrl = new URLSearchParams(window.location.search).get('pvp') === '1' } catch { /* tudo bem */ }

// icon = emoji de reserva; img = arte do ícone (se o arquivo não existir ainda, aparece o emoji)
const MODES = [
  {
    id: 'classic',
    icon: '💣',
    img: '/bomb-laurel.webp',
    title: 'Pyth Bomb Classic',
    sub: 'Answer fast, pass the bomb, don\'t get rugged.',
    locked: false,
  },
  {
    id: 'recap',
    icon: '🗓️',
    img: '/bomb-laurel.webp',
    title: 'Pyth Recap Month',
    sub: null, // sem descrição (pedido da Halls): o cartão mostra só o nome
    locked: false,
    hidden: !(RECAP_OPEN || recapUrl),
  },
  {
    id: 'song',
    icon: '🎵',
    img: '/modes/song.webp',
    title: 'Guess the Song',
    sub: 'Hear a clip, name the artist and the song. Fastest ears win.',
    locked: false,
    href: '/song',
  },
  {
    id: 'person',
    icon: '📸',
    img: '/modes/person.webp',
    title: 'Guess the Person',
    sub: 'A pixelated photo gets sharper. Name the person first.',
    locked: false,
    href: '/person',
    hidden: !(PERSON_OPEN || personUrl),
  },
  {
    id: 'poker',
    icon: '🃏',
    img: '/modes/poker.webp',
    title: 'Pyth Poker',
    sub: "Texas Hold'em tournament with play chips. Last one with chips wins.",
    locked: false,
    href: '/poker',
    hidden: !(POKER_OPEN || pokerUrl),
  },
  {
    id: 'pvp',
    icon: '⚔️',
    img: '/modes/pvp.webp',
    title: 'Pyth Bomb PVP',
    badge: 'Beta', // selo roxo ao lado do nome: o modo ainda está em teste (tirar quando sair do beta)
    sub: 'Bomberman-style knockout tournament. 4 per room, winners move on to the final.',
    locked: false,
    href: '/pvp',
    hidden: !(PVP_OPEN || pvpUrl),
  },
  {
    id: 'new',
    icon: '✨',
    img: '/modes/new.webp',
    title: 'New modes',
    sub: 'More ways to play are on the way.',
    locked: true,
  },
  // Escondidos da lista até ficarem prontos (tirar o "hidden" pra voltar; a ordem na tela é a daqui):
  {
    id: 'price',
    icon: '📈',
    img: '/modes/price.webp',
    title: 'Guess the Price',
    sub: 'What was it worth? Closest guess wins the round.',
    locked: true, // ainda com preços de demonstração; destrava (locked: false) quando a chave da Pyth estiver ligada
    href: '/price',
    hidden: true,
  },
  {
    id: 'solo',
    icon: '🕹️',
    img: '/modes/solo.webp',
    title: 'Solo',
    sub: 'A real Bomberman-style dungeon run. Movement, power-ups, bosses.',
    locked: true,
    hidden: true,
  },
  {
    id: 'arena',
    icon: '⚔️',
    img: '/modes/arena.webp',
    title: 'Arena',
    sub: 'Real-time PvP. Still just an idea — a long way down the road.',
    locked: true,
    hidden: true,
  },
].filter((m) => !m.hidden)

function ModeIcon({ m }) {
  const [broken, setBroken] = useState(false)
  if (m.img && !broken) return <img className="md-mode-img" src={m.img} alt="" aria-hidden="true" draggable="false" onError={() => setBroken(true)} />
  return <span className="md-mode-icon" aria-hidden="true">{m.icon}</span>
}

// Escolha de modo de jogo: a "porta de entrada" do /play, antes do Classic.
// O Classic abre por props do App.jsx; os outros modos têm página própria (href) e abrem por endereço.
export default function Modes({ onSelectClassic, onSelectRecap }) {
  return (
    <main className="hm-stage">
      <SoundToggle className="sound-fixed" />
      <div className="hm-bg" role="img" aria-label="Marble arena above a night city with the Pyth emblem on the floor" />
      <div className="hm-shade" />

      <div className="hm-scroll">
        <section className="hm-panel md-panel">
          <div className="hm-bomb" aria-hidden="true">
            <div className="hm-aura" />
            <img src="/bomb-laurel.webp" alt="" width="1254" height="1254" />
          </div>

          <h1 className="hm-title">
            <img src="/logo.webp" alt="Pyth Bomb" width="2000" height="667" />
          </h1>
          <p className="hm-sub"><span>Choose your game mode</span></p>

          <div className="md-modes">
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                className={`md-mode${m.locked ? ' is-locked' : ''}`}
                disabled={m.locked}
                onClick={m.href ? () => { window.location.assign(m.href) } : m.id === 'classic' ? onSelectClassic : m.id === 'recap' ? onSelectRecap : undefined}
              >
                <ModeIcon m={m} />
                <span className="md-mode-text">
                  <span className="md-mode-title">
                    {m.title}
                    {m.locked && <span className="md-mode-badge">Coming soon</span>}
                    {!m.locked && m.badge && <span className="md-mode-badge is-beta">{m.badge}</span>}
                  </span>
                  {m.sub && <span className="md-mode-sub">{m.sub}</span>}
                </span>
              </button>
            ))}
          </div>
        </section>

        <div className="hm-chars" aria-hidden="true">
          <img className="hm-char hm-oracle" src="/oracle.webp" alt="" />
          <img className="hm-char hm-cyclops" src="/cyclops.webp" alt="" />
        </div>
      </div>
    </main>
  )
}
