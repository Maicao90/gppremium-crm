# Caixa de Entrada: filtro por atendente (número compartilhado) + datas — Design

**Data:** 2026-07-10
**Status:** Aprovado pelo usuário

## 1. Problema

Vários atendentes compartilham o mesmo número de WhatsApp (`Usuario.whatsappDonoId`) — ex.: Ana Paula e Marina no Feirão. Na Caixa de Entrada do painel, filtrar qualquer uma delas mostra a MESMA inbox do dono da conexão, tudo misturado. Além disso, as mensagens só mostram a hora (HH:MM), sem data — em conversas longas não se sabe de que dia é cada mensagem.

## 2. Decisões (com o usuário)

- **Regra do filtro:** automática, **por quem respondeu** — a conversa "é" do atendente que mandou a **última resposta** nela. Sem atribuição manual (YAGNI).
- Conversas sem nenhuma resposta atribuível → grupo **"Sem atendente"**.
- **Datas:** separadores de dia na conversa (Hoje / Ontem / dd/mm/aaaa) + data na prévia da lista de conversas. Hora continua na bolha.

## 3. Fontes de atribuição (já existem — sem mudança de schema)

1. `Mensagem.enviadoPorId` — gravado quando a mensagem sai **pelo painel** (inbox.ts /enviar, /enviar-midia).
2. **Assinatura da extensão** — mensagens digitadas no WhatsApp Web começam com `*Nome:*\n` (content.tsx injeta; ligada por padrão). Parse: `/^\*(.+?):\*/` no texto de mensagens `fromMe`, casando com `Usuario.nome` (trim, case-insensitive) dos atendentes daquela conexão (dono + compartilhantes).
3. Mensagem de cliente não tem dono; a **conversa** herda o dono da última resposta atribuível.

**Limite conhecido:** assinatura desligada/renomeada (ex.: "Aninha") → conversa cai em "Sem atendente". Mitigação operacional: manter assinatura = nome do cadastro.

## 4. Backend (`routes/inbox.ts`)

`GET /conversas` ganha param opcional **`atendenteId`** (além de `usuarioId`):
- Nova query (raw, mesmo padrão): última mensagem `fromMe=true` por `chatJid` com `texto` + `enviadoPorId`.
- Monta mapa nome→id dos atendentes da conexão efetiva (dono + `whatsappDonoId = dono`).
- Atribuição por conversa: `enviadoPorId` se houver; senão parse da assinatura; senão `null`.
- Cada conversa retorna `atendenteId` e `atendenteNome` (novos campos).
- Se `atendenteId` vier na query: filtra server-side. Valor especial `sem` = só não-atribuídas. Sem o param = todas (comportamento atual).
- Escopo por loja do gerente (Fase 2) permanece intacto (`permiteAtendente` continua no `usuarioId` da conexão).

## 5. Frontend (`pages/AtInbox.jsx`)

- **Filtro:** quando a conexão selecionada é compartilhada (ou dona de compartilhamento), aparece um seletor: **Todas do número · <cada atendente> · Sem atendente**, que passa `atendenteId` pro backend.
- **Etiqueta:** cada conversa na lista mostra chip com `atendenteNome` (ou "—" se sem atendente).
- **Datas:**
  - Separador de dia entre mensagens quando muda o dia: "Hoje", "Ontem", ou `dd/mm/aaaa`.
  - Bolha continua com HH:MM; `title` com data+hora completa.
  - Prévia da lista: hoje → HH:MM; ontem → "Ontem"; antes → dd/mm.

## 6. Sem mudanças

Schema/banco, extensão, fluxo dos atendentes, socket. Deploy: backend (restart com boot-test) + frontend (build estático).
