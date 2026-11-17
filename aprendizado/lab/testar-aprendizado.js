// Testa a API do "Aprendizado da Josy" no LAB (127.0.0.1:3017). So mexe nas copias de /root/aprendizado-lab-api.
require('/root/whatsapp-crm/backend/node_modules/dotenv').config({ path: '/root/whatsapp-crm/backend/.env', quiet: true });
const jwt = require('/root/whatsapp-crm/backend/node_modules/jsonwebtoken');
const fs = require('fs');
const crypto = require('crypto');
const LAB = '/root/aprendizado-lab-api';
const ARQ = `${LAB}/data/cerebro/aprendizado-josy.json`;
const LICOES = `${LAB}/data/cerebro/licoes.json`;
const AUDIOS = `${LAB}/public/midias/bot-audios`;
const base = 'http://127.0.0.1:3017/api/cerebro';
const tk = (role, nome) => 'Bearer ' + jwt.sign({ sub: 'lab-' + role, role, ...(nome ? { nome } : {}) }, process.env.JWT_SECRET, { expiresIn: '5m' });
const DONO = tk('master', 'Maicon (lab)'); const GERENTE = tk('gerente');
let falhas = 0;
const ok = (nome, cond, extra) => { if (!cond) falhas++; console.log(`${cond ? 'OK  ' : 'FALHOU'} ${nome}${extra !== undefined ? ' -> ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : ''}`); };
const req = async (metodo, rota, corpo, auth = DONO) => {
  const r = await fetch(base + rota, { method: metodo, headers: { authorization: auth, 'content-type': 'application/json' }, ...(corpo ? { body: JSON.stringify(corpo) } : {}) });
  let j = null; try { j = await r.json(); } catch { /* sem corpo */ }
  return { s: r.status, j };
};
const sha = (f) => crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex');
const prop = (id) => JSON.parse(fs.readFileSync(ARQ, 'utf8')).propostas.find((p) => p.id === id);
const licoes = () => JSON.parse(fs.readFileSync(LICOES, 'utf8'));
const enc = encodeURIComponent;

