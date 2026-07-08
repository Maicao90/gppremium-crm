# Login + Controle de Acesso (RBAC) + Isolamento por Loja — Design

**Data:** 2026-07-08
**Autor:** Maicon + Claude
**Status:** Aprovado (design) — pronto para plano de implementação

---

## 1. Objetivo

Adicionar ao painel GP Premium CRM:

1. **Tela de login** na frente de tudo (hoje o painel abre direto, sem barreira).
2. **Usuário master** (o dono, Maicon) que vê e faz tudo.
3. **Criação de usuários** pelo master, escolhendo **quais módulos** cada um acessa e **qual loja** ele enxerga.
4. **Isolamento por loja de verdade**: um "gerente" vê **apenas** os módulos de WhatsApp e **apenas** os dados (atendentes, agendamentos, conversas, métricas) **da própria loja** — nunca de outra loja, nem forçando a API.

O isolamento é **enforced no servidor** (decisão do usuário), não apenas escondido na tela.

### Não-objetivos (YAGNI)
- Não há auto-cadastro público / signup. Só o master cria usuários.
- Não há recuperação de senha por e-mail nesta fase (o master redefine a senha de um usuário).
- Não há multi-empresa/CNPJ agora (uma empresa "GP Premium", várias lojas). O escopo é **por loja**. Fica extensível a empresa no futuro.
- Gerente é **somente leitura** no WhatsApp (não cria/edita atendentes; isso é só do master).

---

## 2. Estado atual (levantado no código)

- **Sem autenticação real.** Existe `POST /api/usuarios/login` (`backend/src/routes/usuarios.ts:8-35`) que retorna o objeto do usuário, mas:
  - Senhas em **texto puro** (`usuario.senha !== senha`), sem hash.
  - **Sem token/sessão/cookie.** Chamadas seguintes não carregam credencial.
  - **Nenhuma rota `/api/*` é protegida.** Não há middleware de auth. CORS `*`.
  - Seed admin: `admin@crm.com` / `admin123`, role `admin` (`server.ts:266-283`).
- **Frontend sem gate.** `crm-de-anuncios` abre em `<Shell />` (`src/App.jsx:48-54`); `currentView` (contexto) decide a página via cadeia `&&` (`App.jsx:29-40`). Avatar "MB" é hardcoded (`TopBar.jsx:106-120`). Os dois helpers de fetch (`AppContext.jsx` `API`, `atendimento/api.js` `api`) **não mandam token**.
- **Dois mundos de dados:**
  - **Anúncios:** `Empresa → Loja (company_id) → Campanha (company_id)`, `ConexaoAds (company_id)`. Chaveado por empresa; leituras hoje **não** filtram (retornam tudo).
  - **WhatsApp/atendimento:** `Usuario → Agendamento (criadoPorId)`, `Mensagem (usuarioId)`, `Contato (usuarioId)`. **Sem coluna de empresa/loja.** O único elo com loja é `Usuario.lojaId` (string, nullable, **sem** `@relation`) → `Loja.company_id`.
- **Módulos (ids):** `dashboard`, `stores`, `contas`, `linkbio`, `otimizador`, `at-dashboard` (Métricas), `at-atendentes`, `at-inbox`, `assistant`, `settings`.
- **Extensão do Chrome** (atendentes de WhatsApp) também fala com o backend (`/api/usuarios/login`, socket, `/api/inbox/*`). **Enforce de auth afeta a extensão** — ver §8 (rollout).

---

## 3. Modelo de papéis e permissões

Reusa a tabela `Usuario`. Papéis (`role`, string):

| role | Login no painel? | Módulos | Escopo de dados |
|---|---|---|---|
| `master` (ou `admin`) | Sim | Todos | Todas as lojas |
| `gerente` | Sim | Só os que o master marcar (padrão: WhatsApp) | 1 loja (`lojaId`) |
| `operador` | Não (usa extensão) | — | 1 loja (atendente) |

- **Permissão de módulo por usuário**: novo campo `modulosPermitidos` (JSON array de ids de módulo) em `Usuario`. Master ignora (tem tudo). Gerente = o que o master marcar; atalho "Gerente" pré-marca `['at-dashboard','at-atendentes','at-inbox']`.
- **Escopo por loja**: `Usuario.lojaId` (já existe). Gerente tem 1 loja; master tem `null` (= todas). (Suporte a "várias lojas por usuário" fica como extensão simples: trocar `lojaId` por lista — **fora do escopo agora**, usuário confirmou 1 loja por gerente.)

---

## 4. Autenticação (Fase 1)

### 4.1 Senhas
- Adicionar **bcrypt** (`bcryptjs`, puro JS — evita build nativo na VPS).
- **Migração**: script/rotina que, para cada `Usuario` com senha não-hash, gera o hash e substitui. Detecção: se `senha` não começa com `$2` (prefixo bcrypt), tratar como texto puro (migrar no boot uma vez, ou no próximo login válido).
- Master define a **própria senha no primeiro acesso** (fluxo "primeira senha") — nunca digitada no chat. Se preferir, o master pode manter `admin123` só até o primeiro login e ser forçado a trocar.

