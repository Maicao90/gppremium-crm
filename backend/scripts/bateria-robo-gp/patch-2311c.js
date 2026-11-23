// 23/11c — CONFERENTE (dono: "nao e transformar em regras, e resolver para ele ser o melhor robo de atendimento que existe").
// A revisao noturna do Cerebro acha os erros do robo, mas so no dia seguinte (e ninguem aprovava no painel).
// Agora o mesmo revisor le CADA resposta ANTES de sair, com a conversa, a tabela e as regras da loja:
//   ok -> sai como esta | corrigir -> sai a versao corrigida (passa pelas travas de preco e de outra loja; se nao passar,
//   sai a original) | atendente -> "so um instante" e a Josy assume | nao_cliente -> silencio.
// Falhou ou demorou (timeout) -> sai a original: o conferente nunca deixa o cliente sem resposta.
// Simulacao/bateria (simular/teste) so confere se o payload pedir (conferir:true). CONFERENTE=0 no .env desliga.
const fs = require('fs');
const arq = process.argv[2];
let s = fs.readFileSync(arq, 'utf8');
if (s.includes('CORRECOES 23/11c')) { console.log('ja aplicado'); process.exit(0); }
if (!s.includes('CORRECOES 23/11b')) { console.error('FALHOU: aplique antes o patch 2311b'); process.exit(1); }
const trocas = [];
const troca = (nome, de, para) => trocas.push({ nome, de, para });

