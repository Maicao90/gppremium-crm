# Fluxo determinístico de medida/preço — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar a decisão livre da IA na parte de medida→preço do Bot Pneus por um fluxo determinístico: código decide o estado e consulta a tabela real; uma IA de escopo estreito só extrai o que o cliente quis dizer (formulário fixo, nunca texto livre); código monta a ação com o número já certo; a trava de preço existente continua como segurança final.

**Architecture:** 3 camadas por mensagem — (1) filtro barato em código decide se vale chamar a IA extratora; (2) IA extratora devolve JSON estrito (`intencao`, `medida_extraida`, `quantidade_extraida`, `escolha_alternativa`) via OpenAI Responses API com `json_schema` obrigatório; (3) motor de decisão em código puro (zero IA) consulta `TABELA_PRECOS_GP` e monta a resposta final usando as funções de formatação que já existem e já são aprovadas (`montarPartesPreco`, `alternativasMesmoAro`). Estado da conversa (medida confirmada? preço já dado?) fica salvo em `BotConversa`. Se a intenção for `PERGUNTA_TECNICA` ou `OUTRO_ASSUNTO`, nada disso roda — cai no caminho de IA livre de hoje.

**Tech Stack:** TypeScript, Prisma (Postgres), Express (bot-service isolado na porta 3010), OpenAI Responses API (`/v1/responses` com `text.format.type: 'json_schema'`), Baileys (whatsapp-crm — não é tocado neste plano além de um reload após a migration).

**Simplificação em relação à spec aprovada:** a spec previa uma 3ª camada de IA ("redatora") só pra escrever a frase final em cima da ação pronta. Ao ler o código existente, achei que `montarPartesPreco()` e o texto de `alternativasMesmoAro()` já produzem frases naturais, no formato de 2 bolhas que o próprio dono pediu explicitamente em uma sessão anterior (05/09) — não foram eles que geraram a reclamação de "robótico" (essa foi sobre o bot despejar uma lista genérica de preços por aro, coisa que não existe mais nesse fluxo). Por isso a Camada 3 fica **de fora deste plano**: a resposta final usa esses textos determinísticos diretamente, sem nenhuma chamada de IA depois da extração. Isso corta uma chamada de IA por mensagem (custo/latência) e elimina de vez qualquer risco de a IA reescrever um número — exatamente o critério de sucesso #1. Se depois de usar em produção o texto parecer repetitivo, um plano futuro pode adicionar a camada de redação por cima disto sem mexer nas camadas 1 e 2.

---

## File Structure

- **Create:** `src/data/fluxoPreco.ts` — tipos do fluxo (`EstadoPrecoFluxo`, `DadosPrecoFluxo`, `IntencaoExtraida`, `AcaoPreco`) + o motor de decisão puro `decidirAcaoPreco()`. Sem I/O, sem IA — 100% testável sem rede.
- **Create:** `src/data/fluxoPrecoExtrator.ts` — a chamada à IA extratora (Camada 1). Único arquivo que fala com a OpenAI nesta feature.
- **Modify:** `src/data/tabelaPrecos.ts` — exportar `montarPartesPreco` (hoje privada), reaproveitada pelo motor.
- **Modify:** `prisma/schema.prisma` — 2 campos novos em `BotConversa`: `estadoPreco` e `dadosPreco`.
- **Modify:** `src/bot-service/server.ts` — em `/gerar-resposta`, antes do caminho livre de hoje, roda o pipeline novo; aceita `estadoPreco`/`dadosPreco` no corpo da requisição e devolve `novoEstadoPreco`/`novosDadosPreco` na resposta.
- **Modify:** `src/workers/botAtendimentoService.ts` — carrega o estado do banco antes de chamar o bot-service, manda no payload, salva o estado novo depois.
- **Test (scripts manuais, sem framework — este projeto não tem um configurado):** `src/data/fluxoPreco.manual-test.ts` (Camada 2, sem IA) e `src/data/fluxoPrecoExtrator.manual-test.ts` (Camada 1, IA de verdade) — seguem o mesmo padrão usado o dia inteiro nesta sessão (`npx ts-node --transpile-only arquivo.ts`, olha o OK/ERRO). Ficam no repositório (diferente dos scripts descartáveis de hoje) porque são a única rede de regressão que este fluxo vai ter.

---

## Task 1: Exportar `montarPartesPreco`

**Files:**
- Modify: `src/data/tabelaPrecos.ts:771`

- [ ] **Step 1: Trocar a assinatura da função de privada pra exportada**

Arquivo remoto: `/root/whatsapp-crm/backend/src/data/tabelaPrecos.ts`, linha 771 hoje é:
```ts
function montarPartesPreco(item: ItemPreco, parcelaSolicitada: number | null, quantidade: number | null): string[] {
```
Trocar para:
```ts
export function montarPartesPreco(item: ItemPreco, parcelaSolicitada: number | null, quantidade: number | null): string[] {
```

Comando (via SSH, técnica de patch por linha já usada o dia inteiro nesta sessão):
```bash
ssh -i ~/.ssh/vps_gppremium root@2.24.212.146 "cd /root/whatsapp-crm/backend && node -e \"
const fs=require('fs');
const F='src/data/tabelaPrecos.ts';
const raw=fs.readFileSync(F,'utf8');
const s=raw.replace(
  'function montarPartesPreco(item: ItemPreco, parcelaSolicitada: number | null, quantidade: number | null): string[] {',
  'export function montarPartesPreco(item: ItemPreco, parcelaSolicitada: number | null, quantidade: number | null): string[] {'
);
if (s === raw) { console.log('FALHOU: nao encontrou a linha'); process.exit(1); }
fs.writeFileSync(F, s, 'utf8');
console.log('OK: montarPartesPreco exportada');
\""
```

- [ ] **Step 2: Compilar pra confirmar que nada quebrou**

```bash
ssh -i ~/.ssh/vps_gppremium root@2.24.212.146 "cd /root/whatsapp-crm/backend && npx tsc --noEmit 2>&1 | grep -v 'npm notice'"
```
Esperado: nenhuma saída (compilação limpa).

- [ ] **Step 3: Commit**

```bash
ssh -i ~/.ssh/vps_gppremium root@2.24.212.146 "cd /root/whatsapp-crm/backend && git add src/data/tabelaPrecos.ts && git commit --author='Maicon <maiconbatn5@gmail.com>' -m 'Exporta montarPartesPreco pra reuso no fluxo deterministico de preco'"
```

---

## Task 2: Migration — estado do fluxo em `BotConversa`

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Adicionar os 2 campos no model `BotConversa`**

