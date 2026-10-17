import { useEffect } from 'react'
import { setSoundTheme } from '../sound'
import { setMusicTrack } from '../music'

// Personalidade de cada modo: marca a página com <html data-mode="..."> (o CSS do modo troca
// fundo, cartão e plaquinhas), e troca os sons e a música. Enquanto os arquivos do modo não
// existirem, o jogo usa os do Hot Potato (nada quebra).
//   sons:    public/sounds/<modo>/<nome>.mp3   (nomes em src/sound.js)
//   música:  public/music/<modo>.mp3
export default function useModeTheme(mode) {
  useEffect(() => {
    document.documentElement.dataset.mode = mode
    setSoundTheme(mode)
    setMusicTrack(`/music/${mode}.mp3`)
    return () => {
      delete document.documentElement.dataset.mode
      setSoundTheme(null)
      setMusicTrack()
    }
  }, [mode])
}
