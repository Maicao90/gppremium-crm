# Login + RBAC (Fase 1) — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Colocar login com usuário master, criação de usuários com permissão por módulo, e bloqueio de módulos enforced no servidor — sem quebrar a extensão do WhatsApp.

**Architecture:** Login emite JWT (stateless). Middleware `requireAuth` valida o token e popula `req.user`; `requireModulo` barra rotas de módulos que o usuário não tem. Frontend guarda token no localStorage, injeta `Authorization: Bearer` em todo fetch, e filtra menu/rotas pela lista de módulos do usuário. Rotas usadas pela extensão do WhatsApp ficam em "modo transição" (aceitam com ou sem token) até a extensão nova rodar.

**Tech Stack:** Backend Express + TypeScript + Prisma + Postgres (ts-node em prod). Frontend Vite + React (JSX). Auth: `bcryptjs` + `jsonwebtoken`.

**Verificação (padrão do projeto — não há jest):** cada tarefa é validada por (a) `npx tsc --noEmit` filtrando os 2 erros TS6059 pré-existentes, (b) boot-test `PORT=398x npx ts-node --prefer-ts-exts --project tsconfig.json src/server.ts` até imprimir "Servidor rodando", (c) `curl` no endpoint com saída esperada, e/ou (d) verificação no preview do frontend.

---

## Arquivos (mapa)

**Backend (`gppremium-crm/backend`):**
- Create `src/auth/jwt.ts` — assinar/verificar JWT, tipos do payload.
- Create `src/auth/senha.ts` — hash/verify bcrypt + detecção de senha legada (texto puro).
- Create `src/middlewares/requireAuth.ts` — valida token, popula `req.user`.
- Create `src/middlewares/requireModulo.ts` — barra por módulo/role.
- Create `src/auth/modulos.ts` — fonte única do mapa de módulos (ids) + quais rotas exigem qual módulo.
- Modify `prisma/schema.prisma` — `Usuario.modulosPermitidos`, `Usuario.senhaAlterada`.
- Modify `src/routes/usuarios.ts` — login com hash+token; cadastro/edição com `modulosPermitidos`+`lojaId`+`role` (master only).
- Modify `src/server.ts` — montar middlewares, exceções públicas, handshake do socket, migração de senhas no boot.

**Frontend (`crm-de-anuncios/src`):**
- Create `config/modulos.js` — fonte única (id, label, grupo) dos módulos do painel.
- Create `context/AuthContext.jsx` — usuário logado, token, login(), logout().
- Create `pages/Login.jsx` — tela de login.
- Create `pages/Usuarios.jsx` — gestão de usuários (master only).
- Modify `atendimento/api.js` e `context/AppContext.jsx` — injetar `Authorization`, tratar 401.
- Modify `App.jsx` — gate Login/Shell.
- Modify `components/Sidebar.jsx` — menu filtrado por módulos, item "Usuários".
- Modify `components/TopBar.jsx` — usuário real + botão sair.

**Extensão (`extension`):** guardar token do login e mandar `Authorization` nos fetches + handshake do socket.

---

## Task 1: Utilitário de senha (bcrypt) com suporte a senha legada

**Files:**
- Create: `gppremium-crm/backend/src/auth/senha.ts`
- Modify: `gppremium-crm/backend/package.json` (dep `bcryptjs`)

- [ ] **Step 1: Instalar dependência**

Run (em `gppremium-crm/backend`): `npm install bcryptjs @types/bcryptjs`
Expected: adiciona `bcryptjs` a `dependencies`.

- [ ] **Step 2: Criar o utilitário**

```ts
// src/auth/senha.ts
import bcrypt from 'bcryptjs';

// Hash bcrypt sempre começa com "$2a$/$2b$/$2y$". Se não começar, é senha
// LEGADA (texto puro do sistema antigo) e deve ser migrada.
export const ehHash = (valor: string): boolean => /^\$2[aby]\$/.test(valor || '');

export const hashSenha = async (senha: string): Promise<string> => bcrypt.hash(senha, 10);

// Verifica aceitando tanto hash quanto senha legada (texto puro) durante a migração.
export const conferirSenha = async (senhaDigitada: string, senhaSalva: string): Promise<boolean> => {
  if (ehHash(senhaSalva)) return bcrypt.compare(senhaDigitada, senhaSalva);
  return senhaDigitada === senhaSalva; // legada: comparação direta (só até migrar)
};
```

- [ ] **Step 3: Validar compilação**