### 4.2 Token
- Login válido emite um **JWT** assinado (`jsonwebtoken`), com `{ sub: usuario.id, role, lojaId, modulos }`, expiração (ex.: 12h) — **stateless**, sem tabela de sessão.
- Segredo em **variável de ambiente** (`JWT_SECRET`), **nunca** commitado (respeita a dívida técnica de segredo vazado já registrada).
- `POST /api/usuarios/login` passa a retornar `{ token, usuario }` (retro-compatível: mantém `usuario`).

### 4.3 Frontend
- **Tela de login** (`Login.jsx`) — usa o design escuro atual, logo oficial. Campos e-mail + senha.
- Guardar `token` + `usuario` no `localStorage` (`gp_token`, `gp_user`).
- `App.jsx`: se não há token válido → renderiza `<Login />`; senão `<Shell />`. Logout limpa storage.
- Injetar `Authorization: Bearer <token>` nos **dois** helpers (`AppContext.jsx` `API`, `atendimento/api.js` `api`) e nos `fetch()` crus (`Dashboard.jsx`, `AtInbox.jsx` mídia). Em `401` → desloga.
- `TopBar` mostra o usuário real (nome/role) em vez de "MB" hardcoded.

### 4.4 Backend — middleware de auth
- `requireAuth`: lê `Authorization: Bearer`, valida o JWT, carrega `req.user` (id, role, lojaId, modulos). Sem token válido → `401`.
- **Exceções públicas** (sem auth): `POST /api/usuarios/login`, health check `/`, e as páginas públicas de link-na-bio (`middlewares/paginaLinkPublica.ts` e assets `/anuncios`, `/docs-conectar-ads`). Socket.IO: validar token no handshake.

---

## 5. Gate de módulos (Fase 1)

### 5.1 Frontend
- `Sidebar.jsx` (`grupos`) e `App.jsx` (cadeia de render) filtram por `usuario.modulosPermitidos` (master = tudo). Derivar de **uma fonte** (um mapa de módulos) pra manter os dois em sincronia.
- Módulo não permitido: some do menu **e** a rota não renderiza (fallback pro primeiro módulo permitido).

### 5.2 Backend (mapa módulo → rotas)
`requireModulo(modId)` protege cada rota. Mapa:

| Módulo | Rotas backend |
|---|---|
| dashboard | `/api/empresas` (GET), `/api/campanhas` (GET), `/api/integracoes/desempenho`, `/api/integracoes/metricas` |
| stores | `/api/lojas`, `/api/empresas` |
| contas | `/api/contas` |
| linkbio | `/api/paginalinks` |
| otimizador | `/api/otimizador`, `/api/integracoes` |
| at-dashboard | `/api/usuarios/metricas`, `/api/agendamentos/grafico` |
| at-atendentes | `/api/usuarios` (GET, **read-only** pra gerente) |
| at-inbox | `/api/inbox/*` |
| assistant | `/api/ia` |
| settings + gestão de usuários (**master only**) | `/api/configuracoes`, `/api/usuarios` (POST/PUT/DELETE) |

Gerente com módulos WhatsApp **não** acessa Anúncios: `/api/empresas`, `/api/lojas`, `/api/campanhas`, `/api/contas`, `/api/integracoes`, `/api/otimizador`, `/api/paginalinks`, `/api/ia`, `/api/configuracoes`, e escrita em `/api/usuarios` → `403`.

---

## 6. Gestão de usuários (Fase 1, master only)

- Tela **"Usuários / Acessos"** (ou seção em Configurações), visível só pro master.
- Lista todos os usuários com role, loja e módulos.
- Criar/editar: `nome`, `email`, `senha` (inicial), `role` (`gerente`/`operador`/`master`), `lojaId`, `modulosPermitidos` (checkboxes). Atalho "Gerente" pré-preenche módulos WhatsApp.
- A tela **Atendentes** (WhatsApp) existente continua pro master gerenciar atendentes/conexão; o gerente vê a lista da loja dele em modo leitura.
- Endpoints: reusar/estender `POST /api/usuarios/cadastrar`, `PUT/DELETE /api/usuarios/:id` — todos sob `requireAuth` + `role === master`.

---

## 7. Isolamento por loja no WhatsApp (Fase 2)

Enforced no servidor, derivando o escopo do **token** (nunca de query param do cliente).

### 7.1 O elo (sem mudar tabelas de agendamento/conversa)
- Loja de um dado WhatsApp = loja do atendente dono:
  - `Agendamento.loja` = `Agendamento.criadoPor(Usuario).lojaId`
  - `Mensagem.loja` = `Mensagem.usuario(Usuario).lojaId`
  - `Contato.loja` = `Contato.usuario(Usuario).lojaId`
- Pré-requisito: **todo atendente precisa ter `lojaId`**. Passo de dados: garantir que os atendentes atuais estejam com a loja marcada (o master já organizou por loja).

