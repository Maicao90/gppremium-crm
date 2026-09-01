import jwt from 'jsonwebtoken';

// Lê o segredo NA HORA DE USAR (não no load do módulo): os imports rodam antes do
// dotenv.config() em server.ts, então ler no topo pegaria JWT_SECRET vazio.
const segredo = (): string => process.env.JWT_SECRET || '';

export interface TokenPayload {
  sub: string;          // usuario.id
  role: string;         // master | admin | gerente | operador
  lojaId: string | null;
  modulos: string[];    // ids de modulo permitidos
}

export const assinarToken = (p: TokenPayload): string => {
  const s = segredo();
  if (!s) throw new Error('JWT_SECRET não configurado no servidor.');
  return jwt.sign(p, s, { expiresIn: '12h' });
};

export const verificarToken = (token: string): TokenPayload | null => {
  const s = segredo();
  if (!s || !token) return null;
  try {
    const d = jwt.verify(token, s) as any;
    return { sub: String(d.sub), role: String(d.role), lojaId: d.lojaId ?? null, modulos: Array.isArray(d.modulos) ? d.modulos : [] };
  } catch {
    return null;
  }
};