(async () => {
  console.log('=== acesso');
  ok('token invalido = 401', (await req('GET', '/aprendizado', null, 'Bearer lixo')).s === 401);
  ok('vendedor = 403', (await req('GET', '/aprendizado', null, tk('vendedor'))).s === 403);
  const g = await req('GET', '/aprendizado', null, GERENTE);
  ok('gerente le = 200', g.s === 200, g.j?.contagem);
  ok('gerente NAO decide = 403', (await req('POST', '/aprendizado/pergunta_garantia', { decisao: 'ignorar' }, GERENTE)).s === 403);
  ok('7 propostas, 6 pendentes, 1 ignorada', g.j?.propostas?.length === 7 && g.j.contagem.pendente === 6 && g.j.contagem.ignorado === 1);
  ok('conversasLidas 1921 / existe', g.j?.conversasLidas === 1921 && g.j?.existe === true);

  console.log('=== arquivo ausente = lista vazia');
  fs.renameSync(ARQ, ARQ + '.escondido');
  const vazio = await req('GET', '/aprendizado');
  fs.renameSync(ARQ + '.escondido', ARQ);
  ok('sem arquivo -> 200, existe false, propostas []', vazio.s === 200 && vazio.j.existe === false && Array.isArray(vazio.j.propostas) && vazio.j.propostas.length === 0, vazio.j);
  ok('decidir sem arquivo nao acontece (arquivo de volta)', fs.existsSync(ARQ));

  console.log('=== validacoes (nada pode mudar)');
  const antesLicoes = fs.readFileSync(LICOES, 'utf8'); const antesArq = fs.readFileSync(ARQ, 'utf8');
  let r;
  r = await req('POST', '/aprendizado/nao_existe', { decisao: 'ignorar' }); ok('proposta inexistente = 404', r.s === 404, r.j?.error);
  r = await req('POST', '/aprendizado/pergunta_garantia', { decisao: 'talvez' }); ok('decisao invalida = 400', r.s === 400, r.j?.error);
  r = await req('POST', '/aprendizado/pergunta_se_e_remold', { decisao: 'aprovar', audio: '/midias/../../.env.ogg' }); ok('audio com ".." = 400', r.s === 400, r.j?.error);
  r = await req('POST', '/aprendizado/pergunta_se_e_remold', { decisao: 'aprovar', audio: '/midias/bot-audios/garantia.ogg' }); ok('audio em subpasta = 400', r.s === 400, r.j?.error);
  r = await req('POST', '/aprendizado/pergunta_se_e_remold', { decisao: 'aprovar', audio: '/etc/passwd' }); ok('caminho fora de /midias = 400', r.s === 400, r.j?.error);
  r = await req('POST', '/aprendizado/pergunta_se_e_remold', { decisao: 'aprovar', audio: '/midias/3EB000E1241DAA66BD2E2B_536245.ogg' }); ok('audio de OUTRA proposta = 400', r.s === 400, r.j?.error);
  r = await req('POST', '/aprendizado/pergunta_parcelamento', { decisao: 'aprovar', audio: '/midias/3EB02938FFD9387A4236F7_882943.ogg' }); ok('audio com acao orientar = 400', r.s === 400, r.j?.error);
  r = await req('POST', '/aprendizado/pergunta_parcelamento', { decisao: 'aprovar', audio: '/midias/3EB02938FFD9387A4236F7_882943.ogg', licao: { acao: 'responder', resposta: 'Parcelamos em até 10x no cartão!' } });
  ok('audio que nao existe no servidor = 400', r.s === 400, r.j?.error);
  r = await req('POST', '/aprendizado/desconto_a_vista', { decisao: 'aprovar', audio: '/midias/3EB010B52F32479DF651F2_568262.ogg', licao: { resposta: 'a\n\nb\n\nc\n\nd\n\ne' } }); ok('audio + 5 textos de reserva = 400', r.s === 400, r.j?.error);
  r = await req('POST', '/aprendizado/desconto_a_vista', { decisao: 'aprovar', audio: '/midias/3EB010B52F32479DF651F2_568262.ogg', licao: { resposta: '   ' } }); ok('audio sem texto de reserva = 400', r.s === 400, r.j?.error);
  ok('validacoes nao mexeram em licoes.json nem no aprendizado', fs.readFileSync(LICOES, 'utf8') === antesLicoes && fs.readFileSync(ARQ, 'utf8') === antesArq);
  ok('nenhum josy-*.ogg criado pelas validacoes', !fs.readdirSync(AUDIOS).some((f) => f.startsWith('josy-')));

  console.log('=== aprovar COM audio (remold)');
  r = await req('POST', '/aprendizado/pergunta_se_e_remold', { decisao: 'aprovar', audio: '/midias/3EB063BD2D9FB5B1A48B89_398454.ogg' });
  ok('aprovar com audio = 200', r.s === 200, r.j?.error || r.j?.licao?.resposta);
  const destino = `${AUDIOS}/josy-pergunta_se_e_remold.ogg`;
  ok('audio copiado pra bot-audios/josy-pergunta_se_e_remold.ogg', fs.existsSync(destino));
  ok('copia identica ao original (sha1)', fs.existsSync(destino) && sha(destino) === sha(`${LAB}/public/midias/3EB063BD2D9FB5B1A48B89_398454.ogg`));
  let l = licoes().find((x) => x.propostaJosy === 'pergunta_se_e_remold');
  ok('ensinamento gravado', !!l);
  ok('resposta comeca com [ENVIAR_AUDIO:josy-pergunta_se_e_remold!2]', l?.resposta.split('\n\n')[0] === '[ENVIAR_AUDIO:josy-pergunta_se_e_remold!2]', l?.resposta.split('\n\n')[0]);
  ok('2 paragrafos de reserva depois do marcador', l?.resposta.split('\n\n').length === 3);
  ok('origem josy, ligadoA categoria:remold, audioJosy, lojas GP, ativo', l?.origem === 'josy' && l?.ligadoA === 'categoria:remold' && l?.audioJosy === 'josy-pergunta_se_e_remold' && l?.lojas?.[0] === '72213a6c-31c5-410d-a6b4-504dfd223e2f' && l?.ativo === true, { origem: l?.origem, ligadoA: l?.ligadoA, audioJosy: l?.audioJosy, lojas: l?.lojas });
  let p = prop('pergunta_se_e_remold');
  ok('proposta aprovada com decididoEm/decididoPor/licaoId/audioEscolhido', p.status === 'aprovado' && p.decididoEm && p.decididoPor === 'Maicon (lab)' && p.licaoId === l?.id && p.audioEscolhido === '/midias/3EB063BD2D9FB5B1A48B89_398454.ogg', { status: p.status, decididoPor: p.decididoPor, licaoId: p.licaoId });
  r = await req('POST', '/aprendizado/pergunta_se_e_remold', { decisao: 'ignorar' }); ok('decidir de novo = 409', r.s === 409, r.j?.error);
  console.log('   ensinamento gravado:', JSON.stringify(l));

  console.log('=== id com acento (pergunta_se_é_chinês) + texto editado');
  r = await req('POST', `/aprendizado/${enc('pergunta_se_é_chinês')}`, { decisao: 'aprovar', audio: '/midias/3EB01768006C61D6F29367_755806.ogg', licao: { situacao: 'quando o cliente perguntar se o pneu é chinês', acao: 'responder', resposta: 'Não é chinês! O GP Premium é fabricado aqui 😊', lojas: [] } });
  ok('aprovar = 200', r.s === 200, r.j?.error);
  l = licoes().find((x) => x.propostaJosy === 'pergunta_se_é_chinês');
  ok('audio sem acento: josy-pergunta_se_e_chines.ogg', fs.existsSync(`${AUDIOS}/josy-pergunta_se_e_chines.ogg`) && l?.audioJosy === 'josy-pergunta_se_e_chines');
  ok('texto editado + !1 + lojas [] (todas)', l?.resposta === '[ENVIAR_AUDIO:josy-pergunta_se_e_chines!1]\n\nNão é chinês! O GP Premium é fabricado aqui 😊' && Array.isArray(l?.lojas) && l.lojas.length === 0, l?.resposta);

  console.log('=== aprovar SO TEXTO (garantia) com marcador digitado no texto');
  r = await req('POST', '/aprendizado/pergunta_garantia', { decisao: 'aprovar', audio: null, licao: { resposta: '[ENVIAR_AUDIO:garantia!1]\n\nTem sim! São 2 anos de garantia e 60 mil km 😉' } });
  ok('aprovar so texto = 200', r.s === 200, r.j?.error);
  l = licoes().find((x) => x.propostaJosy === 'pergunta_garantia');
  ok('marcador digitado foi tirado; sem audioJosy', l?.resposta === 'Tem sim! São 2 anos de garantia e 60 mil km 😉' && !l?.audioJosy, l?.resposta);
  ok('nenhum josy-pergunta_garantia.ogg', !fs.existsSync(`${AUDIOS}/josy-pergunta_garantia.ogg`));
  ok('audioEscolhido null', prop('pergunta_garantia').audioEscolhido === null);

  console.log('=== ignorar');
  r = await req('POST', '/aprendizado/pergunta_parcelamento', { decisao: 'ignorar' });
  ok('ignorar = 200, nao cria ensinamento', r.s === 200 && prop('pergunta_parcelamento').status === 'ignorado' && !licoes().some((x) => x.propostaJosy === 'pergunta_parcelamento'));

  console.log('=== escrita atomica: nada de .tmp sobrando');
  const sobras = [...fs.readdirSync(`${LAB}/data/cerebro`), ...fs.readdirSync(AUDIOS)].filter((f) => f.endsWith('.tmp'));
  ok('sem .tmp', sobras.length === 0, sobras);

  console.log('=== contagem no /resumo e no GET');
  const resumo = await req('GET', '/resumo', null, GERENTE);
  ok('/resumo.aprendizado', resumo.j?.aprendizado?.pendente === 2 && resumo.j.aprendizado.aprovado === 3 && resumo.j.aprendizado.ignorado === 2, resumo.j?.aprendizado);

  console.log('=== marcador no caminho do ensinamento (partesDaLicao do cerebro.ts, como no server.ts)');
  const t = await req('POST', '/testar', { mensagem: 'esse pneu é remold?', lojaId: '72213a6c-31c5-410d-a6b4-504dfd223e2f' });
  ok('/testar (manda audioFluxo:true) -> via cerebro com marcador + 2 textos', t.j?.via === 'cerebro' && t.j.partes?.[0] === '[ENVIAR_AUDIO:josy-pergunta_se_e_remold!2]' && t.j.partes.length === 3, t.j?.partes);
  const semAudio = await (await fetch('http://127.0.0.1:3017/lab-gerar-resposta', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'user', content: 'esse pneu é remold?' }], lojaBot: { nome: 'Pneus GP Premium' } }) })).json();
  ok('sem audioFluxo -> marcador sai, ficam os 2 textos de reserva', semAudio.partes.length === 2 && !semAudio.partes.some((x) => x.startsWith('[ENVIAR_AUDIO')), semAudio.partes);
  const comAudio = await (await fetch('http://127.0.0.1:3017/lab-gerar-resposta', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'user', content: 'esse pneu é remold?' }], lojaBot: { nome: 'Pneus GP Premium' }, audioFluxo: true }) })).json();
  ok('audioFluxo true (worker) -> marcador vai na 1a parte', comAudio.partes[0] === '[ENVIAR_AUDIO:josy-pergunta_se_e_remold!2]', comAudio.partes[0]);
  // a regra do worker (botAtendimentoService.interpretarMarcadorAudio) le esse marcador?
  const m = /^\[ENVIAR_AUDIO:([a-z0-9_-]+)(?:!(\d{1,2}))?\]$/i.exec(comAudio.partes[0]);
  ok('regex do worker aceita: arquivo josy-pergunta_se_e_remold, pula 2', m && m[1] === 'josy-pergunta_se_e_remold' && m[2] === '2');
  const outraLoja = await (await fetch('http://127.0.0.1:3017/lab-gerar-resposta', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'user', content: 'esse pneu é remold?' }], lojaBot: { nome: 'City Pneus & Auto Center' }, audioFluxo: true }) })).json();
  ok('City nao recebe o ensinamento so da GP', outraLoja.via !== 'cerebro' || !String(outraLoja.licao?.situacao).includes('remold'), outraLoja.via);

  console.log('=== mapa');
  const mapa = await req('GET', '/mapa', null, GERENTE);
  const nosA = (mapa.j?.nos || []).filter((n) => n.tipo === 'aprendizado');
  ok('mapa = 200 e so as 2 pendentes viram no', mapa.s === 200 && nosA.length === 2, nosA.map((n) => `${n.id} -> ${n.extra.ligadoA} (${n.extra.ligadoPor})`));
  const ids = new Set(mapa.j.nos.map((n) => n.id));
  const ligA = mapa.j.ligacoes.filter((x) => x.tipo === 'aprendizado');
  ok('ligacoes aprendizado apontam pra nos que existem', ligA.length === 2 && ligA.every((x) => ids.has(x.de) && ids.has(x.para)), ligA);
  ok('desconto_a_vista ligado a categoria:desconto_dinheiro (escolhido pela proposta)', nosA.some((n) => n.id === 'aprendizado:desconto_a_vista' && n.extra.ligadoA === 'categoria:desconto_dinheiro' && n.extra.ligadoPor === 'proposta'));
  ok('mapa.aprendizado', mapa.j.aprendizado?.pendente === 2, mapa.j.aprendizado);
  const ens = mapa.j.nos.filter((n) => n.tipo === 'ensinamento').map((n) => `${n.rotulo} -> ${n.extra.ligadoA}`);
  console.log('   ensinamentos no mapa:', ens);

  console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTUDO OK');
  process.exit(falhas ? 1 : 0);
})().catch((e) => { console.error('ERRO', e); process.exit(1); });
