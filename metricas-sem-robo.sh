set -e
cd /root/crm-de-anuncios
F=src/pages/AtMetricas.jsx
cp $F /root/AtMetricas.jsx.bak-$(date +%s)
python3 - "$F" <<'PY'
import sys
p = sys.argv[1]
s = open(p, encoding='utf-8').read()
a = "      setAgendamentos((Array.isArray(ags) ? ags : []).filter((a) => !idsOcultos.has(a.criadoPorId)));\n"
assert s.count(a) == 1
s = s.replace(a, """      // 23/10: agendamento feito pelo ROBO (retomada de clientes, lembrete de visita: observacoes 'robo-...') nao e
      // trabalho do atendente — sem isto a Josy aparecia com 160 agendamentos a mais (a retomada sai pelo numero dela).
      setAgendamentos((Array.isArray(ags) ? ags : []).filter((a) => !idsOcultos.has(a.criadoPorId) && !String(a.observacoes || '').includes('robo-')));
""")
open(p, 'w', encoding='utf-8').write(s)
print('ok')
PY
npx vite build 2>&1 | grep -iE "error|built in" | head -3
P=/root/whatsapp-crm/backend/public/anuncios
tar -czf /root/anuncios-bak-metricas-$(date +%s).tgz -C /root/whatsapp-crm/backend/public anuncios
cp -r dist/* $P/
git add $F && git -c user.name=Maicon -c user.email=maiconbatn5@gmail.com commit -q -m "Metricas: agendamentos do robo (retomada/lembrete) nao contam pro atendente" && git log -1 --format=%h
