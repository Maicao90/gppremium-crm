// Remarketing do robo (21/10): o que a GP faz na mao com o emoji 🙋🏼‍♀️ (223 envios em 30 dias, 62% voltaram a
// responder em 2 dias) — cliente parou de responder depois que a loja falou -> o robo manda o emoji, uma vez.
const fs = require('fs');
const base = process.argv[2];
function patch(rel, trocas, marca) {
  const f = base + '/' + rel;
  let s = fs.readFileSync(f, 'utf8');
  const crlf = s.includes('\r\n'); s = s.replace(/\r\n/g, '\n');
  if (s.includes(marca)) { console.log(rel, 'ja aplicado'); return; }
  for (const [a, b] of trocas) {
    const c = s.split(a).length - 1;
    if (c !== 1) { console.error(rel, 'ocorrencias', c, JSON.stringify(a.slice(0, 80))); process.exit(1); }
    s = s.replace(a, () => b);
  }
  if (crlf) s = s.replace(/\n/g, '\r\n');
  fs.writeFileSync(f, s); console.log(rel, 'ok');
}

patch('src/services/botLojas.ts', [
  ["  CHAVES_ATENDENTE?: string[] | undefined;\n}",
   `  CHAVES_ATENDENTE?: string[] | undefined;
  REMARKETING?: RemarketingLoja | undefined;
}

// Remarketing: cliente parou de responder depois que a loja falou -> o robo puxa de volta (uma vez por silencio).
export interface RemarketingLoja {
  ativo: boolean;
  mensagem: string;          // ex.: "🙋🏼‍♀️" (o que a equipe da GP manda na mao)
  horasSemResposta: number;  // so depois de X horas sem o cliente responder (e sem a loja falar)
  maxDias: number;           // nao ressuscita conversa mais velha que isso
  horaInicio: string;        // "08:00" (Brasilia)
  horaFim: string;           // "19:00"
  maxPorHora: number;        // trava de volume (risco de bloqueio do numero)
}`],
  ["    CHAVES_ATENDENTE: Array.isArray(daLoja?.CHAVES_ATENDENTE) ? daLoja.CHAVES_ATENDENTE.map(String) : undefined,\n",
   `    CHAVES_ATENDENTE: Array.isArray(daLoja?.CHAVES_ATENDENTE) ? daLoja.CHAVES_ATENDENTE.map(String) : undefined,
    REMARKETING: daLoja?.REMARKETING && typeof daLoja.REMARKETING === 'object' ? {
      ativo: daLoja.REMARKETING.ativo === true,
      mensagem: String(daLoja.REMARKETING.mensagem || '🙋🏼‍♀️'),
      horasSemResposta: Number(daLoja.REMARKETING.horasSemResposta) > 0 ? Number(daLoja.REMARKETING.horasSemResposta) : 3,
      maxDias: Number(daLoja.REMARKETING.maxDias) > 0 ? Number(daLoja.REMARKETING.maxDias) : 3,
      horaInicio: String(daLoja.REMARKETING.horaInicio || '08:00'),
      horaFim: String(daLoja.REMARKETING.horaFim || '19:00'),
      maxPorHora: Number(daLoja.REMARKETING.maxPorHora) > 0 ? Number(daLoja.REMARKETING.maxPorHora) : 20,
    } : undefined,
`],
], 'RemarketingLoja');

patch('src/workers/botAtendimentoService.ts', [
  ["async function naoAtender(usuarioId: string, chatJid: string): Promise<boolean> {",
   "export async function naoAtender(usuarioId: string, chatJid: string): Promise<boolean> {"],
], 'export async function naoAtender');

