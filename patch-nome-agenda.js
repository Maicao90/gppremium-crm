// 21/10: o painel mostrava o nome do PERFIL do cliente (pushName) na frente do nome SALVO na agenda
// do WhatsApp (tabela Contato, sincronizada pela extensao). Agora: nome salvo (se for nome de verdade,
// nao so o numero) > pushName > agenda em memoria. Vale na Caixa de Entrada e no painel do robo.
const fs = require('fs');
const base = process.argv[2];
function patch(rel, trocas, marca) {
  const f = base + '/' + rel;
  let s = fs.readFileSync(f, 'utf8');
  const crlf = s.includes('\r\n'); s = s.replace(/\r\n/g, '\n');
  if (s.includes(marca)) { console.log(rel, 'ja aplicado'); return; }
  for (const [a, b] of trocas) {
    const c = s.split(a).length - 1;
    if (c !== 1) { console.error(rel, 'ocorrencias', c, JSON.stringify(a.slice(0, 90))); process.exit(1); }
    s = s.replace(a, () => b);
  }
  if (crlf) s = s.replace(/\n/g, '\r\n');
  fs.writeFileSync(f, s); console.log(rel, 'ok');
}

patch('src/routes/inbox.ts', [
  ["      salvos.forEach((ct: any) => { if (ct.numero && ct.nome) mapaContatoNome[String(ct.numero).replace(/\\D/g, '')] = ct.nome; });",
   "      // So nome de verdade: a extensao grava contato nao salvo com o proprio numero no lugar do nome.\n      salvos.forEach((ct: any) => { const nome = String(ct.nome || '').trim(); if (ct.numero && nome && /[^\\d\\s+()-]/.test(nome)) mapaContatoNome[String(ct.numero).replace(/\\D/g, '')] = nome; });"],
  [`      // Nome: msgs recebidas (pushName) > contato salvo (por número) > contatos em memória.
      // NUNCA o nosso próprio nome.
      c.chatNome = mapaNomes[c.chatJid]
        || (numReal && mapaContatoNome[numReal.replace(/\\D/g, '')] ? mapaContatoNome[numReal.replace(/\\D/g, '')] : '')
        || (contatosNomes.has(c.chatJid) ? contatosNomes.get(c.chatJid) : '')`,
`      // Nome: contato SALVO na agenda (por número) > msgs recebidas (pushName = nome do perfil) > contatos em memória.
      // 21/10: antes o pushName vinha primeiro e o nome que a loja salvou no WhatsApp não aparecia.
      // NUNCA o nosso próprio nome.
      const numLimpoNome = (String(numReal || '').split(':')[0] || '').replace(/\\D/g, '');
      c.chatNome = (numLimpoNome && mapaContatoNome[numLimpoNome] ? mapaContatoNome[numLimpoNome] : '')
        || mapaNomes[c.chatJid]
        || (contatosNomes.has(c.chatJid) ? contatosNomes.get(c.chatJid) : '')`],
], 'contato SALVO na agenda');

patch('src/routes/botPneus.ts', [
  [`        where: { usuarioId: { in: permitidos } },
        select: { numero: true, nome: true },`,
`        where: { usuarioId: { in: permitidos } },
        select: { usuarioId: true, numero: true, nome: true },`],
  [`      salvos.forEach((ct: any) => {
        if (ct.numero && ct.nome) mapaContatoNome[String(ct.numero).replace(/\\D/g, '')] = ct.nome;
      });`,
`      // So nome de verdade (a extensao grava contato nao salvo com o proprio numero no lugar do nome).
      // Chave por atendente: cada um tem a sua agenda; sem o do atendente, vale o de qualquer outro.
      salvos.forEach((ct: any) => {
        const nome = String(ct.nome || '').trim();
        if (!ct.numero || !nome || !/[^\\d\\s+()-]/.test(nome)) return;
        const num = String(ct.numero).replace(/\\D/g, '');
        mapaContatoNome[\`\${ct.usuarioId}::\${num}\`] = nome;
        if (!mapaContatoNome[num]) mapaContatoNome[num] = nome;
      });`],
  [`      const nomeResolvido =
        mapaNomes[key]
        || (numeroLimpo && mapaContatoNome[numeroLimpo] ? mapaContatoNome[numeroLimpo] : '')`,
`      // 21/10: nome SALVO na agenda do WhatsApp primeiro; o do perfil (pushName) so se nao tiver salvo.
      const nomeResolvido =
        (numeroLimpo && (mapaContatoNome[\`\${usuarioId}::\${numeroLimpo}\`] || mapaContatoNome[numeroLimpo]) || '')
        || mapaNomes[key]`],
  [`  const numero = extrairNumeroDoJid(chatJid, ultimaComNumero?.numeroReal);

  return {
    id: \`\${usuarioId}::\${chatJid}\`,
    nome: ultimaComNumero?.chatNome || numero || 'Sem nome',`,
`  const numero = extrairNumeroDoJid(chatJid, ultimaComNumero?.numeroReal);
  const salvo = numero
    ? await prisma.contato.findUnique({ where: { usuarioId_numero: { usuarioId, numero: String(numero).replace(/\\D/g, '') } }, select: { nome: true } }).catch(() => null)
    : null;
  const nomeSalvo = String(salvo?.nome || '').trim();
  const nomePerfil = String(historico.slice().reverse().find((m) => !m.fromMe && String(m.chatNome || '').trim())?.chatNome || '').trim();

  return {
    id: \`\${usuarioId}::\${chatJid}\`,
    nome: (/[^\\d\\s+()-]/.test(nomeSalvo) ? nomeSalvo : '') || nomePerfil || ultimaComNumero?.chatNome || numero || 'Sem nome',`],
], 'nome SALVO na agenda');
