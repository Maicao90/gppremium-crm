# Fluxo determinístico de medida/preço — design

**Data:** 10/09/2026
**Status:** aprovado pelo dono, pronto pra virar plano de implementação
**Escopo:** só a parte de medida→preço do robô de atendimento (Bot Pneus, loja GP Premium/Borracharia). Saudação, objeção de remold, agendamento, localização e papo solto continuam como estão hoje (IA livre lendo a conversa).

## Por que

Hoje o robô usa um caminho automático (regex/keyword) OU a IA lendo a conversa inteira e decidindo sozinha o que responder — incluindo números. As duas coisas falharam em conversas reais de clientes no mesmo dia (09-10/09):

- **Elvania** deu a medida "225/70 aro 17" (extraída certinho), mas essa medida não existe na tabela. O caminho foi pra IA com o catálogo do aro 17 em mãos e ela mesmo assim **inventou** um preço (R$399, depois R$349 na segunda tentativa) — mesmo com a instrução explícita "use ESTES números, sem recalcular". A trava bloqueou as duas vezes e caiu num texto genérico pedindo a medida de novo.
- **Paulo David** teve a medida pedida 4x em 5 minutos (usando a própria medida dele como exemplo) e foi comprar em outro lugar.
- Um cliente perguntou "aguenta até quantos kg" e recebeu o preço do pneu de novo, duas vezes — a pergunta nunca foi respondida.
- **César** recebeu o mesmo parágrafo/pergunta 2x em 5 minutos.
- **Pwa** engajou rápido (5 falas geraram 9 bolhas do robô, dentro do próprio estilo "conversa gradual" que o prompt manda) e foi **pausado por 12 horas** por um guard "anti-loop" que confundiu cliente respondendo rápido com bot brigando com bot.
- **Gustavo** mandou a medida certa junto com a imagem do anúncio e o robô ignorou, despejando uma lista genérica de preço por aro — "muito robótico".

Conclusão: regra em texto (prompt) e trava reativa em cima de resposta livre não seguram — a IA não segue restrição numérica com 100% de confiança, por mais clara que a instrução seja, e regex não cobre toda forma real de escrever uma medida. A correção é estrutural: **tirar da IA o poder de decidir o quê responder e de gerar número livre**, deixando só decisão de código (sempre verificável, sempre testável) e usando IA só pra ler linguagem natural (extrair fato) e escrever linguagem natural (frase final) — nunca pra decidir nem pra gerar preço.

## Critérios de sucesso

1. Preço nunca é inventado — todo valor sempre vem de consulta direta à tabela pelo código, nunca de "cálculo" da IA.
2. Nunca pede a mesma medida duas vezes na mesma conversa.
3. Medida que não existe sempre oferece alternativa real do mesmo aro — nunca fica em loop, nunca some.
4. A frase final ainda soa natural, não vira despejo de tabela/robótico.

## Arquitetura — 3 camadas

