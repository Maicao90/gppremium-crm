import { Request } from 'express';
import { prisma } from '../server';
import { ehMaster } from './modulos';

// Um usuário LOGADO que NÃO é master deve ser escopado à própria loja.
// (Sem token = extensão/atendente, tratado pelo fluxo antigo — não escopa aqui.)
export function ehEscopado(req: Request): boolean {
  const u = req.user;
  return !!u && !ehMaster(u.role);
}

// Ids dos atendentes (Usuario) da loja do usuário logado, para escopar dados de
// WhatsApp (agendamentos/conversas/métricas) pelo elo atendente→loja.
// Retorna null quando NÃO se deve escopar (sem token, ou master).
// Retorna [] quando é gerente sem loja definida (não vê nada).
export async function idsAtendentesDaLoja(req: Request): Promise<string[] | null> {
  const u = req.user;
  if (!u) return null;
  if (ehMaster(u.role)) return null;
  if (!u.lojaId) return [];
  const atendentes = await prisma.usuario.findMany({ where: { lojaId: u.lojaId }, select: { id: true } });
  return atendentes.map((a) => a.id);
}
