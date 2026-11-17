cd /root/ant-lab
grep -n -i "medida_extraida" src/data/fluxoPrecoExtrator.ts | head -20
echo "== motor: uso de medidaExtraida"
grep -n "medidaExtraida" src/data/fluxoPreco.ts | head -30
echo "== bot-lojas"
python3 -c "import json;d=json.load(open('/root/whatsapp-crm/backend/data/bot-lojas.json'));print(json.dumps(d,ensure_ascii=False)[:1500])"
echo "== caller: minutosDesdeUltimaDaLoja / gerar-resposta no backend de producao (so leitura)"
grep -rn --include=*.ts -e "minutosDesdeUltimaDaLoja" -e "gerar-resposta" /root/whatsapp-crm/backend/src | grep -v bot-service/server.ts | head -20
