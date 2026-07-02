import { prisma } from '../server';
import { MetricaCampanhaDia } from './tipos';
import * as googleAds from './googleAds';
import * as metaAds from './metaAds';

// ════════════════════════════════════════════════════════════════════════
// SERVIÇO DE SINCRONIZAÇÃO DE ANÚNCIOS (Google Ads + Meta Ads)
// ════════════════════════════════════════════════════════════════════════
// Puxa métricas diárias das plataformas, grava em MetricaDiaria (histórico)
// e mantém a tabela Campanha do CRM atualizada (1 linha por campanha externa).

// Janela sincronizada a cada rodada (dias para trás, contando de hoje)
const DIAS_SYNC = 90;
// Intervalo entre rodadas automáticas: 6 horas
const INTERVALO_SYNC_MS = 6 * 60 * 60 * 1000;
// Primeira rodada: 90s após o boot (dá tempo do banco/workers subirem)
const ATRASO_INICIAL_MS = 90 * 1000;

export interface ResultadoSync {
  ok: boolean;
  campanhas: number;
  detalhe?: string;
}

// Sincroniza UMA conexão: busca métricas na plataforma, faz upsert em
// MetricaDiaria e atualiza/cria as linhas correspondentes em Campanha.
// NUNCA deixa exception vazar: qualquer erro é registrado em ultimoErro.
export async function sincronizarConexao(conexaoId: string): Promise<ResultadoSync> {
  let conexao: any = null;
  try {
    conexao = await prisma.conexaoAds.findUnique({ where: { id: conexaoId } });
    if (!conexao) return { ok: false, campanhas: 0, detalhe: 'Conexão não encontrada' };

    // Credenciais ficam serializadas em JSON no banco
    let credenciais: any = {};
    try {
      credenciais = JSON.parse(conexao.credenciais || '{}') || {};
    } catch {
      throw new Error('Credenciais salvas estão corrompidas — salve a conexão novamente');
    }

    // 1) Busca as métricas na plataforma certa
    const metricas: MetricaCampanhaDia[] = conexao.plataforma === 'meta'
      ? await metaAds.buscarMetricasDiarias(credenciais, DIAS_SYNC)
      : await googleAds.buscarMetricasDiarias(credenciais, DIAS_SYNC);

    // 2) Upsert do histórico diário (unique conexaoId + campanhaExternalId + data)
    for (const m of metricas) {
      const dia = new Date(`${m.data}T00:00:00.000Z`); // meia-noite UTC = chave estável
      await prisma.metricaDiaria.upsert({
        where: {
          conexaoId_campanhaExternalId_data: {
            conexaoId: conexao.id,
            campanhaExternalId: m.campanhaExternalId,
            data: dia,
          },
        },
        update: {
          campanhaNome: m.campanhaNome,
          plataforma: conexao.plataforma,
          spend: m.spend,
          leads: m.leads,
          impressoes: m.impressoes,
          cliques: m.cliques,
        },
        create: {
          conexaoId: conexao.id,
          campanhaExternalId: m.campanhaExternalId,
          campanhaNome: m.campanhaNome,
          plataforma: conexao.plataforma,
          data: dia,
          spend: m.spend,
          leads: m.leads,
          impressoes: m.impressoes,
          cliques: m.cliques,
        },
      });
    }

    // 3) Agrega por campanha (soma do período sincronizado) para a tabela Campanha
    const porCampanha = new Map<string, { nome: string; status: 'Active' | 'Paused'; spend: number; leads: number }>();
    for (const m of metricas) {
      const atual = porCampanha.get(m.campanhaExternalId) || { nome: m.campanhaNome, status: m.status, spend: 0, leads: 0 };
      if (m.campanhaNome) atual.nome = m.campanhaNome;
      atual.status = m.status;
      atual.spend += m.spend;
      atual.leads += m.leads;
      porCampanha.set(m.campanhaExternalId, atual);
    }

    // 4) Upsert em Campanha: uma linha por campanha externa (external_id + conexao_id)
    const avisos: string[] = [];
    for (const [externalId, agg] of porCampanha) {
      try {
        const dados = {
          name: agg.nome,
          platform: conexao.plataforma === 'meta' ? 'Meta' : 'Google',
          status: agg.status,
          spend: Math.round(agg.spend * 100) / 100,
          leads: agg.leads,
        };
        const existente = await prisma.campanha.findFirst({
          where: { external_id: externalId, conexao_id: conexao.id },
        });
        if (existente) {
          await prisma.campanha.update({ where: { id: existente.id }, data: dados });
        } else if (conexao.company_id) {
          await prisma.campanha.create({
            data: {
              ...dados,
              company_id: conexao.company_id,
              store_id: conexao.store_id,
              external_id: externalId,
              conexao_id: conexao.id,
            },
          });
        } else {
          avisos.push(`campanha ${externalId} não criada no CRM (conexão sem empresa vinculada)`);
        }
      } catch (e: any) {
        avisos.push(`campanha ${externalId}: ${e?.message || e}`);
      }
    }

    // 5) Marca a sincronização como concluída (limpa o último erro)
    await prisma.conexaoAds.update({
      where: { id: conexao.id },
      data: { ultimaSync: new Date(), ultimoErro: null },
    });

    let detalhe = `${metricas.length} registro(s) diário(s) em ${porCampanha.size} campanha(s)`;
    if (avisos.length > 0) detalhe += ` — avisos: ${avisos.join('; ')}`.slice(0, 1000);

    return { ok: true, campanhas: porCampanha.size, detalhe };
  } catch (e: any) {
    // Registra o erro na conexão para aparecer no painel (sem tokens: as
    // integrações só devolvem mensagens de erro legíveis das plataformas)
    const msg = String(e?.message || e || 'Erro desconhecido').slice(0, 1000);
    if (conexao) {
      try {
        await prisma.conexaoAds.update({ where: { id: conexaoId }, data: { ultimoErro: msg } });
      } catch (errBanco) {
        console.error('[SyncAds] Falha ao registrar ultimoErro:', errBanco);
      }
    }
    return { ok: false, campanhas: 0, detalhe: msg };
  }
}

