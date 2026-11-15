"""高清立繪：清掉透明雜訊、裁切邊界、縮到指定高度。
用法：python3 -I art/tools/hd.py <原始檔> <名稱> <高度>"""
import sys
from pathlib import Path
from PIL import Image

src, name, h = sys.argv[1], sys.argv[2], int(sys.argv[3])
im = Image.open(src).convert('RGBA')
a = im.getchannel('A').point(lambda v: 0 if v < 24 else v)
im.putalpha(a)
im = im.crop(im.getchannel('A').getbbox())
s = h / im.height
im = im.resize((round(im.width * s), h), Image.Resampling.LANCZOS)
out = Path(__file__).resolve().parents[2] / 'src' / 'assets' / 'sprites' / f'{name}.webp'
im.save(out, 'WEBP', quality=88, method=6)
print(name, im.size, out.stat().st_size // 1024, 'KB')
