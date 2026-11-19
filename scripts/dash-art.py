"""Pyth Dash: transforma as folhas que o ChatGPT gerou (fundo verde #00FF00) nas imagens que o jogo usa.

Uso:  python scripts/dash-art.py <pasta com as folhas> [pasta de saída]
      (padrão da saída: public/dash/art)

Folhas esperadas na pasta (nomes de Downloads/pyth-dash-arte):
  01-blocos.png  02-lag-bug.png  03-objetos.png  04-itens.png  05-pirb-lado.png
  grecia/greek-01-far.png  grecia/greek-02-near.png  grecia/greek-comic-1..5.png
  grecia/greek2-far.png  grecia/greek2-near.png  grecia/greek2-sprites.png  (fase 2)

O que faz: tira o verde (e a "franja" verde das bordas), acha cada desenho pelos espaços verdes entre eles,
recorta e reduz pra escala do jogo (64 px por bloco), com as bordas duras de pixel art.
Precisa de Pillow e numpy (o .venv da pasta Pyth Q3 Video tem).
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image

PX = 64  # pixels por bloco nas imagens do jogo


def key_green(img):
    a = np.asarray(img.convert('RGBA')).astype(np.int16)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    green = (g > 120) & (g > r + 60) & (g > b + 60)
    out = a.copy()
    out[..., 3] = np.where(green, 0, 255)
    # franja: o que sobrou e ainda puxa pro verde perde o verde
    mx = np.maximum(r, b)
    spill = (~green) & (g > mx + 20)
    out[..., 1] = np.where(spill, mx + 10, out[..., 1])
    return Image.fromarray(out.clip(0, 255).astype(np.uint8), 'RGBA')


def segments(profile, min_gap, min_len=6):
    on = profile > 0
    segs, start = [], None
    for i, v in enumerate(on):
        if v and start is None:
            start = i
        if not v and start is not None:
            segs.append([start, i])
            start = None
    if start is not None:
        segs.append([start, len(on)])
    merged = []
    for s in segs:
        if merged and s[0] - merged[-1][1] < min_gap:
            merged[-1][1] = s[1]
        else:
            merged.append(s)
    return [s for s in merged if s[1] - s[0] >= min_len]


def split_sheet(img, gap_y=14, gap_x=14):
    """devolve [[(x0,y0,x1,y1), ...] por linha] dos desenhos na folha"""
    alpha = np.asarray(img)[..., 3] > 0
    rows = segments(alpha.sum(1), gap_y, 12)
    out = []
    for y0, y1 in rows:
        band = alpha[y0:y1]
        cols = segments(band.sum(0), gap_x, 6)
        boxes = []
        for x0, x1 in cols:
            sub = band[:, x0:x1]
            ys = np.where(sub.any(1))[0]
            boxes.append((x0, y0 + ys[0], x1, y0 + ys[-1] + 1))
        out.append(boxes)
    return out


def hard_resize(img, w, h):
    small = img.resize((max(1, round(w)), max(1, round(h))), Image.BOX)
    a = np.asarray(small).copy()
    a[..., 3] = np.where(a[..., 3] >= 110, 255, 0)
    return Image.fromarray(a, 'RGBA')


def scaled(img, box, k):
    crop = img.crop(box)
    return hard_resize(crop, crop.width * k, crop.height * k)


def frames_strip(imgs, anchor_x=None):
    """junta quadros num canvas igual (pés na mesma linha, centro alinhado) e devolve a lista de quadros prontos"""
    h = max(i.height for i in imgs)
    ax = anchor_x or [i.width / 2 for i in imgs]
    left = max(a for a in ax)
    right = max(i.width - a for i, a in zip(imgs, ax))
    w = int(np.ceil(left + right))
    out = []
    for i, a in zip(imgs, ax):
        c = Image.new('RGBA', (w, h), (0, 0, 0, 0))
        c.paste(i, (int(round(left - a)), h - i.height), i)
        out.append(c)
    return out


def head_center(img):
    a = np.asarray(img)[..., 3] > 0
    top = a[: max(1, int(img.height * 0.45))]
    xs = np.where(top.any(0))[0]
    return (xs[0] + xs[-1] + 1) / 2 if len(xs) else img.width / 2


def save(img, out, name):
    p = out / name
    img.save(p, optimize=True)
    print(f'  {name}  {img.width}x{img.height}')


def main():
    src = Path(sys.argv[1])
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else Path(__file__).resolve().parent.parent / 'public' / 'dash' / 'art'
    out.mkdir(parents=True, exist_ok=True)

    # 1) blocos: linha 1 = grama, terra, tijolo, oráculo, oráculo usado, bloco aceso, bloco apagado (as velas seguem por código)
    sheet = key_green(Image.open(src / '01-blocos.png'))
    rows = split_sheet(sheet, 14, 14)
    names = ['tile-grass', 'tile-soil', 'tile-brick', 'tile-oracle', 'tile-used', 'tile-powered']  # o apagado (tracejado) segue por código
    for name, box in zip(names, rows[0]):
        save(hard_resize(sheet.crop(box), PX, PX), out, name + '.png')

    # 2) lag bug: andando 1, andando 2, amassado (altura do bicho em pé ~1,1 bloco)
    sheet = key_green(Image.open(src / '02-lag-bug.png'))
    boxes = split_sheet(sheet, 14, 20)[0]
    k = (1.1 * PX) / (boxes[0][3] - boxes[0][1])
    fr = frames_strip([scaled(sheet, b, k) for b in boxes[:3]])
    for name, f in zip(['bug-walk1', 'bug-walk2', 'bug-squash'], fr):
        save(f, out, name + '.png')

    # 3) objetos: publisher off/on (4,2 blocos), relay off/on (2,1), beacon off/on (8,6)
    sheet = key_green(Image.open(src / '03-objetos.png'))
    boxes = split_sheet(sheet, 14, 14)[0]
    for (a, b), (name, tiles) in zip([(0, 1), (2, 3), (4, 5)], [('publisher', 4.2), ('relay', 2.1), ('beacon', 8.6)]):
        k = (tiles * PX) / (boxes[a][3] - boxes[a][1])
        f0, f1 = frames_strip([scaled(sheet, boxes[a], k), scaled(sheet, boxes[b], k)])
        save(f0, out, f'{name}-off.png')
        save(f1, out, f'{name}-on.png')

    # 4) itens. linha 1: baú fechado/abrindo/aberto, checkpoint cinza/verde, gem, gem brilhando
    #           linha 2: moeda (4 quadros), escudo, lazer boots
    sheet = key_green(Image.open(src / '04-itens.png'))
    r1, r2 = split_sheet(sheet, 14, 16)[:2]
    k = (0.85 * PX) / (r1[0][3] - r1[0][1])
    for name, f in zip(['chest-closed', 'chest-opening', 'chest-open'], frames_strip([scaled(sheet, b, k) for b in r1[0:3]])):
        save(f, out, name + '.png')
    k = (2.2 * PX) / (r1[3][3] - r1[3][1])
    # a bandeira verde some junto com o fundo verde: a "ligada" é a cinza pintada de verde (só o pano, o mastro fica)
    off = frames_strip([scaled(sheet, b, k) for b in r1[3:5]])[0]
    a = np.asarray(off).astype(np.int16)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    grey = (a[..., 3] > 0) & ((r + g + b) / 3 > 90) & (r < b + 30)  # lilás-acinzentado claro (não o dourado nem o contorno)
    cloth = np.zeros_like(grey); cloth[: int(off.height * 0.62), int(off.width * 0.3):] = True
    m = grey & cloth
    lum = (r + g + b) / 3 / 255
    on = a.copy()
    on[..., 0] = np.where(m, 20 + lum * 60, r)
    on[..., 1] = np.where(m, 110 + lum * 140, g)
    on[..., 2] = np.where(m, 40 + lum * 70, b)
    save(off, out, 'checkpoint-off.png')
    save(Image.fromarray(on.clip(0, 255).astype(np.uint8), 'RGBA'), out, 'checkpoint-on.png')
    k = (0.85 * PX) / (r1[5][3] - r1[5][1])
    for name, f in zip(['gem', 'gem-sparkle'], frames_strip([scaled(sheet, b, k) for b in r1[5:7]])):
        save(f, out, name + '.png')
    k = (0.62 * PX) / (r2[0][3] - r2[0][1])
    for i, f in enumerate(frames_strip([scaled(sheet, b, k) for b in r2[0:4]])):
        save(f, out, f'coin-{i + 1}.png')
    for b, name in zip(r2[4:6], ['power-shield', 'power-lazer']):
        k = (0.8 * PX) / (b[3] - b[1])
        save(scaled(sheet, b, k), out, name + '.png')

    # 5) herói de lado (PIRB): parado, corrida 1-4, pulo, queda, dano, comemora. Altura parado = 1,65 bloco
    sheet = key_green(Image.open(src / '05-pirb-lado.png'))
    boxes = split_sheet(sheet, 14, 10)[0]
    if len(boxes) != 9:
        print('  ! PIRB: achei', len(boxes), 'quadros (esperava 9)')
    k = (1.65 * PX) / (boxes[0][3] - boxes[0][1])
    imgs = [scaled(sheet, b, k) for b in boxes[:9]]
    fr = frames_strip(imgs, [head_center(i) for i in imgs])
    w, h = fr[0].size
    strip = Image.new('RGBA', (w * len(fr), h), (0, 0, 0, 0))
    for i, f in enumerate(fr):
        strip.paste(f, (i * w, 0), f)
    save(strip, out, 'hero-pirb.png')

    # 6) Grécia (Delphi's Olive Grove), na subpasta grecia/: fundo longe (céu inteiro), fundo perto (morros, sem verde)
    #    e os 5 quadros da história em quadrinhos da abertura
    g = src / 'grecia'
    if g.exists():
        far = Image.open(g / 'greek-01-far.png').convert('RGBA')
        far = far.resize((round(far.width * 512 / far.height), 512), Image.BOX)
        save(seamless(far, hard_alpha=False), out, 'bg-far.png')
        near = key_green(Image.open(g / 'greek-02-near.png'))
        a = np.asarray(near)[..., 3] > 0
        ys, xs = np.where(a.any(1))[0], np.where(a.any(0))[0]
        near = near.crop((xs[0], ys[0], xs[-1] + 1, ys[-1] + 1))
        hgt = round(4 * PX)
        near = near.resize((round(near.width * hgt / near.height), hgt), Image.BOX)
        save(seamless(near), out, 'bg-near.png')
        story = out.parent / 'story'
        story.mkdir(parents=True, exist_ok=True)
        for i in range(1, 6):
            im = Image.open(g / f'greek-comic-{i}.png').convert('RGB')
            im = im.resize((1280, round(im.height * 1280 / im.width)), Image.LANCZOS)
            im.save(story / f'{i}.webp', quality=86, method=6)
            print(f'  story/{i}.webp  {im.width}x{im.height}')

    # 7) fase 2 (Mount Parnassus): fundo longe/perto, harpia (3 quadros) e a polia de mármore (só a laje, sem as cordas)
    if (g / 'greek2-far.png').exists():
        far = Image.open(g / 'greek2-far.png').convert('RGBA')
        far = far.resize((round(far.width * 512 / far.height), 512), Image.BOX)
        save(seamless(far, hard_alpha=False), out, 'bg2-far.png')
        near = key_green(Image.open(g / 'greek2-near.png'))
        a = np.asarray(near)[..., 3] > 0
        ys, xs = np.where(a.any(1))[0], np.where(a.any(0))[0]
        near = near.crop((xs[0], ys[0], xs[-1] + 1, ys[-1] + 1))
        near = near.resize((round(near.width * 256 / near.height), 256), Image.BOX)
        save(seamless(near), out, 'bg2-near.png')
        sheet = key_green(Image.open(g / 'greek2-sprites.png'))
        rows = split_sheet(sheet, 14, 20)
        hb = rows[0][:3]
        k = (1.15 * PX) / max(b[3] - b[1] for b in hb[:2])
        for name, f in zip(['harpy-1', 'harpy-2', 'harpy-dead'], frames_strip([scaled(sheet, b, k) for b in hb])):
            save(f, out, name + '.png')
        lb = rows[1][0]
        crop = sheet.crop(lb)
        al = np.asarray(crop)[..., 3] > 0
        wide = np.where(al.sum(1) > al.shape[1] * 0.6)[0]  # linhas da laje (as cordas são finas)
        slab = crop.crop((0, wide[0], crop.width, wide[-1] + 1))
        save(hard_resize(slab, 3 * PX, round(slab.height * 3 * PX / slab.width)), out, 'lift.png')


def seamless(img, hard_alpha=True):
    """emenda as pontas (degradê de 10%) pra imagem repetir na horizontal sem costura"""
    arr = np.asarray(img).astype(np.float32)
    ov = arr.shape[1] // 10
    t = np.linspace(0, 1, ov)[None, :, None]
    head = arr[:, :ov] * t + arr[:, -ov:] * (1 - t)
    out = np.concatenate([head, arr[:, ov:-ov]], axis=1)
    if hard_alpha:
        out[..., 3] = np.where(out[..., 3] >= 110, 255, 0)
    return Image.fromarray(out.clip(0, 255).astype(np.uint8), 'RGBA')

if __name__ == '__main__':
    main()
