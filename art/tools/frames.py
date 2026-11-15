"""切動畫影格：把 COLSxROWS 的影格表切開，每格「不」個別裁切，維持一致的大小與位置。

用法：python3 -I art/tools/frames.py <原始檔> <名稱> <COLS>x<ROWS> <輸出每格寬度> [--skip N]
輸出：src/assets/sprites/fx-<名稱>-<i>.png（i 從 0 開始）
"""
import sys
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'src' / 'assets' / 'sprites'

src, name, grid, size = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4])
skip = int(sys.argv[sys.argv.index('--skip') + 1]) if '--skip' in sys.argv else 0
cols, rows = map(int, grid.split('x'))
im = Image.open(src).convert('RGBA')
a = im.getchannel('A').point(lambda v: 0 if v < 30 else v)
im.putalpha(a)
W, H = im.size
cw, ch = W // cols, H // rows
for old in OUT.glob(f'fx-{name}-*.png'):
    old.unlink()
n = 0
for i in range(cols * rows):
    if i < skip:
        continue
    c, r = i % cols, i // cols
    cell = im.crop((c * cw, r * ch, (c + 1) * cw, (r + 1) * ch))
    side = max(cw, ch)
    sq = Image.new('RGBA', (side, side))
    sq.alpha_composite(cell, ((side - cw) // 2, (side - ch) // 2))
    sq.resize((size, size), Image.Resampling.BOX).save(OUT / f'fx-{name}-{n}.png', optimize=True)
    n += 1
print(name, n, 'frames')