Run: `npx tsc --noEmit 2>&1 | grep -v "TS6059" | grep "src/auth/senha.ts"`
Expected: nenhuma saída (sem erros nesse arquivo).

- [ ] **Step 4: Commit**

```bash
git add src/auth/senha.ts package.json package-lock.json
git commit -m "feat(auth): utilitario de senha bcrypt com suporte a senha legada"
```

---

## Task 2: Utilitário JWT (assinar/verificar)

**Files:**
- Create: `gppremium-crm/backend/src/auth/jwt.ts`
- Modify: `gppremium-crm/backend/package.json` (dep `jsonwebtoken`)

- [ ] **Step 1: Instalar dependência**

Run: `npm install jsonwebtoken @types/jsonwebtoken`

- [ ] **Step 2: Criar o utilitário**

```ts
// src/auth/jwt.ts
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
  try { return jwt.verify(token, SEGREDO) as TokenPayload; }
  catch { return null; }
};
```

- [ ] **Step 3: Setar JWT_SECRET local pro boot-test**

Run: crie/edite `gppremium-crm/backend/.env` (que é gitignored) adicionando uma linha:
`JWT_SECRET=dev-secret-trocar-em-prod`
Expected: `.env` contém a linha. Confirmar que `.env` está no `.gitignore`.

- [ ] **Step 4: Validar compilação**

Run: `npx tsc --noEmit 2>&1 | grep -v "TS6059" | grep "src/auth/jwt.ts"`
Expected: nenhuma saída.

- [ ] **Step 5: Commit**

```bash
git add src/auth/jwt.ts package.json package-lock.json
git commit -m "feat(auth): utilitario JWT (assinar/verificar) com segredo em env"
```

---

## Task 3: Fonte única dos módulos + mapa módulo→rota (backend)

**Files:**
- Create: `gppremium-crm/backend/src/auth/modulos.ts`

- [ ] **Step 1: Criar o mapa**

```ts
// src/auth/modulos.ts
// Ids de modulo do painel (batem com os do frontend).
export const MODULOS = [
  'dashboard', 'stores', 'contas', 'linkbio', 'otimizador',
  'at-dashboard', 'at-atendentes', 'at-inbox', 'assistant', 'settings',
] as const;
export type ModuloId = typeof MODULOS[number];

// Atalho: modulos do "gerente" (so WhatsApp).
export const MODULOS_GERENTE: ModuloId[] = ['at-dashboard', 'at-atendentes', 'at-inbox'];

// Roles que enxergam tudo (ignoram modulosPermitidos e escopo de loja).
export const ROLES_MASTER = ['master', 'admin'];
export const ehMaster = (role: string): boolean => ROLES_MASTER.includes(role);
```

- [ ] **Step 2: Validar compilação e commit**

Run: `npx tsc --noEmit 2>&1 | grep -v "TS6059" | grep "src/auth/modulos.ts"`
Expected: nenhuma saída.

```bash
git add src/auth/modulos.ts
git commit -m "feat(auth): fonte unica dos ids de modulo + atalho gerente"
```

---

## Task 4: Schema Prisma — campos de permissão no Usuario

**Files:**
- Modify: `gppremium-crm/backend/prisma/schema.prisma` (model Usuario, ~linha 13-43)

- [ ] **Step 1: Adicionar campos**

No `model Usuario`, adicionar (depois de `lojaId`):

```prisma
  modulosPermitidos String  @default("[]") // JSON array de ids de modulo (master ignora)
  senhaAlterada     Boolean @default(false) // false = senha inicial, forcar troca no 1o login
```

- [ ] **Step 2: Gerar client + aplicar no banco**

Run: `npx prisma generate`
Run: `npx prisma db push`
Expected: colunas criadas; `prisma generate` sem erro.

