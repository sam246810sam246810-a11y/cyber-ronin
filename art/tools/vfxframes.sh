#!/usr/bin/env bash
# 把黑底特效影片切成遊戲用的序列幀（JPG，遊戲裡用發光疊加去掉黑色）。
# 用法：art/tools/vfxframes.sh <影片> <名稱> [幀數=16] [寬度=480] [開始秒=0] [結束秒=全長]
# 輸出：src/assets/sprites/fx-<名稱>-<i>.jpg（BootScene 會自動建立 fx-<名稱> 動畫）
set -euo pipefail
src=$1; name=$2; n=${3:-16}; width=${4:-480}; ss=${5:-0}
dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$src")
to=${6:-$dur}
len=$(python3 -c "print(float('$to')-float('$ss'))")
fps=$(python3 -c "print($n/$len)")
out=src/assets/sprites
rm -f "$out"/fx-"$name"-*.jpg
tmp=$(mktemp -d)
ffmpeg -v error -ss "$ss" -to "$to" -i "$src" -vf "fps=$fps,scale=$width:-2:flags=lanczos" -q:v ${QV:-9} "$tmp/f-%02d.jpg"
i=0
for f in $(ls "$tmp"/f-*.jpg | sort | head -n "$n"); do mv "$f" "$out/fx-$name-$i.jpg"; i=$((i+1)); done
rm -rf "$tmp"
echo "fx-$name: $i 幀"
