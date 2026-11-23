"""Corta os ícones dos modos (cards do menu) de uma folha do ChatGPT com fundo verde #00FF00.
Uso: python scripts/mode-icons.py <folha.png> <nome-esquerda> [<nome-meio> ...] <nome-direita>
Cada ícone vira public/modes/<nome>.webp, 192x192, fundo transparente (igual aos outros cards).
"""
import sys
from pathlib import Path
import numpy as np
from PIL import Image

OUT = Path(__file__).resolve().parent.parent / 'public' / 'modes'
SIZE = 192
MARGIN = 0.04  # folga em volta do desenho (os cards atuais quase encostam na borda)


def key_green(img):
    a = np.asarray(img.convert('RGBA')).astype(np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    # quanto o verde passa do maior entre vermelho e azul: muito = fundo, pouco = borda meio verde (transparência suave)
    lead = g - np.maximum(r, b)
    alpha = np.clip(1 - (lead - 40) / 80, 0, 1)
    alpha[(g < 100)] = 1
    out = a.copy()
    # tira o verde que vazou na borda
    mx = np.maximum(r, b)
    out[..., 1] = np.where(lead > 10, np.minimum(g, mx + 10), g)
    out[..., 3] = alpha * 255
    return Image.fromarray(out.clip(0, 255).astype(np.uint8), 'RGBA')


def main():
    src, names = Path(sys.argv[1]), sys.argv[2:]
    im = key_green(Image.open(src))
    al = np.asarray(im)[..., 3] > 40
    cols = al.any(0)
    # pedaços de colunas com desenho, separados por faixas vazias
    segs, start = [], None
    for x, on in enumerate(cols):
        if on and start is None: start = x
        if not on and start is not None: segs.append([start, x]); start = None
    if start is not None: segs.append([start, len(cols)])
    segs = [s for s in segs if s[1] - s[0] > 20]
    # junta pedacinhos até sobrar um por ícone (os maiores vãos separam os ícones)
    while len(segs) > len(names):
        gaps = [segs[i + 1][0] - segs[i][1] for i in range(len(segs) - 1)]
        i = gaps.index(min(gaps))
        segs[i:i + 2] = [[segs[i][0], segs[i + 1][1]]]
    if len(segs) != len(names):
        sys.exit(f'achei {len(segs)} ícones, esperava {len(names)}')
    for (x0, x1), name in zip(segs, names):
        part = al[:, x0:x1]
        ys = np.where(part.any(1))[0]
        y0, y1 = ys[0], ys[-1] + 1
        crop = im.crop((x0, y0, x1, y1))
        side = int(max(crop.size) * (1 + 2 * MARGIN))
        sq = Image.new('RGBA', (side, side), (0, 0, 0, 0))
        sq.alpha_composite(crop, ((side - crop.width) // 2, (side - crop.height) // 2))
        out = sq.resize((SIZE, SIZE), Image.LANCZOS)
        OUT.mkdir(parents=True, exist_ok=True)
        out.save(OUT / f'{name}.webp', quality=92, method=6)
        print(f'  public/modes/{name}.webp  (from x {x0}-{x1}, y {y0}-{y1})')


if __name__ == '__main__':
    main()