- [ ] **Step 3: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(auth): campos modulosPermitidos e senhaAlterada no Usuario"
```

---

## Task 5: Login com hash + token; migração de senhas no boot

**Files:**
- Modify: `gppremium-crm/backend/src/routes/usuarios.ts` (handler `POST /login`, ~linha 8-35)
- Modify: `gppremium-crm/backend/src/server.ts` (rotina de migração no boot, perto do seed ~266-283)

- [ ] **Step 1: Reescrever o handler de login**

Substituir o handler `router.post('/login', ...)` em `usuarios.ts` por:

```ts
import { conferirSenha } from '../auth/senha';
import { assinarToken } from '../auth/jwt';
import { ehMaster } from '../auth/modulos';
// ... dentro do router:
router.post('/login', async (req, res) => {
  const { email, senha } = req.body;
  if (!email || !senha) return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
  const usuario = await prisma.usuario.findUnique({ where: { email: String(email).toLowerCase().trim() } });
  if (usuario && !usuario.ativo) return res.status(401).json({ error: 'Usuário inativo.' });
  if (!usuario || !(await conferirSenha(String(senha), usuario.senha))) {
    return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
  }
  const modulos: string[] = (() => { try { return JSON.parse(usuario.modulosPermitidos || '[]'); } catch { return []; } })();
  const token = assinarToken({ sub: usuario.id, role: usuario.role, lojaId: usuario.lojaId || null, modulos });
  const { senha: _, ...usuarioDados } = usuario;
  res.json({ token, usuario: usuarioDados });
});
```

- [ ] **Step 2: Migração de senhas no boot (uma vez, idempotente)**

Em `server.ts`, perto do seed do admin, adicionar antes do `app.listen`:

```ts
import { ehHash, hashSenha } from './auth/senha';
async function migrarSenhas() {
  const legadas = await prisma.usuario.findMany({ where: { NOT: { senha: { startsWith: '$2' } } } });
  for (const u of legadas) {
    if (u.senha) await prisma.usuario.update({ where: { id: u.id }, data: { senha: await hashSenha(u.senha) } });
  }
  if (legadas.length) console.log(`[auth] ${legadas.length} senha(s) migrada(s) para hash.`);
}
// chamar dentro do bootstrap async existente: await migrarSenhas();
```

- [ ] **Step 3: Boot-test + verificar login retorna token**

Run: `npx tsc --noEmit 2>&1 | grep -v "TS6059"` → Expected: sem erros novos.
Run: `set PORT=3985 && npx ts-node --prefer-ts-exts --project tsconfig.json src/server.ts` (ou `PORT=3985 npx ...` no bash) → Expected: imprime "Servidor rodando" + "senha(s) migrada(s)".
Em outro terminal: `curl -sk -X POST https://127.0.0.1:3985/api/usuarios/login -H "Content-Type: application/json" -d "{\"email\":\"admin@crm.com\",\"senha\":\"admin123\"}"`
Expected: JSON com `token` (string longa) e `usuario`. Repetir o login → ainda funciona (senha já migrada, agora via bcrypt).

- [ ] **Step 4: Commit**

```bash
git add src/routes/usuarios.ts src/server.ts
git commit -m "feat(auth): login com bcrypt+JWT e migracao de senhas legadas no boot"
```

---

## Task 6: Middleware requireAuth + exceções públicas + socket handshake

**Files:**
- Create: `gppremium-crm/backend/src/middlewares/requireAuth.ts`
- Modify: `gppremium-crm/backend/src/server.ts` (montagem dos routers ~135-144; socket ~200-236)

- [ ] **Step 1: Criar o middleware**

```ts
// src/middlewares/requireAuth.ts
import { Request, Response, NextFunction } from 'express';
import { verificarToken, TokenPayload } from '../auth/jwt';

declare global { namespace Express { interface Request { user?: TokenPayload } } }

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  const payload = token ? verificarToken(token) : null;
  if (!payload) return res.status(401).json({ error: 'Não autenticado.' });
  req.user = payload;
  next();
}

// Modo transição: popula req.user se houver token válido, mas NÃO bloqueia se não houver.
// Usado nas rotas que a extensão do WhatsApp ainda chama sem token (até ela atualizar).
export function authOpcional(req: Request, _res: Response, next: NextFunction) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  const payload = token ? verificarToken(token) : null;
  if (payload) req.user = payload;
  next();
}
```

- [ ] **Step 2: Montar no server (exceções públicas)**

Em `server.ts`, aplicar `requireAuth` só nas rotas do painel; login e públicos ficam de fora. As rotas usadas pela extensão (`/api/inbox`, `/api/agendamentos`, `/api/contatos`, e `/api/usuarios` só nos GET usados por ela) usam `authOpcional` nesta fase:

