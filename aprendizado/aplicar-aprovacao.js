// 22/10 (dono: "aprovo"): aplica as propostas do Aprendizado da Josy.
// - Situacoes que o fluxo fixo NAO cobre -> ensinamento da GP pela propria API do Cerebro (copia o audio da Josy).
// - Situacoes que o fluxo fixo ja cobre -> NAO viram ensinamento (passariam por cima do motor de preco);
//   so marca a proposta como aplicada no fluxo (os textos da GP sao trocados no FluxoResposta, em outro passo).
const fs = require('fs');
const path = require('path');
const jwt = require('/root/whatsapp-crm/backend/node_modules/jsonwebtoken');

const B = '/root/whatsapp-crm/backend';
const ENV = fs.readFileSync(`${B}/.env`, 'utf8');
const SEGREDO = (ENV.match(/^JWT_SECRET=(.*)$/m) || [])[1].trim().replace(/^["']|["']$/g, '');
const token = jwt.sign({ sub: 'aprovacao-do-dono-22-10', role: 'master', nome: 'Aprovado pelo dono (22/10)' }, SEGREDO, { expiresIn: '10m' });
const GP = '72213a6c-31c5-410d-a6b4-504dfd223e2f';
const API = 'http://127.0.0.1:3010/api/cerebro';
const m = (f) => `/midias/${f}.ogg`;

const novos = [
  { id: 'vai_pensar', audio: m('3EB0B2937D25C36C8670C3_567971'), pino: true,
    situacao: 'quando o cliente diz que vai pensar, pesquisar, ver com alguém ou que depois passa na loja, sem marcar um dia',
    acao: 'responder', resposta: 'Tudo bem, entendo perfeitamente! 😊 Vou te mandar a nossa localização: quando der, passa aqui na loja pra gente conversar pessoalmente, tá joia?' },
  { id: 'compara_outra_loja', audio: m('3EB0D42FE3032A5B7BE5A0_271754'), substitui: 1,
    situacao: 'quando o cliente diz que achou pneu mais barato em outra loja, na internet ou em anúncio, ou que está fazendo outros orçamentos',
    acao: 'responder', resposta: 'Entendo perfeitamente! Me manda o orçamento ou o anúncio que você achou, que eu vejo aqui o que consigo fazer pra te ajudar 😉\n\nO nosso GP Premium tem garantia de 2 anos e 60 mil km ou seu dinheiro de volta, e dá pra parcelar em até 10x no cartão.' },
  { id: 'desconfia_qualidade', audio: m('3EB06D2428538C70A9C427_901360'), substitui: 0,
    situacao: 'quando o cliente desconfia da qualidade do pneu ("é bom mesmo?", "dura?", "já tive problema com remold", "por que é tão barato?") sem perguntar diretamente se é remold',
    acao: 'responder', resposta: 'O GP Premium é remold de primeira linha, nada a ver com o remold convencional 😉 Usamos só estrutura intacta, borracha padrão europeu e tudo passa por controle de qualidade.\n\nSão 2 anos de garantia e 60 mil km ou seu dinheiro de volta!' },
  { id: 'fora_da_regiao', audio: m('3EB07F02A5F65886D987E0_364712'), substitui: 1,
    situacao: 'quando o cliente mora longe (outro estado ou cidade distante, fora de Luziânia e do entorno do DF) e pergunta se tem loja ou entrega na cidade dele',
    acao: 'responder', resposta: 'Nossa loja fica só aqui em Luziânia-GO e infelizmente não trabalhamos com entregas.\n\nMas se você passar por Luziânia, é só me chamar que eu te atendo com o maior carinho! 🙏' },
  { id: 'retorno_cliente_antigo', audio: m('3EB077568174C80A5FF652_407817'), substitui: 0,
    situacao: 'quando o cliente diz que já comprou na loja antes e está voltando para comprar mais pneus',
    acao: 'responder', resposta: 'Que bom te ver de volta! 😊 Obrigada pela confiança!\n\nMe passa a medida do pneu que você precisa hoje e quantos vai querer, que eu já te passo as opções!' },
  { id: 'pergunta_marca', audio: m('3EB0C4390C51FB4622ECED_901629'), substitui: 0,
    situacao: 'quando o cliente pergunta qual é a marca do pneu',
    acao: 'responder', resposta: 'É o pneu mais vendido aqui da loja! 😊 Remold linha premium, com borracha padrão europeu e controle de qualidade, e garantia de 2 anos e 60 mil km ou seu dinheiro de volta.\n\nSe estiver procurando alguma marca específica, me fala que eu verifico pra você.' },
  { id: 'desistiu', audio: null,
    situacao: 'quando o cliente diz que desistiu, que não vai querer, que já comprou ou trocou os pneus em outro lugar, ou que fica para a próxima',
    acao: 'responder', resposta: 'Tudo bem, sem problema! Obrigada pelo retorno 😊\n\nSe precisar de pneu mais pra frente, é só chamar aqui. O GP Premium tem garantia de 2 anos e 60 mil km ou seu dinheiro de volta. Vai ser um prazer te atender!' },
  { id: 'informa_cidade', audio: null, usarProposta: true },
  { id: 'retorno_depois_de_dias', audio: null, usarProposta: true },
  { id: 'acha_caro', audio: null, usarProposta: true },
  { id: 'pergunta_entrega', audio: null, usarProposta: true },
  { id: 'pos_venda_problema', audio: null, usarProposta: true },
  { id: 'pede_foto_ou_video', audio: null, usarProposta: true },
];
const noFluxo = ['saudacao', 'pede_preco', 'informa_medida', 'pergunta_localizacao', 'quer_agendar_ou_ir', 'pergunta_se_e_remold', 'pergunta_servico_oficina',
  'pergunta_horario', 'pergunta_garantia', 'nao_sabe_medida', 'pede_preco_repetido', 'quer_outra_marca_ou_novo', 'pneu_fora_da_tabela', 'pede_parcelamento',
  'pede_desconto', 'pergunta_pix_dinheiro', 'compre3leve4', 'informa_carro', 'informa_quantidade'];
const juntadas = { desistiu_comprou_outro_lugar: 'desistiu', comprou_em_outro_lugar: 'desistiu' };

(async () => {
  const props = JSON.parse(fs.readFileSync(`${B}/data/cerebro/aprendizado-josy.json`, 'utf8')).propostas;
  const porId = new Map(props.map((p) => [p.id, p]));
  for (const n of novos) {
    const p = porId.get(n.id);
    if (!p || p.status !== 'pendente') { console.log('pula', n.id, p && p.status); continue; }
    const licao = n.usarProposta ? { ...p.sugestao, lojas: [GP] } : { situacao: n.situacao, acao: n.acao, resposta: n.resposta, lojas: [GP] };
    const r = await fetch(`${API}/aprendizado/${encodeURIComponent(n.id)}`, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ decisao: 'aprovar', licao, audio: n.audio || null }),
    });
    const j = await r.json().catch(() => ({}));
    console.log(n.id, r.status, j.error || (j.licao && j.licao.id) || '');
  }
  // ajustes finos no marcador (o padrao da API e o audio SUBSTITUIR todas as bolhas de reserva)
  const ARQ = `${B}/data/cerebro/licoes.json`;
  const licoes = JSON.parse(fs.readFileSync(ARQ, 'utf8'));
  for (const n of novos) {
    const l = licoes.find((x) => x.propostaJosy === n.id || (x.origem === 'josy' && x.situacao === n.situacao));
    if (!l || !n.audio) continue;
    if (n.substitui !== undefined) l.resposta = l.resposta.replace(/^\[ENVIAR_AUDIO:([a-z0-9_-]+)!\d+\]/i, (_, a) => (n.substitui ? `[ENVIAR_AUDIO:${a}!${n.substitui}]` : `[ENVIAR_AUDIO:${a}]`));
    if (n.pino && !l.resposta.includes('[ENVIAR_LOCALIZACAO]')) l.resposta += '\n\n[ENVIAR_LOCALIZACAO]';
    l.atualizadoEm = new Date().toISOString();
  }
  const tmp = `${ARQ}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(licoes, null, 1));
  fs.renameSync(tmp, ARQ);
  // propostas que o fluxo fixo ja cobre / juntadas
  const ARQP = `${B}/data/cerebro/aprendizado-josy.json`;
  const doc = JSON.parse(fs.readFileSync(ARQP, 'utf8'));
  const agora = new Date().toISOString();
  for (const p of doc.propostas) {
    if (p.status !== 'pendente') continue;
    if (noFluxo.includes(p.id)) Object.assign(p, { status: 'aprovado', aplicadoNoFluxo: true, decididoEm: agora, decididoPor: 'Aprovado pelo dono (22/10)', nota: 'Já tratada pelo fluxo fixo (preço pela TAB.7); texto da GP ajustado no jeito da Josy.' });
    else if (juntadas[p.id]) Object.assign(p, { status: 'aprovado', decididoEm: agora, decididoPor: 'Aprovado pelo dono (22/10)', nota: `Junto com "${juntadas[p.id]}".` });
  }
  const tmp2 = `${ARQP}.tmp-${process.pid}`;
  fs.writeFileSync(tmp2, JSON.stringify(doc, null, 1));
  fs.renameSync(tmp2, ARQP);
  const fim = JSON.parse(fs.readFileSync(ARQ, 'utf8'));
  console.log('\nensinamentos:', fim.length);
  for (const l of fim) console.log('-', l.acao, '|', l.situacao.slice(0, 70), '|', l.resposta.slice(0, 90).replace(/\n/g, ' / '));
  console.log('propostas:', JSON.stringify(doc.propostas.reduce((a, p) => ((a[p.status] = (a[p.status] || 0) + 1), a), {})));
})();