```
Mensagem do cliente
      │
      ▼
[Filtro barato em código] ─── "claramente não é sobre preço" ──► caminho de hoje (IA livre)
      │ (tem número, tem preço/quanto/valor, OU estado já espera resposta)
      ▼
[Camada 1 — IA Extratora]  (saída ESTRUTURADA, não texto livre)
  entrada: mensagem atual + poucas mensagens de contexto + estado salvo
  saída (schema fixo):
    intencao: DAR_MEDIDA | PERGUNTAR_PRECO_SEM_MEDIDA | RESPONDER_QUANTIDADE
             | ESCOLHER_ALTERNATIVA | PERGUNTA_TECNICA | OUTRO_ASSUNTO
    medida_extraida, quantidade_extraida, escolha_alternativa
      │
      ├── intencao = PERGUNTA_TECNICA ou OUTRO_ASSUNTO ──► caminho de hoje (IA livre)
      │                                                     (já recebe o preço confirmado
      │                                                      como contexto, se houver, mas
      │                                                      não pode decidir outro valor)
      ▼
[Camada 2 — Máquina de Estados]  (código puro, ZERO IA aqui)
  recebe a intenção + estado atual
  consulta a TABELA DE PRECOS de verdade
  decide a transição de estado e monta uma AÇÃO já com os dados resolvidos
  ex.: { tipo: CONFIRMAR_PRECO, medida: "205/55/16", preco: 289.00, parcelas: {...} }
  ex.: { tipo: OFERECER_ALTERNATIVAS, aro: "17", opcoes: [...] }  ← usa alternativasMesmoAro()
  o PREÇO NUNCA SAI DAQUI SEM SER O DA TABELA — não existe caminho de código que gere
  um numero que não veio de uma consulta direta
      │
      ▼
[Camada 3 — IA Redatora]  (escopo estreito)
  entrada: SÓ a Ação já pronta (não a conversa inteira)
  instrução: escreva 1-2 frases curtas, tom de vendedor de loja, comunicando
             EXATAMENTE isto — os números vêm prontos, não recalcule nada
      │
      ▼
[Trava de preço existente] (precosForaDaTabela) — fica como cinto de segurança final,
  mesmo sendo redundante na maioria dos casos, não custa nada manter
      │
      ▼
Resposta ao cliente
```

## Estados (por conversa, salvos junto do registro da conversa no banco)

- **sem estado** (padrão) — nada relacionado a preço ainda.
- **aguardando medida** — cliente sinalizou que quer preço, ainda não demos uma medida válida.
- **medida sem correspondência** — medida dada não existe; oferecemos alternativas do mesmo aro, esperando escolha.
- **preço confirmado** — já demos o preço certo pra medida certa; guarda medida + preço + parcelamento.

Uma vez em **preço confirmado**, mensagens que não são continuação direta (quantidade, forma de pagamento) saem do fluxo e vão pro caminho livre — mas o estado permanece salvo, então se o cliente perguntar de novo mais tarde, o mesmo valor é usado (nunca um diferente).

## Entrada e saída do fluxo

- **Entrada**: filtro barato em código decide se vale chamar a IA extratora (economiza chamada em papo solto tipo "oi bom dia"). Se a conversa já está esperando uma resposta específica (pedimos a medida, ou oferecemos alternativas), a extratora é chamada sempre, não importa como o cliente escreveu.
- **Saída**: depois do preço confirmado, toda mensagem nova ainda passa pela extratora. Se for continuação, o fluxo resolve. Se for outra coisa, o fluxo não faz nada e a mensagem vai pro caminho livre de hoje.

## Erros e segurança

- Trava de preço existente continua ativa — defesa em profundidade, sem custo.
- IA extratora falhou/demorou → trata como OUTRO_ASSUNTO, nunca trava o cliente sem resposta.
- IA redatora falhou → frase pronta de reserva (ex.: "{medida}: R$ {preço} à vista, parcela em até 10x"), garante resposta mesmo com a IA fora do ar.
- Estado nunca bloqueia a conversa: se o cliente muda de assunto, o fluxo só fica esperando, não impede nada.

## Testes antes de subir

1. Testes automatizados da Camada 2 (código puro, sem chamar IA) cobrindo os casos reais de hoje:
   - Elvania (225/70 aro 17 → oferece alternativas reais do aro 17, nunca inventa preço)
   - Paulo David (medida repetida → conclui na primeira vez, sem loop)
   - pergunta técnica (kg) → sai do fluxo, não repete preço
   - repetição de frase (César) → não repete o que já foi dito
   - Pwa (conversa rápida, várias bolhas) → não aciona anti-loop indevidamente
2. Testes ponta a ponta com a IA de verdade em 3-4 casos, confirmando que a frase final sai natural.
3. Só sobe pra produção depois de tudo passar.

## Fora de escopo (fica como está por agora)

- Objeção de remold, agendamento, envio de localização, papo solto — continuam no caminho de IA livre de hoje.
- Guard de anti-loop (pausa de 12h) — revisar o limiar separadamente, não faz parte deste fluxo.
- Pode ser expandido pra cobrir mais partes da conversa depois, se este primeiro passo funcionar.
