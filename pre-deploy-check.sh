cd /root/ant-lab
for a in src/workers/botAtendimentoService.ts src/routes/botPneus.ts src/services/transcricaoLocal.ts; do
  echo "== $a  lab: $(date -r $a '+%d/%m %H:%M')"
  diff /root/whatsapp-crm/backend/$a $a | grep -c '^[<>]'
done
echo "== arquivos do lab mexidos na ultima 1h30"
find /root/ant-lab/src -newermt '-90 minutes' -type f | head
date '+agora %d/%m %H:%M'