```ts
import { requireAuth, authOpcional } from './middlewares/requireAuth';
// públicas: '/', '/api/usuarios/login', '/anuncios', '/docs-conectar-ads', link-na-bio (já tratados)
app.use('/api/empresas', requireAuth, /* requireModulo aplicado na Task 7 */);
app.use('/api/lojas', requireAuth);
app.use('/api/campanhas', requireAuth);
app.use('/api/contas', requireAuth);
app.use('/api/integracoes', requireAuth);
app.use('/api/otimizador', requireAuth);
app.use('/api/paginalinks', requireAuth);
app.use('/api/ia', requireAuth);
app.use('/api/configuracoes', requireAuth);
// transição (extensão): não quebra quem ainda não manda token
app.use('/api/inbox', authOpcional);
app.use('/api/agendamentos', authOpcional);
app.use('/api/contatos', authOpcional);
```
> Obs: como os routers de anúncios (`/empresas`,`/lojas`,`/campanhas`,`/contas`) hoje vêm de `crmAnuncios.ts` montado num único `app.use('/api', ...)`, aplicar `requireAuth` por-rota exige montar cada um com seu path OU adicionar um guard interno no `crmAnuncios.ts`. Escolher: mover o mount pra paths específicos com `requireAuth` (preferido) ou um `router.use(requireAuth)` dentro de `crmAnuncios.ts` deixando os GET públicos de link fora.

- [ ] **Step 3: Handshake do socket com token**

No `io.on('connection'...)` / middleware `io.use`, validar token do handshake:

```ts
io.use((socket, next) => {
  const token = socket.handshake.auth?.token as string | undefined;
  const payload = token ? verificarToken(token) : null;
  // transição: aceita sem token também; se tiver, guarda pra escopo futuro (Fase 2)
  (socket.data as any).user = payload || null;
  next();
});
```

- [ ] **Step 4: Boot-test + verificar 401 sem token e 200 com token**

Boot na porta 3985. Depois:
Run: `curl -sk -o /dev/null -w "%{http_code}" https://127.0.0.1:3985/api/campanhas` → Expected: `401`.
Run pegar token: login (Task 5 curl) e copiar o `token`.
Run: `curl -sk -o /dev/null -w "%{http_code}" -H "Authorization: Bearer <TOKEN>" https://127.0.0.1:3985/api/campanhas` → Expected: `200`.
Run: `curl -sk -o /dev/null -w "%{http_code}" https://127.0.0.1:3985/api/inbox/conversas?usuarioId=x` → Expected: `200` (modo transição, não bloqueia).

- [ ] **Step 5: Commit**

```bash
git add src/middlewares/requireAuth.ts src/server.ts
git commit -m "feat(auth): requireAuth nas rotas do painel + authOpcional (transicao) + socket handshake"
```

---

## Task 7: requireModulo + gestão de usuários (master only)

**Files:**
- Create: `gppremium-crm/backend/src/middlewares/requireModulo.ts`
- Modify: `gppremium-crm/backend/src/server.ts` (aplicar requireModulo)
- Modify: `gppremium-crm/backend/src/routes/usuarios.ts` (cadastro/edição com modulos+loja+role; guard master)

- [ ] **Step 1: Criar requireModulo + requireMaster**

```ts
// src/middlewares/requireModulo.ts
import { Request, Response, NextFunction } from 'express';
import { ehMaster } from '../auth/modulos';

export const requireModulo = (mod: string) => (req: Request, res: Response, next: NextFunction) => {
  const u = req.user;
  if (!u) return res.status(401).json({ error: 'Não autenticado.' });
  if (ehMaster(u.role)) return next();
  if (Array.isArray(u.modulos) && u.modulos.includes(mod)) return next();
  return res.status(403).json({ error: 'Sem acesso a este módulo.' });
};

export const requireMaster = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) return res.status(401).json({ error: 'Não autenticado.' });
  if (!ehMaster(req.user.role)) return res.status(403).json({ error: 'Apenas o administrador.' });
  next();
};
```

- [ ] **Step 2: Aplicar requireModulo nas rotas do painel**

Em `server.ts`, encadear o módulo em cada mount (exemplos):
`app.use('/api/campanhas', requireAuth, requireModulo('dashboard'))`,
`app.use('/api/contas', requireAuth, requireModulo('contas'))`,
`app.use('/api/integracoes', requireAuth, requireModulo('otimizador'))`,
`app.use('/api/otimizador', requireAuth, requireModulo('otimizador'))`,
`app.use('/api/paginalinks', requireAuth, requireModulo('linkbio'))`,
`app.use('/api/ia', requireAuth, requireModulo('assistant'))`.
(As rotas WhatsApp em `authOpcional` NÃO ganham requireModulo nesta fase — escopo/gate delas é Fase 2.)

- [ ] **Step 3: Cadastro/edição de usuário (master only, com módulos+loja+role)**

Em `usuarios.ts`, proteger e estender. No mount do router em server.ts as escritas passam por `requireMaster`. No handler `POST /cadastrar` (e `PUT /:id`), aceitar e salvar:

