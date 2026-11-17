P=/root/whatsapp-crm/backend/src
L=/root/ant-lab/src
ls -la /root/ant-lab | head -40
echo ---; cat /root/lab-start.sh
for f in workers/botAtendimentoService.ts workers/whatsappService.ts bot-service/server.ts; do echo "== $f"; ls -la $P/$f $L/$f; cmp $P/$f $L/$f && echo IGUAL; done
echo ---; ls $P/bot-service $L/bot-service
echo ---; grep -rln "tabelaPrecos" $P --include=*.ts
echo ---; find $P -name "tabelaPrecos*"
echo ---; ls -la /root/gp-aro /root/gp-aro/conf
cd /root/whatsapp-crm/backend && git status --short | head -30 && git log --oneline | head -5
pm2 ls
