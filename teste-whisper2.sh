cd /opt/whisper-teste
CLI=/opt/whisper.cpp/build/bin/whisper-cli
M=/opt/whisper-models/ggml-small-q5_1.bin
PROMPT="Atendimento de loja de pneus no WhatsApp. Medidas como 175/70 aro 14, 185/65/15, 195/55/15, 205/55/16, 265/60/18. Pneu GP Premium, remold, alinhamento, balanceamento, à vista, Pix, cartão, parcelar em 10 vezes, Luziânia."
# 3 audios reais de cliente que a loja recebeu hoje + os de teste
ls -t /root/whatsapp-crm/backend/public/midias/*.ogg | head -400 | while read f; do d=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$f"); echo "$d $f"; done | awk '$1>3 && $1<15' | head -3 | awk '{print $2}' > /tmp/audios-teste.txt
for f in $(cat /tmp/audios-teste.txt) AC0CA299283BFC6BA1315940A47BD44C_21683.ogg; do
  ffmpeg -nostdin -loglevel error -y -i "$f" -ar 16000 -ac 1 -c:a pcm_s16le /tmp/t.wav
  s=$(ffprobe -v error -show_entries format=duration -of csv=p=0 /tmp/t.wav)
  ctx=$(awk -v s="$s" 'BEGIN{c=int(s/30*1500)+128; if(c>1500)c=1500; print c}')
  echo "== $(basename $f) (${s}s)"
  for modo in atual prompt prompt_bs3; do
    extra=""; [ "$modo" != atual ] && extra="--prompt"
    ini=$(date +%s.%N)
    if [ "$modo" = atual ]; then t=$(nice -n 15 $CLI -m $M -l pt -t 1 -nt -np -ac $ctx -f /tmp/t.wav 2>/dev/null | tr '\n' ' ');
    elif [ "$modo" = prompt ]; then t=$(nice -n 15 $CLI -m $M -l pt -t 1 -nt -np -ac $ctx --prompt "$PROMPT" -f /tmp/t.wav 2>/dev/null | tr '\n' ' ');
    else t=$(nice -n 15 $CLI -m $M -l pt -t 1 -nt -np -ac $ctx --prompt "$PROMPT" -bs 3 -f /tmp/t.wav 2>/dev/null | tr '\n' ' '); fi
    fim=$(date +%s.%N)
    printf "  %-11s %5.1fs | %s\n" "$modo" "$(echo "$fim - $ini" | bc)" "$t"
  done
done
