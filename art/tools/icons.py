"""切圖示表：每一格只留下面積最大的那個圖示，去掉從隔壁格子跨進來的邊框。

用法：/path/to/venv/bin/python art/tools/icons.py <原始檔> <COLS>x<ROWS> <輸出大小> <名稱1,名稱2,...>
（需要 numpy、scipy、pillow）
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'src' / 'assets' / 'sprites'

src, grid, size, names = sys.argv[1], sys.argv[2], int(sys.argv[3]), sys.argv[4].split(',')
cols, rows = map(int, grid.split('x'))
im = Image.open(src).convert('RGBA')
W, H = im.size
cw, ch = W / cols, H / rows
for i, name in enumerate(names):
    c, r = i % cols, i // cols
    # 多抓一點邊界，避免圖示本身被切到
    x0, y0 = int(max(0, c * cw - cw * 0.08)), int(max(0, r * ch - ch * 0.08))
    x1, y1 = int(min(W, (c + 1) * cw + cw * 0.08)), int(min(H, (r + 1) * ch + ch * 0.08))
    cell = im.crop((x0, y0, x1, y1))
    a = np.array(cell)[:, :, 3] > 60
    # 侵蝕幾個像素，切斷和隔壁圖示的細連結，再找最大的一塊
    er = 6
    eroded = ndimage.binary_erosion(a, iterations=er)
    lab, n = ndimage.label(eroded)
    if n == 0:
        print('empty', name)
        continue
    sizes = ndimage.sum(eroded, lab, range(1, n + 1))
    k = int(np.argmax(sizes)) + 1
    # 偏好靠近格子中心的那塊（面積差不多時）
    cy, cx = a.shape[0] / 2, a.shape[1] / 2
    best = k
    for j in range(1, n + 1):
        if sizes[j - 1] > 0.6 * sizes[k - 1]:
            ys, xs = np.nonzero(lab == j)
            if abs(ys.mean() - cy) + abs(xs.mean() - cx) < abs(np.nonzero(lab == best)[0].mean() - cy) + abs(np.nonzero(lab == best)[1].mean() - cx):
                best = j
    keep = ndimage.binary_dilation(lab == best, iterations=er + 2) & a
    arr = np.array(cell)
    arr[:, :, 3] = np.where(keep, arr[:, :, 3], 0)
    out = Image.fromarray(arr)
    bb = out.getchannel('A').getbbox()
    out = out.crop(bb)
    s = size / max(out.size)
    out = out.resize((max(1, round(out.width * s)), max(1, round(out.height * s))), Image.Resampling.BOX)
    out.save(OUT / f'{name}.png', optimize=True)
print('done', len(names))