patch('src/workers/whatsappService.ts', [
  ["import { agendarRespostaBotIA, pausarConversaBotIA } from './botAtendimentoService';",
   "import { agendarRespostaBotIA, pausarConversaBotIA, naoAtender } from './botAtendimentoService';"],
  ["iniciarVigiaRespostasPendentes();\n",
`iniciarVigiaRespostasPendentes();

// ─── REMARKETING DO ROBÔ (21/10) ───
// A equipe da GP manda o emoji 🙋🏼‍♀️ na mão pra quem parou de responder (223 envios em 30 dias; 62% voltaram a
// falar em 2 dias). O robô faz o mesmo nas lojas com REMARKETING ativo (bot-lojas.json): a LOJA falou por último,
// o cliente está quieto há X horas (e há menos de N dias), no horário comercial — manda UMA vez por silêncio.
// Não manda se: já mandou o emoji depois da última fala do cliente, cliente disse que desistiu/já comprou, conversa
// pausada (atendente assumiu, pneu fora da tabela, anti-loop), lista de não-atender/equipe, ou já tem agendamento
// pendente pra esse número. Trava de volume por hora.
const REMARKETING_FECHOU = /(n[aã]o (quero|preciso|tenho interesse)|sem interesse|desist|j[aá] comprei|comprei em outr|n[aã]o vou querer|pode cancelar|n[aã]o precisa mais)/i;
const remarketingEnvios = new Map<string, number[]>();
let remarketingRodando = false;
function minutosBR(hhmm: string): number { const m = /^(\\d{1,2}):(\\d{2})$/.exec(hhmm.trim()); return m ? Number(m[1]) * 60 + Number(m[2]) : -1; }
function agoraMinutosBR(): number {
  const hm = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
  const [h, mi] = hm.split(':').map(Number); return (h as number) * 60 + (mi as number);
}
function iniciarRemarketingRobo() {
  const varrer = async () => {
    if (remarketingRodando) return;
    remarketingRodando = true;
    try {
      const contasBot = await prisma.usuario.findMany({ where: { ativo: true, botIaAtivo: true }, select: { id: true } });
      for (const conta of contasBot) {
        const cfg = await configBotDaLoja(conta.id);
        const rm = cfg.REMARKETING;
        if (!rm || !rm.ativo) continue;
        const agoraMin = agoraMinutosBR();
        if (agoraMin < minutosBR(rm.horaInicio) || agoraMin >= minutosBR(rm.horaFim)) continue;
        const domingo = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', weekday: 'short' }).format(new Date()) === 'Sun';
        if (domingo) continue;
        if (!sessions.has(conta.id) && !connectedUsers.has(conta.id)) continue;

        const agora = Date.now();
        const silencioMs = rm.horasSemResposta * 3600_000;
        const idadeMaxMs = rm.maxDias * 86400_000;
        const envios = (remarketingEnvios.get(conta.id) || []).filter((t) => agora - t < 3600_000);
        remarketingEnvios.set(conta.id, envios);
        if (envios.length >= rm.maxPorHora) continue;

        const msgs = await prisma.mensagem.findMany({
          where: { usuarioId: conta.id, timestamp: { gte: new Date(agora - idadeMaxMs - 86400_000) } },
          orderBy: { timestamp: 'desc' },
          take: 3000,
          select: { chatJid: true, fromMe: true, texto: true, timestamp: true, numeroReal: true, tipo: true },
        });
        const porChat = new Map<string, typeof msgs>();
        for (const m of msgs) { const l = porChat.get(m.chatJid) || []; l.push(m); porChat.set(m.chatJid, l); }

        for (const [chatJid, lista] of porChat.entries()) {
          if (envios.length >= rm.maxPorHora) break;
          if (chatJid.includes('@g.us') || chatJid.includes('@newsletter') || chatJid.includes('status@broadcast')) continue;
          const ultima = lista[0];
          if (!ultima || !ultima.fromMe) continue;                                   // a loja falou por ultimo
          if (agora - ultima.timestamp.getTime() < silencioMs) continue;            // a loja falou ha pouco
          const ultimaCliente = lista.find((m) => !m.fromMe);
          if (!ultimaCliente) continue;                                             // cliente nunca falou (nao e lead)
          const idade = agora - ultimaCliente.timestamp.getTime();
          if (idade < silencioMs || idade > idadeMaxMs) continue;
          if (lista.some((m) => m.fromMe && m.timestamp > ultimaCliente.timestamp && /🙋/.test(String(m.texto || '')))) continue; // ja puxou
          if (REMARKETING_FECHOU.test(String(ultimaCliente.texto || ''))) continue;
          const estado = await prisma.botConversa.findUnique({
            where: { usuarioId_chatJid: { usuarioId: conta.id, chatJid } },
            select: { pausadoAte: true },
          }).catch(() => null);
          if (estado?.pausadoAte && estado.pausadoAte.getTime() > agora) continue;
          if (await naoAtender(conta.id, chatJid)) continue;
          const numeroReal = String(lista.find((m) => m.numeroReal)?.numeroReal || '').split(':')[0] || '';
          const digitos = (numeroReal || chatJid.split('@')[0] || '').replace(/\\D/g, '');
          if (digitos.length >= 8) {
            const agendado = await prisma.agendamento.count({ where: { criadoPorId: conta.id, status: 'pendente', numero: { contains: digitos.slice(-8) } } }).catch(() => 0);
            if (agendado > 0) continue;
          }
          const ok = await enviarParteBotIA(conta.id, chatJid, numeroReal, rm.mensagem, 1500 + Math.floor(Math.random() * 1500));
          if (ok) {
            envios.push(Date.now());
            console.log(\`[Remarketing] \${chatJid}: cliente quieto ha \${Math.round(idade / 3600_000)}h — mandei "\${rm.mensagem}" (\${envios.length}/\${rm.maxPorHora} nesta hora).\`);
            await delay(20_000 + Math.floor(Math.random() * 40_000));
          }
        }
      }
    } catch (e: any) {
      console.error('[Remarketing] erro na varredura:', e?.message || e);
    } finally {
      remarketingRodando = false;
    }
  };
  setTimeout(() => { varrer().catch(() => {}); }, 90_000).unref?.();
  setInterval(() => { varrer().catch(() => {}); }, 5 * 60_000).unref?.();
}
iniciarRemarketingRobo();
`],
], 'REMARKETING DO ROBÔ');