troca('funcoes do conferente',
String.raw`function horaCurta(m: number): string {`,
String.raw`// ===== CORRECOES 23/11c — CONFERENTE: le cada resposta antes de sair =====
const CONFERENTE_MODELO = process.env.ANTHROPIC_MODEL_CONFERENTE || 'claude-sonnet-5-5';
const CONFERENTE_TIMEOUT_MS = Number(process.env.CONFERENTE_TIMEOUT_MS || 9000);
const INSTRUCAO_CONFERENTE = [
  'Voce e o CONFERENTE do robo de atendimento de uma loja de pneus no WhatsApp. Antes de cada resposta sair, voce confere se ela esta certa.',
  'Recebe a conversa (CLIENTE e LOJA; LOJA pode ser o robo ou a atendente humana), a tabela de precos das medidas citadas e a resposta que o robo vai mandar AGORA.',
  'Veredito:',
  '- "ok": a resposta esta boa (mesmo que nao perfeita). E o caso mais comum: so mude se houver erro de verdade.',
  '- "corrigir": tem erro e voce sabe a resposta certa com as informacoes que tem. Devolva as bolhas corrigidas em "partes".',
  '- "atendente": a resposta certa depende de algo que o robo nao sabe (estoque, outra marca, preco de servico, reclamacao, garantia acionada, negociacao de preco, situacao confusa). Use POUCO: o dono nao quer o robo fugindo pra atendente.',
  '- "nao_cliente": a mensagem nao e de cliente (resposta automatica de outra empresa, fornecedor, equipe da loja, propaganda) e o robo nao devia responder.',
  '- "silencio": o robo nao devia mandar nada agora: a atendente humana ja esta conduzindo e o cliente so cumprimentou, agradeceu ou confirmou (ok, blz, joia) sem pergunta nova; ou a LOJA ja disse "Só um instante que eu vou verificar" e o cliente so respondeu ok.',
  'E erro:',
  '1. Nao responder o que o cliente perguntou agora (ignorou a pergunta, respondeu outro assunto, so cumprimentou ou pediu a medida quando ele perguntou outra coisa).',
  '2. Pedir de novo o que o cliente ja disse (medida, aro, carro, quantidade).',
  '3. Preco, total ou parcela diferente da tabela; falar de "base de troca" ou de R$ 189 / R$ 199 sem o cliente ter perguntado disso (a loja nao trabalha mais com base de troca).',
  '4. Inventar informacao (prazo, estoque, servico, preco de servico, que a loja faz algo que nao faz) ou confirmar visita/dia que o cliente nao combinou.',
  '5. Contradizer o que a LOJA ja disse antes na conversa.',
  '6. Mensagem longa demais, robotica, fora de ordem (preco antes do cumprimento), repetida, ou lista enorme de medidas quando bastava perguntar o carro.',
  'Regras da loja: so vende pneu GP Premium (remold de primeira linha); outra marca -> atendente. Pagamento so presencial, na loja; nao tem boleto, link de pagamento nem pix antecipado. Separa pneu so mediante o pagamento. Nunca indicar outra loja nem passar telefone de ninguem. Medida que nao esta na tabela da loja -> atendente.',
  'Fatos da loja (verdade, nunca invencao): a montagem do GP Premium e por conta da loja; garantia de 2 anos e 60 mil km (se nao rodar, devolve o dinheiro); a GP Premium e a fabrica, em Luziania-GO, com borracha padrao europeu e controle de qualidade; parcela em ate 10x no cartao; pagamento em dinheiro em especie tem desconto; a promocao compre 3 leve 4 vale so nas medidas marcadas na tabela.',
  'Parcelamento: NUNCA fale de parcela/cartao se o cliente nao perguntou (regra da Josy). Se ele perguntou, de o valor da parcela pela tabela.',
  'Os TEXTOS OFICIAIS e os ENSINAMENTOS DO DONO (abaixo) sao a verdade da loja: frase que vem deles NUNCA e invencao, e eles valem mais que qualquer regra geral (ex.: o que a loja faz de servico, garantia, como e o pneu).',
  'NAO corrija estilo nem redacao: se a informacao esta certa e responde o cliente, o veredito e "ok". So corrija os erros da lista acima.',
  'Ao corrigir: escreva como a atendente Josy escreve no WhatsApp: curto, simpatico, no maximo 3 bolhas, no maximo 1 emoji por bolha. Use SO precos que estao na TABELA ou na resposta original. Prefira as frases dos TEXTOS OFICIAIS. Nao acrescente oferta, garantia ou pergunta que nao precisa. Mantenha o que a resposta original tinha de certo (preco certo, pergunta de quantidade, etc.).',
  'Responda SO com JSON: {"veredito":"ok|corrigir|atendente|nao_cliente|silencio","tipo":"nao_respondeu|repetiu|preco|inventou|contradisse|robotica|nao_cliente|outro","problema":"uma frase curta","partes":["bolha 1","bolha 2"]}',
].join('\n');
function conferenteLigado(req: any): boolean {
  if (process.env.CONFERENTE === '0') return false;
  if (req?.body?.simular || req?.body?.teste) return req?.body?.conferir === true;
  return true;
}
function precisaConferir(body: any): boolean {
  if (!body || !Array.isArray(body.partes) || !body.partes.length || body.acaoTipo === 'SILENCIO') return false;
  const textos = body.partes.map((p: any) => String(p || '').trim()).filter((p: string) => p && !/^\[[A-Z_]+(:[^\]]*)?\]$/.test(p));
  if (!textos.length) return false;
  return !textos.every((p: string) => /^S[oó] um instante que eu vou verificar/i.test(p));
}
function tabelaParaConferente(texto: string): string {
  const meds = Array.from(new Set(extrairMedidasDoTexto(texto)));
  const itens = meds.flatMap((m) => encontrarPrecosExatosPorMedida(m)).slice(0, 12);
  if (!itens.length) return '(nenhuma medida da tabela citada)';
  const r = (n: number) => 'R$ ' + n.toFixed(2).replace('.', ',');
  return itens.map((i: any) => i.medida + ' ' + i.modelo + (i.promocao ? ' [PROMOCAO]' : '') + (i.compre3Leve4 ? ' [COMPRE 3 LEVE 4: 4 pneus pelo preco de 3]' : '') + ': a vista ' + r(i.aVista) + ' cada | no cartao 10x de ' + r(i.parcelado.x10 / 10)).join('\n');
}
// Parte fixa do pedido (instrucao + textos oficiais + ensinamentos): igual entre chamadas da mesma loja -> cache da Anthropic.
function sistemaDoConferente(lojaNome: string, textosFluxo: any): string {
  const limpa = (t: string) => String(t || '').replace(/\[ENVIAR_[A-Z_]+(:[^\]]*)?\]/g, '').replace(/\s+/g, ' ').trim();
  const textos = Object.keys(textosFluxo || {}).sort().map((k) => {
    const p = Array.isArray(textosFluxo[k]) ? textosFluxo[k].map((x: any) => limpa(x)).filter(Boolean).join(' / ') : '';
    return p ? '- ' + k + ': ' + p.slice(0, 260) : '';
  }).filter(Boolean).join('\n');
  let licoes = '';
  try {
    licoes = licoesAtivasDaLoja(lojaNome).filter((l: any) => l.acao !== 'orientar')
      .map((l: any) => '- ' + String(l.situacao || '').slice(0, 200) + ' -> ' + (l.acao === 'responder' ? 'responder: "' + limpa(l.resposta).slice(0, 240) + '"' : l.acao))
      .join('\n');
  } catch { licoes = ''; }
  return INSTRUCAO_CONFERENTE + '\n\nTEXTOS OFICIAIS DA LOJA (chave: texto):\n' + (textos || '(nenhum)') + '\n\nENSINAMENTOS DO DONO (situacao -> o que fazer):\n' + (licoes || '(nenhum)');
}
async function chamarConferente(sistema: string, usuario: string): Promise<string> {
  const apiKey = String(chaveDoFluxo() || '');
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json', ...(process.env.ANTHROPIC_WORKSPACE_ID ? { 'anthropic-workspace-id': process.env.ANTHROPIC_WORKSPACE_ID.trim() } : {}) },
    body: JSON.stringify({ model: CONFERENTE_MODELO, max_tokens: 700, system: [{ type: 'text', text: sistema, cache_control: { type: 'ephemeral' } }], messages: [{ role: 'user', content: usuario }] }),
    signal: AbortSignal.timeout(CONFERENTE_TIMEOUT_MS),
  });
  const j: any = await r.json().catch(() => null);
  if (!r.ok) throw new Error('anthropic ' + r.status + ' ' + String(j?.error?.message || '').slice(0, 120));
  return (Array.isArray(j?.content) ? j.content : []).map((c: any) => String(c?.text || '')).join('');
}
async function conferirResposta(body: any, messages: any[], lojaNome: string, textosFluxo: any, textosCliente: string, agoraIso?: string): Promise<any> {
  const inicio = Date.now();
  try {
    const apiKey = chaveDoFluxo();
    if (!apiKey || !ehChaveAnthropic(apiKey)) return body;
    const conversa = (Array.isArray(messages) ? messages : []).slice(-16)
      .map((m: any) => (m?.role === 'user' ? 'CLIENTE: ' : 'LOJA: ') + String(typeof m?.content === 'string' ? m.content : '(midia)').replace(/\s+/g, ' ').slice(0, 500)).join('\n');
    const proposta = body.partes.map((p: any, i: number) => (i + 1) + ') ' + String(p)).join('\n');
    const horario = (textoFluxo(textosFluxo, 'horario') || []).join(' ');
    const agoraTxt = agoraIso ? 'AGORA: ' + new Date(agoraIso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'long', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : contextoDeData();
    const usuario = 'LOJA: ' + lojaNome + ' (atendente: ' + nomeAtendenteGuarda + ')\nHORARIO: ' + horario + '\n' + agoraTxt
      + '\n\nTABELA (medidas citadas):\n' + tabelaParaConferente(conversa + '\n' + proposta)
      + '\n\nCONVERSA (o fim e o que o cliente acabou de mandar):\n' + conversa
      + '\n\nRESPOSTA QUE O ROBO VAI MANDAR AGORA (uma bolha por linha):\n' + proposta;
    const txt = await chamarConferente(sistemaDoConferente(lojaNome, textosFluxo), usuario);
    const a = txt.indexOf('{'), z = txt.lastIndexOf('}');
    const j: any = a >= 0 && z > a ? JSON.parse(txt.slice(a, z + 1)) : null;
    const ms = Date.now() - inicio;
    const chaves0: string[] = Array.isArray(body.chaves) ? body.chaves : [];
    const semAudioC = (o: any) => { for (const k of Object.keys(o)) if (/audio/i.test(k)) delete o[k]; return o; };
    if (!j || j.veredito === 'ok') { console.log('[Conferente] ok (' + ms + 'ms)'); return { ...body, conferente: { veredito: 'ok', ms } }; }
    const info = { veredito: String(j.veredito), tipo: String(j.tipo || ''), problema: String(j.problema || '').slice(0, 300), original: body.partes, ms };
    if (j.veredito === 'nao_cliente' || j.veredito === 'silencio') {
      console.log('[Conferente] ' + j.veredito + ' — silencio: ' + info.problema);
      return semAudioC({ ...body, partes: [], acaoTipo: 'SILENCIO', chaves: [...chaves0, 'conferente_silencio'], conferente: info });
    }
    if (j.veredito === 'atendente') {
      console.log('[Conferente] atendente (' + ms + 'ms): ' + info.problema);
      return semAudioC({ ...body, partes: ['Só um instante que eu vou verificar aqui pra você, tá bem?'], acaoTipo: 'PASSAR_ATENDENTE', chaves: [...chaves0, 'assunto_atendente', 'conferente_atendente'], conferente: info });
    }
    if (j.veredito === 'corrigir' && Array.isArray(j.partes)) {
      // Mesma trava da Josy: parcelamento so se o cliente pediu.
      const cliRecentes = (Array.isArray(messages) ? messages : []).filter((m: any) => m?.role === 'user').slice(-4).map((m: any) => String(m?.content ?? ''));
      const novas: string[] = removerParcelamentoNaoPedido(j.partes.map((p: any) => String(p || '').trim()).filter(Boolean).slice(0, 4), cliRecentes).partes;
      const marcadores = body.partes.filter((p: any) => /^\[[A-Z_]+(:[^\]]*)?\]$/.test(String(p).trim()) && !/AUDIO/i.test(String(p)));
      const valoresOriginais = new Set(valoresEmReais(body.partes.join('\n')));
      const precoRuim = novas.length ? precosForaDaTabela(novas, textosCliente).filter((v) => !valoresOriginais.has(v)) : [];
      if (!novas.length || precoRuim.length || iaIndicouOutraLoja(novas, { nome: lojaNome, telefone: '' }) || novas.some((p) => /^\[/.test(p)) || prometeuTransferenciaFalsa(novas)) {
        console.log('[Conferente] correcao recusada pelas travas (' + (precoRuim.join(',') || 'formato') + ') — sai a original: ' + info.problema);
        return { ...body, conferente: { ...info, veredito: 'correcao_recusada' } };
      }
      console.log('[Conferente] corrigiu (' + ms + 'ms): ' + info.problema);
      return semAudioC({ ...body, partes: [...novas, ...marcadores], chaves: [...chaves0, 'conferente_corrigiu'], conferente: info });
    }
    return { ...body, conferente: info };
  } catch (e: any) {
    console.error('[Conferente] falhou (' + (Date.now() - inicio) + 'ms), sai a original: ' + String(e?.message || e).slice(0, 160));
    return body;
  }
}
function horaCurta(m: number): string {`);