### 7.2 Escopo por endpoint (quando `req.user.role === 'gerente'`)
- Derivar `atendentesDaLoja = Usuario.findMany({ where: { lojaId: req.user.lojaId } }).map(id)`.
- `/api/usuarios` (GET, Atendentes): retornar só `atendentesDaLoja`.
- `/api/usuarios/metricas`: agregar só `atendentesDaLoja`.
- `/api/agendamentos` (GET/grafico): `where.criadoPorId in atendentesDaLoja` (ignora `criadoPorId` do cliente). PUT/DELETE: validar que o agendamento pertence à loja → senão `403`.
- `/api/inbox/conversas|mensagens`: validar que o `usuarioId` pedido ∈ `atendentesDaLoja` → senão `403`. Reconciliar com `resolverConexaoEfetiva` (conexões compartilhadas).
- Master (`lojaId` null): sem filtro (vê tudo), como hoje.

### 7.3 Wrinkle: WhatsApp compartilhado
- `Usuario.whatsappDonoId` faz mensagens viverem sob o dono da sessão. Se atendentes de lojas diferentes compartilharem conexão, o escopo deve considerar a loja do **dono efetivo**. Regra: um atendente só pode ser dono/compartilhar dentro da mesma loja. Documentar e validar no cadastro (master). Caso raro; tratar defensivamente (escopar pela loja do dono efetivo).

---

## 8. Rollout e risco (não derrubar o WhatsApp)

- **Extensão do Chrome**: hoje fala com `/api/inbox/*`, socket e `/api/usuarios/login` **sem token**. Ligar `requireAuth` nessas rotas **quebraria a extensão** até ela ser atualizada (rebuild + Web Store + atendentes atualizarem).
  - **Estratégia**: Fase 1 liga `requireAuth` + gate nas rotas **do painel** (Anúncios, gestão de usuários) e no próprio painel (deploy junto → painel manda token). A extensão recebe o token no login (resposta passa a incluir `token`) e é atualizada pra mandar `Authorization`/handshake.
  - Enquanto a nova extensão não estiver 100% distribuída, as rotas de WhatsApp usadas pela extensão ficam num **modo de transição**: aceitam token (novo) **ou** o comportamento atual, com log de quem ainda não manda token. A **Fase 2** (escopo por loja) só "fecha" essas rotas depois que a extensão atualizada estiver confirmada — evitando janela de quebra.
- **Deploy**: seguir o padrão do projeto — validar `prisma generate` + `tsc` + **boot-test com `ts-node` em porta separada** antes de reiniciar produção (regra crítica registrada: `tsc --noEmit` não basta). Frontend estático não reinicia servidor.
- **Migração de senha** roda uma vez; idempotente (hash já feito é ignorado).
- **JWT_SECRET** setado na VPS via env (`ecosystem.config.js`/env), fora do git.

---

## 9. Mudanças de schema (Prisma)

`model Usuario`:
- `role`: passa a aceitar `master`/`admin`/`gerente`/`operador` (continua String; sem enum pra não migrar dados).
- `+ modulosPermitidos String @default("[]")` — JSON array de ids de módulo.
- `lojaId`: mantém (escopo). (Opcional futuro: formalizar `@relation` com `Loja`.)
- `+ senhaAlterada Boolean @default(false)` (opcional) — pra forçar troca da senha inicial no 1º login.

Sem mudança em `Agendamento`/`Mensagem`/`Contato` (isolamento via join por `Usuario.lojaId`).

---

## 10. Faseamento

- **Fase 1 — Login + acessos** (entrega o núcleo pedido):
  1. bcrypt + migração de senhas + `JWT_SECRET`.
  2. Login emite token; `requireAuth` + exceções públicas; socket handshake.
  3. Frontend: tela de login, storage do token, injeção do header, gate de módulos (menu + render), TopBar com usuário real, logout.
  4. Backend: `requireModulo` nas rotas do painel; escrita de usuários só master.
  5. Tela "Usuários" (master) com módulos + loja; atalho "Gerente".
  6. Extensão: login guarda token e passa a mandá-lo (modo transição nas rotas WhatsApp).
- **Fase 2 — Isolamento por loja no WhatsApp**:
  1. Garantir `lojaId` em todos os atendentes.
  2. Escopo por loja em `/api/usuarios` (GET), `/metricas`, `/api/agendamentos*`, `/api/inbox/*`, derivado do token.
  3. Fechar o modo de transição depois da extensão atualizada.

Cada fase: validada (boot-test) e no ar antes da próxima, sem downtime do WhatsApp.

---

## 11. Riscos / pontos de atenção
- Quebra da extensão se o enforce nas rotas de WhatsApp for ligado antes de a extensão mandar token → mitigado pelo **modo de transição** (§8).
- Atendente sem `lojaId` fica "órfão" no escopo (não aparece pra nenhum gerente) → passo de dados na Fase 2 + validação no cadastro.
- Conexão de WhatsApp compartilhada entre lojas diferentes vaza escopo → regra "compartilhar só dentro da loja" + escopo pelo dono efetivo.
- `JWT_SECRET` vazado = tokens forjáveis → env only, rotacionável.