// Sincroniza todas as conexões ATIVAS, em série (uma por vez), com try/catch
// por conexão — uma conta com problema não derruba as demais.
async function sincronizarTodasAtivas() {
  try {
    const conexoes = await prisma.conexaoAds.findMany({ where: { ativo: true } });
    if (conexoes.length === 0) return;
    console.log(`[SyncAds] Iniciando rodada de sincronização de ${conexoes.length} conexão(ões)...`);

    for (const conexao of conexoes) {
      try {
        const r = await sincronizarConexao(conexao.id);
        if (r.ok) {
          console.log(`[SyncAds] ✅ "${conexao.nome}" (${conexao.plataforma}): ${r.campanhas} campanha(s) sincronizada(s).`);
        } else {
          console.error(`[SyncAds] ❌ "${conexao.nome}" (${conexao.plataforma}): ${r.detalhe}`);
        }
      } catch (e: any) {
        // sincronizarConexao já trata erros; isto aqui é só cinto de segurança
        console.error(`[SyncAds] Erro inesperado na conexão ${conexao.id}:`, e?.message || e);
      }
    }
  } catch (e) {
    console.error('[SyncAds] Erro ao listar conexões ativas:', e);
  }
}

// Proteção contra init duplo (mesmo padrão dos outros workers do projeto)
let syncAdsIniciado = false;

// Inicia o worker de sincronização: 1ª rodada 90s após o boot e depois a cada 6h
export function initSyncAds() {
  if (syncAdsIniciado) return;
  syncAdsIniciado = true;

  console.log('[SyncAds] Worker de sincronização de anúncios iniciado (rodada inicial em 90s, depois a cada 6h)');
  setTimeout(() => {
    sincronizarTodasAtivas().catch((e) => console.error('[SyncAds] Erro na rodada inicial:', e));
  }, ATRASO_INICIAL_MS);
  setInterval(() => {
    sincronizarTodasAtivas().catch((e) => console.error('[SyncAds] Erro na rodada periódica:', e));
  }, INTERVALO_SYNC_MS);
}
