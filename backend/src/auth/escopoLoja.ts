import { Request } from 'express';
import { prisma } from '../server';
import { ehMaster } from './modulos';

// Quem deve ser escopado à própria loja: o GERENTE (usuário de painel não-master).
// Master vê tudo. Operador (atendente) NÃO é escopado por aqui — ele se auto-escopa
// pelo próprio usuarioId na extensão; escopar por loja mudaria o que ele vê hoje.
// Sem token (extensão sem login novo) também não escopa.
export function ehEscopado(req: Request): boolean {
  const u = req.user;
  return !!u && !ehMaster(u.role) && u.role !== 'operador';
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
