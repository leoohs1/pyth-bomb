import { useEffect, useRef, useState } from 'react'

// A foto do Guess the Person: começa MUITO pixelada e vai ficando nítida com o tempo.
// progress vai de 0 (começo da rodada) a 1 (fim). Cada degrau é "quantos quadradões cabem na largura";
// 0 = foto nítida. Só visual: quem decide o acerto e os pontos é o servidor (supabase/person/W01).
const STEPS = [
  [0.85, 0],   // últimos 15%: nítida
  [0.7, 72],
  [0.55, 40],
  [0.4, 24],
  [0.25, 14],
  [0, 8],      // primeiros 25%: bem borrada (8 x 8)
]
export function blocksFor(progress) {
  for (const [from, n] of STEPS) if (progress >= from) return n
  return STEPS[STEPS.length - 1][1]
}

// src = endereço da foto (pode ser null: mostra a moldura vazia com "?"). A foto é quadrada (o script de preparo corta).
export default function PersonPhoto({ src, progress = 1, alt = 'A person to guess', className = '' }) {
  const ref = useRef(null)
  const [img, setImg] = useState(null)

  useEffect(() => {
    setImg(null)
    if (!src) return undefined
    const i = new Image()
    i.onload = () => setImg(i)
    i.src = src
    return () => { i.onload = null }
  }, [src])

  const blocks = blocksFor(progress)
  useEffect(() => {
    const c = ref.current
    if (!c || !img) return
    const size = blocks === 0 ? Math.min(640, Math.max(img.naturalWidth, 8)) : blocks
    c.width = size
    c.height = size
    const g = c.getContext('2d')
    g.imageSmoothingEnabled = true
    g.imageSmoothingQuality = 'high'
    // recorte quadrado pelo meio (se a foto não vier quadrada)
    const s = Math.min(img.naturalWidth, img.naturalHeight)
    const sx = (img.naturalWidth - s) / 2
    const sy = (img.naturalHeight - s) * 0.2 // rosto costuma ficar na parte de cima
    g.drawImage(img, sx, sy, s, s, 0, 0, size, size)
  }, [img, blocks])

  return (
    <div className={`pe-photo${blocks === 0 ? ' is-sharp' : ''} ${className}`}>
      {img ? <canvas ref={ref} role="img" aria-label={alt} /> : <span className="pe-photo-q" aria-hidden="true">?</span>}
    </div>
  )
}
