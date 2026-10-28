import { prisma } from '../server';

// ===== Revisão por CARRO (1.1.4, contrato 28/10) =====
// Cada compra continua sendo uma Garantia separada (kmInicial/kmMaximo/dataExpiracao próprios),
// mas a REVISÃO segue um calendário único do veículo:
//   âncora = menor kmInicial entre as garantias EM ANDAMENTO do veículo;
//   base   = max(âncora, maior km de revisão já registrada no veículo — todas as garantias);
//   próxima revisão = base + intervalo.
// O max com a âncora faz revisões de garantias ANTIGAS (já canceladas/expiradas, de antes da
// compra atual) não puxarem o calendário pra trás. No caso normal (revisões depois da âncora)
// é exatamente "maior km de revisão + intervalo"; sem revisão no ciclo atual, "âncora + intervalo".

export const EM_ANDAMENTO = ['pendente', 'em_analise', 'ativa', 'atencao'];

export async function calendarioDoCarro(veiculoId: string, intervaloKm: number) {
  const garantias = await prisma.garantia.findMany({ where: { veiculoId }, orderBy: [{ criadoEm: 'asc' }, { id: 'asc' }] });
  const emAndamento = garantias.filter((g) => EM_ANDAMENTO.includes(g.status));
  const agg = garantias.length
    ? await prisma.garantiaRevisao.aggregate({ where: { garantiaId: { in: garantias.map((g) => g.id) } }, _max: { km: true } })
    : null;
  const maiorKmRevisao = agg?._max.km || 0;
  if (!emAndamento.length) {
    return { garantias, emAndamento, ancora: null as number | null, maiorKmRevisao, base: null as number | null, proximaRevisaoKm: null as number | null, intervaloKm };
  }
  const ancora = Math.min(...emAndamento.map((g) => g.kmInicial));
  const base = Math.max(ancora, maiorKmRevisao);
  return { garantias, emAndamento, ancora: ancora as number | null, maiorKmRevisao, base: base as number | null, proximaRevisaoKm: (base + intervaloKm) as number | null, intervaloKm };
}

// Dia (YYYY-MM-DD) no horário de Brasília — agrupa revisões "do mesmo dia" na auditoria.
export const diaBR = (d: Date): string => new Date(d.getTime() - 3 * 3600 * 1000).toISOString().slice(0, 10);

// Grupo de auditoria: mesmo veículo + mesmo km + mesmo dia. Estável (não depende de ids de revisão).
export const grupoIdRevisao = (veiculoId: string, km: number, criadoEm: Date): string => `${veiculoId}:${km}:${diaBR(criadoEm)}`;
