// whatsapp-crm: quando o robo confirma a visita, agenda os lembretes no Agendamento (o envio ja e do sistema).
const fs = require('fs');
const f = process.argv[2] + '/src/workers/botAtendimentoService.ts';
let s = fs.readFileSync(f, 'utf8');
if (s.includes('agendarLembretesVisita')) { console.log('ja aplicado'); process.exit(0); }
const rep = (a, b) => { const c = s.split(a).length - 1; if (c !== 1) { console.error('ocorrencias', c, JSON.stringify(a.slice(0, 90))); process.exit(1); } s = s.replace(a, () => b); };

rep("    chaves: Array.isArray(body?.chaves) ? body.chaves.map(String) : undefined,\n",
    "    chaves: Array.isArray(body?.chaves) ? body.chaves.map(String) : undefined,\n    visita: body?.visita && typeof body.visita.iso === 'string' ? { iso: String(body.visita.iso), rotulo: String(body.visita.rotulo || ''), diasAte: Number(body.visita.diasAte) || 0 } : undefined,\n");

// tipo
{
  const i = s.indexOf('interface RespostaBotService {');
  if (i < 0) { console.error('interface'); process.exit(1); }
  const j = s.indexOf('\n}', i);
  s = s.slice(0, j) + "\n  visita?: { iso: string; rotulo: string; diasAte: number } | undefined;" + s.slice(j);
}

rep("function tempoDigitacao(texto: string): number {",
`// Lembretes da visita (21/10): o cliente disse que vem num dia certo. Vespera 17h (se faltar 2+ dias) e no dia 8h30,
// em nome do atendente dono do numero. Um lembrete por cliente: se ele remarcar, os pendentes antigos saem.
// observacoes 'robo-visita' = criado pelo robo (fora da pontuacao das atendentes).
async function agendarLembretesVisita(params: AgendarBotParams, visita: { iso: string; rotulo: string; diasAte: number }, nomeLoja: string) {
  try {
    const { horariosLembreteVisita } = await import('../data/visita');
    const h = horariosLembreteVisita(visita);
    if (!h.vespera && !h.noDia) return;
    const msgNum = await prisma.mensagem.findFirst({ where: { usuarioId: params.usuarioId, chatJid: params.chatJid, numeroReal: { not: null } }, orderBy: { timestamp: 'desc' }, select: { numeroReal: true } });
    const numero = (String(msgNum?.numeroReal || '').split(':')[0] || (params.chatJid.includes('@lid') ? '' : params.chatJid.split('@')[0]) || '').replace(/\\D/g, '');
    if (numero.length < 10) { console.error(\`[Bot IA] \${params.chatJid}: visita confirmada mas sem numero real — lembrete nao agendado.\`); return; }
    const ultimaNome = await prisma.mensagem.findFirst({ where: { usuarioId: params.usuarioId, chatJid: params.chatJid, chatNome: { not: '' } }, orderBy: { timestamp: 'desc' }, select: { chatNome: true } });
    const nomeCompleto = String(ultimaNome?.chatNome || '').trim();
    const primeiro = /^[A-Za-zÀ-ÿ]{2,}/.test(nomeCompleto) ? (nomeCompleto.split(/\\s+/)[0] || '') : '';
    const nome = primeiro ? primeiro.charAt(0).toUpperCase() + primeiro.slice(1).toLowerCase() : '';
    const cliente = nomeCompleto || numero;
    await prisma.agendamento.deleteMany({ where: { criadoPorId: params.usuarioId, numero, status: 'pendente', observacoes: { contains: 'robo-visita' } } });
    const criar = (enviarEm: Date, mensagem: string, cancelarSeResponder: boolean) =>
      prisma.agendamento.create({ data: { cliente, numero, mensagem, enviarEm, criadoPorId: params.usuarioId, status: 'pendente', cancelarSeResponder, observacoes: \`robo-visita \${visita.iso}\` } });
    if (h.vespera) await criar(h.vespera, \`Oi\${nome ? \`, \${nome}\` : ''}! Passando pra confirmar: amanhã a gente te espera aqui na \${nomeLoja} 😊 Tá confirmado?\`, true);
    if (h.noDia) await criar(h.noDia, \`Bom dia\${nome ? \`, \${nome}\` : ''}! Hoje é o dia 😊 Estamos te esperando aqui na \${nomeLoja}. Qualquer coisa é só me chamar!\`, false);
    console.log(\`[Bot IA] \${params.chatJid}: visita \${visita.iso} — lembretes agendados (vespera: \${h.vespera ? 'sim' : 'nao'}, no dia: \${h.noDia ? 'sim' : 'nao'}).\`);
  } catch (e: any) {
    console.error('[Bot IA] erro ao agendar lembretes da visita:', e?.message || e);
  }
}

function tempoDigitacao(texto: string): number {`);

rep("      await registrarEventoFluxo(params, resposta, estadoPrecoSalvo?.estadoPreco || 'sem_estado', resposta.partes);\n",
    "      await registrarEventoFluxo(params, resposta, estadoPrecoSalvo?.estadoPreco || 'sem_estado', resposta.partes);\n      if (resposta.visita) await agendarLembretesVisita(params, resposta.visita, cfgLoja.NOME_LOJA);\n");
fs.writeFileSync(f, s); console.log('ok');
