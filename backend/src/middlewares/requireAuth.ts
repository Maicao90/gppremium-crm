import { Request, Response, NextFunction } from 'express';
import { verificarToken, TokenPayload } from '../auth/jwt';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request { user?: TokenPayload }
  }
}

const extrairToken = (req: Request): string => {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7) : '';
};

// Bloqueia se não houver token válido.
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const payload = verificarToken(extrairToken(req));
  if (!payload) return res.status(401).json({ error: 'Não autenticado.' });
  req.user = payload;
  next();
}

// Modo transição: popula req.user se houver token válido, mas NÃO bloqueia se não houver.
// Usado nas rotas que a extensão do WhatsApp ainda chama sem token (até ela atualizar).
export function authOpcional(req: Request, _res: Response, next: NextFunction) {
  const payload = verificarToken(extrairToken(req));
  if (payload) req.user = payload;
  next();
}

// Interruptor da trava final das rotas de WhatsApp: quando WHATSAPP_REQUIRE_AUTH=true
// (setar no .env da VPS DEPOIS que a extensão nova — que manda token — estiver em todos
// os atendentes), exige token de verdade; senão fica em modo transição (não bloqueia).
export function authWhatsapp(req: Request, res: Response, next: NextFunction) {
  if (process.env.WHATSAPP_REQUIRE_AUTH === 'true') return requireAuth(req, res, next);
  return authOpcional(req, res, next);
}
