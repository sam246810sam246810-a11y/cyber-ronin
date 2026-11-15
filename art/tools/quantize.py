"""把精靈圖壓成 256 色調色盤 PNG（保留透明度），檔案約小一半，像素風幾乎看不出差別。

用法：python3 -I art/tools/quantize.py <檔案...>
"""
import sys
from PIL import Image

for f in sys.argv[1:]:
    im = Image.open(f)
    if im.mode == 'P':
        continue
    q = im.convert('RGBA').quantize(colors=256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
    q.save(f, optimize=True)
