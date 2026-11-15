#!/usr/bin/env bash
# 把 art/raw/ 的音樂與音效壓縮並正規化音量，輸出到 src/assets/audio/
set -euo pipefail
cd "$(dirname "$0")/../.."
A=src/assets/audio; mkdir -p $A
peak() { ffmpeg -i "$1" -af volumedetect -f null - 2>&1 | grep max_volume | awk '{print $5}'; }
for f in art/raw/bgm-*.mp3; do
  n=$(basename "$f" .mp3); g=$(python3 -c "print(-1.0 - float('$(peak "$f")'))")
  ffmpeg -loglevel error -y -i "$f" -ac 2 -b:a 96k -af "volume=${g}dB" "$A/$n.mp3"
done
for f in art/raw/sfx-*.mp3; do
  n=$(basename "$f" .mp3); g=$(python3 -c "print(min(30.0, -3.0 - float('$(peak "$f")')))")
  d=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$f"); st=$(python3 -c "print(max(0.1, $d - 0.25))")
  ffmpeg -loglevel error -y -i "$f" -ac 1 -b:a 64k -af "volume=${g}dB,silenceremove=start_periods=1:start_threshold=-45dB,afade=t=out:st=${st}:d=0.2" "$A/$n.mp3" 2>/dev/null || true
  # 太短（被裁掉）就改用沒有裁切的版本
  if [ "$(stat -c %s "$A/$n.mp3")" -lt 2000 ]; then
    ffmpeg -loglevel error -y -i "$f" -ac 1 -b:a 64k -af "volume=${g}dB" "$A/$n.mp3"
  fi
done
ls -la $A