Estado hoje (`prisma/schema.prisma`):
```prisma
model BotConversa {
  id                 String    @id @default(uuid())
  usuarioId          String
  chatJid            String
  pausadoAte         DateTime?
  ultimoInboundWaId  String?
  ultimaRespostaEm   DateTime?
  motivoPausa        String?
  atualizadoEm       DateTime  @updatedAt
  criadoEm           DateTime  @default(now())

  @@unique([usuarioId, chatJid])
  @@index([usuarioId, atualizadoEm])
}
```

Novo (adiciona `estadoPreco` e `dadosPreco`, segue o padrão já usado no schema pra JSON-como-string, ex.: `ConexaoAds.credenciais`):
```prisma
model BotConversa {
  id                 String    @id @default(uuid())
  usuarioId          String
  chatJid            String
  pausadoAte         DateTime?
  ultimoInboundWaId  String?
  ultimaRespostaEm   DateTime?
  motivoPausa        String?
  // Fluxo deterministico de medida/preco (10/09). estadoPreco: sem_estado |
  // aguardando_medida | medida_sem_match | preco_confirmado. dadosPreco e JSON
  // serializado (medida, precoUnitario, aroSemMatch, alternativasOferecidas) —
  // guarda o que o fluxo ja decidiu, pra nao repetir pergunta nem inventar preco
  // diferente se o cliente perguntar de novo depois.
  estadoPreco        String?
  dadosPreco         String?
  atualizadoEm       DateTime  @updatedAt
  criadoEm           DateTime  @default(now())

  @@unique([usuarioId, chatJid])
  @@index([usuarioId, atualizadoEm])
}
```

Aplicar via SSH (mesma técnica de patch por linha):
```bash
ssh -i ~/.ssh/vps_gppremium root@2.24.212.146 "cd /root/whatsapp-crm/backend && node -e \"
const fs=require('fs');
const F='prisma/schema.prisma';
const raw=fs.readFileSync(F,'utf8');
const eol = raw.includes('\\r\\n') ? '\\r\\n' : '\\n';
const L=raw.split(/\\r\\n|\\n/);
const i=L.findIndex(l=>l.trim()===\\\"motivoPausa        String?\\\");
if(i===-1){console.log('FALHOU: linha motivoPausa nao encontrada');process.exit(1);}
L.splice(i+1,0,
  '  // Fluxo deterministico de medida/preco (10/09). estadoPreco: sem_estado |',
  '  // aguardando_medida | medida_sem_match | preco_confirmado. dadosPreco e JSON',
  '  // serializado (medida, precoUnitario, aroSemMatch, alternativasOferecidas) —',
  '  // guarda o que o fluxo ja decidiu, pra nao repetir pergunta nem inventar preco',
  '  // diferente se o cliente perguntar de novo depois.',
  '  estadoPreco        String?',
  '  dadosPreco         String?'
);
fs.writeFileSync(F,L.join(eol),'utf8');
console.log('OK: campos adicionados');
\""
```

- [ ] **Step 2: Rodar a migration (banco de produção — atenção)**

```bash
ssh -i ~/.ssh/vps_gppremium root@2.24.212.146 "cd /root/whatsapp-crm/backend && npx prisma migrate dev --name fluxo_preco_estado --create-only"
```
Ler o SQL gerado em `prisma/migrations/*_fluxo_preco_estado/migration.sql` antes de aplicar — tem que ser só `ALTER TABLE "BotConversa" ADD COLUMN "estadoPreco" TEXT, ADD COLUMN "dadosPreco" TEXT;` (colunas opcionais, sem default, sem risco de perda de dado). Se bater com isso, aplicar:
```bash
ssh -i ~/.ssh/vps_gppremium root@2.24.212.146 "cd /root/whatsapp-crm/backend && npx prisma migrate deploy && npx prisma generate"
```

- [ ] **Step 3: Compilar**

```bash
ssh -i ~/.ssh/vps_gppremium root@2.24.212.146 "cd /root/whatsapp-crm/backend && npx tsc --noEmit 2>&1 | grep -v 'npm notice'"
```
Esperado: nenhuma saída.

- [ ] **Step 4: Reload do whatsapp-crm (o Prisma Client mudou, o processo precisa pegar o client novo) — protocolo de segurança obrigatório**

```bash
ssh -i ~/.ssh/vps_gppremium root@2.24.212.146 "cd /root/whatsapp-crm/backend && PORT=3001 pm2 reload whatsapp-crm --update-env"
```
Esperar e confirmar estabilidade (nunca pular esta checagem):
```bash
ssh -i ~/.ssh/vps_gppremium root@2.24.212.146 "for i in \$(seq 1 10); do sleep 5; A=\$(pm2 logs whatsapp-crm --lines 300 --nostream 2>/dev/null | grep -c 'Conexão aberta'); S=\$(pm2 logs whatsapp-crm --lines 300 --nostream 2>/dev/null | grep -c 'sem sessão registrada'); echo \"[\$i] abertas=\$A semsessao=\$S\"; if [ \"\$A\" -ge 10 ] && [ \"\$S\" -eq 0 ]; then echo ESTAVEL; break; fi; done"
```
Só segue pro próximo task depois de ver `ESTAVEL`.

- [ ] **Step 5: Commit**

```bash
ssh -i ~/.ssh/vps_gppremium root@2.24.212.146 "cd /root/whatsapp-crm/backend && git add prisma/schema.prisma prisma/migrations && git commit --author='Maicon <maiconbatn5@gmail.com>' -m 'Migration: estadoPreco e dadosPreco em BotConversa (fluxo deterministico)'"
```

---

## Task 3: Camada 2 — motor de decisão puro (`fluxoPreco.ts`)

**Files:**
- Create: `src/data/fluxoPreco.ts`
- Test: `src/data/fluxoPreco.manual-test.ts`

- [ ] **Step 1: Escrever `src/data/fluxoPreco.ts`**

