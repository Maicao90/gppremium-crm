import { Request, Response, NextFunction } from 'express';
import { ehMaster } from '../auth/modulos';

// Exige que o usuário logado tenha UM módulo específico (master sempre passa).
export const requireModulo = (mod: string) => (req: Request, res: Response, next: NextFunction) => {
  const u = req.user;
  if (!u) return res.status(401).json({ error: 'Não autenticado.' });
  if (ehMaster(u.role)) return next();
  if (Array.isArray(u.modulos) && u.modulos.includes(mod)) return next();
  return res.status(403).json({ error: 'Sem acesso a este módulo.' });
};

// Exige QUALQUER um de uma lista de módulos (para routers compartilhados por vários módulos).
export const requireAnyModulo = (mods: string[]) => (req: Request, res: Response, next: NextFunction) => {
  const u = req.user;
  if (!u) return res.status(401).json({ error: 'Não autenticado.' });
  if (ehMaster(u.role)) return next();
  if (Array.isArray(u.modulos) && u.modulos.some((m) => mods.includes(m))) return next();
  return res.status(403).json({ error: 'Sem acesso a este módulo.' });
};

// Apenas o master (dono).
export const requireMaster = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) return res.status(401).json({ error: 'Não autenticado.' });
  if (!ehMaster(req.user.role)) return res.status(403).json({ error: 'Apenas o administrador.' });
  next();
};
