cd /opt/whisper-teste
CLI=/opt/whisper.cpp/build/bin/whisper-cli
for f in *.ogg; do
  ffmpeg -nostdin -loglevel error -y -i "$f" -ar 16000 -ac 1 -c:a pcm_s16le "${f%.ogg}.wav"
done
for m in base small-q5_1; do
  echo "===== modelo $m"
  for w in *.wav; do
    ini=$(date +%s.%N)
    txt=$(nice -n 15 $CLI -m /opt/whisper-models/ggml-$m.bin -l pt -t 1 -nt -np -f "$w" 2>/dev/null | tr '\n' ' ')
    fim=$(date +%s.%N)
    dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$w")
    printf "%5.1fs audio | %5.1fs p/ transcrever | %s\n" "$dur" "$(echo "$fim - $ini" | bc)" "$txt"
  done
done
