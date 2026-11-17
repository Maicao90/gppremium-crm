cd /root/whatsapp-crm/backend
U=$(grep ^DATABASE_URL .env | cut -d= -f2- | tr -d '"' | sed 's#^postgresql://##; s#^postgres://##')
q() { docker exec gp-postgres-crm psql -U "${U%%:*}" -d testdb -At -F '|' -c "$1"; }
q "select to_char(timestamp - interval '3 hours','HH24:MI'), tipo, \"midiaUrl\" from \"Mensagem\" where \"usuarioId\"='34268c16-7bed-400a-bf1e-a3d9e37d8774' and \"chatJid\"='198466395455670@lid' and \"fromMe\" and coalesce(\"enviadoPorId\",'')<>'bot' and tipo in ('imagem','audio') order by timestamp" > /tmp/midias-josy.txt
cat /tmp/midias-josy.txt
cd /root/ant-lab
cat > src/teste-enxergar.ts <<'EOF'
import 'dotenv/config';
import fs from 'fs';
import { lerImagem } from './services/leituraImagem';
import { transcreverAudioLocal } from './services/transcricaoLocal';
(async () => {
  const linhas = fs.readFileSync('/tmp/midias-josy.txt', 'utf8').trim().split('\n').map((l) => l.split('|'));
  for (const [hora, tipo, url] of linhas) {
    const arq = '/root/whatsapp-crm/backend/public' + url;
    const t = tipo === 'imagem' ? await lerImagem(arq, 'atendente') : await transcreverAudioLocal(arq);
    console.log(`\n${hora} ${tipo}: ${t}`);
  }
})();
EOF
DOTENV_CONFIG_PATH=/root/whatsapp-crm/backend/.env ./node_modules/.bin/ts-node --transpile-only src/teste-enxergar.ts
rm -f src/teste-enxergar.ts; rm -rf data
