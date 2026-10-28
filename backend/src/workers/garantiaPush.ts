import { prisma } from '../server';
import { lerMensagem, tituloDaNotificacao, enviarEmailsAgendadosDevidos } from '../services/garantiaAvisos';

// ===== Motor de PUSH da Garantia 50k =====
// A cada ciclo, pega as notificações do CLIENTE que já venceram o dia agendado, ainda
// não foram enviadas, e cujo dono TEM token de push (instalou o app). Dispara pelo
// Expo Push e marca como enviada. Quem não tem app (sem pushToken) continua pendente
// no painel pra envio manual por WhatsApp — os dois canais convivem.

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const TIPOS_CLIENTE = ['revisao_proxima', 'pneu_cancelado', 'garantia_expira', 'garantia_cancelada', 'garantia_aprovada', 'revisao_aprovada', 'aviso', 'garantia_cadastrada', 'vistoria_entrada']; // odometro_suspeito é do analista, não vai pro cliente
// Título: o gravado no cabeçalho da mensagem (template do aviso, ver services/garantiaAvisos)
// ou, em notificação antiga, o padrão do tipo.

// LABORATÓRIO (NODE_ENV=lab): não chama o Expo — finge 'ok' e só loga. O push de verdade
// nunca sai do lab.
const PUSH_SIMULADO = process.env.NODE_ENV === 'lab';

const hojeStr = () => new Date().toISOString().slice(0, 10);
let rodando = false;

type ResultadoPush = 'ok' | 'invalido' | 'falha';

// Devolve o resultado POR MENSAGEM (alinhado ao array de entrada): 'ok' = o Expo aceitou;
// 'invalido' = token morto (app desinstalado), limpar do banco; 'falha' = o Expo caiu /
// erro de rede — NÃO marca como enviada, tenta de novo no próximo ciclo. Sem isso, uma
// indisponibilidade do Expo marcaria tudo como enviado e a notificação sumiria.
async function enviarLote(mensagens: { to: string; title: string; body: string; data: any }[]): Promise<ResultadoPush[]> {
  const resultado: ResultadoPush[] = new Array(mensagens.length).fill('falha');
  if (PUSH_SIMULADO) {
    mensagens.forEach((m) => console.log('[garantiaPush] (lab, simulado)', JSON.stringify({ title: m.title, body: m.body, data: m.data })));
    return resultado.fill('ok');
  }
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
    // E-mail de aviso AGENDADO que venceu hoje (ex.: revisao_proxima com e-mail ligado).
    await enviarEmailsAgendadosDevidos().catch((e) => console.error('[garantiaPush] e-mails agendados:', e?.message));
    const devidas = await prisma.garantiaNotificacao.findMany({
      where: { enviada: false, agendadaPara: { lte: hojeStr() }, tipo: { in: TIPOS_CLIENTE } },
      take: 500,
    });
    if (devidas.length === 0) return;

    const clientes = await prisma.garantiaCliente.findMany({ where: { id: { in: devidas.map((n) => n.clienteId) } } });
    const cliPorId = Object.fromEntries(clientes.map((c) => [c.id, c]));
    const garantiaIds = [...new Set(devidas.map((n) => n.garantiaId).filter(Boolean))];
    const garantias = garantiaIds.length
      ? await prisma.garantia.findMany({ where: { id: { in: garantiaIds } }, select: { id: true, veiculoId: true } })
      : [];
    const veiculoIds = [...new Set(garantias.map((g) => g.veiculoId))];
    const veiculos = veiculoIds.length
      ? await prisma.garantiaVeiculo.findMany({ where: { id: { in: veiculoIds } }, select: { id: true, placa: true, marca: true, modelo: true } })
      : [];
    const veiculoPorId = Object.fromEntries(veiculos.map((v) => [v.id, v]));
    const veiculoPorGarantia = Object.fromEntries(garantias.map((g) => [g.id, veiculoPorId[g.veiculoId] || null]));

    const mensagens: { to: string; title: string; body: string; data: any }[] = [];
    const idsParaMarcar: string[] = [];
    for (const n of devidas) {
      const c = cliPorId[n.clienteId];
      if (!c || !c.pushToken) continue; // sem app: fica pro envio manual no painel
      const { texto, meta } = lerMensagem(n.mensagem);
      // Aviso novo (com cabeçalho) já traz veículo/placa no próprio texto do template;
      // notificação antiga continua ganhando a linha "Veículo: ...".
      const veiculo = meta.t ? null : veiculoPorGarantia[n.garantiaId];
      const identificacao = veiculo
        ? `${[veiculo.marca, veiculo.modelo].filter(Boolean).join(' ') || 'Veículo'} • placa ${veiculo.placa}`
        : '';
      mensagens.push({
        to: c.pushToken,
        title: tituloDaNotificacao(n.tipo, n.mensagem),
        body: identificacao ? `${texto}\nVeículo: ${identificacao}` : texto,
        data: { notificacaoId: n.id, tipo: n.tipo, ...(meta.v ? { vistoriaId: meta.v } : {}) },
      });
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