```ts
import { hashSenha } from '../auth/senha';
// no corpo aceitar: { nome, email, senha, role, lojaId, modulosPermitidos }
const dados: any = {
  nome, email: String(email).toLowerCase().trim(), role: role || 'gerente',
  lojaId: lojaId || null,
  modulosPermitidos: JSON.stringify(Array.isArray(modulosPermitidos) ? modulosPermitidos : []),
};
if (senha) dados.senha = await hashSenha(String(senha)); // já entra como hash
// prisma.usuario.create({ data: dados }) / update
```
Guard no server: `app.use('/api/usuarios', authOpcional, usuariosRouter)` e, dentro de `usuarios.ts`, aplicar `requireMaster` só nos métodos de escrita (`router.post('/cadastrar', requireMaster, ...)`, `router.put('/:id', requireMaster, ...)`, `router.delete('/:id', requireMaster, ...)`). O `POST /login` continua público; os GET ficam em `authOpcional` (transição p/ extensão + gerente lê no painel).

- [ ] **Step 4: Boot-test + verificar 403 pra não-master e 200 pra master**

Boot 3985. Criar um gerente via master:
Run: `curl -sk -X POST https://127.0.0.1:3985/api/usuarios/cadastrar -H "Authorization: Bearer <TOKEN_MASTER>" -H "Content-Type: application/json" -d "{\"nome\":\"Gerente Feirao\",\"email\":\"feirao@gp.com\",\"senha\":\"123456\",\"role\":\"gerente\",\"lojaId\":\"<ID_LOJA_FEIRAO>\",\"modulosPermitidos\":[\"at-dashboard\",\"at-atendentes\",\"at-inbox\"]}"`
Expected: `200`/usuário criado.
Login como esse gerente → pega TOKEN_GERENTE.
Run: `curl -sk -o /dev/null -w "%{http_code}" -H "Authorization: Bearer <TOKEN_GERENTE>" https://127.0.0.1:3985/api/campanhas` → Expected: `403` (gerente não tem módulo dashboard).
Run: `curl -sk -o /dev/null -w "%{http_code}" -X POST -H "Authorization: Bearer <TOKEN_GERENTE>" https://127.0.0.1:3985/api/usuarios/cadastrar -d '{}'` → Expected: `403` (não é master).

- [ ] **Step 5: Commit**

```bash
git add src/middlewares/requireModulo.ts src/server.ts src/routes/usuarios.ts
git commit -m "feat(auth): requireModulo nas rotas do painel + gestao de usuarios master-only"
```

---

## Task 8: Frontend — AuthContext + injeção de token nos fetches

**Files:**
- Create: `crm-de-anuncios/src/context/AuthContext.jsx`
- Modify: `crm-de-anuncios/src/atendimento/api.js`
- Modify: `crm-de-anuncios/src/context/AppContext.jsx` (helper `API`)
- Modify: `crm-de-anuncios/src/main.jsx` (envolver com AuthProvider)

- [ ] **Step 1: Criar AuthContext**

```jsx
// src/context/AuthContext.jsx
import { createContext, useContext, useState, useCallback } from 'react';
import { API_BASE } from '../apiBase';

const AuthContext = createContext();
const readUser = () => { try { return JSON.parse(localStorage.getItem('gp_user') || 'null'); } catch { return null; } };

export const AuthProvider = ({ children }) => {
  const [token, setToken] = useState(() => localStorage.getItem('gp_token') || '');
  const [usuario, setUsuario] = useState(readUser);

  const login = useCallback(async (email, senha) => {
    const r = await fetch(API_BASE + '/api/usuarios/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, senha }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'Falha no login.');
    localStorage.setItem('gp_token', j.token); localStorage.setItem('gp_user', JSON.stringify(j.usuario));
    setToken(j.token); setUsuario(j.usuario);
    return j.usuario;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('gp_token'); localStorage.removeItem('gp_user');
    setToken(''); setUsuario(null);
  }, []);

  return <AuthContext.Provider value={{ token, usuario, login, logout }}>{children}</AuthContext.Provider>;
};
export const useAuth = () => useContext(AuthContext);
export const getToken = () => localStorage.getItem('gp_token') || '';
```

- [ ] **Step 2: Injetar Authorization + tratar 401 nos dois helpers**

Em `src/atendimento/api.js`, incluir o header e deslogar em 401:

