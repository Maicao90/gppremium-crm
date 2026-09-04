import { Request, Response, NextFunction } from 'express';
import { ehMaster } from '../auth/modulos';
import { prisma } from '../server';

// Achado 04/09 em caso real: o dono liberou um modulo novo pra atendente (Josy, at-
// botpneus) e ela continuou sem conseguir usar o modulo — via a tela, mas as chamadas
// que ESCREVEM (enviar mensagem) falhavam. Causa: modulos ficam gravados DENTRO do
// token JWT no momento do login; conceder um modulo no banco nao atualiza um token que
// ja foi emitido. Ficava preso ate a pessoa deslogar e entrar de novo — ninguem avisa
// isso, entao parecia bug.
// CONFERE NO BANCO: em vez de confiar so no token, confere modulosPermitidos AO VIVO no
// banco a cada chamada. Um pouco mais lento (1 consulta a mais por requisicao), mas
// permissao concedida passa a valer na hora, sem exigir logout/login de ninguem.
const parseModulos = (v: unknown): string[] => {
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === 'string') { try { const a = JSON.parse(v); return Array.isArray(a) ? a.map(String) : []; } catch { return []; } }
  return [];
};

async function temModulo(userId: string, mod: string): Promise<boolean> {
  try {
    const u = await prisma.usuario.findUnique({ where: { id: userId }, select: { modulosPermitidos: true, ativo: true } });
    if (!u || !u.ativo) return false;
    return parseModulos(u.modulosPermitidos).includes(mod);
  } catch {
    return false; // banco fora do ar: nao libera por engano
  }
}

// Exige que o usuário logado tenha UM módulo específico (master sempre passa).
export const requireModulo = (mod: string) => async (req: Request, res: Response, next: NextFunction) => {
  const u = req.user;
  if (!u) return res.status(401).json({ error: 'Não autenticado.' });
  if (ehMaster(u.role)) return next();
  if (await temModulo(u.sub, mod)) return next();
  return res.status(403).json({ error: 'Sem acesso a este módulo.' });
};

// Exige QUALQUER um de uma lista de módulos (para routers compartilhados por vários módulos).
export const requireAnyModulo = (mods: string[]) => async (req: Request, res: Response, next: NextFunction) => {
  const u = req.user;
  if (!u) return res.status(401).json({ error: 'Não autenticado.' });
  if (ehMaster(u.role)) return next();
  const resultados = await Promise.all(mods.map((m) => temModulo(u.sub, m)));
  if (resultados.some(Boolean)) return next();
  return res.status(403).json({ error: 'Sem acesso a este módulo.' });
};

// Apenas o master (dono).
export const requireMaster = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) return res.status(401).json({ error: 'Não autenticado.' });
  if (!ehMaster(req.user.role)) return res.status(403).json({ error: 'Apenas o administrador.' });
  next();
};