```ts
import { ItemPreco, encontrarPrecosExatosPorMedida, alternativasMesmoAro, montarPartesPreco } from './tabelaPrecos';

// FLUXO DETERMINISTICO DE MEDIDA/PRECO (10/09).
//
// Substitui a decisao livre da IA por: codigo consulta a tabela de precos de
// verdade e decide a acao. A IA (fluxoPrecoExtrator.ts) so entra pra ENTENDER a
// mensagem do cliente (formulario fixo, nunca texto livre) — nunca pra decidir
// o que responder nem pra gerar numero. Ver design em
// docs/superpowers/specs/2026-09-10-fluxo-preco-deterministico-design.md.

export type EstadoPrecoFluxo = 'sem_estado' | 'aguardando_medida' | 'medida_sem_match' | 'preco_confirmado';

export interface DadosPrecoFluxo {
  medida?: string;
  aroSemMatch?: string;
  alternativasOferecidas?: string[];
}

export type IntencaoTipo =
  | 'DAR_MEDIDA'
  | 'PERGUNTAR_PRECO_SEM_MEDIDA'
  | 'RESPONDER_QUANTIDADE'
  | 'ESCOLHER_ALTERNATIVA'
  | 'PERGUNTA_TECNICA'
  | 'OUTRO_ASSUNTO';

export interface IntencaoExtraida {
  intencao: IntencaoTipo;
  medidaExtraida: string | null;
  quantidadeExtraida: number | null;
  escolhaAlternativa: string | null;
}

export type AcaoPreco =
  | { tipo: 'PEDIR_MEDIDA'; partes: string[] }
  | { tipo: 'CONFIRMAR_PRECO'; partes: string[] }
  | { tipo: 'OFERECER_ALTERNATIVAS'; partes: string[] }
  | { tipo: 'NADA' }; // sai do fluxo — cai no caminho de IA livre de hoje

export interface ResultadoDecisao {
  acao: AcaoPreco;
  novoEstado: EstadoPrecoFluxo;
  novosDados: DadosPrecoFluxo;
}

const PEDIR_MEDIDA_TEXTO = 'Poderia me informar a medida do pneu (ex.: 175/65/14) ou o modelo do seu carro?';
const SEM_ALTERNATIVA_FALLBACK = 'Pra eu te passar o valor certinho sem risco de errar, me confirma a medida exata que esta escrita no flanco do pneu (ex.: 175/65/14)?';

function montarAcaoParaMedida(medida: string): { acao: AcaoPreco; novoEstado: EstadoPrecoFluxo; novosDados: DadosPrecoFluxo } {
  const itens = encontrarPrecosExatosPorMedida(medida);
  if (itens.length > 0) {
    // Achado 09/09 (SEJA DECISIVO): quando ha mais de um modelo pra mesma medida,
    // pega o primeiro em vez de perguntar — a loja ja escolhe por preco/uso.
    const item = itens[0];
    const partes = montarPartesPreco(item, null, null);
    return {
      acao: { tipo: 'CONFIRMAR_PRECO', partes },
      novoEstado: 'preco_confirmado',
      novosDados: { medida: item.medida },
    };
  }
  const aro = medida.split('/')[2] || '';
  const alternativas = alternativasMesmoAro(medida);
  const texto = alternativas
    ? `Essa medida a gente não tem, infelizmente. No mesmo aro eu tenho: ${alternativas}. Alguma dessas serve pra você?`
    : SEM_ALTERNATIVA_FALLBACK;
  return {
    acao: { tipo: 'OFERECER_ALTERNATIVAS', partes: [texto] },
    novoEstado: alternativas ? 'medida_sem_match' : 'sem_estado',
    novosDados: alternativas ? { aroSemMatch: aro } : {},
  };
}

/**
 * Motor de decisao PURO — sem I/O, sem IA, 100% testavel sem rede.
 * Recebe a intencao ja extraida (pela IA, em fluxoPrecoExtrator.ts) + o estado
 * salvo da conversa, e devolve a ACAO pronta (com os numeros ja resolvidos pela
 * tabela) + o proximo estado.
 */
export function decidirAcaoPreco(
  intencao: IntencaoExtraida,
  estadoAtual: EstadoPrecoFluxo,
  dadosAtuais: DadosPrecoFluxo
): ResultadoDecisao {
  if (intencao.intencao === 'PERGUNTA_TECNICA' || intencao.intencao === 'OUTRO_ASSUNTO') {
    return { acao: { tipo: 'NADA' }, novoEstado: estadoAtual, novosDados: dadosAtuais };
  }

  if (intencao.intencao === 'DAR_MEDIDA' && intencao.medidaExtraida) {
    return montarAcaoParaMedida(intencao.medidaExtraida);
  }

  if (intencao.intencao === 'PERGUNTAR_PRECO_SEM_MEDIDA') {
    if (estadoAtual === 'preco_confirmado' && dadosAtuais.medida) {
      const itens = encontrarPrecosExatosPorMedida(dadosAtuais.medida);
      if (itens.length > 0) {
        return {
          acao: { tipo: 'CONFIRMAR_PRECO', partes: montarPartesPreco(itens[0], null, intencao.quantidadeExtraida) },
          novoEstado: estadoAtual,
          novosDados: dadosAtuais,
        };
      }
    }
    return {
      acao: { tipo: 'PEDIR_MEDIDA', partes: [PEDIR_MEDIDA_TEXTO] },
      novoEstado: 'aguardando_medida',
      novosDados: dadosAtuais,
    };
  }

  if (intencao.intencao === 'RESPONDER_QUANTIDADE' && dadosAtuais.medida) {
    const itens = encontrarPrecosExatosPorMedida(dadosAtuais.medida);
    if (itens.length > 0) {
      return {
        acao: { tipo: 'CONFIRMAR_PRECO', partes: montarPartesPreco(itens[0], null, intencao.quantidadeExtraida) },
        novoEstado: 'preco_confirmado',
        novosDados: dadosAtuais,
      };
    }
  }

  if (intencao.intencao === 'ESCOLHER_ALTERNATIVA' && estadoAtual === 'medida_sem_match' && intencao.escolhaAlternativa) {
    return montarAcaoParaMedida(intencao.escolhaAlternativa);
  }

  // Intencao nao reconhecida dado o estado atual (ex.: RESPONDER_QUANTIDADE sem
  // medida salva) — sai do fluxo em vez de arriscar uma acao errada.
  return { acao: { tipo: 'NADA' }, novoEstado: estadoAtual, novosDados: dadosAtuais };
}
```

- [ ] **Step 2: Escrever o teste manual — casos reais de hoje**

