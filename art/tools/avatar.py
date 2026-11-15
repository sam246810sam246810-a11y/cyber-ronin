"""從高清立繪裁出頭像（avatar-<id>.png，160×160）。

用法：/path/to/venv/bin/python art/tools/avatar.py
新角色在 FACES 加一行：臉中心的 x、y（佔圖寬高的比例）與半徑（佔圖高的比例）。
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SP = ROOT / 'src' / 'assets' / 'sprites'
FACES = {'jin': (0.62, 0.17, 0.085), 'zero': (0.52, 0.18, 0.085), 'tetsu': (0.6, 0.175, 0.095), 'oboro': (0.78, 0.29, 0.075), 'hayabusa': (0.56, 0.19, 0.075), 'kagura': (0.61, 0.155, 0.075)}

for cid, (fx, fy, r) in FACES.items():
    im = Image.open(SP / f'hd-{cid}.webp').convert('RGBA')
    w, h = im.size
    cx, cy, R = fx * w, fy * h, r * h
    im.crop((int(cx - R), int(cy - R), int(cx + R), int(cy + R))).resize((160, 160), Image.LANCZOS).save(SP / f'avatar-{cid}.png', optimize=True)
    print('avatar', cid)
