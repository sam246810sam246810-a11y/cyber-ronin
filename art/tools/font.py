"""把 Cubic 11（俐方體 11 號，SIL OFL）裁成遊戲實際用到的字。

用法：/path/to/venv/bin/python art/tools/font.py <cn-font-split 的 Cubic 資料夾>
（需要 fonttools 與 brotli）

- 掃描 src/ 底下所有 .ts 檔案裡出現的字，再加上全部可列印的 ASCII
- 找出含有這些字的分割檔，各自裁切後輸出到 src/assets/fonts/cubic-N.woff2
- 輸出 src/assets/fonts/ranges.json：每個檔案涵蓋的 unicode-range
"""
import json
import re
import sys
from pathlib import Path

from fontTools.subset import Options, Subsetter
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'src' / 'assets' / 'fonts'


def used_chars() -> set[int]:
    chars = set(range(0x20, 0x7F))
    for f in (ROOT / 'src').rglob('*.ts'):
        for ch in f.read_text(encoding='utf-8'):
            if ord(ch) > 0x7F:
                chars.add(ord(ch))
    # 常用全形標點與符號
    for ch in '，。！？：；、「」『』（）《》…—～・◆▲▼←→↑↓％＋－×÷０１２３４５６７８９':
        chars.add(ord(ch))
    return chars


def main():
    src = Path(sys.argv[1])
    need = used_chars()
    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob('cubic-*.woff2'):
        old.unlink()
    ranges = []
    covered: set[int] = set()
    for i, path in enumerate(sorted(src.glob('*.woff2'))):
        font = TTFont(path)
        cmap = set(font.getBestCmap().keys())
        hit = (cmap & need) - covered
        if not hit:
            continue
        opts = Options()
        opts.flavor = 'woff2'
        opts.layout_features = ['*']
        opts.name_IDs = ['*']
        sub = Subsetter(options=opts)
        sub.populate(unicodes=sorted(hit))
        sub.subset(font)
        name = f'cubic-{len(ranges)}'
        font.flavor = 'woff2'
        font.save(OUT / f'{name}.woff2')
        covered |= hit
        ranges.append({'file': name, 'range': ','.join(f'U+{c:X}' for c in sorted(hit))})
    (OUT / 'ranges.json').write_text(json.dumps(ranges, ensure_ascii=False))
    missing = sorted(need - covered)
    print(f'{len(ranges)} files, {len(covered)} chars, missing {len(missing)}:', ''.join(chr(c) for c in missing if c > 0x7F)[:200])


if __name__ == '__main__':
    main()
