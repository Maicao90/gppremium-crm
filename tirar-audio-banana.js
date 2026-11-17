// 23/10 (dono): parar o audio "preco de banana" (josy-desconfia_qualidade). O ensinamento fica so com o texto.
const fs = require('fs');
const ARQ = '/root/whatsapp-crm/backend/data/cerebro/licoes.json';
const l = JSON.parse(fs.readFileSync(ARQ, 'utf8'));
let n = 0;
for (const x of l) {
  if (/\[ENVIAR_AUDIO:josy-desconfia_qualidade[^\]]*\]/.test(x.resposta)) {
    x.resposta = x.resposta.replace(/\[ENVIAR_AUDIO:josy-desconfia_qualidade[^\]]*\]\s*/g, '').trim();
    delete x.audioJosy;
    x.atualizadoEm = new Date().toISOString();
    n++;
    console.log('sem audio agora:', x.situacao.slice(0, 60), '|', x.resposta.replace(/\n/g, ' / ').slice(0, 120));
  }
}
const t = ARQ + '.tmp-' + process.pid;
fs.writeFileSync(t, JSON.stringify(l, null, 1));
fs.renameSync(t, ARQ);
// tira o arquivo da pasta do robo (guardado em /root/bot-audios-josy-originais)
const a = '/root/whatsapp-crm/backend/public/midias/bot-audios/josy-desconfia_qualidade.ogg';
if (fs.existsSync(a)) { fs.renameSync(a, '/root/bot-audios-josy-originais/josy-desconfia_qualidade.ogg.desligado'); console.log('arquivo do audio tirado da pasta do robo'); }
console.log('ensinamentos alterados:', n);
