import { Request } from 'express';
import { prisma } from '../server';
import { ehMaster } from './modulos';

// Lê o papel + loja ATUAIS do usuário no banco. NÃO confia no token: ele pode estar
// VELHO. Ex.: um atendente promovido a gerente DEPOIS do último login continua com
// role="operador" gravado no token — e como operador não é escopado, ele passava a
// ver os agendamentos/métricas de TODAS as lojas até relogar. Lendo do banco, a
// promoção vale na hora.
async function usuarioAtual(req: Request): Promise<{ role: string; lojaId: string | null } | null> {
  const uid = (req.user as any)?.sub;
  if (!uid) return null;
  try {
    const u = await prisma.usuario.findUnique({
      where: { id: String(uid) },
      select: { role: true, lojaId: true },
    });
    return u ? { role: u.role, lojaId: u.lojaId ?? null } : null;
  } catch {
    return null;
  }
}

// True quando o usuário deve ser escopado à própria loja: o GERENTE. Master vê tudo;
// operador se auto-escopa pelo próprio usuarioId na extensão; sem token (extensão) não
// escopa. Baseado no estado ATUAL do banco (não no token).
export async function ehEscopado(req: Request): Promise<boolean> {
  const u = await usuarioAtual(req);
  return !!u && !ehMaster(u.role) && u.role !== 'operador';
}

// lojaId ATUAL do gerente logado (do banco). Retorna null quando NÃO se deve escopar
// (master, operador ou sem token). '__sem_loja__' quando é gerente sem loja definida
// (não vê nenhuma loja real).
export async function lojaDoUsuario(req: Request): Promise<string | null> {
  const u = await usuarioAtual(req);
  if (!u || ehMaster(u.role) || u.role === 'operador') return null;
  return u.lojaId || '__sem_loja__';
}

// Ids dos atendentes (Usuario) da loja do gerente logado, para escopar dados de WhatsApp
// (agendamentos/conversas) pelo elo atendente→loja.
// null  = NÃO escopar (master, operador ou sem token) → fluxo normal, vê tudo.
// []    = gerente sem loja definida → não vê nada.
export async function idsAtendentesDaLoja(req: Request): Promise<string[] | null> {
  const u = await usuarioAtual(req);
  if (!u || ehMaster(u.role) || u.role === 'operador') return null;
  if (!u.lojaId) return [];
  const atendentes = await prisma.usuario.findMany({
    where: { lojaId: u.lojaId },
    select: { id: true },
  });
  return atendentes.map((a) => a.id);
}
