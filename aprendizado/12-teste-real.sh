# Teste com a COPIA do arquivo real no lab: aprovar remold com o 1o audio, aprovar so texto, ignorar uma.
cd /root/aprendizado-lab-api
cat > /tmp/aj-real.js <<'JS'
require('/root/whatsapp-crm/backend/node_modules/dotenv').config({ path: '/root/whatsapp-crm/backend/.env', quiet: true });
const jwt = require('/root/whatsapp-crm/backend/node_modules/jsonwebtoken');
const fs = require('fs'); const crypto = require('crypto');
const L = '/root/aprendizado-lab-api'; const T = 'Bearer ' + jwt.sign({ sub: 'lab', role: 'master', nome: 'Maicon (lab)' }, process.env.JWT_SECRET, { expiresIn: '5m' });
const post = (id, b) => fetch('http://127.0.0.1:3017/api/cerebro/aprendizado/' + encodeURIComponent(id), { method: 'POST', headers: { authorization: T, 'content-type': 'application/json' }, body: JSON.stringify(b) }).then(async (r) => ({ s: r.status, j: await r.json() }));
const sha = (f) => crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex');
(async () => {
  const props = JSON.parse(fs.readFileSync(L + '/data/cerebro/aprendizado-josy.json', 'utf8')).propostas;
  const rem = props.find((p) => p.id === 'pergunta_se_e_remold');
  console.log('remold: acao', rem.sugestao.acao, '| ligadoA', rem.ligadoA, '| audios', rem.audios.map((a) => a.midia));
  let r = await post('pergunta_se_e_remold', { decisao: 'aprovar', licao: rem.sugestao, audio: rem.audios[0].midia });
  console.log('aprovar com audio ->', r.s, r.j.error || '');
  const dest = L + '/public/midias/bot-audios/josy-pergunta_se_e_remold.ogg';
  console.log('copiado:', fs.existsSync(dest), 'sha igual:', fs.existsSync(dest) && sha(dest) === sha(L + '/public/midias/' + rem.audios[0].midia.split('/').pop()));
  const l = JSON.parse(fs.readFileSync(L + '/data/cerebro/licoes.json', 'utf8')).find((x) => x.propostaJosy === 'pergunta_se_e_remold');
  console.log('ensinamento:', JSON.stringify(l, null, 1));
  const h = props.find((p) => p.id === 'pergunta_horario');
  r = await post('pergunta_horario', { decisao: 'aprovar', licao: h.sugestao, audio: null }); console.log('aprovar so texto (horario) ->', r.s, r.j.error || r.j.licao?.resposta?.slice(0, 80));
  r = await post('pergunta_entrega', { decisao: 'ignorar' }); console.log('ignorar (entrega) ->', r.s, r.j.proposta?.status, r.j.proposta?.decididoPor);
  const parc = props.find((p) => p.id === 'pede_parcelamento');
  r = await post('pede_parcelamento', { decisao: 'aprovar', licao: parc.sugestao, audio: parc.audios[0]?.midia }); console.log('audio em proposta "orientar" ->', r.s, r.j.error);
  const c = JSON.parse(fs.readFileSync(L + '/data/cerebro/aprendizado-josy.json', 'utf8')).propostas.reduce((m, p) => (m[p.status] = (m[p.status] || 0) + 1, m), {});
  console.log('contagem:', c, '| .tmp sobrando:', fs.readdirSync(L + '/data/cerebro').filter((f) => f.endsWith('.tmp')).length);
  console.log('arquivo real da analise intocado:', fs.statSync('/root/josy-analise/aprendizado-josy.json').size, 'bytes; producao sem aprendizado-josy.json:', !fs.existsSync('/root/whatsapp-crm/backend/data/cerebro/aprendizado-josy.json'));
})();
JS
timeout 60 node /tmp/aj-real.js; rm -f /tmp/aj-real.js
ls -la public/midias/bot-audios