```js
import { getToken } from '../context/AuthContext';
export async function api(path, opts = {}) {
  const token = getToken();
  const r = await fetch(API_BASE + path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(opts.headers || {}) },
  });
  if (r.status === 401) { localStorage.removeItem('gp_token'); localStorage.removeItem('gp_user'); location.reload(); }
  // ...resto igual (throw em !ok, retorno)...
}
```
Fazer o mesmo no helper `API` de `AppContext.jsx` (linhas 8-12).

- [ ] **Step 3: Envolver o app com AuthProvider**

Em `main.jsx`, envolver `<App />` com `<AuthProvider>` (por fora do AppProvider).

- [ ] **Step 4: Verificar no preview**

Reload no preview. `eval`: `localStorage.getItem('gp_token')` → `null` (ainda não logou). Nenhum erro no console.

- [ ] **Step 5: Commit (frontend)**

```bash
git add src/context/AuthContext.jsx src/atendimento/api.js src/context/AppContext.jsx src/main.jsx
git commit -m "feat(auth): AuthContext + injecao de token Bearer nos fetches + logout em 401"
```

---

## Task 9: Frontend — fonte única de módulos + tela de Login

**Files:**
- Create: `crm-de-anuncios/src/config/modulos.js`
- Create: `crm-de-anuncios/src/pages/Login.jsx`

- [ ] **Step 1: Config de módulos (bate com o backend)**

```js
// src/config/modulos.js
export const GRUPOS_MODULOS = [
  { titulo: 'Anúncios', itens: [
    { id: 'dashboard', label: 'Dashboard' }, { id: 'stores', label: 'Lojas' },
    { id: 'contas', label: 'Saldos' }, { id: 'linkbio', label: 'Link na Bio' },
    { id: 'otimizador', label: 'Otimizador' } ] },
  { titulo: 'Atendimento (WhatsApp)', itens: [
    { id: 'at-dashboard', label: 'Métricas' }, { id: 'at-atendentes', label: 'Atendentes' },
    { id: 'at-inbox', label: 'Caixa de Entrada' } ] },
  { titulo: 'Central', itens: [ { id: 'assistant', label: 'Assistente IA', destaque: true } ] },
];
export const MODULOS_GERENTE = ['at-dashboard', 'at-atendentes', 'at-inbox'];
export const ROLES_MASTER = ['master', 'admin'];
export const podeVer = (usuario, id) => {
  if (!usuario) return false;
  if (ROLES_MASTER.includes(usuario.role)) return true;
  let mods = usuario.modulosPermitidos;
  if (typeof mods === 'string') { try { mods = JSON.parse(mods); } catch { mods = []; } }
  return Array.isArray(mods) && mods.includes(id);
};
```

- [ ] **Step 2: Tela de login (design escuro + logo oficial)**

```jsx
// src/pages/Login.jsx
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState(''); const [senha, setSenha] = useState('');
  const [erro, setErro] = useState(''); const [carregando, setCarregando] = useState(false);
  const enviar = async (e) => {
    e.preventDefault(); setErro(''); setCarregando(true);
    try { await login(email.trim(), senha); } catch (err) { setErro(err.message); } finally { setCarregando(false); }
  };
  return (
    <div className="login-shell">
      <form className="login-card card" onSubmit={enviar}>
        <img className="login-logo" src={`${import.meta.env.BASE_URL}logo-premium.png`} alt="GP Premium" />
        <h1 className="login-titulo">Entrar no painel</h1>
        <div className="form-group"><label className="form-label">E-mail</label>
          <input className="input-field" type="email" autoComplete="username" value={email} onChange={(e)=>setEmail(e.target.value)} required /></div>
        <div className="form-group"><label className="form-label">Senha</label>
          <input className="input-field" type="password" autoComplete="current-password" value={senha} onChange={(e)=>setSenha(e.target.value)} required /></div>
        {erro && <p className="login-erro">{erro}</p>}
        <button className="btn btn-primary" style={{ width: '100%', marginTop: 8 }} disabled={carregando}>{carregando ? 'Entrando…' : 'Entrar'}</button>
      </form>
    </div>
  );
}
```
Adicionar CSS (`index.css`): `.login-shell` (flex center, min-height 100dvh, fundo escuro), `.login-card` (max-width 380px, centralizado), `.login-logo` (max-width 220px, margin auto), `.login-erro` (cor danger).

- [ ] **Step 3: Verificar no preview** (só compila; a montagem é na Task 10).

Run: build/HMR sem erro; nenhum import quebrado.

- [ ] **Step 4: Commit**

