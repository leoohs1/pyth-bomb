"""Pyth Dash: transforma as folhas que o ChatGPT gerou (fundo verde #00FF00) nas imagens que o jogo usa.

Uso:  python scripts/dash-art.py <pasta com as folhas> [pasta de saída]
      (padrão da saída: public/dash/art)

Folhas esperadas na pasta (nomes de Downloads/pyth-dash-arte):
  01-blocos.png  02-lag-bug.png  03-objetos.png  04-itens.png  05-pirb-lado.png
  grecia/greek-01-far.png  grecia/greek-02-near.png  grecia/greek-comic-1..5.png
  grecia/greek2-far.png  grecia/greek2-near.png  grecia/greek2-sprites.png  (fase 2)
  grecia/greek3-far.png  grecia/greek3-near.png  grecia/greek3-sprites.png  (fase 3)
  grecia/greek4..6-far/near.png  grecia/greek-objects456.png  grecia/greek-kronos.png  grecia/greek-end-1..2.png  (fases 4-6 e final)

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

    # 8) fase 3 (Echoes of the Styx): caverna longe/perto, TALOS (5 quadros) e a tocha (2 quadros)
    if (g / 'greek3-far.png').exists():
        far = Image.open(g / 'greek3-far.png').convert('RGBA')
        far = far.resize((round(far.width * 512 / far.height), 512), Image.BOX)
        save(seamless(far, hard_alpha=False), out, 'bg3-far.png')
        near = key_green(Image.open(g / 'greek3-near.png'))
        a = np.asarray(near)[..., 3] > 0
        ys, xs = np.where(a.any(1))[0], np.where(a.any(0))[0]
        near = near.crop((xs[0], ys[0], xs[-1] + 1, ys[-1] + 1))
        near = near.resize((round(near.width * 256 / near.height), 256), Image.BOX)
        save(seamless(near), out, 'bg3-near.png')
        sheet = key_green(Image.open(g / 'greek3-sprites.png'))
        rows = split_sheet(sheet, 14, 18)
        tb = split_to(sheet, rows[0], 5)  # dois quadros às vezes vêm grudados (a onda do martelo encosta no vizinho)
        k = (2.75 * PX) / (tb[0][3] - tb[0][1])
        imgs = [scaled(sheet, b, k) for b in tb]
        names = ['talos-walk1', 'talos-walk2', 'talos-windup', 'talos-slam', 'talos-down']
        for name, f in zip(names, frames_strip(imgs, [torso_center(i) for i in imgs])):
            save(f, out, name + '.png')
        cb = rows[1][:2]
        k = (1.4 * PX) / (cb[0][3] - cb[0][1])
        for name, f in zip(['torch-1', 'torch-2'], frames_strip([scaled(sheet, b, k) for b in cb])):
            save(f, out, name + '.png')

    # 9) fases 4, 5 e 6: fundos (longe/perto), objetos (ponte, redemoinho, jato, altares), Kronos e os quadros do final
    for n in (4, 5, 6):
        if not (g / f'greek{n}-far.png').exists():
            continue
        far = Image.open(g / f'greek{n}-far.png').convert('RGBA')
        far = far.resize((round(far.width * 512 / far.height), 512), Image.BOX)
        save(seamless(far, hard_alpha=False), out, f'bg{n}-far.png')
        near = key_green(Image.open(g / f'greek{n}-near.png'))
        a = np.asarray(near)[..., 3] > 0
        ys, xs = np.where(a.any(1))[0], np.where(a.any(0))[0]
        near = near.crop((xs[0], ys[0], xs[-1] + 1, ys[-1] + 1))
        near = near.resize((round(near.width * 256 / near.height), 256), Image.BOX)
        save(seamless(near), out, f'bg{n}-near.png')
    if (g / 'greek-objects456.png').exists():
        sheet = key_green(Image.open(g / 'greek-objects456.png'))
        boxes = blobs(sheet, 7)
        mid = sheet.height / 2
        top = sorted([b for b in boxes if (b[1] + b[3]) / 2 < mid], key=lambda b: b[0])
        bot = sorted([b for b in boxes if (b[1] + b[3]) / 2 >= mid], key=lambda b: b[0])
        if len(top) != 5 or len(bot) != 2:
            print('  ! objetos: achei', len(top), 'em cima e', len(bot), 'embaixo (esperava 5 e 2)')
        save(hard_resize(sheet.crop(top[0]), PX, PX), out, 'tile-crumble.png')
        k = (1.6 * PX) / (top[1][3] - top[1][1])
        for name, f in zip(['portal-1', 'portal-2'], frames_strip([scaled(sheet, b, k) for b in top[1:3]])):
            save(f, out, name + '.png')
        k = (3 * PX) / (top[3][3] - top[3][1])
        for name, f in zip(['jet-1', 'jet-2'], frames_strip([scaled(sheet, b, k) for b in top[3:5]])):
            save(f, out, name + '.png')
        k = (2.1 * PX) / (bot[0][3] - bot[0][1])
        for name, f in zip(['altar-off', 'altar-on'], frames_strip([scaled(sheet, b, k) for b in bot[:2]])):
            save(f, out, name + '.png')
    if (g / 'greek-kronos.png').exists():
        sheet = key_green(Image.open(g / 'greek-kronos.png'))
        kb = sorted(blobs(sheet, 5), key=lambda b: b[0])  # por manchas: a foice de um quadro invade a coluna do vizinho
        k = (4.2 * PX) / (kb[0][3] - kb[0][1])
        imgs = [scaled(sheet, b, k) for b in kb]
        for name, f in zip(['kronos-float', 'kronos-cast', 'kronos-sweep', 'kronos-hurt', 'kronos-down'], frames_strip(imgs, [torso_center(i) for i in imgs])):
            save(f, out, name + '.png')
    story = out.parent / 'story'
    for i in (1, 2):
        f = g / f'greek-end-{i}.png'
        if f.exists():
            im = Image.open(f).convert('RGB')
            im = im.resize((1280, round(im.height * 1280 / im.width)), Image.LANCZOS)
            im.save(story / f'end-{i}.webp', quality=86, method=6)
            print(f'  story/end-{i}.webp  {im.width}x{im.height}')

def split_to(img, boxes, n):
    """se vieram menos desenhos que o esperado, corta o mais largo na coluna mais vazia do meio dele"""
    boxes = list(boxes)
    al = np.asarray(img)[..., 3] > 0
    while len(boxes) < n:
        i = max(range(len(boxes)), key=lambda k: boxes[k][2] - boxes[k][0])
        x0, y0, x1, y1 = boxes[i]
        cols = al[y0:y1, x0:x1].sum(0)
        lo, hi = int(len(cols) * 0.3), int(len(cols) * 0.7)
        cut = x0 + lo + int(np.argmin(cols[lo:hi]))
        def tight(a, b):
            ys = np.where(al[y0:y1, a:b].any(1))[0]
            return (a, y0 + ys[0], b, y0 + ys[-1] + 1)
        boxes[i:i + 1] = [tight(x0, cut), tight(cut, x1)]
        print('  (cortei um quadro grudado em x =', cut, ')')
    return boxes[:n]


def blobs(img, n):
    """acha os n desenhos maiores (manchas separadas por fundo); manchinhas pequenas (brilhos) juntam no vizinho"""
    al = np.asarray(img)[..., 3] > 0
    f = 4
    sm = al[::f, ::f]
    h, w = sm.shape
    lab = np.zeros((h, w), np.int32)
    comps = []
    for y0 in range(h):
        for x0 in range(w):
            if not sm[y0, x0] or lab[y0, x0]:
                continue
            cid = len(comps) + 1
            stack = [(y0, x0)]; lab[y0, x0] = cid
            minx = maxx = x0; miny = maxy = y0; area = 0
            while stack:
                y, x = stack.pop(); area += 1
                minx = min(minx, x); maxx = max(maxx, x); miny = min(miny, y); maxy = max(maxy, y)
                for dy in (-1, 0, 1):
                    for dx in (-1, 0, 1):
                        yy, xx = y + dy, x + dx
                        if 0 <= yy < h and 0 <= xx < w and sm[yy, xx] and not lab[yy, xx]:
                            lab[yy, xx] = cid; stack.append((yy, xx))
            comps.append([minx * f, miny * f, (maxx + 1) * f, (maxy + 1) * f, area])
    comps.sort(key=lambda c: -c[4])
    big, small = comps[:n], comps[n:]
    for c in small:
        cx, cy = (c[0] + c[2]) / 2, (c[1] + c[3]) / 2
        j = min(range(len(big)), key=lambda i: abs((big[i][0] + big[i][2]) / 2 - cx) + abs((big[i][1] + big[i][3]) / 2 - cy))
        b = big[j]
        if abs((b[0] + b[2]) / 2 - cx) + abs((b[1] + b[3]) / 2 - cy) < (b[2] - b[0] + b[3] - b[1]):
            big[j] = [min(b[0], c[0]), min(b[1], c[1]), max(b[2], c[2]), max(b[3], c[3]), b[4]]
    return [tuple(min(v, lim) for v, lim in zip(b[:4], (img.width, img.height, img.width, img.height))) for b in big]


def torso_center(img):
    """meio do corpo (faixa do meio da altura), pra o boneco não pular quando o martelo/onda muda o tamanho do quadro"""
    a = np.asarray(img)[..., 3] > 0
    band = a[int(img.height * 0.35): int(img.height * 0.75)]
    ys, xs = np.nonzero(band)
    return float(np.median(xs)) if len(xs) else img.width / 2


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
