# Fluxo determinístico do atendimento completo — design

**Data:** 18/09/2026
**Status:** aprovado pelo dono, pronto pra virar plano de implementação
**Escopo:** expandir o fluxo determinístico já construído (hoje cobre só medida→preço e a pergunta sobre remold) pra cobrir praticamente todo o atendimento do robô Charles/Josi (loja Borracharia Popular Pneus, GP CRM). Não muda o que já está no ar — só adiciona mais categorias no mesmo padrão.

## Por que

Ao longo do dia (10/09 e 15-18/09), ficou estabelecido e reconfirmado várias vezes que regra em texto de prompt não segura resultado — a IA livre não segue instrução 100% das vezes, por mais explícita que seja (preço inventado mesmo com a tabela em mãos, negação falsa sobre remold mesmo proibida, repetição de pergunta já respondida, pausa injusta por 12h por confundir cliente engajado com loop de robô). A correção que já funcionou duas vezes (preço, remold) foi tirar a decisão da IA inteiramente: código decide a ação com base num fato extraído, texto de resposta é fixo e já aprovado.

O dono quer agora o mesmo tratamento pro atendimento inteiro: "quero o fluxo travado pra ele nunca errar, tem que ser perfeito sempre." Sem exceção — inclusive removendo a opção de transferir pra atendente humano, que hoje existe como válvula de escape (`[TRANSFERIR_HUMANO]`): **o robô é quem atende, sempre, sozinho, não existe humano pra assumir.**

## Critérios de sucesso

1. Nenhuma categoria nova gera preço, desconto ou parcela calculados pela IA — todo número vem de consulta real à tabela, no código.
2. Nenhuma categoria nova permite a IA decidir sozinha se dispara uma ação (agendar visita, mandar localização) — a decisão de disparar é sempre do código, a IA só extrai a intenção.
3. `[TRANSFERIR_HUMANO]` deixa de ser uma opção em qualquer lugar do sistema — nem a IA livre nem o fluxo novo podem emitir isso.
4. As categorias listadas abaixo (parcelamento específico, desconto à vista, chinês, base de troca, compra de usado, nota fiscal, balanceamento, alinhamento, localização, fechamento, agendamento) passam a ter resposta determinística, testada com os fatos reais já aprovados — nunca texto gerado na hora pra esses assuntos.
5. O caminho de IA livre continua existindo só como rede de segurança temporária pro que ainda não foi mapeado — protegido pelas travas já existentes (preço, comportamento) — e deve encolher com o tempo conforme mais categorias entrarem no fluxo, não é uma saída permanente aceita por design.

## Arquitetura

Mesmo modelo de 3 peças já em produção, sem mudar a forma — só cresce o conteúdo:

```
Mensagem do cliente
      │
      ▼
[Filtro barato em código] ─── "claramente não é sobre nenhuma categoria conhecida" ──► caminho de IA livre (rede de segurança, protegida pelas travas existentes)
      │
      ▼
[Camada 1 — IA Extratora]  (mesma função já existe, cardápio de intenções cresce)
  saída ESTRUTURADA (json_schema estrito), nunca texto livre:
    intencao: (todas as já existentes) + as novas listadas abaixo
    + campos extraídos relevantes pra cada intenção nova (ex.: numero de parcelas,
      data/hora pedida pro agendamento)
      │
      ▼
[Camada 2 — Máquina de Decisão]  (código puro, ZERO IA)
  um branch novo por categoria — mesmo padrão do remold de hoje: não é uma ETAPA fixa
  numa sequência, é uma intenção que pode aparecer em QUALQUER estado da conversa e
  responde sem perder o lugar onde a conversa estava (ex.: cliente pode perguntar
  sobre balanceamento no meio de negociar preço, sem perder a medida já confirmada)
      │
      ▼
Resposta final = texto fixo já aprovado (com valor calculado quando aplicável) — sem
Camada 3 de "IA redatora", mesma decisão já tomada hoje pro preço/remold
      │
      ▼
[Travas existentes] (preço, comportamento) continuam ativas como rede de segurança
final, mesmo pro caminho de IA livre residual
```