```ts
// src/data/fluxoPreco.manual-test.ts
// Roda sem chamar IA nenhuma — so a logica pura. Cobre os casos reais que
// quebraram em 09-10/09/2026. Apagar depois de rodar NAO e o padrao aqui: este
// arquivo fica no repo como regressao (unico jeito de saber se uma mudanca
// futura na tabela ou no motor voltou a quebrar algum destes casos).
import { decidirAcaoPreco, IntencaoExtraida, EstadoPrecoFluxo, DadosPrecoFluxo } from './fluxoPreco';

let erros = 0;
function checar(nome: string, condicao: boolean, detalhe?: string) {
  if (!condicao) { erros++; console.log('ERRO ' + nome + (detalhe ? ' | ' + detalhe : '')); }
  else console.log('OK   ' + nome);
}

// ===== Caso Elvania (10/09): medida real, valida, mas que NAO existe na tabela =====
{
  const intencao: IntencaoExtraida = { intencao: 'DAR_MEDIDA', medidaExtraida: '225/70/17', quantidadeExtraida: null, escolhaAlternativa: null };
  const r = decidirAcaoPreco(intencao, 'sem_estado', {});
  checar('Elvania: nao inventa preco pra medida inexistente', r.acao.tipo === 'OFERECER_ALTERNATIVAS');
  checar('Elvania: estado vira medida_sem_match', r.novoEstado === 'medida_sem_match');
  checar('Elvania: oferece medida REAL do aro 17 (nao lista vazia)', r.acao.tipo === 'OFERECER_ALTERNATIVAS' && /205\/50\/17|205\/55\/17|215\/50\/17/.test(r.acao.partes[0]));
  checar('Elvania: nunca cita R$399 nem R$349 (os valores que a IA tinha inventado)', r.acao.tipo === 'OFERECER_ALTERNATIVAS' && !/399|349/.test(r.acao.partes[0]));
}

// ===== Caso Paulo David (08/09): mesma medida inexistente perguntada de novo =====
// Nao pode voltar a pedir a medida — tem que oferecer a MESMA alternativa de novo,
// sem repetir o ciclo de "nao encontrei, me confirma a medida" que fez ele desistir.
{
  const intencao: IntencaoExtraida = { intencao: 'DAR_MEDIDA', medidaExtraida: '185/35/17', quantidadeExtraida: null, escolhaAlternativa: null };
  const r1 = decidirAcaoPreco(intencao, 'sem_estado', {});
  const r2 = decidirAcaoPreco(intencao, r1.novoEstado, r1.novosDados);
  checar('Paulo David: 1a vez oferece alternativa (nao pede medida)', r1.acao.tipo === 'OFERECER_ALTERNATIVAS');
  checar('Paulo David: 2a vez tambem oferece alternativa (nao volta a PEDIR_MEDIDA)', r2.acao.tipo === 'OFERECER_ALTERNATIVAS');
}

// ===== Pergunta tecnica: nunca vira cotacao (era o bug do "aguenta quantos kg") =====
{
  const intencao: IntencaoExtraida = { intencao: 'PERGUNTA_TECNICA', medidaExtraida: null, quantidadeExtraida: null, escolhaAlternativa: null };
  const r = decidirAcaoPreco(intencao, 'preco_confirmado', { medida: '215/65/16' });
  checar('Pergunta tecnica: sai do fluxo (NADA), nao repete preco', r.acao.tipo === 'NADA');
  checar('Pergunta tecnica: nao perde o estado/dados salvos', r.novoEstado === 'preco_confirmado' && r.novosDados.medida === '215/65/16');
}

// ===== Medida exata existe: preco vem certo da tabela =====
{
  const intencao: IntencaoExtraida = { intencao: 'DAR_MEDIDA', medidaExtraida: '195/55/15', quantidadeExtraida: null, escolhaAlternativa: null };
  const r = decidirAcaoPreco(intencao, 'sem_estado', {});
  checar('Medida existe: CONFIRMAR_PRECO', r.acao.tipo === 'CONFIRMAR_PRECO');
  checar('Medida existe: preco vem da tabela (tem R$ na resposta)', r.acao.tipo === 'CONFIRMAR_PRECO' && /R\$/.test(r.acao.partes.join(' ')));
  checar('Medida existe: estado vira preco_confirmado', r.novoEstado === 'preco_confirmado' && r.novosDados.medida === '195/55/15');
}

// ===== Quantidade depois do preco: usa a MESMA medida ja confirmada, conta certa =====
{
  const intencaoQtd: IntencaoExtraida = { intencao: 'RESPONDER_QUANTIDADE', medidaExtraida: null, quantidadeExtraida: 4, escolhaAlternativa: null };
  const r = decidirAcaoPreco(intencaoQtd, 'preco_confirmado', { medida: '195/55/15' });
  checar('Quantidade: CONFIRMAR_PRECO com a medida ja salva', r.acao.tipo === 'CONFIRMAR_PRECO');
  checar('Quantidade: menciona "4" na resposta (unidades)', r.acao.tipo === 'CONFIRMAR_PRECO' && /4/.test(r.acao.partes.join(' ')));
}

// ===== Pergunta de preco sem medida nenhuma: pede a medida, so uma vez, nao repete =====
{
  const intencao: IntencaoExtraida = { intencao: 'PERGUNTAR_PRECO_SEM_MEDIDA', medidaExtraida: null, quantidadeExtraida: null, escolhaAlternativa: null };
  const r = decidirAcaoPreco(intencao, 'sem_estado', {});
  checar('Sem medida: PEDIR_MEDIDA', r.acao.tipo === 'PEDIR_MEDIDA');
  checar('Sem medida: estado vira aguardando_medida', r.novoEstado === 'aguardando_medida');
}

console.log(erros === 0 ? '\nTODOS OK' : '\n' + erros + ' ERRO(S)');
process.exit(erros === 0 ? 0 : 1);
```

- [ ] **Step 3: Rodar e confirmar TODOS OK**

```bash
ssh -i ~/.ssh/vps_gppremium root@2.24.212.146 "cd /root/whatsapp-crm/backend && npx ts-node --transpile-only src/data/fluxoPreco.manual-test.ts"
```
Esperado: todas as linhas `OK`, terminando em `TODOS OK` (exit code 0). Se algo vier `ERRO`, parar e corrigir `fluxoPreco.ts` antes de continuar — não seguir pro próximo task com teste vermelho.

- [ ] **Step 4: Compilar**

```bash
ssh -i ~/.ssh/vps_gppremium root@2.24.212.146 "cd /root/whatsapp-crm/backend && npx tsc --noEmit 2>&1 | grep -v 'npm notice'"
```

- [ ] **Step 5: Commit**

```bash
ssh -i ~/.ssh/vps_gppremium root@2.24.212.146 "cd /root/whatsapp-crm/backend && git add src/data/fluxoPreco.ts src/data/fluxoPreco.manual-test.ts && git commit --author='Maicon <maiconbatn5@gmail.com>' -m 'Motor de decisao puro do fluxo de preco (Camada 2) + testes dos casos reais de hoje'"
```

---

## Task 4: Camada 1 — IA extratora (`fluxoPrecoExtrator.ts`)

**Files:**
- Create: `src/data/fluxoPrecoExtrator.ts`
- Test: `src/data/fluxoPrecoExtrator.manual-test.ts`

- [ ] **Step 1: Escrever `src/data/fluxoPrecoExtrator.ts`**

