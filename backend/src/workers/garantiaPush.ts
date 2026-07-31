import { prisma } from '../server';

// ===== Motor de PUSH da Garantia 50k =====
// A cada ciclo, pega as notificações do CLIENTE que já venceram o dia agendado, ainda
// não foram enviadas, e cujo dono TEM token de push (instalou o app). Dispara pelo
// Expo Push e marca como enviada. Quem não tem app (sem pushToken) continua pendente
// no painel pra envio manual por WhatsApp — os dois canais convivem.

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const TIPOS_CLIENTE = ['revisao_proxima', 'pneu_cancelado', 'garantia_expira', 'garantia_cancelada', 'garantia_aprovada', 'revisao_aprovada', 'aviso']; // odometro_suspeito é do analista, não vai pro cliente

const TITULO: Record<string, string> = {
  revisao_proxima: 'Revisão dos seus pneus GP Premium 🛞',
  pneu_cancelado: 'Aviso sobre sua garantia GP Premium',
  garantia_expira: 'Sua garantia GP Premium está terminando',
  garantia_cancelada: 'Sua garantia GP Premium foi cancelada',
  garantia_aprovada: 'Garantia aprovada! ✅',
  revisao_aprovada: 'Revisão aprovada! ✅',
  aviso: 'GP Premium 🛞',
};

const hojeStr = () => new Date().toISOString().slice(0, 10);
let rodando = false;

type ResultadoPush = 'ok' | 'invalido' | 'falha';

// Devolve o resultado POR MENSAGEM (alinhado ao array de entrada): 'ok' = o Expo aceitou;
// 'invalido' = token morto (app desinstalado), limpar do banco; 'falha' = o Expo caiu /
// erro de rede — NÃO marca como enviada, tenta de novo no próximo ciclo. Sem isso, uma
// indisponibilidade do Expo marcaria tudo como enviado e a notificação sumiria.
async function enviarLote(mensagens: { to: string; title: string; body: string; data: any }[]): Promise<ResultadoPush[]> {
  const resultado: ResultadoPush[] = new Array(mensagens.length).fill('falha');
  for (let base = 0; base < mensagens.length; base += 100) {
    const lote = mensagens.slice(base, base + 100);
    try {
      const resp = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(lote),
      });
      const json: any = resp.ok ? await resp.json().catch(() => null) : null;
      const data = json?.data;
      if (Array.isArray(data)) {
        data.forEach((r: any, idx: number) => {
          const g = base + idx;
          if (r?.status === 'ok') resultado[g] = 'ok';
          else if (r?.details?.error === 'DeviceNotRegistered') resultado[g] = 'invalido';
          else resultado[g] = 'falha'; // outro erro do Expo → tenta de novo depois
        });
      } else {
        console.error('[garantiaPush] Expo respondeu sem data (status', resp.status, ') — lote fica pendente.');
      }
    } catch (e) {
      console.error('[garantiaPush] falha ao enviar lote:', (e as any)?.message);
    }
  }
  return resultado;
}

export async function dispararPushDevidos(): Promise<void> {
  if (rodando) return;
  rodando = true;
  try {
    const devidas = await prisma.garantiaNotificacao.findMany({
      where: { enviada: false, agendadaPara: { lte: hojeStr() }, tipo: { in: TIPOS_CLIENTE } },
      take: 500,
    });
    if (devidas.length === 0) return;

    const clientes = await prisma.garantiaCliente.findMany({ where: { id: { in: devidas.map((n) => n.clienteId) } } });
    const cliPorId = Object.fromEntries(clientes.map((c) => [c.id, c]));

    const mensagens: { to: string; title: string; body: string; data: any }[] = [];
    const idsParaMarcar: string[] = [];
    for (const n of devidas) {
      const c = cliPorId[n.clienteId];
      if (!c || !c.pushToken) continue; // sem app: fica pro envio manual no painel
      mensagens.push({ to: c.pushToken, title: TITULO[n.tipo] || 'GP Premium', body: n.mensagem, data: { notificacaoId: n.id, tipo: n.tipo } });
      idsParaMarcar.push(n.id);
    }
    if (mensagens.length === 0) return;

    const resultado = await enviarLote(mensagens);
    // Marca como enviada SÓ o que o Expo aceitou ('ok'). 'falha' fica pendente pro
    // próximo ciclo; 'invalido' também não marca (o cliente não recebeu), mas o token é limpo.
    const idsOk = idsParaMarcar.filter((_, i) => resultado[i] === 'ok');
    const tokensInvalidos = [...new Set(mensagens.filter((_, i) => resultado[i] === 'invalido').map((m) => m.to))];
    if (idsOk.length) {
      await prisma.garantiaNotificacao.updateMany({ where: { id: { in: idsOk } }, data: { enviada: true, enviadaEm: new Date() } });
    }
    if (tokensInvalidos.length) {
      await prisma.garantiaCliente.updateMany({ where: { pushToken: { in: tokensInvalidos } }, data: { pushToken: '' } });
    }
    const falhas = resultado.filter((r) => r === 'falha').length;
    console.log(`[garantiaPush] enviados ${idsOk.length} push, ${tokensInvalidos.length} token(s) inválido(s) limpo(s), ${falhas} pendente(s) pra retry.`);
  } catch (e) {
    console.error('[garantiaPush] erro:', (e as any)?.message);
  } finally {
    rodando = false;
  }
}

export function initGarantiaPush(): void {
  // Roda logo no boot e depois a cada 30 min (as notificações são por DIA, não precisa
  // de precisão de minuto).
  setTimeout(() => { dispararPushDevidos(); }, 20000);
  setInterval(() => { dispararPushDevidos(); }, 30 * 60 * 1000);
  console.log('[garantiaPush] motor de push iniciado (ciclo 30min).');
}
