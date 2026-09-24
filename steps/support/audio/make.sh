#!/bin/sh
# Как сделаны тестовые аудиофайлы (план среза 3, решение 16).
# meeting.m4a — настоящая запись «Диктофона» iPhone (AAC, 7 с, moov в конце),
# её не пересоздавать. Остальное — из неё:
set -e
cd "$(dirname "$0")"
ffmpeg -v error -y -i meeting.m4a -t 2 -c:a alac lossless-meeting.m4a
# Для BR-20 содержимое не важно, формат проверяется по расширению.
ffmpeg -v error -y -i meeting.m4a -t 0.3 -c:a libmp3lame -b:a 32k meeting.mp3
ffmpeg -v error -y -i meeting.m4a -t 0.1 -ar 8000 voice.wav
ffmpeg -v error -y -i meeting.m4a -t 0.3 -c:a libopus call.ogg
printf '%%PDF-1.4\n%%%%EOF\n' > notes.pdf