```ts
import { IntencaoExtraida, IntencaoTipo } from './fluxoPreco';

// CAMADA 1 do fluxo deterministico de preco (10/09). Unica funcao desta feature
// que fala com a OpenAI. So EXTRAI o que o cliente quis dizer, em formulario
// fixo (json_schema estrito) — nunca decide o que responder, nunca gera preco.
// Ver docs/superpowers/specs/2026-09-10-fluxo-preco-deterministico-design.md.

const SCHEMA_EXTRACAO = {
  type: 'object',
  properties: {
    intencao: {
      type: 'string',
      enum: ['DAR_MEDIDA', 'PERGUNTAR_PRECO_SEM_MEDIDA', 'RESPONDER_QUANTIDADE', 'ESCOLHER_ALTERNATIVA', 'PERGUNTA_TECNICA', 'OUTRO_ASSUNTO'],
    },
    medida_extraida: {
      type: ['string', 'null'],
      description: 'Medida do pneu no formato EXATO "LARGURA/PERFIL/ARO" (ex.: "205/55/16"), so quando o cliente deu uma medida completa nesta mensagem — normalize qualquer ordem/separador (ex.: "16r 205 55" ou "225/70 aro 17" viram "225/70/17"). null se nao houver medida completa nesta mensagem.',
    },
    quantidade_extraida: {
      type: ['integer', 'null'],
      description: 'Quantidade de pneus mencionada nesta mensagem (ex.: "preciso de 4" = 4). null se nao mencionou.',
    },
    escolha_alternativa: {
      type: ['string', 'null'],
      description: 'Se o cliente esta escolhendo uma das medidas alternativas que JA foram oferecidas a ele (contexto anterior), a medida escolhida no formato LARGURA/PERFIL/ARO. null se nao se aplica.',
    },
  },
  required: ['intencao', 'medida_extraida', 'quantidade_extraida', 'escolha_alternativa'],
  additionalProperties: false,
};

const INSTRUCAO = [
  'Voce classifica UMA mensagem de cliente de uma loja de pneus, pra um sistema que decide a resposta certa.',
  'Categorias de intencao:',
  '- DAR_MEDIDA: o cliente informou a medida do pneu (mesmo em formato estranho, tipo "16r 205 55" ou "225/70 aro 17").',
  '- PERGUNTAR_PRECO_SEM_MEDIDA: pergunta de preco/valor SEM informar a medida nesta mensagem.',
  '- RESPONDER_QUANTIDADE: informou quantos pneus quer (numero de unidades), sem dar medida nova.',
  '- ESCOLHER_ALTERNATIVA: esta escolhendo uma das opcoes que JA foram oferecidas antes (contexto da conversa).',
  '- PERGUNTA_TECNICA: pergunta sobre caracteristica do produto que NAO e preco (ex.: capacidade de carga em kg, durabilidade, garantia, se e remold).',
  '- OUTRO_ASSUNTO: qualquer outra coisa (saudacao, agradecimento, pedir endereco, reclamacao, papo solto).',
  'Na duvida entre PERGUNTA_TECNICA e as outras, prefira PERGUNTA_TECNICA — e mais seguro nao tratar como pedido de preco.',
  'NUNCA calcule nem mencione preco — isso nao e sua tarefa, so classifique e extraia.',
].join('\n');

export async function extrairIntencaoPreco(
  mensagemAtual: string,
  contextoRecente: string,
  apiKey: string
): Promise<IntencaoExtraida | null> {
  try {
    const model = process.env.OPENAI_MODEL || 'gpt-5-mini';
    const resp = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        input: [
          { role: 'system', content: [{ type: 'input_text', text: INSTRUCAO }] },
          { role: 'user', content: [{ type: 'input_text', text: `Contexto recente da conversa (mais antiga primeiro):\n${contextoRecente.slice(0, 1500)}\n\nMENSAGEM ATUAL A CLASSIFICAR:\n${mensagemAtual.slice(0, 500)}` }] },
        ],
        text: { format: { type: 'json_schema', name: 'extracao_preco', strict: true, schema: SCHEMA_EXTRACAO } },
      }),
      signal: AbortSignal.timeout(20_000),
    });
    const body: any = await resp.json().catch(() => null);
    if (!resp.ok) {
      console.error('[FluxoPreco][Extrator] Falha na API:', resp.status, body?.error?.message);
      return null;
    }
    const textoSaida = extrairTextoJson(body);
    if (!textoSaida) return null;
    const parsed = JSON.parse(textoSaida);
    const intencoesValidas: IntencaoTipo[] = ['DAR_MEDIDA', 'PERGUNTAR_PRECO_SEM_MEDIDA', 'RESPONDER_QUANTIDADE', 'ESCOLHER_ALTERNATIVA', 'PERGUNTA_TECNICA', 'OUTRO_ASSUNTO'];
    if (!intencoesValidas.includes(parsed.intencao)) return null;
    return {
      intencao: parsed.intencao,
      medidaExtraida: typeof parsed.medida_extraida === 'string' ? parsed.medida_extraida : null,
      quantidadeExtraida: typeof parsed.quantidade_extraida === 'number' ? parsed.quantidade_extraida : null,
      escolhaAlternativa: typeof parsed.escolha_alternativa === 'string' ? parsed.escolha_alternativa : null,
    };
  } catch (e: any) {
    console.error('[FluxoPreco][Extrator] Erro:', e?.message || e);
    return null; // falha = trata como OUTRO_ASSUNTO no chamador (fail-safe, nunca trava o cliente)
  }
}

function extrairTextoJson(payload: any): string | null {
  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) return payload.output_text.trim();
  for (const item of Array.isArray(payload?.output) ? payload.output : []) {
    for (const content of Array.isArray(item?.content) ? item.content : []) {
      if (typeof content?.text === 'string' && content.text.trim()) return content.text.trim();
    }
  }
  return null;
}

// Filtro barato (nao gasta chamada de IA em papo solto obviamente fora do assunto).
// So retorna false quando tem certeza que NAO e sobre preco/medida — na duvida,
// deixa passar pro extrator decidir (ele e mais confiavel que regex).
export function podeSerSobrePreco(mensagem: string, estadoAtual: string): boolean {
  if (estadoAtual === 'aguardando_medida' || estadoAtual === 'medida_sem_match') return true; // esperando resposta especifica
  const t = String(mensagem || '').toLowerCase();
  if (/\d/.test(t)) return true; // tem numero (pode ser medida ou quantidade)
  if (/pre[cç]o|quanto|valor|vist[a-z]|parcel|cotar|cota[cç][aã]o/.test(t)) return true;
  return false;
}
```

- [ ] **Step 2: Escrever o teste manual — chama a IA de verdade com os textos reais de hoje**

