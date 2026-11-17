cd /opt/whisper-teste
CLI=/opt/whisper.cpp/build/bin/whisper-cli
M=/opt/whisper-models/ggml-small-q5_1.bin
PROMPT="Atendimento de loja de pneus no WhatsApp. Medidas como 175/70 aro 14, 185/65/15, 195/55/15, 205/55/16, 265/60/18. Pneu GP Premium, remold, alinhamento, balanceamento, à vista, Pix, cartão, parcelar em 10 vezes, Luziânia."
T=/root/whatsapp-crm/backend/data/transcricoes
echo "transcricoes de clientes ja feitas: $(ls $T | wc -l)"
# audios de cliente ja transcritos que falam de medida/aro/numero
for f in $(grep -lE "[0-9]|aro|medida|pneu" $T/*.txt | head -6); do
  a=/root/whatsapp-crm/backend/public/midias/$(basename "$f" .txt)
  [ -f "$a" ] || continue
  ffmpeg -nostdin -loglevel error -y -i "$a" -ar 16000 -ac 1 -c:a pcm_s16le /tmp/t.wav
  s=$(ffprobe -v error -show_entries format=duration -of csv=p=0 /tmp/t.wav)
  ctx=$(awk -v s="$s" 'BEGIN{c=int(s/30*1500)+128; if(c>1500)c=0; print c}')
  echo "== $(basename $a) (${s}s)"
  echo "  atual(cache) | $(cat $f)"
  ini=$(date +%s.%N)
  t=$(nice -n 15 $CLI -m $M -l pt -t 1 -nt -np -ac $ctx --prompt "$PROMPT" -f /tmp/t.wav 2>/dev/null | tr '\n' ' ')
  fim=$(date +%s.%N)
  printf "  prompt %5.1fs | %s\n" "$(echo "$fim - $ini" | bc)" "$t"
done
