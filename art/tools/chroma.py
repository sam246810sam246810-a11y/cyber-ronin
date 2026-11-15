"""把綠幕影片做成透明背景的動態立繪序列幀（WebP，含透明）。

用法：/path/to/venv/bin/python art/tools/chroma.py <影片> <名稱> [幀數=16] [高度=900] [開始秒=0] [結束秒=全長]
輸出：src/assets/sprites/live-<名稱>-<i>.webp
步驟：ffmpeg 取幀 → 依「綠色比紅藍多多少」算透明度 → 去掉邊緣綠色反光 → 裁成同一個外框 → 縮放存檔
"""
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'src' / 'assets' / 'sprites'

src, name = sys.argv[1], sys.argv[2]
n = int(sys.argv[3]) if len(sys.argv) > 3 else 16
height = int(sys.argv[4]) if len(sys.argv) > 4 else 900
ss = float(sys.argv[5]) if len(sys.argv) > 5 else 0.0
dur = float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', src]).decode())
to = float(sys.argv[6]) if len(sys.argv) > 6 else dur

tmp = Path(tempfile.mkdtemp())
subprocess.run(['ffmpeg', '-v', 'error', '-ss', str(ss), '-to', str(to), '-i', src, '-vf', f'fps={n / (to - ss)}', str(tmp / 'f-%03d.png')], check=True)
files = sorted(tmp.glob('f-*.png'))[:n]


def key(path: Path) -> Image.Image:
    a = np.asarray(Image.open(path).convert('RGB')).astype(np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    diff = g - np.maximum(r, b)
    # 綠色多出 30 以下視為不透明，多出 90 以上視為全透明
    alpha = 1 - np.clip((diff - 30) / 60, 0, 1)
    # 去掉綠色反光：綠色不超過紅藍較大者
    g2 = np.where(diff > 0, np.maximum(r, b) + np.clip(diff, 0, 20) * 0.2, g)
    out = np.dstack([r, g2, b, alpha * 255]).clip(0, 255).astype(np.uint8)
    return Image.fromarray(out, 'RGBA')


frames = [key(f) for f in files]
# 所有幀共用一個外框，動畫才不會抖
box = None
for f in frames:
    bb = f.getchannel('A').point(lambda v: 255 if v > 24 else 0).getbbox()
    if bb:
        box = bb if box is None else (min(box[0], bb[0]), min(box[1], bb[1]), max(box[2], bb[2]), max(box[3], bb[3]))
for old in OUT.glob(f'live-{name}-*.webp'):
    old.unlink()
total = 0
for i, f in enumerate(frames):
    c = f.crop(box)
    s = height / c.height
    c = c.resize((round(c.width * s), height), Image.LANCZOS)
    p = OUT / f'live-{name}-{i}.webp'
    c.save(p, 'WEBP', quality=int(__import__('os').environ.get('Q', '72')), method=6)
    total += p.stat().st_size
print(f'live-{name}: {len(frames)} 幀，外框 {box}，共 {total // 1024} KB')
