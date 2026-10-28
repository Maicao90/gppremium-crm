import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// ===== Entrar com Apple / Google (app do cliente, 1.1.4) =====
// Verifica o idToken (JWT RS256) com as chaves PÚBLICAS do provedor (JWKS), sem pacote
// externo: JWK -> crypto.KeyObject (Node nativo). Confere assinatura, iss, aud e exp.
//   Apple : JWKS https://appleid.apple.com/auth/keys, iss https://appleid.apple.com,
//           aud = APPLE_CLIENT_IDS (padrão com.gppremium.garantia)
//   Google: JWKS https://www.googleapis.com/oauth2/v3/certs, iss accounts.google.com
//           (ou https://accounts.google.com), aud ∈ GOOGLE_CLIENT_IDS (.env, separados por vírgula)
// Vínculo provedor+sub -> clienteId em data/garantia-login-social.json (sem mudar o banco).
//
// LABORATÓRIO: GARANTIA_JWKS_TESTE (JSON da JWKS ou caminho de um arquivo) troca as chaves
// dos DOIS provedores por uma chave de teste — SÓ é lida quando NODE_ENV === 'lab'. Em
// produção (NODE_ENV=production) a variável é ignorada, mesmo se existir.

export type Provedor = 'apple' | 'google';
export const PROVEDORES: Provedor[] = ['apple', 'google'];

const JWKS_URL: Record<Provedor, string> = {
  apple: 'https://appleid.apple.com/auth/keys',
  google: 'https://www.googleapis.com/oauth2/v3/certs',
};
const ISS: Record<Provedor, string[]> = {
  apple: ['https://appleid.apple.com'],
  google: ['accounts.google.com', 'https://accounts.google.com'],
};
const listaEnv = (v: string | undefined) => String(v || '').split(',').map((s) => s.trim()).filter(Boolean);
const audiencias = (p: Provedor): string[] =>
  p === 'apple' ? listaEnv(process.env.APPLE_CLIENT_IDS || 'com.gppremium.garantia') : listaEnv(process.env.GOOGLE_CLIENT_IDS);

export class TokenSocialInvalido extends Error {}

// ---------- Chaves (JWKS) ----------
type Jwks = { keys: any[] };
const cache: Partial<Record<Provedor, { em: number; jwks: Jwks }>> = {};
const VALIDADE_CACHE_MS = 6 * 3600 * 1000;
const REBUSCA_MIN_MS = 60 * 1000; // kid desconhecido: rebusca no máx. 1x/min (rotação de chave)

let avisouTeste = false;
function jwksDeTeste(): Jwks | null {
  if (process.env.NODE_ENV !== 'lab') return null;
  const v = String(process.env.GARANTIA_JWKS_TESTE || '').trim();
  if (!v) return null;
  try {
    const j = JSON.parse(v.startsWith('{') ? v : fs.readFileSync(v, 'utf8'));
    if (!avisouTeste) { avisouTeste = true; console.warn('[loginSocial] LAB: usando JWKS de TESTE (GARANTIA_JWKS_TESTE)'); }
    return j && Array.isArray(j.keys) ? j : null;
  } catch {
    return null;
  }
}

