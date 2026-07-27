// Cliente de API do app — fala com o backend REAL do CRM (não é mais o localhost morto).
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

export const API_BASE = 'https://crm.nailacademyprofissional.com';

// Armazenamento do token: SecureStore no aparelho, localStorage no web (SecureStore
// não existe no navegador).
const storage = {
  async get(key: string): Promise<string | null> {
    if (Platform.OS === 'web') { try { return globalThis.localStorage?.getItem(key) ?? null; } catch { return null; } }
    return SecureStore.getItemAsync(key);
  },
  async set(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web') { try { globalThis.localStorage?.setItem(key, value); } catch {} return; }
    await SecureStore.setItemAsync(key, value);
  },
  async del(key: string): Promise<void> {
    if (Platform.OS === 'web') { try { globalThis.localStorage?.removeItem(key); } catch {} return; }
    await SecureStore.deleteItemAsync(key);
  },
};

const TOKEN_KEY = 'gp_garantia_token';
export const salvarToken = (t: string) => storage.set(TOKEN_KEY, t);
export const lerToken = () => storage.get(TOKEN_KEY);
export const limparToken = () => storage.del(TOKEN_KEY);

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

// Chamada genérica. Injeta o Bearer token guardado (se houver) ou um explícito.
export async function api<T = any>(
  path: string,
  opts: { method?: string; body?: any; token?: string | null } = {},
): Promise<T> {
  const token = opts.token !== undefined ? opts.token : await lerToken();
  const resp = await fetch(API_BASE + path, {
    method: opts.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
  });
  if (resp.status === 204) return null as T;
  let json: any = null;
  try { json = await resp.json(); } catch { /* corpo vazio */ }
  if (!resp.ok) throw new ApiError(resp.status, json?.error || `Erro ${resp.status}`);
  return json as T;
}