troca('instala o conferente (primeiro a instalar = ultimo a rodar)',
String.raw`    const lb = req.body?.lojaBot;
    if (lb && iaLivreRestrita(lb.nome)) {
      nomeAtendenteGuarda`,
String.raw`    const lb = req.body?.lojaBot;
    // CORRECOES 23/11c: CONFERENTE — instalado PRIMEIRO, entao roda por ULTIMO (depois de todas as travas e guardas).
    if (lb && iaLivreRestrita(lb.nome) && conferenteLigado(req)) {
      const jsonReal = res.json.bind(res);
      const msgsConf = Array.isArray(messages) ? messages : [];
      const cliConf = String(ultimosTextosCliente || '');
      (res as any).json = (body: any) => {
        if (res.statusCode >= 400 || !precisaConferir(body)) return jsonReal(body);
        conferirResposta(body, msgsConf, String(lb.nome), textosFluxo, cliConf, req.body?.simular || req.body?.teste ? req.body?.agoraTeste : undefined).then((b) => jsonReal(b)).catch(() => jsonReal(body));
        return res;
      };
    }
    if (lb && iaLivreRestrita(lb.nome)) {
      nomeAtendenteGuarda`);

troca('simulacao pode rodar a IA livre (teste dos aprendizados)',
String.raw`    if (req.body?.simular) {
      return res.json({
        partes: [],`,
String.raw`    // CORRECOES 23/11c: simularIa:true deixa a IA livre rodar na simulacao (o bot-service so gera texto, nao envia nada).
    if (req.body?.simular && req.body?.simularIa !== true) {
      return res.json({
        partes: [],`);

for (const t of trocas) {
  const n = s.split(t.de).length - 1;
  if (n !== 1) { console.error('FALHOU: ancora de "' + t.nome + '" apareceu ' + n + 'x (esperado 1). Nada foi gravado.'); process.exit(1); }
}
for (const t of trocas) s = s.replace(t.de, () => t.para);
fs.writeFileSync(arq, s);
console.log('aplicadas ' + trocas.length + ' trocas (23/11c conferente) em ' + arq);
