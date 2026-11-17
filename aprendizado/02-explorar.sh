B=/root/whatsapp-crm/backend
echo "=== ogg em midias (find)"; find $B/public/midias -maxdepth 1 -name '*.ogg' | head -5; find $B/public/midias -maxdepth 1 -name '*.ogg' | wc -l
echo "=== josy-analise"; ls -la /root/josy-analise | head -40
echo "=== josy-export"; ls -la /root/josy-export | head -20
echo "=== audio-lab"; ls /root/audio-lab | head
echo "=== bot-audios-originais"; ls -la /root/bot-audios-originais | head
for f in /root/josy-analise/*.json; do [ -f "$f" ] && { echo "--- $f"; head -c 1500 "$f"; echo; }; done 2>/dev/null | head -120
echo "=== aprendizado existente?"; ls $B/data/cerebro/aprendizado* 2>&1
echo "=== lojas"; node -e 'const j=require("/root/whatsapp-crm/backend/data/bot-lojas.json");for(const [k,v] of Object.entries(j)) if(!k.startsWith("_")) console.log(k, v.NOME_LOJA)'
echo "=== fluxoCatalogo chaves"; grep -oE "chave: '[a-z0-9_]+'" $B/src/data/fluxoCatalogo.ts | head -60 | tr '\n' ' '
echo; echo "=== ffprobe?"; which ffprobe ffmpeg
echo "=== painel index.css vars"; grep -n -- "--panel-bg\b\|--panel-bg:\|--text-primary:\|--accent-color:\|--bg-color:" /root/crm-de-anuncios/src/index.css | head
echo "=== atendimento/api.js"; head -30 /root/crm-de-anuncios/src/atendimento/api.js