```bash
git add src/config/modulos.js src/pages/Login.jsx src/index.css
git commit -m "feat(auth): config unica de modulos + tela de login (design escuro, logo oficial)"
```

---

## Task 10: Frontend — gate Login/Shell, menu filtrado, TopBar com sair

**Files:**
- Modify: `crm-de-anuncios/src/App.jsx`
- Modify: `crm-de-anuncios/src/components/Sidebar.jsx`
- Modify: `crm-de-anuncios/src/components/TopBar.jsx`

- [ ] **Step 1: Gate no App.jsx**

Em `App.jsx`, usar `useAuth`: se `!usuario` renderiza `<Login />`; senão `<Shell />`. Além disso, na cadeia de render, só renderizar a página se `podeVer(usuario, id)`; se `currentView` não é permitido, cair no primeiro módulo permitido.

```jsx
import { useAuth } from './context/AuthContext';
import Login from './pages/Login';
import { podeVer, GRUPOS_MODULOS } from './config/modulos';
// dentro do App (fora do AppProvider ou dentro, mas AuthProvider por fora):
const { usuario } = useAuth();
if (!usuario) return <Login />;
// ...Shell normal, mas guardado por podeVer...
```

- [ ] **Step 2: Sidebar filtrada + item "Usuários" (master)**

`Sidebar.jsx` passa a montar `grupos` a partir de `GRUPOS_MODULOS`, filtrando itens por `podeVer(usuario, item.id)` e escondendo grupos vazios. Adicionar, só pra master, um item "Usuários" (id `usuarios`) no grupo Central ou no rodapé. Ícone via lucide (`Users`/`ShieldCheck`).

- [ ] **Step 3: TopBar com usuário real + Sair**

`TopBar.jsx`: trocar "MB"/"Maicon Batista"/"Administrador" hardcoded por `usuario.nome` + label do role; iniciais derivadas do nome. Adicionar botão "Sair" que chama `logout()`.

- [ ] **Step 4: Verificar no preview (fluxo completo)**