## Categorias novas e o comportamento exato de cada uma

Todas seguem o mesmo padrão do remold: a intenção pode surgir a qualquer momento da conversa, não muda `estadoPreco`/`dadosPreco` a não ser onde explicitamente indicado, e a resposta é sempre 1-2 bolhas curtas (nunca um parágrafo só), igual todo o resto do fluxo.

**Regra de escrita obrigatória pra todo texto fixo (achado 18/09):** a resposta é sempre a voz direta do vendedor falando com o cliente — nunca texto de instrução, meta-comentário ou "sugestão pra copiar e enviar". Isso é o que já causou o incidente real da Josy (17/09): o robô gerou um texto no formato "aqui está uma sugestão de mensagem que você pode copiar e enviar" e isso foi parar direto na conversa. Todo texto fixo novo escrito nesta spec (e em qualquer categoria futura) precisa ser a frase final, pronta, em primeira pessoa do vendedor — nunca uma frase sobre o que dizer.

1. **Parcelamento genérico** ("parcela?", "dá pra parcelar?", sem dizer quantas vezes): resposta fixa `"Sim, parcelamos em até 10x."` — sem nenhum valor em R$.

2. **Parcelamento específico** ("em 6x fica quanto?", "quanto fica em 10x?"): exige uma medida já confirmada (`dadosPreco.medida`); se não tiver, pede a medida primeiro (reaproveita `PEDIR_MEDIDA_TEXTO`). Com a medida confirmada, o código busca o item real na tabela e calcula o valor de CADA parcela pra N vezes (total da parcela N dividido por N — nunca a IA calculando), resposta no formato já usado no resto do projeto (ex.: "Em 6x fica R$X cada, total R$Y").

2a. **"É sem juros?"** (achado 18/09): resposta fixa confirmando que TEM um juro pequeno em cada parcela (nunca dizer "sem juros" — o parcelamento já embute isso nos valores reais da tabela, que são maiores que o à vista dividido por N). Junto, pergunta em quantas vezes o cliente quer parcelar (pra então cair na categoria 2 e dar o valor real), e menciona que vindo até a loja dá pra negociar melhor.

3. **Desconto à vista em DINHEIRO** (achado 18/09: PIX **não** tem desconto — só dinheiro vivo; o prompt de hoje dizia "PIX ou dinheiro", estava errado, embora o `precoGuard.ts` já calculasse certo só-dinheiro por baixo dos panos): exige medida já confirmada (mesma regra acima). Código calcula 5% em cima do valor à vista real da tabela, nunca estimativa da IA. Se o cliente perguntar especificamente sobre desconto no PIX, resposta fixa deixando claro que o desconto de 5% é só em dinheiro — PIX não tem desconto.

4. **"É pneu chinês?"**: categoria PRÓPRIA, separada do remold (são fatos diferentes — remold agora é confirmado como verdade, "chinês" continua sendo negado de verdade). Resposta fixa negando, no espírito do que já está aprovado no prompt de hoje: a loja não trabalha com pneu chinês, borracha de má qualidade, roda pouco.

5. **Base de troca** (cliente quer dar pneu usado como parte do pagamento): recusa fixa — já era regra vigente, só formaliza como branch determinístico. "A loja não trabalha com base de troca."

6. **Compra de pneu usado** (loja compraria o pneu usado do cliente, fora do contexto de venda): recusa fixa — já era regra vigente. "A loja não compra pneu usado."

7. **Nota fiscal**: NOVO fato confirmado pelo dono hoje (18/09) — a loja **sempre emite nota fiscal** em toda venda. Resposta fixa confirmando isso quando perguntado.

8. **Balanceamento**: R$25,00 por roda — código multiplica pela quantidade já confirmada (`dadosPreco`), se houver; se não houver quantidade ainda, usa o texto genérico "R$25 por roda" sem multiplicar.