async function buscarJwks(p: Provedor): Promise<Jwks> {
  const r = await fetch(JWKS_URL[p], { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`JWKS ${p} respondeu ${r.status}`);
  const j: any = await r.json();
  if (!j || !Array.isArray(j.keys)) throw new Error(`JWKS ${p} inválida`);
  cache[p] = { em: Date.now(), jwks: j };
  return j;
}

async function chavePublica(p: Provedor, kid: string): Promise<crypto.KeyObject | null> {
  const teste = jwksDeTeste();
  let jwks: Jwks;
  if (teste) jwks = teste;
  else {
    const c = cache[p];
    jwks = c && Date.now() - c.em < VALIDADE_CACHE_MS ? c.jwks : await buscarJwks(p);
    if (!jwks.keys.some((k) => k.kid === kid) && Date.now() - (cache[p]?.em || 0) > REBUSCA_MIN_MS) jwks = await buscarJwks(p);
  }
  const jwk = jwks.keys.find((k) => k.kid === kid && k.kty === 'RSA');
  if (!jwk) return null;
  return crypto.createPublicKey({ key: { kty: 'RSA', n: jwk.n, e: jwk.e }, format: 'jwk' });
}

// ---------- Verificação do idToken ----------
const b64json = (s: string) => JSON.parse(Buffer.from(s, 'base64url').toString('utf8'));

export type IdentidadeSocial = { provedor: Provedor; sub: string; email: string; emailVerificado: boolean; nome: string };

export async function verificarIdToken(provedor: Provedor, idToken: string): Promise<IdentidadeSocial> {
  const partes = String(idToken || '').split('.');
  if (partes.length !== 3) throw new TokenSocialInvalido('formato');
  const [h, pl, sig] = partes as [string, string, string];
  let header: any, claims: any;
  try { header = b64json(h); claims = b64json(pl); } catch { throw new TokenSocialInvalido('base64'); }
  if (header?.alg !== 'RS256' || !header?.kid) throw new TokenSocialInvalido('alg');
  const chave = await chavePublica(provedor, String(header.kid)); // erro de rede sobe (vira 503)
  if (!chave) throw new TokenSocialInvalido('kid');
  const ok = crypto.verify('RSA-SHA256', Buffer.from(`${h}.${pl}`), chave, Buffer.from(sig, 'base64url'));
  if (!ok) throw new TokenSocialInvalido('assinatura');
  if (!ISS[provedor].includes(String(claims.iss))) throw new TokenSocialInvalido('iss');
  const auds = audiencias(provedor);
  const aud = Array.isArray(claims.aud) ? claims.aud.map(String) : [String(claims.aud)];
  if (!auds.length || !aud.some((a: string) => auds.includes(a))) throw new TokenSocialInvalido('aud');
  const agora = Math.floor(Date.now() / 1000);
  if (typeof claims.exp !== 'number' || claims.exp < agora - 60) throw new TokenSocialInvalido('exp');
  if (typeof claims.iat === 'number' && claims.iat > agora + 300) throw new TokenSocialInvalido('iat');
  if (!claims.sub) throw new TokenSocialInvalido('sub');
  return {
    provedor,
    sub: String(claims.sub),
    email: String(claims.email || '').trim().toLowerCase(),
    emailVerificado: claims.email_verified === true || claims.email_verified === 'true',
    nome: String(claims.name || '').trim(),
  };
}

// ---------- Vínculos (data/garantia-login-social.json) ----------
export type Vinculo = { provedor: Provedor; sub: string; clienteId: string; email: string; criadoEm: string };
const ARQUIVO = path.join(__dirname, '../../data/garantia-login-social.json');

function lerVinculos(): Vinculo[] {
  try {
    const j = JSON.parse(fs.readFileSync(ARQUIVO, 'utf8'));
    return Array.isArray(j?.vinculos) ? j.vinculos : [];
  } catch {
    return [];
  }
}
function gravarVinculos(vinculos: Vinculo[]): void {
  fs.mkdirSync(path.dirname(ARQUIVO), { recursive: true });
  const tmp = ARQUIVO + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify({ vinculos }, null, 2));
  fs.renameSync(tmp, ARQUIVO);
}

export const acharVinculo = (provedor: Provedor, sub: string): Vinculo | null =>
  lerVinculos().find((v) => v.provedor === provedor && v.sub === sub) || null;
export const vinculosDoCliente = (clienteId: string): Vinculo[] => lerVinculos().filter((v) => v.clienteId === clienteId);

export function salvarVinculo(v: { provedor: Provedor; sub: string; clienteId: string; email: string }): void {
  const todos = lerVinculos().filter((x) => !(x.provedor === v.provedor && x.sub === v.sub));
  todos.push({ ...v, criadoEm: new Date().toISOString() });
  gravarVinculos(todos);
}
export function removerVinculosDoCliente(clienteId: string): number {
  const todos = lerVinculos();
  const resto = todos.filter((v) => v.clienteId !== clienteId);
  if (resto.length !== todos.length) gravarVinculos(resto);
  return todos.length - resto.length;
}
export function removerVinculo(provedor: Provedor, sub: string): void {
  const todos = lerVinculos();
  const resto = todos.filter((v) => !(v.provedor === provedor && v.sub === sub));
  if (resto.length !== todos.length) gravarVinculos(resto);
}