- Sem token → aparece a tela de Login. `eval` confirma `<Login>` na tela.
- Logar como master (admin@crm.com) → entra, menu mostra tudo.
- `eval` simulando gerente: setar `gp_user` com role gerente + `modulosPermitidos:["at-dashboard","at-atendentes","at-inbox"]`, reload → menu mostra só Métricas/Atendentes/Caixa de Entrada; Dashboard some; abrir `dashboard` via localStorage cai no primeiro permitido.
- Botão Sair → volta pro Login.

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx src/components/Sidebar.jsx src/components/TopBar.jsx
git commit -m "feat(auth): gate login/shell + menu filtrado por modulo + topbar com usuario real e sair"
```

---

## Task 11: Frontend — tela de gestão de usuários (master)

**Files:**
- Create: `crm-de-anuncios/src/pages/Usuarios.jsx`
- Modify: `crm-de-anuncios/src/App.jsx` (render do view `usuarios`)

- [ ] **Step 1: Tela Usuarios.jsx**

Lista usuários (`api('/api/usuarios')`), mostra nome/email/role/loja/módulos. Modal "Novo/Editar usuário" com: nome, email, senha (inicial), role (`gerente`/`master`), loja (`data.stores`), e **checkboxes de módulos** (de `GRUPOS_MODULOS`). Botão atalho "Gerente" marca `MODULOS_GERENTE` e some os de anúncios. Salvar → `POST /api/usuarios/cadastrar` ou `PUT /api/usuarios/:id`. Reaproveitar classes de modal/formulário existentes (`.modal`, `.input-field`, `.form-group`).

- [ ] **Step 2: Render no App.jsx**

`currentView === 'usuarios' && podeVer(usuario,'settings') && <Usuarios />` (ou guard por master). Só master vê o item no menu (Task 10).

- [ ] **Step 3: Verificar no preview**

Logado como master: abrir "Usuários", criar um gerente do Feirão (marca só WhatsApp + loja Feirão), salvar; confirmar na lista. `curl`/network mostra `201/200`. Logar como esse gerente → só WhatsApp aparece.

- [ ] **Step 4: Commit**

```bash
git add src/pages/Usuarios.jsx src/App.jsx
git commit -m "feat(auth): tela de gestao de usuarios (master) com modulos + loja + atalho gerente"
```

---

## Task 12: Extensão — guardar e enviar o token (modo transição)

**Files:**
- Modify: `extension/` (o código que faz login e os fetches/socket — localizar o que chama `/api/usuarios/login` e `/api/inbox`, e o socket)

- [ ] **Step 1: Guardar token no login**

Onde a extensão chama `/api/usuarios/login`, ler `j.token` da resposta (agora `{ token, usuario }`) e salvar em `chrome.storage.local` (`gp_token`). Fallback: se a resposta não tiver `token` (backend antigo), seguir como hoje.

- [ ] **Step 2: Enviar Authorization nos fetches + handshake**

Em todo fetch pro backend, incluir `Authorization: Bearer <gp_token>` quando existir. No `io(...)` do socket, passar `{ auth: { token } }` no handshake.

- [ ] **Step 3: Build da extensão**

Run (em `extension`): o build de produção do projeto (ex.: `npm run build` → `build/chrome-mv3-prod`).
Expected: zip/pasta gerada sem erro.

- [ ] **Step 4: Verificar (backend em transição não quebra)**

Com o backend rodando com `authOpcional` nas rotas de WhatsApp: a extensão **sem** token ainda funciona (200); a extensão **com** token também. Confirmar nos logs que o `authOpcional` não bloqueia.

- [ ] **Step 5: Commit**

```bash
git add extension/
git commit -m "feat(auth): extensao guarda e envia o token (compat: funciona com backend antigo)"
```

---

## Task 13: Deploy da Fase 1 (sem downtime do WhatsApp)

**Files:** nenhum novo — deploy dos dois repos + build do frontend + env na VPS.

- [ ] **Step 1: Setar JWT_SECRET na VPS (fora do git)**

SSH: adicionar `JWT_SECRET` (valor forte, aleatório) no ambiente do processo — em `ecosystem.config.js` (`env`) ou `.env` do backend na VPS. **Nunca** commitar o valor.
Expected: `pm2 env` / boot mostra o segredo presente.

- [ ] **Step 2: Build do frontend + copiar pro backend/public/anuncios**

Run: `VITE_API_BASE= npx vite build` em `crm-de-anuncios`; copiar `dist/assets/*` + `dist/index.html` (+ `logo-premium.png` já existe) pra `gppremium-crm/backend/public/anuncios/` (remover assets antigos).

- [ ] **Step 3: Validar e commitar os dois repos**

`npx tsc --noEmit` (backend) sem erros novos; `prisma generate`. Commit+push front e back.

- [ ] **Step 4: Deploy na VPS + boot-test em porta separada**

SSH: `cd /root/whatsapp-crm && git fetch origin -q && git checkout origin/main -- <arquivos backend + public/anuncios>`; `npx prisma generate` e `npx prisma db push` (novos campos); boot-test: `PORT=3986 JWT_SECRET=... npx ts-node --prefer-ts-exts --project tsconfig.json src/server.ts` até "Servidor rodando" + migração de senhas. Só então `pm2 restart ecosystem.config.js --update-env` e `pm2 save`.

- [ ] **Step 5: Verificar produção**

- `curl -sk https://127.0.0.1:3001/` → 200 (health).
- `curl` login master → recebe token.
- `curl` `/api/campanhas` sem token → 401; com token master → 200; com token gerente → 403.
- `curl` `/api/inbox/conversas?usuarioId=...` sem token → 200 (transição; extensão intacta).
- Abrir o painel externo, logar como master, conferir menu completo; criar gerente; logar como gerente e ver só WhatsApp.
- Confirmar WhatsApp dos atendentes conectado (extensão) — sem queda. `pm2` uptime novo mas WhatsApp reconecta.

- [ ] **Step 6: Fechar**

`pm2 save`. Anotar na memória (`gp-crm-*`) que a Fase 1 (login+RBAC) está no ar e que a **Fase 2** (isolamento por loja no WhatsApp) fecha o `authOpcional` depois da extensão nova distribuída.

---

## Self-review (cobertura da spec)

- §4 Auth (bcrypt+JWT+middleware+frontend token) → Tasks 1,2,5,6,8. ✅
- §5 Gate de módulos (front+back) → Tasks 3,7,9,10. ✅
- §6 Gestão de usuários master → Tasks 7,11. ✅
- §8 Rollout/extensão (transição) → Tasks 6 (authOpcional), 12, 13. ✅
- §9 Schema → Task 4. ✅
- Migração de senhas → Task 5. ✅
- §7 Isolamento por loja (Fase 2) → **fora deste plano** (próximo plano). ✅ (intencional)

**Nota:** os passos de "verificação" usam boot-test + curl + preview (padrão do projeto), no lugar de testes unitários, porque não há test runner instalado — introduzir um está fora do escopo da Fase 1.
