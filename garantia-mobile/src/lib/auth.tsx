// Contexto de autenticação do app. Dois tipos de login:
//  - LOJA (mecânico/vendedor): usa o MESMO login do CRM (/api/usuarios/login).
//  - CLIENTE: CPF + senha (/api/garantia-app/cliente/login|registrar).
import React, { createContext, useContext, useEffect, useState } from 'react';
import { api, salvarToken, lerToken, limparToken } from './api';

export type Identidade =
  | { tipo: 'loja'; nome: string; role: string; lojaId: string | null; modulos: string[] }
  | { tipo: 'cliente'; id: string; nome: string; cpf: string };

type AuthCtx = {
  carregando: boolean;
  identidade: Identidade | null;
  loginLoja: (email: string, senha: string) => Promise<void>;
  loginCliente: (cpf: string, senha: string) => Promise<void>;
  registrarCliente: (dados: { nome: string; cpf: string; telefone: string; email: string; senha: string; nascimento?: string }) => Promise<void>;
  sair: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);
const IDENT_KEY = 'gp_garantia_identidade';

// A identidade (quem é) também vai pro storage, ao lado do token, pra reabrir o app já logado.
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
const storeIdent = {
  async get(): Promise<Identidade | null> {
    try {
      const raw = Platform.OS === 'web' ? globalThis.localStorage?.getItem(IDENT_KEY) : await SecureStore.getItemAsync(IDENT_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  },
  async set(v: Identidade | null) {
    const raw = v ? JSON.stringify(v) : '';
    if (Platform.OS === 'web') { try { v ? globalThis.localStorage?.setItem(IDENT_KEY, raw) : globalThis.localStorage?.removeItem(IDENT_KEY); } catch {} return; }
    if (v) await SecureStore.setItemAsync(IDENT_KEY, raw); else await SecureStore.deleteItemAsync(IDENT_KEY);
  },
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [carregando, setCarregando] = useState(true);
  const [identidade, setIdentidade] = useState<Identidade | null>(null);

  useEffect(() => {
    (async () => {
      const [tok, ident] = await Promise.all([lerToken(), storeIdent.get()]);
      if (tok && ident) setIdentidade(ident);
      setCarregando(false);
    })();
  }, []);

  const definir = async (token: string, ident: Identidade) => {
    await salvarToken(token);
    await storeIdent.set(ident);
    setIdentidade(ident);
  };

  const loginLoja = async (email: string, senha: string) => {
    const r = await api<any>('/api/usuarios/login', { method: 'POST', body: { email, senha }, token: null });
    const u = r.usuario || r;
    let modulos = u.modulosPermitidos;
    if (typeof modulos === 'string') { try { modulos = JSON.parse(modulos); } catch { modulos = []; } }
    await definir(r.token, { tipo: 'loja', nome: u.nome, role: u.role, lojaId: u.lojaId || null, modulos: Array.isArray(modulos) ? modulos : [] });
  };

  const loginCliente = async (cpf: string, senha: string) => {
    const r = await api<any>('/api/garantia-app/cliente/login', { method: 'POST', body: { cpf, senha }, token: null });
    await definir(r.token, { tipo: 'cliente', id: r.cliente.id, nome: r.cliente.nome, cpf: r.cliente.cpf });
  };

  const registrarCliente: AuthCtx['registrarCliente'] = async (dados) => {
    const r = await api<any>('/api/garantia-app/cliente/registrar', { method: 'POST', body: dados, token: null });
    await definir(r.token, { tipo: 'cliente', id: r.cliente.id, nome: r.cliente.nome, cpf: r.cliente.cpf });
  };

  const sair = async () => {
    await limparToken();
    await storeIdent.set(null);
    setIdentidade(null);
  };

  return (
    <Ctx.Provider value={{ carregando, identidade, loginLoja, loginCliente, registrarCliente, sair }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth(): AuthCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth fora do AuthProvider');
  return c;
}
