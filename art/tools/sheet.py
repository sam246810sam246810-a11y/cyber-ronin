"""切角色精靈表：每格取最大的那塊圖形，以腳底與水平中心對齊，全部用同一個縮放比例。

用法：/path/to/venv/bin/python art/tools/sheet.py <原始檔> <名稱> <COLS>x<ROWS> <列名稱,逗號分隔> <待機高度>
      [--white] 白底去背   [--preview <gif路徑>] 輸出預覽動畫   [--out <資料夾>]
輸出：<out>/<名稱>-<列名稱>-<i>.png（畫布大小一致）
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[2]
args = sys.argv[1:]
src, name, grid, rownames, idle_h = args[0], args[1], args[2], args[3].split(','), int(args[4])
white = '--white' in args
preview = args[args.index('--preview') + 1] if '--preview' in args else None
out_dir = Path(args[args.index('--out') + 1]) if '--out' in args else ROOT / 'src' / 'assets' / 'sprites'
out_dir.mkdir(parents=True, exist_ok=True)
cols, rows = map(int, grid.split('x'))

im = Image.open(src).convert('RGBA')
arr = np.array(im)
if white:
    rgb = arr[:, :, :3].astype(int)
    near_white = (rgb.min(axis=2) > 232)
    # 只去掉和外框相連的白色，避免把角色身上的白色挖空
    if '--white-all' in args:
        # 圖上有格線時，白底會被圍住；直接去掉所有接近白色與淺灰格線的像素
        grid_line = (rgb.min(axis=2) > 170) & ((rgb.max(axis=2) - rgb.min(axis=2)) < 18)
        arr[:, :, 3] = np.where(near_white | grid_line, 0, arr[:, :, 3])
    else:
        lab, _ = ndimage.label(near_white)
        border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
        arr[:, :, 3] = np.where(np.isin(lab, list(border)), 0, arr[:, :, 3])
H, W = arr.shape[:2]
cw, ch = W / cols, H / rows

frames = []  # (row, col, image, bbox)
for r in range(rows):
    for c in range(cols):
        x0, y0, x1, y1 = int(c * cw), int(r * ch), int((c + 1) * cw), int((r + 1) * ch)
        cell = arr[y0:y1, x0:x1].copy()
        a = cell[:, :, 3] > 60
        lab, n = ndimage.label(ndimage.binary_closing(a, iterations=3))
        if n == 0:
            frames.append((r, c, None))
            continue
        sizes = ndimage.sum(a, lab, range(1, n + 1))
        k = int(np.argmax(sizes)) + 1
        # 保留最大塊，以及和它差不多大的（例如刀光）
        keep = np.zeros_like(a)
        for j in range(1, n + 1):
            if sizes[j - 1] >= 0.15 * sizes[k - 1]:
                keep |= lab == j
        cell[:, :, 3] = np.where(keep, cell[:, :, 3], 0)
        frames.append((r, c, Image.fromarray(cell)))

# 用第一列（待機）的平均高度決定縮放比例
hs = [f[2].getchannel('A').getbbox() for f in frames if f[0] == 0 and f[2] is not None]
avg_h = sum(b[3] - b[1] for b in hs) / len(hs)
scale = idle_h / avg_h
# 畫布：寬 2.4 倍、高 1.5 倍角色身高，腳底固定在高度 90% 的位置（攻擊時刀伸出去也放得下）
canvas_w, canvas_h = int(idle_h * 2.4), int(idle_h * 1.5)
out = {}
for r, c, fr in frames:
    if fr is None:
        continue
    bb = fr.getchannel('A').getbbox()
    crop = fr.crop(bb)
    a = np.array(crop)[:, :, 3] > 60
    ys, xs = np.nonzero(a)
    # 水平中心：用下半身（腳）的重心，攻擊時刀伸出去也不會把身體推歪
    low = ys > (a.shape[0] * 0.55)
    cx = xs[low].mean() if low.any() else xs.mean()
    sm = crop.resize((max(1, round(crop.width * scale)), max(1, round(crop.height * scale))), Image.Resampling.BOX)
    cv = Image.new('RGBA', (canvas_w, canvas_h))
    px = int(canvas_w / 2 - cx * scale)
    py = int(canvas_h * 0.9 - sm.height)
    cv.paste(sm, (px, py), sm)
    key = f'{name}-{rownames[r]}-{c}'
    cv.save(out_dir / f'{key}.png', optimize=True)
    out.setdefault(rownames[r], []).append(cv)
print(name, {k: len(v) for k, v in out.items()}, 'canvas', canvas_w, canvas_h, 'scale %.3f' % scale)

if preview:
    seq = []
    for rn in rownames:
        for _ in range(3):
            seq += out.get(rn, [])
    big = []
    for f in seq:
        bg = Image.new('RGBA', f.size, (18, 15, 32, 255))
        bg.alpha_composite(f)
        big.append(bg.resize((f.width * 2, f.height * 2), Image.Resampling.NEAREST).convert('P', palette=Image.ADAPTIVE))
    big[0].save(preview, save_all=True, append_images=big[1:], duration=120, loop=0)
