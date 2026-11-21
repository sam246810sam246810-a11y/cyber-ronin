#!/usr/bin/env python3
"""
角色／怪物素材批次處理：綠幕去背 → 去綠邊（despill）→ 裁切透明邊界 → 補成正方形 → 統一尺寸。

用法：
  python3 tools/sprite_pipeline.py IN_DIR OUT_DIR [--size 512] [--pad 0.04] [--flip name1,name2]

  - IN_DIR 內的 .png / .jpg 都會處理，輸出同名 .png 到 OUT_DIR。
  - 綠幕（約 #00FF00）會變透明；若原圖本來就有透明背景，會跳過去背只做裁切與縮放。
  - --flip：讓指定檔名（不含副檔名）左右翻轉，統一面向右邊。
  - --preview PATH：另外輸出一張深色底的總覽圖，方便檢查白邊／黑邊／綠邊。

處理細節：
  1. 去背：計算每個像素「綠色多於紅藍的程度」，超過門檻完全透明，邊緣地帶做漸層透明（抗鋸齒）。
  2. 去綠邊：半透明邊緣上殘留的綠光，把 G 壓回 max(R, B)，避免角色外緣泛綠。
  3. 清雜點：alpha 太低的像素直接歸零，避免裁切範圍被零星雜點撐大。
  4. 裁切：依 alpha 的外框裁切，再依 --pad 留一點邊距，補成置中的正方形。
  5. 縮放：LANCZOS 縮到 --size，透明區 RGB 一併清成 0，避免縮放時邊緣混出黑邊或白邊。
"""
import argparse
import os
import sys

import numpy as np
from PIL import Image


def chroma_key(rgb: np.ndarray) -> np.ndarray:
    """回傳 0..1 的 alpha。綠色越明顯越透明。"""
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    greenness = g - np.maximum(r, b)  # 綠幕約 200 以上，角色本身通常 < 30
    lo, hi = 40.0, 110.0  # lo 以下保留、hi 以上全透明、中間漸層
    a = 1.0 - np.clip((greenness - lo) / (hi - lo), 0.0, 1.0)
    return a


def despill(rgb: np.ndarray, alpha: np.ndarray) -> np.ndarray:
    """把邊緣（以及任何偏綠像素）的 G 壓到不超過 max(R, B)。"""
    out = rgb.copy()
    r, g, b = out[..., 0], out[..., 1], out[..., 2]
    limit = np.maximum(r, b)
    spill = g > limit + 8
    edge = alpha < 0.98
    mask = spill & (edge | ((g - limit) > 60))
    out[..., 1] = np.where(mask, limit, g)
    return out


def process(path: str, size: int, pad: float, flip: bool) -> Image.Image:
    im = Image.open(path).convert('RGBA')
    arr = np.asarray(im).astype(np.float32)
    rgb, a0 = arr[..., :3], arr[..., 3] / 255.0
    has_alpha = (a0 < 0.99).mean() > 0.05
    if has_alpha:
        alpha = a0
    else:
        alpha = chroma_key(rgb)
        rgb = despill(rgb, alpha)
    alpha = np.where(alpha < 0.08, 0.0, alpha)
    rgb = np.where(alpha[..., None] > 0, rgb, 0.0)  # 透明區 RGB 清零，縮放時不混出雜色
    out = np.dstack([rgb, alpha * 255.0]).clip(0, 255).astype(np.uint8)
    im = Image.fromarray(out, 'RGBA')

    bbox = im.getchannel('A').getbbox()
    if not bbox:
        raise ValueError(f'{path}: 去背後沒有任何內容，檢查綠幕門檻')
    im = im.crop(bbox)
    if flip:
        im = im.transpose(Image.FLIP_LEFT_RIGHT)
    side = int(max(im.size) * (1 + pad * 2))
    canvas = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    # 角色腳底對齊下緣（留 pad），左右置中：放進遊戲時陰影位置才一致
    x = (side - im.width) // 2
    y = side - im.height - int(max(im.size) * pad)
    canvas.paste(im, (x, y))
    return canvas.resize((size, size), Image.LANCZOS)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('in_dir')
    ap.add_argument('out_dir')
    ap.add_argument('--size', type=int, default=512)
    ap.add_argument('--pad', type=float, default=0.04)
    ap.add_argument('--flip', default='')
    ap.add_argument('--preview', default='')
    args = ap.parse_args()
    flips = {s for s in args.flip.split(',') if s}
    os.makedirs(args.out_dir, exist_ok=True)
    done = []
    for name in sorted(os.listdir(args.in_dir)):
        stem, ext = os.path.splitext(name)
        if ext.lower() not in ('.png', '.jpg', '.jpeg', '.webp'):
            continue
        img = process(os.path.join(args.in_dir, name), args.size, args.pad, stem in flips)
        dst = os.path.join(args.out_dir, stem + '.png')
        img.save(dst, optimize=True)
        done.append((stem, img))
        print(f'{stem}: {img.size}')
    if args.preview and done:
        t = 256
        sheet = Image.new('RGBA', (t * len(done), t), (24, 20, 32, 255))
        for i, (_, img) in enumerate(done):
            sheet.alpha_composite(img.resize((t, t), Image.LANCZOS), (i * t, 0))
        sheet.convert('RGB').save(args.preview)
    if not done:
        sys.exit('沒有找到圖片')


if __name__ == '__main__':
    main()
