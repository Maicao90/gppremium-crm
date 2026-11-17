cd /root/whatsapp-crm
echo "== logs de envio de audio do robo =="
grep -hiE "midia|audio" logs/error.log | grep -viE "transcri|whisper" | tail -15
grep -hiE "BotIA.*(audio|midia)|enviarMidiaBotIA|sendMessage\(midia\)" logs/*.log 2>/dev/null | tail -15
echo "== ultimas mensagens de audio no banco (robo x atendente) =="
docker exec gp-postgres-crm psql -U postgres -d testdb -c "select \"criadoEm\", \"enviadoPorId\"='bot' as robo, \"midiaUrl\", left(\"chatJid\",14) from \"Mensagem\" where tipo='audio' and \"fromMe\"=true order by \"criadoEm\" desc limit 12;" 2>&1 | head -20
echo "== detalhes ogg =="
ffprobe -v error -show_streams -show_format /root/bot-audios-pausados/pneu-gp-premium-remold.ogg | grep -E "codec|bit_rate|extradata|start|tag|duration" | head -20
ls -la backend/node_modules | grep -iE "audio-decode|baileys" ; grep '"version"' backend/node_modules/baileys/package.json backend/node_modules/@whiskeysockets/baileys/package.json 2>/dev/null
