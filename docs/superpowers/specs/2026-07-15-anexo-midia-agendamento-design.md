# Anexo de mídia no agendamento de mensagens — GP Premium CRM

**Data:** 2026-07-15
**Status:** Design aprovado pelo usuário

## Objetivo
Permitir **anexar foto, vídeo, áudio e documento** a um agendamento de mensagem, para
o WhatsApp disparar a mídia na hora agendada. Recorrência (repetir a cada X dias, N
vezes) fica para uma **fase posterior** — este spec cobre só a mídia.

## Comportamento aprovado
- **Tipos:** imagem (jpg/png), vídeo (mp4), áudio (mp3/ogg → enviado como **mensagem de
  voz / PTT**, bolha redonda), documento (pdf etc.).
- **Origem:** upload do computador (file picker na extensão).
- **Limite:** 16 MB por arquivo (ajustável).
- **Texto = legenda** da foto/vídeo. Em áudio/documento (WhatsApp não aceita legenda),
  o texto vai como **mensagem separada logo após** a mídia.
- **Envio novo:** arquivo enviado na hora certa como mensagem nova — **sem etiqueta
  "encaminhada", sem marca de agendado** (chega como envio ao vivo).
- **Sem mídia = texto puro** (comportamento atual 100% preservado).

## 1. Banco — modelo `Agendamento` (3 campos novos, aditivos/opcionais)
- `tipo         String  @default("texto")` — texto | imagem | video | audio | documento
- `midiaUrl     String?` — caminho no disco (ex: `/midias/agendamentos/<uuid>.jpg`)
- `midiaNome    String?` — nome original do arquivo (documento exibir certo)

Migração aditiva → agendamentos antigos seguem funcionando (tipo default "texto").

## 2. Servidor (Express + Baileys)
### Upload
- **`POST /api/agendamentos/upload`** (multipart via `multer`, limite 16 MB). Salva em
  `backend/public/midias/agendamentos/<uuid>.<ext>`, valida o mime (imagem/vídeo/áudio/
  pdf/doc), devolve `{ midiaUrl, tipo, midiaNome }`.
- A criação do agendamento (`POST /api/agendamentos`) passa a aceitar `midiaUrl`, `tipo`,
  `midiaNome` (opcionais) no JSON.
### Envio (worker que dispara o agendamento)
Lê o arquivo do disco pelo `midiaUrl` e manda conforme o `tipo`:
- **texto** → `sendMessage(jid, { text: mensagem })` (atual)
- **imagem** → `sendMessage(jid, { image: buffer, caption: mensagem })`
- **video** → `sendMessage(jid, { video: buffer, caption: mensagem })`
- **audio** → `sendMessage(jid, { audio: buffer, mimetype: 'audio/ogg; codecs=opus', ptt: true })`;
  se houver `mensagem`, `sendMessage(jid, { text: mensagem })` em seguida
- **documento** → `sendMessage(jid, { document: buffer, fileName: midiaNome, mimetype })`;
  se houver `mensagem`, `sendMessage(jid, { text: mensagem })` em seguida
### Limpeza
- Ao marcar o agendamento como enviado/cancelado/falhou-final, apaga o arquivo de
  `/midias/agendamentos/` (try/catch — nunca derruba o envio).

## 3. Extensão (`ModalAgendamento.tsx`)
- Botão **📎 Anexar** → `<input type="file" accept="image/*,video/*,audio/*,.pdf,...">`.
- Ao escolher: **prévia** (miniatura de imagem; ícone + nome para vídeo/áudio/doc) +
  botão **remover (X)**.
- O campo de texto permanece; com mídia presente vira "Legenda (opcional)".
- Ao agendar: se há arquivo, **`POST /upload` primeiro** → recebe `{ midiaUrl, tipo,
  midiaNome }` → inclui no `POST` de criação do agendamento.
- Validação client-side: tamanho ≤ 16 MB e tipo aceito (erro amigável).

## Fora do escopo desta fase
- **Recorrência** (repetir a cada X dias, N vezes).
- Áudio **gravado na hora** (só upload de arquivo por enquanto).

## Riscos / cuidados
- Baileys já baixa mídia recebida (`downloadMediaMessage`); pro envio usa `sendMessage`
  com buffer — padrão suportado.
- `multer` é dependência nova no backend (leve, comum).
- Servir `/midias` precisa de `express.static` — **verificar se já existe** (as mensagens
  recebidas já usam `midiaUrl`, então provavelmente sim).
- Isolamento por loja: o `midiaUrl` pertence ao agendamento, que já é escopado por loja.
