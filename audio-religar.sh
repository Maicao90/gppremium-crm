set -e
# Religa os audios do robo (22/10, pedido do dono). Antes de voltar, regrava cada arquivo com o MESMO
# formato que o painel usa pros audios da atendente (que chegam normal): Opus 32k, 48 kHz, mono, OGG,
# sem metadados.
SRC=/root/bot-audios-pausados
DST=/root/whatsapp-crm/backend/public/midias/bot-audios
mkdir -p $DST /root/bot-audios-originais
cp -n $SRC/*.ogg /root/bot-audios-originais/
for f in $SRC/*.ogg; do
  n=$(basename $f)
  ffmpeg -hide_banner -loglevel error -y -i "$f" -vn -map_metadata -1 -c:a libopus -b:a 32k -ar 48000 -ac 1 -f ogg "$DST/$n"
  ffprobe -v error -show_entries format=duration:stream=codec_name,sample_rate,channels -of compact "$DST/$n"
done
ls -la $DST