```ts
// src/data/fluxoPrecoExtrator.manual-test.ts
// Chama a OpenAI de verdade — precisa de OPENAI_API_KEY no ambiente (o processo
// bot-service ja tem via dotenv; rodar este script de dentro da pasta backend).
import 'dotenv/config';
import { extrairIntencaoPreco } from './fluxoPrecoExtrator';

const apiKey = process.env.OPENAI_API_KEY?.trim();
if (!apiKey) { console.log('SEM OPENAI_API_KEY — nao da pra rodar este teste'); process.exit(1); }

const casos: { nome: string; msg: string; contexto: string; esperado: string; medidaEsperada?: string }[] = [
  { nome: 'Elvania: "225/70 aro 17"', msg: '225/70 aro 17', contexto: '', esperado: 'DAR_MEDIDA', medidaEsperada: '225/70/17' },
  { nome: 'medida falada: "16r 205 55"', msg: '16r 205 55', contexto: '', esperado: 'DAR_MEDIDA', medidaEsperada: '205/55/16' },
  { nome: 'pergunta tecnica: "aguenta quantos kg"', msg: 'Ele aguenta até quantos kg', contexto: 'CLIENTE: quanto ta o 215/65/16\nROBO: R$349 a vista', esperado: 'PERGUNTA_TECNICA' },
  { nome: 'quantidade: "preciso de 4"', msg: 'preciso de 4', contexto: 'ROBO: o pneu 195/55/15 sai por R$289', esperado: 'RESPONDER_QUANTIDADE' },
  { nome: 'outro assunto: "onde fica a loja"', msg: 'onde fica a loja', contexto: '', esperado: 'OUTRO_ASSUNTO' },
];

(async () => {
  let erros = 0;
  for (const c of casos) {
    const r = await extrairIntencaoPreco(c.msg, c.contexto, apiKey!);
    const ok = !!r && r.intencao === c.esperado && (!c.medidaEsperada || r.medidaExtraida === c.medidaEsperada);
    if (!ok) erros++;
    console.log((ok ? 'OK   ' : 'ERRO ') + c.nome + ' -> ' + JSON.stringify(r));
  }
  console.log(erros === 0 ? '\nTODOS OK' : '\n' + erros + ' ERRO(S)');
  process.exit(erros === 0 ? 0 : 1);
})();
```

- [ ] **Step 3: Rodar e confirmar TODOS OK**

```bash
ssh -i ~/.ssh/vps_gppremium root@2.24.212.146 "cd /root/whatsapp-crm/backend && npx ts-node --transpile-only src/data/fluxoPrecoExtrator.manual-test.ts"
```
Esperado: `TODOS OK`. Se algum caso falhar, ajustar o texto de `INSTRUCAO`/descrições do schema (não o motor de decisão — esse já está testado e correto) e rodar de novo.

- [ ] **Step 4: Compilar**

```bash
ssh -i ~/.ssh/vps_gppremium root@2.24.212.146 "cd /root/whatsapp-crm/backend && npx tsc --noEmit 2>&1 | grep -v 'npm notice'"
```

- [ ] **Step 5: Commit**

```bash
ssh -i ~/.ssh/vps_gppremium root@2.24.212.146 "cd /root/whatsapp-crm/backend && git add src/data/fluxoPrecoExtrator.ts src/data/fluxoPrecoExtrator.manual-test.ts && git commit --author='Maicon <maiconbatn5@gmail.com>' -m 'IA extratora do fluxo de preco (Camada 1) + testes com os casos reais de hoje'"
```

---

## Task 5: Ligar o fluxo em `bot-service/server.ts`

**Files:**
- Modify: `src/bot-service/server.ts`

- [ ] **Step 1: Importar as novas peças**

No topo do arquivo, onde já importa de `../data/tabelaPrecos`, adicionar:
```ts
import { decidirAcaoPreco, EstadoPrecoFluxo, DadosPrecoFluxo } from '../data/fluxoPreco';
import { extrairIntencaoPreco, podeSerSobrePreco } from '../data/fluxoPrecoExtrator';
```

- [ ] **Step 2: Aceitar estado no corpo da requisição e rodar o pipeline ANTES do caminho livre**

Dentro de `app.post('/gerar-resposta', ...)`, logo após a linha `const { messages, imagem, audio, lojas, ultimosTextosCliente } = req.body || {};`, adicionar:
```ts
    const estadoPrecoAtual: EstadoPrecoFluxo = (req.body?.estadoPreco as EstadoPrecoFluxo) || 'sem_estado';
    let dadosPrecoAtuais: DadosPrecoFluxo = {};
    try { dadosPrecoAtuais = JSON.parse(req.body?.dadosPreco || '{}'); } catch { dadosPrecoAtuais = {}; }
```

Logo depois do bloco que calcula `gatilho` (a mensagem mais recente do cliente), e ANTES de tudo que hoje monta `respostaDeterministica`/`referenciaPreco`, adicionar o pipeline novo:
```ts
    // FLUXO DETERMINISTICO DE PRECO (Camadas 1+2, 10/09). So roda se valer a pena
    // chamar a IA extratora; se ela decidir que a mensagem e sobre medida/preco, a
    // resposta sai 100% do codigo (motor + tabela) — nunca chega no caminho livre
    // abaixo, que e onde a IA podia inventar numero.
    if (podeSerSobrePreco(gatilho, estadoPrecoAtual)) {
      const apiKeyFluxo = process.env.OPENAI_API_KEY?.trim();
      if (apiKeyFluxo) {
        const contextoRecente = (Array.isArray(messages) ? messages : [])
          .slice(-6)
          .map((m: any) => `${m.role === 'user' ? 'CLIENTE' : 'ROBO'}: ${String(m.content || '').slice(0, 200)}`)
          .join('\n');
        const intencao = await extrairIntencaoPreco(gatilho, contextoRecente, apiKeyFluxo);
        if (intencao) {
          const decisao = decidirAcaoPreco(intencao, estadoPrecoAtual, dadosPrecoAtuais);
          if (decisao.acao.tipo !== 'NADA') {
            return res.json({
              partes: decisao.acao.partes,
              deterministico: true,
              novoEstadoPreco: decisao.novoEstado,
              novosDadosPreco: JSON.stringify(decisao.novosDados),
            });
          }
        }
      }
    }
```

- [ ] **Step 3: Remover o mecanismo antigo que ficava com a IA respondendo preço solta**

O bloco de hoje que monta `respostaDeterministica`, `referenciaPreco` e `SEM_RESULTADO_FALLBACK` (linhas atuais ~262-286, o comentário começa com `// 09/09 — A IA PASSA A RESPONDER TAMBEM AS COTACOES.`) fica **obsoleto** — o fluxo novo (Step 2) já resolve tudo que é medida/preço antes de chegar aqui. Remover esse bloco inteiro e a linha `+ referenciaPreco` na chamada de `gerarRespostaViaOpenAI` logo abaixo (volta a ser só `briefingComercial + avisoData + avisoCoerencia`).

