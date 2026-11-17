// 22/10: confere na PRODUCAO (so gera a resposta, teste:true — nada vai pro WhatsApp) se cada mensagem cai no lugar
// certo depois do Aprendizado da Josy: ensinamento novo, fluxo fixo (preco pela TAB.7) ou IA.
const { execSync } = require('child_process');
const URL = 'http://127.0.0.1:3010/gerar-resposta';
const lojas = require('/root/whatsapp-crm/backend/data/bot-lojas.json');
const gp = (Array.isArray(lojas) ? lojas : Object.values(lojas)).find((l) => /GP Premium/i.test(JSON.stringify(l))) || {};
const lojaBot = { nome: gp.nome || gp.NOME_LOJA || 'Pneus GP Premium', telefone: gp.telefone || gp.TELEFONE || '', horario: gp.horario || gp.HORARIO || '', localizacao: gp.localizacao || gp.LOCALIZACAO || 'Pneus GP Premium', localizacaoTexto: gp.localizacaoTexto || gp.LOCALIZACAO_TEXTO || '' };
const linhas = execSync(`docker exec gp-postgres-crm psql -U postgres -d testdb -tAc "select chave||'|'||partes from \\"FluxoResposta\\" where chave like 'loja:72213a6c-31c5-410d-a6b4-504dfd223e2f:%'"`).toString().trim().split('\n');
const textosFluxo = {};
for (const l of linhas) { const i = l.indexOf('|'); textosFluxo[l.slice(0, i).split(':').pop()] = JSON.parse(l.slice(i + 1)); }
const U = (c) => ({ role: 'user', content: c });
const A = (c) => ({ role: 'assistant', content: c });
const PRECO = [U('195/55/15'), A('Temos o pneu *195/55/15* da marca *GP Premium* está saindo por *R$ 289,00 à vista*.'), A('Se preferir, você pode parcelar em até 10x no cartão!')];
const casos = [
  ['saudacao do anuncio', [U('📢 [Anúncio] Pneus a partir de R$ 479\n\nOlá! Posso ter mais informações sobre isso?')], 'sem_estado'],
  ['preco com medida (fluxo/TAB.7)', [U('quanto ta o 175/70/13?')], 'sem_estado'],
  ['é remold? (fluxo + audio)', [U('é remold?')], 'sem_estado'],
  ['vou pensar', [...PRECO, U('vou pensar e te falo')], 'preco_confirmado'],
  ['achei mais barato', [...PRECO, U('achei mais barato em outra loja')], 'preco_confirmado'],
  ['é bom mesmo?', [...PRECO, U('mas esse pneu é bom mesmo? dura?')], 'preco_confirmado'],
  ['mora longe', [U('vcs tem loja em Goiânia?')], 'sem_estado'],
  ['mora perto (nao pode cair em "longe")', [...PRECO, U('moro no Valparaíso')], 'preco_confirmado'],
  ['cliente antigo', [U('boa tarde, ja comprei com vcs ano passado, quero mais 2 pneus')], 'sem_estado'],
  ['qual a marca', [...PRECO, U('qual a marca?')], 'preco_confirmado'],
  ['desistiu', [...PRECO, U('ja comprei em outro lugar, obrigado')], 'preco_confirmado'],
  ['entrega', [U('vcs entregam?')], 'sem_estado'],
  ['foto', [...PRECO, U('manda foto do pneu')], 'preco_confirmado'],
  ['achou caro', [...PRECO, U('nossa achei caro')], 'preco_confirmado'],
  ['parcelamento (fluxo)', [...PRECO, U('em 10x quanto fica?')], 'preco_confirmado'],
  ['desconto pix (fluxo)', [...PRECO, U('no pix tem desconto?')], 'preco_confirmado'],
];
(async () => {
  for (const [nome, messages, estadoPreco] of casos) {
    const dadosPreco = estadoPreco === 'preco_confirmado' ? '{"medida":"195/55/15"}' : '{}';
    const body = { messages, lojas: [], ultimosTextosCliente: messages.filter((m) => m.role === 'user').map((m) => m.content).join('\n'), estadoPreco, dadosPreco, textosFluxo, lojaBot, minutosDesdeLocalizacao: null, minutosDesdeUltimaDaLoja: 2, audioFluxo: true, simular: false, teste: true };
    const r = await fetch(URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then((x) => x.json()).catch((e) => ({ erro: e.message }));
    console.log(`\n# ${nome}\n  via=${r.via} acao=${r.acaoTipo} chaves=${JSON.stringify(r.chaves)}${r.licao ? ' licao=' + r.licao.situacao.slice(0, 50) : ''}\n  > ${(r.partes || []).join('\n  > ')}${r.erro || r.error ? ' ERRO ' + (r.erro || r.error) : ''}`);
  }
})();
