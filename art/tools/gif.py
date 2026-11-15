"""把 GIF 動畫拆成一列影格，再交給 sheet.py 對齊與縮放。

用法：/path/to/venv/bin/python art/tools/gif.py <gif> <名稱> <動畫名稱> <身高> [--out 資料夾]
輸出：<名稱>-<動畫名稱>-<i>.png
"""
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image

gif, name, anim, height = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
extra = sys.argv[5:]
g = Image.open(gif)
frames = []
for i in range(g.n_frames):
    g.seek(i)
    frames.append(g.convert('RGBA'))
w, h = frames[0].size
strip = Image.new('RGBA', (w * len(frames), h))
for i, f in enumerate(frames):
    strip.alpha_composite(f, (i * w, 0))
with tempfile.TemporaryDirectory() as d:
    p = Path(d) / 'strip.png'
    strip.save(p)
    subprocess.run([sys.executable, str(Path(__file__).with_name('sheet.py')), str(p), name, f'{len(frames)}x1', anim, height, *extra], check=True)
