// Som do PVP = o som do modo Solo (pedido da Halls): os efeitos de public/sounds/solo e a música de cada fase.
//   taverna -> música da taverna · casco -> música do casco · final no CHOP -> música do chefe · campeão -> vitória
// Uso: useSoloAudio(caminho da música) — com null não troca nada (fica a música normal do jogo).
import { useEffect, useState } from 'react'
import { setMusicSilenced, setMusicStartFade, setMusicTrack } from '../music'
import { setSoundTheme } from '../sound'
import { LEVELS } from '../solo/engine/levels.js'

export const PVP_MUSIC = {
  tavern: LEVELS[0]?.music ?? '/music/solo-tavern.mp3',
  hull: LEVELS[1]?.music ?? '/music/solo-hull.mp3',
  chop: LEVELS[2]?.music ?? '/music/solo-boss.mp3',
  victory: '/music/solo-victory.mp3',
}

export function useSoloAudio(track) {
  const [ownMusic, setOwnMusic] = useState(false)
  const on = !!track

  // efeitos com os arquivos do Solo (solo_bomb, solo_boom...) enquanto a tela do PVP estiver aberta
  useEffect(() => {
    if (!on) return
    setSoundTheme('solo')
    setMusicStartFade(120) // a música entra quase na hora
    return () => { setSoundTheme(null); setMusicStartFade(null); setMusicTrack() }
  }, [on])

  useEffect(() => {
    if (!track) return
    let alive = true
    setMusicTrack(track).then((ok) => { if (alive) setOwnMusic(ok) })
    return () => { alive = false }
  }, [track])

  // sem o arquivo da música, fica em silêncio (em vez de tocar a música do lobby por cima)
  useEffect(() => {
    if (!on) return
    setMusicSilenced(!ownMusic)
    return () => setMusicSilenced(false)
  }, [on, ownMusic])
}
