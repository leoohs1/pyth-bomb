import { useEffect, useState } from 'react'
import { play, setSoundTheme, SOLO_SOUNDS } from '../sound'
import { setMusicSilenced } from '../music'
import './SoloSounds.css'

// Tela só de SONS do Solo (/solo-sons): um botão pra ouvir cada som quando quiser, sem precisar jogar.
// status: 'ok' = aprovado pela Halls | 'arquivo' = som de verdade (arquivo) | 'prov' = provisório 8 bits
const SOUNDS = [
  ['solo_bomb', 'Soltar a bomba', 'ok'],
  ['solo_boom', 'Explosão da bomba', 'ok', 'arquivo'],
  ['solo_pickup', 'Pegar item', 'ok'],
  ['solo_shield', 'Escudo absorvendo o dano', 'ok'],
  ['solo_hurt', 'Levar dano', 'prov'],
  ['solo_dead', 'Morrer (vai tentar de novo)', 'ok'],
  ['solo_gameover', 'Game over (a risada do Classic)', 'arquivo'],
  ['solo_enemy_die', 'Derrotar um inimigo', 'prov'],
  ['solo_hit', 'Acertar um inimigo (sem derrotar)', 'prov'],
  ['solo_kick', 'Chutar uma bomba (fase 2)', 'prov'],
  ['solo_roar', 'O chefe se enfurece (fase 4)', 'prov'],
  ['solo_door', 'A porta abre', 'prov'],
  ['solo_chest_open', 'Clicar no baú (tensão)', 'ok'],
  ['solo_chest_win', 'Baú com prêmio (fanfarra gloriosa)', 'prov'],
  ['solo_chest_empty', 'Baú vazio', 'ok'],
  ['solo_clear', 'Fase concluída', 'prov'],
  ['solo_win', 'Vencer o jogo (depois do chefe)', 'prov'],
]
const LABEL = { ok: 'aprovado', prov: 'provisório', arquivo: 'arquivo' }

export default function SoloSounds() {
  const [ready, setReady] = useState(false)
  const [last, setLast] = useState(null)

  useEffect(() => {
    setSoundTheme('solo')
    setMusicSilenced(true)
    return () => { setSoundTheme(null); setMusicSilenced(false) }
  }, [])

  // 1º clique libera o som e dá um tempinho pros arquivos carregarem (explosão e risada)
  const unlock = () => setTimeout(() => setReady(true), 900)
  const hear = (name) => { setLast(name); play(name) }
  const missing = SOLO_SOUNDS.filter((n) => !SOUNDS.some((s) => s[0] === n))

  return (
    <main className="ss-page">
      <h1>Sons do Solo</h1>
      <p className="ss-sub">Clique num som para ouvir. Os que dizem “aprovado” já ficaram do jeito que você quer.</p>
      {!ready ? (
        <button type="button" className="ss-start" onClick={unlock}>▶ Liberar o som</button>
      ) : (
        <ul className="ss-list">
          {SOUNDS.map(([name, label, st, kind]) => (
            <li key={name}>
              <button type="button" className={`ss-btn${last === name ? ' is-last' : ''}`} onClick={() => hear(name)}>
                <span className="ss-play" aria-hidden="true">▶</span>
                <span className="ss-name">{label}</span>
                <span className={`ss-tag is-${st}`}>{LABEL[st]}</span>
                {kind === 'arquivo' && <span className="ss-tag is-arquivo">{LABEL.arquivo}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {ready && missing.length > 0 && <p className="ss-sub">Sem botão ainda: {missing.join(', ')}</p>}
    </main>
  )
}
