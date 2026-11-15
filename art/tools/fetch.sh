#!/usr/bin/env bash
# 用法：art/tools/fetch.sh <輸出名稱> <Higgsfield 結果網址>
# 把 Higgsfield 生成的原始檔下載到 art/raw/
set -euo pipefail
name="$1"; url="$2"
dir="$(cd "$(dirname "$0")/.." && pwd)/raw"
ext="${url##*.}"
curl -sSf --retry 3 -o "$dir/$name.$ext" "$url"
echo "$dir/$name.$ext"
