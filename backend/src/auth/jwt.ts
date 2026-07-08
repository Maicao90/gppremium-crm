import jwt from 'jsonwebtoken';

const SEGREDO = process.env.JWT_SECRET || '';
if (!SEGREDO) {
  // Falha cedo e claro se o segredo não estiver setado (evita tokens forjáveis).
  console.warn('[auth] ATENCAO: JWT_SECRET nao definido — login vai falhar ate ser setado.');
}

export interface TokenPayload {
  sub: string;          // usuario.id
  role: string;         // master | admin | gerente | operador
  lojaId: string | null;
  modulos: string[];    // ids de modulo permitidos
}

export const assinarToken = (p: TokenPayload): string =>
  jwt.sign(p, SEGREDO, { expiresIn: '12h' });

export const verificarToken = (token: string): TokenPayload | null => {
  if (!SEGREDO) return null;
  try {
    const d = jwt.verify(token, SEGREDO) as any;
    return { sub: String(d.sub), role: String(d.role), lojaId: d.lojaId ?? null, modulos: Array.isArray(d.modulos) ? d.modulos : [] };
  } catch {
    return null;
  }
};
