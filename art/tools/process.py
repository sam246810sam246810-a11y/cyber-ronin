"""把 art/raw/ 裡的原始圖轉成遊戲用的精靈圖。

用法：python3 -I art/tools/process.py <原始檔> <輸出名稱> <最大邊長> [--grid COLSxROWS --names a,b,c...]

- 去掉透明邊界、縮放到指定大小（用面積平均縮小，保留像素風的清晰度）
- --grid：把一張圖切成格子（例如 4x4 的圖示表），每格各自裁切與縮放
- 輸出到 src/assets/sprites/<名稱>.png
"""
import sys
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'src' / 'assets' / 'sprites'


def clean_alpha(im: Image.Image) -> Image.Image:
    im = im.convert('RGBA')
    # 把半透明的雜訊清掉，讓邊緣乾淨
    a = im.getchannel('A').point(lambda v: 0 if v < 40 else (255 if v > 200 else v))
    im.putalpha(a)
    return im


def fit(im: Image.Image, size: int) -> Image.Image:
    bbox = im.getchannel('A').getbbox()
    if bbox:
        im = im.crop(bbox)
    w, h = im.size
    s = size / max(w, h)
    nw, nh = max(1, round(w * s)), max(1, round(h * s))
    return im.resize((nw, nh), Image.Resampling.BOX)


def main():
    args = sys.argv[1:]
    src, name, size = Path(args[0]), args[1], int(args[2])
    im = clean_alpha(Image.open(src))
    OUT.mkdir(parents=True, exist_ok=True)
    if '--grid' in args:
        cols, rows = map(int, args[args.index('--grid') + 1].split('x'))
        names = args[args.index('--names') + 1].split(',')
        W, H = im.size
        for i, n in enumerate(names):
            c, r = i % cols, i // cols
            cell = im.crop((c * W // cols, r * H // rows, (c + 1) * W // cols, (r + 1) * H // rows))
            fit(cell, size).save(OUT / f'{n}.png', optimize=True)
            print('wrote', n)
    else:
        fit(im, size).save(OUT / f'{name}.png', optimize=True)
        print('wrote', name)


if __name__ == '__main__':
    main()