9. **Alinhamento**: fixo — a loja não faz alinhamento, só balanceamento.

10. **Localização/endereço**: substitui o mecanismo de tag `[ENVIAR_LOCALIZACAO]` decidido pela IA livre — a intenção "pediu localização" vira decisão de código, que dispara a ação de mandar o pino/endereço real (endereço oficial: Borracharia Popular Pneus — Em frente ao posto de gasolina Pontão 24h Lunabel, Novo Gama-GO, 520 - Lunabel).

11. **Fechamento** (cliente confirma interesse em comprar — "sim", "pode ser", "beleza", ou responde com qualquer dia/horário quando perguntado "quando você consegue vir"): código manda o endereço direto, sem repetir a pergunta se ela já foi feita.

12. **Agendamento de visita com data/hora específica**: substitui o mecanismo de tag `[AGENDAR_VISITA:...]` decidido pela IA livre — a intenção "quer agendar pra tal dia/hora" vira decisão de código, que dispara a mesma ação de agendamento que já existe hoje (`processarAgendamentoAutomatico`), só que a DECISÃO de disparar sai da IA e vai pro código.

## O que é removido

- **`[TRANSFERIR_HUMANO]`**: removido de toda instrução de prompt que hoje manda a IA emitir essa tag (negociação fora da tabela, desconto inventado, cliente insistindo em falar com pessoa, etc.) — cada uma dessas situações precisa virar uma categoria determinística própria (ex.: "cliente pede desconto fora do combinado" → resposta fixa recusando com educação) em vez de uma saída genérica pra humano, já que não existe humano pra assumir. Onde o código (`botAtendimentoService.ts`) hoje trata essa tag (pausa de 120min, `motivoPausa: 'transferencia_humana'`), avaliar na implementação se o mecanismo de pausa em si tem outro uso legítimo (ex.: pausa manual pelo painel) antes de remover o código — só a INSTRUÇÃO pra IA emitir a tag sozinha precisa sumir com certeza; o mecanismo de pausa manual (alguém do painel pausando o robô) é uma coisa diferente e não deve ser tocado.

## Fora de escopo desta spec (fica como está por agora)

- Perguntas técnicas genuinamente abertas sobre o carro específico do cliente (ex.: "esse pneu aguenta quanto peso no meu modelo X") continuam na categoria `PERGUNTA_TECNICA` existente, tratada pelo caminho de IA livre residual protegido pelas travas — não dá pra enumerar todo carro/pergunta possível como resposta fixa. Se um padrão real de erro aparecer aqui depois, vira uma spec própria.
- A pergunta técnica de garantia por km específica de OUTRO contexto que não remold (ex.: garantia de fábrica genérica não ligada à conversa de remold) não foi detalhada — se o dono quiser um texto fixo específico pra isso fora do contexto remold, é uma categoria adicional a definir depois.
- Reformular/melhorar as travas de segurança existentes (`precoGuard.ts`, `comportamentoGuard.ts`) não faz parte desta spec — elas continuam como estão, protegendo o caminho de IA livre residual.

## Testes antes de subir

Mesma disciplina já usada hoje: teste standalone da Camada 2 (sem IA, `fluxoPreco.manual-test.ts`) cobrindo cada uma das 12 categorias novas com um caso real ou plausível; teste da Camada 1 com chamadas reais à API (`fluxoPrecoExtrator.manual-test.ts`) confirmando que a IA classifica corretamente cada categoria nova, rodado pelo menos 2x pra checar estabilidade; teste de ponta a ponta via curl direto no bot-service pra pelo menos os casos de maior risco (parcelamento específico e desconto, por calcularem número; agendamento e localização, por disparar ação real). Só sobe pra produção depois de tudo passar, seguindo o protocolo de reload já estabelecido pro `whatsapp-crm` sempre que o arquivo alterado for usado por ele.
