// 23/10 (dono: "aprova tudo e manda pro cerebro"): decide as 39 sugestoes da revisao de 22/10 e as 2 propostas
// pendentes da Josy. Aprova o que melhora; o que ja e resolvido pelo codigo fixo (ou que faria o robo ficar calado
// com cliente real) fica marcado como ignorado COM o motivo.
const fs = require('fs');
const jwt = require('/root/whatsapp-crm/backend/node_modules/jsonwebtoken');
const B = '/root/whatsapp-crm/backend';
const ENV = fs.readFileSync(`${B}/.env`, 'utf8');
const SEGREDO = (ENV.match(/^JWT_SECRET=(.*)$/m) || [])[1].trim().replace(/^["']|["']$/g, '');
const token = jwt.sign({ sub: 'aprovacao-do-dono-23-10', role: 'master', nome: 'Aprovado pelo dono (23/10)' }, SEGREDO, { expiresIn: '10m' });
const API = 'http://127.0.0.1:3010/api/cerebro';
const GP = '72213a6c-31c5-410d-a6b4-504dfd223e2f';
const DATA = '2026-10-22';
const post = (url, body) => fetch(API + url, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify(body) }).then(async (r) => [r.status, await r.json().catch(() => ({}))]);

const aprovar = {
  Amvkcrarf22hz: { resposta: 'Desculpa por isso! Vou escrever por aqui então 😊\n\nSó um instante que eu já verifico essa informação pra você, tá bem?' },
  Amvkcsxmrw5k: {},
  Amvkct86gyqb: {},
  Amvkcvyrkei3: {},
  Amvkcy1w0vye: {},
};
const motivo = (a) => {
  if (a.sugestao?.acao === 'silencio') return 'Já resolvido: quando a atendente assume, o robô fica pausado. Como ensinamento, ele ficaria calado até com cliente que precisa de resposta.';
  if (a.id === 'Amvkctye61zl8') return 'Já resolvido no código: currículo/vaga o robô não responde (fica 7 dias quieto).';
  if (['Amvkcwyfnqj5', 'Amvkcx9t21c6u'].includes(a.id)) return 'Já coberto pelo ensinamento da Josy "desconfia da qualidade" (com o áudio dela).';
  if (a.id === 'Amvkctye61cxh') return 'Já coberto pelo fluxo fixo de agradecimento.';
  if (a.id === 'Amvkcs7iy15mi') return 'Aplicado no texto fixo da GP "cumprimento com conversa andando" (retoma o orçamento).';
  if (['Amvkcuhlu20c7', 'Amvkcvfpngpp'].includes(a.id)) return 'É sobre a mensagem de retomada; a retomada nova (agendamentos) já manda frase completa, sem emoji solto.';
  if (a.id === 'Amvkcrhmuo1j') return 'Anotado para corrigir no código: depois do "só um instante" o robô fica pausado e não responde a medida nova.';
  return 'Já resolvido no código fixo de medida/preço (TAB.7) — como ensinamento mandaria o caso para a IA livre.';
};

(async () => {
  const ARQ = `${B}/data/cerebro/revisoes/${DATA}.json`;
  const rev = JSON.parse(fs.readFileSync(ARQ, 'utf8'));
  const res = { aprovados: 0, ignorados: 0 };
  for (const a of rev.achados.filter((x) => x.status === 'pendente')) {
    if (aprovar[a.id]) {
      const licao = { ...a.sugestao, ...aprovar[a.id], lojas: [GP] };
      const [st, j] = await post(`/revisoes/${DATA}/achados/${a.id}`, { status: 'aprovado', licao });
      console.log('aprovado', a.id, st, j.error || '');
      res.aprovados++;
    } else {
      const [st, j] = await post(`/revisoes/${DATA}/achados/${a.id}`, { status: 'ignorado' });
      if (st !== 200) console.log('erro', a.id, st, j.error);
      res.ignorados++;
    }
  }
  // motivo de cada ignorado, pro dono ver no painel
  const rev2 = JSON.parse(fs.readFileSync(ARQ, 'utf8'));
  for (const a of rev2.achados) if (a.status === 'ignorado' && !a.nota) a.nota = motivo(a);
  const tmp = `${ARQ}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(rev2, null, 1));
  fs.renameSync(tmp, ARQ);
  console.log(JSON.stringify(res));

  // propostas pendentes da Josy
  const [s1, j1] = await post('/aprendizado/pos_venda_avaliacao', { decisao: 'aprovar', audio: null, licao: {
    situacao: 'quando o cliente que já comprou diz que deu tudo certo, agradece pelo serviço ou elogia a loja',
    acao: 'responder', lojas: [GP],
    resposta: 'Que bom saber! 😊 Obrigada pela preferência!\n\nSe puder, deixa uma avaliação pra gente no Google, ajuda muito a loja! 🙏',
  } });
  console.log('pos_venda_avaliacao', s1, j1.error || '');
  const ARQP = `${B}/data/cerebro/aprendizado-josy.json`;
  const doc = JSON.parse(fs.readFileSync(ARQP, 'utf8'));
  const sumiu = doc.propostas.find((p) => p.id === 'sumiu');
  if (sumiu && sumiu.status === 'pendente') Object.assign(sumiu, { status: 'aprovado', decididoEm: new Date().toISOString(), decididoPor: 'Aprovado pelo dono (23/10)', nota: 'Aplicado na retomada de clientes (agendamentos 20 por dia).' });
  const tmp2 = `${ARQP}.tmp-${process.pid}`;
  fs.writeFileSync(tmp2, JSON.stringify(doc, null, 1));
  fs.renameSync(tmp2, ARQP);
  console.log('propostas:', JSON.stringify(doc.propostas.reduce((a, p) => ((a[p.status] = (a[p.status] || 0) + 1), a), {})));
  console.log('ensinamentos:', JSON.parse(fs.readFileSync(`${B}/data/cerebro/licoes.json`, 'utf8')).length);
})();