Também remover a variável `SEM_RESULTADO_FALLBACK` e seu uso no bloco de `TRAVA DE PRECO` (`partesFinais = [SEM_RESULTADO_FALLBACK];`) — trocar de volta pra uma mensagem fixa simples, já que esse caminho só é alcançado agora quando a intenção NÃO é sobre preço (então nunca deveria estar citando preço pra começo de conversa):
```ts
        partesFinais = ['Deixa eu confirmar uma coisa com você — pode repetir, por favor?'];
```

- [ ] **Step 4: Devolver o estado (sem mudança) quando a resposta vem do caminho livre**

No final do handler, onde hoje é `res.json({ partes: partesFinais, deterministico: false });`, trocar para:
```ts
    res.json({
      partes: partesFinais,
      deterministico: false,
      novoEstadoPreco: estadoPrecoAtual,
      novosDadosPreco: JSON.stringify(dadosPrecoAtuais),
    });
```
(o caminho livre não decide nada sobre o fluxo de preço, então devolve o estado igual ao que recebeu — quem chama salva o mesmo valor de volta, sem perda).

- [ ] **Step 5: Compilar**

```bash
ssh -i ~/.ssh/vps_gppremium root@2.24.212.146 "cd /root/whatsapp-crm/backend && npx tsc --noEmit 2>&1 | grep -v 'npm notice'"
```
Esperado: nenhuma saída. Se der erro de tipo/variável não usada relacionado ao bloco removido no Step 3, apagar o que sobrou (imports agora não usados de `montarRespostaDeterministicaPreco`/`analisarConsultaPreco`/`alternativasMesmoAro` no topo do arquivo, se não forem mais referenciados em outro lugar do arquivo).

- [ ] **Step 6: Reload do bot-service (isolado, nunca afeta WhatsApp) e teste manual end-to-end**

```bash
ssh -i ~/.ssh/vps_gppremium root@2.24.212.146 "pm2 reload bot-service --update-env && sleep 4"
```

Teste 1 — medida que não existe (caso Elvania), sem estado prévio:
```bash
cat > /tmp/teste-fluxo-1.json <<'EOF'
{"messages":[{"role":"user","content":"225/70 aro 17"}],"lojas":[],"ultimosTextosCliente":"225/70 aro 17","estadoPreco":"sem_estado","dadosPreco":"{}"}
EOF
ssh -i ~/.ssh/vps_gppremium root@2.24.212.146 "curl -s -m 30 -X POST http://127.0.0.1:3010/gerar-resposta -H 'Content-Type: application/json' --data @-" < /tmp/teste-fluxo-1.json
rm -f /tmp/teste-fluxo-1.json
```
Esperado no JSON de resposta: `"deterministico":true`, `"novoEstadoPreco":"medida_sem_match"`, e o texto em `partes` oferecendo medidas reais do aro 17 (205/50/17, 205/55/17 ou 215/50/17) — **nunca** um preço pra "225/70/17" nem número fora da tabela.

Teste 2 — medida que existe:
```bash
cat > /tmp/teste-fluxo-2.json <<'EOF'
{"messages":[{"role":"user","content":"quanto ta o 195/55/15"}],"lojas":[],"ultimosTextosCliente":"quanto ta o 195/55/15","estadoPreco":"sem_estado","dadosPreco":"{}"}
EOF
ssh -i ~/.ssh/vps_gppremium root@2.24.212.146 "curl -s -m 30 -X POST http://127.0.0.1:3010/gerar-resposta -H 'Content-Type: application/json' --data @-" < /tmp/teste-fluxo-2.json
rm -f /tmp/teste-fluxo-2.json
```
Esperado: `"deterministico":true`, `"novoEstadoPreco":"preco_confirmado"`, preço correto pra 195/55/15 (confirmar contra a tabela).

Teste 3 — pergunta técnica com estado já confirmado (não pode repetir preço):
```bash
cat > /tmp/teste-fluxo-3.json <<'EOF'
{"messages":[{"role":"user","content":"quanto ta o 215/65/16"},{"role":"assistant","content":"R$349 a vista"},{"role":"user","content":"Ele aguenta até quantos kg"}],"lojas":[],"ultimosTextosCliente":"Ele aguenta até quantos kg","estadoPreco":"preco_confirmado","dadosPreco":"{\"medida\":\"215/65/16\"}"}
EOF
ssh -i ~/.ssh/vps_gppremium root@2.24.212.146 "curl -s -m 30 -X POST http://127.0.0.1:3010/gerar-resposta -H 'Content-Type: application/json' --data @-" < /tmp/teste-fluxo-3.json
rm -f /tmp/teste-fluxo-3.json
```
Esperado: `"deterministico":false` (saiu do fluxo, foi pro caminho livre responder a pergunta técnica de verdade), e a resposta em `partes` responde sobre capacidade de carga, não repete "R$349".

Se os 3 testes baterem com o esperado, seguir. Se algum não bater, corrigir antes de continuar — não seguir pro Task 6 com o bot-service quebrado.

- [ ] **Step 7: Commit**

```bash
ssh -i ~/.ssh/vps_gppremium root@2.24.212.146 "cd /root/whatsapp-crm/backend && git add src/bot-service/server.ts && git commit --author='Maicon <maiconbatn5@gmail.com>' -m 'Liga o fluxo deterministico de preco no bot-service, remove o mecanismo antigo de referencia solta'"
```

---

## Task 6: Persistir o estado em `botAtendimentoService.ts`

**Files:**
- Modify: `src/workers/botAtendimentoService.ts`

- [ ] **Step 1: Carregar o estado salvo antes de chamar o bot-service**

A função `gerarRespostaViaBotService` (linha ~129) hoje recebe `args` sem `usuarioId`/`chatJid`. Quem a chama (dentro de `executar()`) já tem esses dois valores em `params.usuarioId`/`params.chatJid`. Localizar a chamada a `gerarRespostaViaBotService(...)` dentro de `executar()` e, logo ANTES dela, adicionar:
```ts
    const estadoSalvo = await prisma.botConversa.findUnique({
      where: { usuarioId_chatJid: { usuarioId: params.usuarioId, chatJid: params.chatJid } },
      select: { estadoPreco: true, dadosPreco: true },
    });
```

- [ ] **Step 2: Mandar o estado no payload**

