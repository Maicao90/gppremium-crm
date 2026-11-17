cd /root/whatsapp-crm/backend
echo "== arquivos pausados =="
ls -la /root/bot-audios-pausados | head -20
for f in $(ls /root/bot-audios-pausados | head -3); do echo "-- $f"; ffprobe -v error -show_entries format=format_name,duration:stream=codec_name,sample_rate,channels -of compact "/root/bot-audios-pausados/$f"; done
echo "== codigo de envio =="
grep -n "carregarMidiaBotIA" -A40 src/workers/whatsappService.ts | head -80
grep -rn "ptt" src/workers/whatsappService.ts src/services/*.ts | head -20