Na chamada existente a `gerarRespostaViaBotService({...})`, adicionar os 2 campos novos ao objeto passado:
```ts
      estadoPreco: estadoSalvo?.estadoPreco || 'sem_estado',
      dadosPreco: estadoSalvo?.dadosPreco || '{}',
```
E na assinatura da função `gerarRespostaViaBotService` (linha ~129), adicionar os mesmos 2 campos no tipo do parâmetro `args`:
```ts
  estadoPreco: string;
  dadosPreco: string;
```
E no tipo de retorno `RespostaBotService` (procurar a interface, provavelmente logo acima desta função), adicionar:
```ts
  novoEstadoPreco?: string;
  novosDadosPreco?: string;
```
E no corpo da função, no objeto retornado, adicionar:
```ts
    novoEstadoPreco: typeof body?.novoEstadoPreco === 'string' ? body.novoEstadoPreco : undefined,
    novosDadosPreco: typeof body?.novosDadosPreco === 'string' ? body.novosDadosPreco : undefined,
```

- [ ] **Step 3: Salvar o estado novo depois da resposta**

Logo depois de receber a resposta de `gerarRespostaViaBotService` dentro de `executar()`, adicionar:
```ts
    if (resposta.novoEstadoPreco) {
      await prisma.botConversa.upsert({
        where: { usuarioId_chatJid: { usuarioId: params.usuarioId, chatJid: params.chatJid } },
        create: { usuarioId: params.usuarioId, chatJid: params.chatJid, estadoPreco: resposta.novoEstadoPreco, dadosPreco: resposta.novosDadosPreco || '{}' },
        update: { estadoPreco: resposta.novoEstadoPreco, dadosPreco: resposta.novosDadosPreco || '{}' },
      }).catch((e) => console.error('[Bot IA] Erro ao salvar estado do fluxo de preco:', e?.message || e));
    }
```

(Nota pra quem for aplicar: a localização exata de cada ponto acima depende da estrutura atual de `executar()`, que já tem lógica bem estabelecida — ler a função inteira antes de inserir, usando a técnica de patch por linha já usada o dia inteiro nesta sessão: nunca template string multi-linha com `.includes()`/`.replace()` neste arquivo, sempre `split(/\r\n|\n/)` → encontrar índice → `splice` → `join(eol)`, porque o arquivo usa CRLF.)

- [ ] **Step 4: Compilar**

```bash
ssh -i ~/.ssh/vps_gppremium root@2.24.212.146 "cd /root/whatsapp-crm/backend && npx tsc --noEmit 2>&1 | grep -v 'npm notice'"
```

- [ ] **Step 5: Reload do whatsapp-crm (este arquivo roda nesse processo) — protocolo de segurança obrigatório**

```bash
ssh -i ~/.ssh/vps_gppremium root@2.24.212.146 "cd /root/whatsapp-crm/backend && PORT=3001 pm2 reload whatsapp-crm --update-env"
```
```bash
ssh -i ~/.ssh/vps_gppremium root@2.24.212.146 "for i in \$(seq 1 10); do sleep 5; A=\$(pm2 logs whatsapp-crm --lines 300 --nostream 2>/dev/null | grep -c 'Conexão aberta'); S=\$(pm2 logs whatsapp-crm --lines 300 --nostream 2>/dev/null | grep -c 'sem sessão registrada'); echo \"[\$i] abertas=\$A semsessao=\$S\"; if [ \"\$A\" -ge 10 ] && [ \"\$S\" -eq 0 ]; then echo ESTAVEL; break; fi; done"
```
Só segue depois de `ESTAVEL`.

- [ ] **Step 6: Commit**

```bash
ssh -i ~/.ssh/vps_gppremium root@2.24.212.146 "cd /root/whatsapp-crm/backend && git add src/workers/botAtendimentoService.ts && git commit --author='Maicon <maiconbatn5@gmail.com>' -m 'Persiste o estado do fluxo de preco em BotConversa entre mensagens'"
```

---

## Task 7: Prova final — os 4 casos reais de ponta a ponta, no ar

**Files:** nenhum (só verificação)

- [ ] **Step 1: Repetir os 3 testes de bot-service do Task 5 Step 6 (garantir que sobreviveram ao reload do whatsapp-crm)**

Rodar novamente os 3 comandos `curl` do Task 5 Step 6 e confirmar os mesmos resultados esperados.

- [ ] **Step 2: Confirmar que a Elvania de verdade, se escrever de novo, recebe a resposta certa**

```bash
ssh -i ~/.ssh/vps_gppremium root@2.24.212.146 "cat > /root/whatsapp-crm/backend/verificar-elvania.js <<'EOF'
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.botConversa.findUnique({ where: { usuarioId_chatJid: { usuarioId: '6b016cfc-6cbf-4356-a10c-a3a5aaf30a65', chatJid: '163818927841504@lid' } } }).then(function (e) {
  console.log(JSON.stringify(e));
  process.exit(0);
});
EOF
cd /root/whatsapp-crm/backend && node verificar-elvania.js; rm -f verificar-elvania.js"
```
Isso só confirma que a conversa da Elvania existe e está com estado limpo (`estadoPreco: null`, já que ela conversou ANTES desta mudança) — não requer nenhuma ação, é só uma checagem de sanidade que o campo novo está acessível via Prisma Client sem erro.

- [ ] **Step 3: Resumo final pro dono**

Escrever uma mensagem de resumo citando: os 2 processos rodando (`pm2 list`), os commits feitos (`git log --oneline` desde o início do plano), e os 3 testes end-to-end confirmados — deixando claro que remold, agendamento, localização e papo solto **não foram tocados** (continuam no caminho de IA livre de hoje, como combinado no design).

---

## Self-review desta plano

**Cobertura da spec:** os 4 critérios de sucesso da spec (nunca inventa preço, nunca repete pedido de medida, sempre oferece alternativa real, frase não robótica) são cobertos: critério 1 e 2 pelo Task 3 (motor puro, testado contra Elvania e Paulo David), critério 3 pelo Task 3 (`montarAcaoParaMedida` sempre tenta `alternativasMesmoAro` antes de desistir), critério 4 pela decisão de reusar `montarPartesPreco`/`alternativasMesmoAro` (textos já aprovados) em vez de uma 3ª camada de IA — registrado explicitamente como simplificação da spec, com justificativa.

**Fora de escopo, preservado:** remold, agendamento, localização, papo solto — nenhum task deste plano toca nesses caminhos; eles continuam passando pelo `gerarRespostaViaOpenAI` de sempre quando o fluxo novo devolve `NADA`.

**Risco arquitetural resolvido:** bot-service continua 100% sem Prisma/stateless (a persistência do estado fica em `botAtendimentoService.ts`, que já fala com o banco) — preserva a garantia de que reload do bot-service nunca afeta WhatsApp, que é uma regra central deste projeto.
