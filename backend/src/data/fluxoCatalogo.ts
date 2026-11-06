// CATALOGO DO FLUXO DE ATENDIMENTO (18/09) — dados puros, sem import nenhum.
//
// Fonte unica de verdade de "o que o robo sabe responder por codigo": quem usa e
//  - fluxoPreco.ts (Camada 2): pega o texto PADRAO daqui e aplica o texto EDITADO por cima;
//  - routes/fluxo.ts + tela "Fluxo" do painel: mostram o mapa e deixam o dono editar o texto.
// Texto editado pelo dono fica na tabela FluxoResposta (so a diferenca do padrao); apagar
// a edicao volta pro padrao daqui. NUMERO nunca e editavel: preco, parcela e desconto saem
// sempre da tabela de precos (categorias `calculado`), e os placeholders {XXX} sao
// preenchidos pelo codigo.
//
// REGRA DE ESCRITA de todo texto: voz direta do vendedor falando com o cliente — nunca
// meta-comentario nem "sugestao pra copiar e enviar" (incidente real da Josy, 17/09).

export type GrupoFluxo = 'preco' | 'pagamento' | 'produto' | 'servicos' | 'loja' | 'objecao' | 'filtro';

export interface CategoriaFluxo {
  chave: string; // id estavel (chave no banco) — nao renomear depois de publicado
  grupo: GrupoFluxo;
  titulo: string;
  quando: string; // quando o robo entra neste ramo
  exemplos: string[]; // frases reais/plausiveis do cliente
  partes?: string[]; // texto padrao, uma bolha de WhatsApp por item. Ausente = calculado da tabela
  placeholders?: string[]; // ex.: ['QTD', 'TOTAL'] — preenchidos pelo codigo
  calculado?: string; // como o texto e montado quando vem da tabela de precos
  acao?: string; // acao extra que o codigo dispara alem de mandar o texto
  silencio?: boolean; // o codigo decide NAO responder (sem texto pra editar)
  // Resposta em AUDIO (voz gravada pelo dono, ogg/opus em public/midias/bot-audios/<arquivo>.ogg).
  // O motor coloca o marcador [ENVIAR_AUDIO:...] nas partes (ver aplicarAudioFluxo) e o
  // botAtendimentoService manda como mensagem de voz. 'substitui' = o audio toma o lugar do texto
  // (o texto fica de reserva, so sai se o audio nao puder ser enviado); 'antes'/'depois' = o audio
  // sai junto com o texto, antes ou depois dele.
  audio?: { arquivo: string; modo: 'substitui' | 'antes' | 'depois'; transcricao?: string };
}

export const GRUPOS_FLUXO: Record<GrupoFluxo, { titulo: string; descricao: string }> = {
  preco: { titulo: 'Medida e preço', descricao: 'Do "oi" e do "quanto custa?" até o preço confirmado' },
  pagamento: { titulo: 'Pagamento', descricao: 'Parcelamento, juros e desconto' },
  produto: { titulo: 'Sobre o pneu', descricao: 'Remold, chinês, nacional e desconfiança de procedência' },
  servicos: { titulo: 'Serviços e políticas', descricao: 'Balanceamento, alinhamento, troca, usado, nota fiscal' },
  loja: { titulo: 'Loja', descricao: 'Endereço e localização' },
  objecao: { titulo: 'Objeções e despedidas', descricao: 'Reclama de preço/marca, agradece, diz que vai pensar ou que não tem interesse' },
  filtro: { titulo: 'Quem o robô não responde', descricao: 'Fornecedor, equipe e mensagem vazia: o robô fica calado e a equipe vê no painel' },
};

export const CATALOGO_FLUXO: CategoriaFluxo[] = [
  // ---------- Medida e preco ----------
  {
    chave: 'saudacao',
    grupo: 'preco',
    titulo: 'Cliente só cumprimentou (início)',
    quando: 'A mensagem é só um cumprimento ou a legenda automática do anúncio ("Olá! Posso ter mais informações sobre isso?") e ainda não tem preço na conversa. O robô cumprimenta e, na mesma resposta, pede a medida.',
    exemplos: ['oi', 'bom dia', 'tudo bem?', 'Olá! Posso ter mais informações sobre isso?'],
    partes: ['Oi, tudo bem?'],
    acao: 'Logo depois vai a bolha de "Pedir a medida".',
  },
  {
    chave: 'saudacao_retorno',
    grupo: 'preco',
    titulo: 'Cliente só cumprimentou (conversa já andando)',
    quando: 'O cliente manda só "oi"/"bom dia" depois que o preço já foi passado. O robô responde UMA vez; se o cliente repetir, fica em silêncio.',
    exemplos: ['oi', 'boa tarde', 'opa'],
    partes: ['Oi, tudo bem? Em que posso te ajudar?'],
  },
  {
    chave: 'pedir_medida',
    grupo: 'preco',
    titulo: 'Pedir a medida',
    quando: 'O cliente pergunta preço (ou parcelamento/desconto) sem dizer a medida do pneu.',
    exemplos: ['quanto custa?', 'qual o valor?', 'em 6x fica quanto?'],
    partes: ['Poderia me informar a medida do pneu (ex.: 175/65/14) ou o modelo do seu carro?'],
  },
  {
    chave: 'preco_medida',
    grupo: 'preco',
    titulo: 'Preço da medida',
    quando: 'O cliente informa uma medida que existe na tabela.',
    exemplos: ['195/55/15', '16r 205 55', 'preciso de 4 pneus 175/65/14'],
    calculado: 'Preço à vista, "parcela em até 10x" e, se houver, aviso da campanha — tudo montado a partir da tabela de preços. Se o cliente disse a quantidade, o total já vem multiplicado.',
  },
  {
    chave: 'medida_inexistente',
    grupo: 'preco',
    titulo: 'Medida que a loja não tem',
    quando: 'A medida informada não existe na tabela.',
    exemplos: ['225/70/17', '185/35/17'],
    calculado: 'Avisa que não tem essa medida e oferece até 3 medidas reais do mesmo aro, com o preço à vista de cada uma.',
    audio: { arquivo: 'so-um-instante-verificando', modo: 'antes', transcricao: 'Só um instante que eu vou verificar aqui para vocês, tá bem?' },
  },
  {
    chave: 'sem_alternativa',
    grupo: 'preco',
    titulo: 'Sem alternativa no aro',
    quando: 'A medida não existe e também não há nenhuma medida do mesmo aro na tabela.',
    exemplos: ['medida de aro que a loja não trabalha'],
    partes: ['Pra eu te passar o valor certinho sem risco de errar, me confirma a medida exata que esta escrita na lateral do pneu (ex.: 175/65/14)?'],
    audio: { arquivo: 'so-um-instante-verificando', modo: 'antes', transcricao: 'Só um instante que eu vou verificar aqui para vocês, tá bem?' },
  },

  // ---------- Pagamento ----------
  {
    chave: 'parcelamento_generico',
    grupo: 'pagamento',
    titulo: 'Parcelamento (sem citar quantas vezes)',
    quando: 'O cliente pergunta se parcela, sem dizer em quantas vezes.',
    exemplos: ['parcela?', 'dá pra parcelar?', 'tem parcelamento?'],
    partes: ['Sim, parcelamos em até 10x no cartão.'],
  },
  {
    chave: 'parcelamento_especifico',
    grupo: 'pagamento',
    titulo: 'Parcelamento em N vezes',
    quando: 'O cliente pergunta o valor em um número específico de parcelas (medida já informada, ou pergunta guardada até ele informar).',
    exemplos: ['quanto fica em 6x?', 'e em 10x?', 'parcelando em 3 vezes?'],
    calculado: 'Valor de cada parcela = total da tabela naquela quantidade ÷ N, mais o total. Nunca é editável: é conta feita com a tabela de preços.',
  },
  {
    chave: 'parcelamento_maximo',
    grupo: 'pagamento',
    titulo: 'Parcelamento acima do máximo',
    quando: 'O cliente pede mais de 10 parcelas.',
    exemplos: ['em 12x fica quanto?', 'parcela em 18x?'],
    partes: ['O máximo que a gente parcela é em 10x no cartão.'],
  },
  {
    chave: 'juros',
    grupo: 'pagamento',
    titulo: 'É sem juros?',
    quando: 'O cliente pergunta se o parcelamento tem juros.',
    exemplos: ['é sem juros?', 'esse parcelamento tem juros?'],
    partes: [
      'Tem sim um jurinho em cada parcela — o valor à vista é sempre o mais em conta.',
      'Em quantas vezes você quer parcelar? Vindo até a loja a gente também consegue negociar melhor.',
    ],
  },
  {
    chave: 'desconto_dinheiro',
    grupo: 'pagamento',
    titulo: 'Desconto à vista (dinheiro)',
    quando: 'O cliente pergunta se tem desconto, ou desconto à vista/no dinheiro.',
    exemplos: ['à vista tem desconto?', 'faz desconto?', 'no dinheiro fica quanto?'],
    calculado: '5% de desconto sobre o valor à vista da tabela, só para pagamento em DINHEIRO. Mostra o valor com desconto e o valor cheio.',
  },
  {
    chave: 'desconto_pix',
    grupo: 'pagamento',
    titulo: 'Desconto no PIX',
    quando: 'O cliente pergunta especificamente se o PIX tem desconto.',
    exemplos: ['no pix tem desconto?', 'pix faz quanto?'],
    partes: ['O desconto de 5% é só pra pagamento em dinheiro — no PIX não tem desconto, mas dá pra parcelar em até 10x se preferir.'],
  },

  // ---------- Sobre o pneu ----------
  {
    chave: 'remold',
    grupo: 'produto',
    titulo: 'É remold?',
    quando: 'O cliente pergunta se é remold/recauchutado/usado, ou desconfia ("por que é tão barato?", "é original mesmo?").',
    exemplos: ['é remold isso?', 'por que é tão barato?', 'é original mesmo?'],
    partes: [
      'Vou ser sincero com você: sim, é remold — mas não é um remold comum. O GP Premium é feito com borracha padrão europeu e passa por controle rígido de qualidade.',
      'A gente dá garantia de 2 anos e 60 mil km ou seu dinheiro de volta. Muitos clientes já aprovaram esse modelo.',
    ],
    audio: { arquivo: 'pneu-gp-premium-remold', modo: 'substitui' },
  },
  {
    chave: 'condicao',
    grupo: 'produto',
    titulo: 'É novo? / tem meia-vida? (1ª vez)',
    quando: 'O cliente pergunta se o pneu é novo, se só tem novos, ou se tem "meia-vida" (usado) — SEM falar a palavra remold. O robô não se precipita: responde com a qualidade e a garantia e não confessa remold de cara. Se o cliente perguntar de novo, aí vem a resposta honesta de remold.',
    exemplos: ['é novo?', 'tem somente novos?', 'tem meia vida ou só pneu novo?'],
    partes: [
      'O GP Premium usa borracha padrão europeu e passa por um controle rígido de qualidade.',
      'E tem garantia de 2 anos e 60 mil km ou seu dinheiro de volta. Se quiser, vem ver o pneu de perto aqui na loja.',
    ],
  },
  {
    chave: 'remold_insistencia',
    grupo: 'produto',
    titulo: 'É remold? (cliente insiste ou recusa)',
    quando: 'O cliente volta a falar de remold DEPOIS que o robô já explicou (ex.: "remold tô fora", "não vou arriscar"). Evita repetir a mesma explicação palavra por palavra.',
    exemplos: ['remold tô fora', 'mas é remold mesmo?', 'não quero remold'],
    partes: [
      'Entendo sua preocupação. Por isso a gente oferece a garantia de 2 anos e 60 mil km ou seu dinheiro de volta.',
      'Se quiser, vem até a loja ver o pneu de perto antes de decidir.',
    ],
    audio: { arquivo: 'marca-especifica', modo: 'depois', transcricao: 'Você está em busca de alguma marca específica?' },
  },
  {
    chave: 'chines',
    grupo: 'produto',
    titulo: 'É pneu chinês?',
    quando: 'O cliente pergunta explicitamente se o pneu é chinês (sem perguntar de remold).',
    exemplos: ['isso é chinês?', 'é pneu chinês?'],
    partes: [
      'Não, a gente não trabalha com pneu chinês — é borracha de baixa qualidade, que gasta rápido e roda pouco.',
      'O GP Premium é diferente: borracha padrão europeu e controle de qualidade rígido.',
    ],
  },
  {
    chave: 'nacional',
    grupo: 'produto',
    titulo: 'É nacional? / De onde vem?',
    quando: 'O cliente pergunta se o pneu é nacional, importado ou de onde vem. O texto serve pras três perguntas (por isso não começa com "sim" nem "não").',
    exemplos: ['é nacional?', 'sim mas é nacional', 'esse pneu é importado?', 'de onde vem esse pneu?'],
    partes: ['O GP Premium é nacional: fabricado aqui no Brasil, com garantia de 2 anos e 60 mil km ou seu dinheiro de volta.'],
    audio: { arquivo: 'so-um-instante-verificando', modo: 'antes', transcricao: 'Só um instante que eu vou verificar aqui para vocês, tá bem?' },
  },
  {
    chave: 'garantia',
    grupo: 'produto',
    titulo: 'Qual a garantia?',
    quando: 'O cliente pergunta quanto tempo ou quantos km de garantia o pneu tem, ou quantos km ele roda/dura. O robô responde com a voz gravada do dono (2 anos e 60 mil km); se o áudio não puder ser enviado, vai o texto.',
    exemplos: ['qual a garantia?', 'tem garantia?', 'quantos km roda esse pneu?', 'a garantia é de quanto tempo?'],
    partes: ['Os pneus GP Premium têm 2 anos de garantia e rodam 60 mil km.'],
    audio: { arquivo: 'garantia', modo: 'substitui' },
  },
  {
    chave: 'promocao_leve4',
    grupo: 'produto',
    titulo: 'Promoção compre 3 e leve 4',
    quando: 'O cliente pergunta da promoção compre 3 e leve 4: se existe, se vale, em quais medidas.',
    exemplos: ['tem a promoção compre 3 leve 4?', 'o leve 4 vale pra qual medida?', 'levando 4 eu pago 3?'],
    partes: ['A promoção existe e é válida para os pneus da marca GP Premium nas medidas 195/65/15 e 215/55/17.'],
  },
  {
    chave: 'visita_confirmada',
    grupo: 'loja',
    titulo: 'Cliente diz que vem (com dia)',
    quando: 'O cliente diz que vem na loja num dia certo ("vou sábado", "amanhã eu passo aí"). O robô confirma e agenda sozinho os lembretes: na véspera (se faltar 2 dias ou mais) e no dia de manhã. {DIA} vira "amanhã", "no sábado (25/10)"...',
    exemplos: ['vou passar aí sábado', 'amanhã cedo eu vou', 'dia 25 eu passo aí'],
    placeholders: ['DIA'],
    partes: ['Combinado! Fica anotado aqui: te espero {DIA} 😊', 'Qualquer coisa é só me chamar por aqui.'],
  },
  {
    chave: 'visita_sem_dia',
    grupo: 'loja',
    titulo: 'Cliente diz que vem (sem dia certo)',
    quando: 'O cliente diz que vem, mas sem dia certo ("semana que vem", "qualquer dia").',
    exemplos: ['semana que vem eu passo aí', 'qualquer dia eu vou'],
    partes: ['Combinado! Quando souber o dia, me avisa que eu já deixo anotado aqui 😊'],
  },
  {
    chave: 'servico_oficina',
    grupo: 'loja',
    titulo: 'Serviço de mecânica (freio, suspensão, óleo…)',
    quando: 'O cliente pergunta de serviço de oficina que não é pneu, alinhamento nem balanceamento. Na loja que é oficina (ex.: City), troque o texto e o robô passa a conversa pra equipe.',
    exemplos: ['vcs fazem freio?', 'quanto a troca de óleo?', 'olham suspensão?'],
    partes: ['Aqui a gente trabalha só com pneus — serviço de mecânica não fazemos, não.'],
  },

  {
    chave: 'outra_marca',
    grupo: 'produto',
    titulo: 'Pergunta por outra marca',
    quando: 'O cliente pergunta se a loja tem ou trabalha com outra marca de pneu (Pirelli, Dunlop, Michelin, Goodyear…).',
    exemplos: ['vc tem Pirelli ou Dunlop?', 'tem Michelin?', 'trabalha com outras marcas?'],
    partes: ['Aqui a gente trabalha só com o GP Premium — não temos outras marcas.'],
    audio: { arquivo: 'so-um-instante-verificando', modo: 'antes', transcricao: 'Só um instante que eu vou verificar aqui para vocês, tá bem?' },
  },

  // ---------- Servicos e politicas ----------
  {
    chave: 'balanceamento',
    grupo: 'servicos',
    titulo: 'Balanceamento',
    quando: 'O cliente pergunta do balanceamento e ainda não há quantidade de pneus.',
    exemplos: ['quanto é o balanceamento?', 'vocês fazem balanceamento?'],
    placeholders: ['VALOR_RODA'],
    partes: ['Balanceamento é R$ {VALOR_RODA} por roda.'],
  },
  {
    chave: 'balanceamento_quantidade',
    grupo: 'servicos',
    titulo: 'Balanceamento (com quantidade)',
    quando: 'O cliente pergunta do balanceamento e a quantidade de pneus já é conhecida (mais de 1).',
    exemplos: ['faz balanceamento? são 4 pneus'],
    placeholders: ['VALOR_RODA', 'QTD', 'TOTAL'],
    partes: ['Balanceamento é R$ {VALOR_RODA} por roda — pra {QTD} rodas fica R$ {TOTAL} no total.'],
  },
  {
    chave: 'alinhamento',
    grupo: 'servicos',
    titulo: 'Alinhamento',
    quando: 'O cliente pergunta do alinhamento.',
    exemplos: ['vocês fazem alinhamento?', 'quanto é o alinhamento?'],
    partes: ['A loja não faz alinhamento, não — só balanceamento.'],
  },
  {
    chave: 'base_troca',
    grupo: 'servicos',
    titulo: 'Base de troca',
    quando: 'O cliente quer dar o pneu usado como parte do pagamento.',
    exemplos: ['posso dar meu pneu velho na troca?', 'aceita base de troca?'],
    partes: ['A loja não trabalha com base de troca, não — só venda direta.'],
  },
  {
    chave: 'compra_usado',
    grupo: 'servicos',
    titulo: 'Compra de pneu usado',
    quando: 'O cliente quer vender o pneu usado dele para a loja.',
    exemplos: ['vocês compram pneu usado?'],
    partes: ['A loja não compra pneu usado, a gente não trabalha com isso.'],
  },
  {
    chave: 'nota_fiscal',
    grupo: 'servicos',
    titulo: 'Nota fiscal',
    quando: 'O cliente pergunta se a loja emite nota fiscal.',
    exemplos: ['emite nota fiscal?', 'vc dá nota?'],
    partes: ['Sim, a gente sempre emite nota fiscal em toda venda, pode ficar tranquilo.'],
  },

  // ---------- Loja ----------
  // (localizacao e localizacao_repetida abaixo)
  {
    chave: 'localizacao',
    grupo: 'loja',
    titulo: 'Localização da loja',
    quando: 'O cliente pede o endereço ou a localização.',
    exemplos: ['onde fica a loja?', 'manda a localização'],
    partes: ['Segue a nossa localização:'],
    acao: 'Depois do texto, o sistema envia o pino de localização real da loja (mapa).',
  },

  {
    chave: 'horario',
    grupo: 'loja',
    titulo: 'Horário de funcionamento',
    quando: 'O cliente pergunta o horário, se está aberto agora, até que horas atende.',
    exemplos: ['tá aberto agora?', 'que horas fecha?', 'qual o horário de funcionamento?'],
    partes: ['A gente atende de segunda a sexta, das 8h às 18h, e aos sábados, das 8h às 12h.'],
  },
  {
    chave: 'foto',
    grupo: 'loja',
    titulo: 'Cliente pede foto do pneu',
    quando: 'O cliente pede foto/imagem do pneu. O robô NÃO manda foto e nunca diz que vai mandar — chama pra ver o pneu de perto na loja.',
    exemplos: ['foto', 'manda foto do pneu', 'tem foto?'],
    partes: ['Pra ver o pneu de perto, é só passar aqui na loja. Quando você consegue vir?'],
  },
  {
    chave: 'localizacao_repetida',
    grupo: 'loja',
    titulo: 'Localização já enviada',
    quando: 'O cliente pede o endereço de novo, e o pino da localização já foi mandado nesta conversa há menos de 30 minutos.',
    exemplos: ['qual o endereço?', 'onde fica mesmo?'],
    partes: ['Te mandei o pino da localização aqui em cima na conversa. A gente fica em frente ao posto de gasolina Pontão 24h Lunabel, em Novo Gama-GO.'],
    acao: 'Só o texto: o pino NÃO é enviado de novo (o sistema nunca manda o pino repetido).',
  },

  // ---------- Objecoes ----------
  {
    chave: 'objecao',
    grupo: 'objecao',
    titulo: 'Reclamação de preço ou marca',
    quando: 'O cliente diz que está caro, que achou mais barato, ou desqualifica a marca — sem fazer uma pergunta nova.',
    exemplos: ['achei caro', 'essa marca não presta', 'vi mais barato em outro lugar'],
    partes: [
      'Entendo! Mas o GP Premium tem controle de qualidade rígido e garantia de 2 anos e 60 mil km ou seu dinheiro de volta — poucos por aí oferecem isso nessa faixa de preço.',
      'Dá pra parcelar em até 10x também, e vindo até a loja a gente consegue negociar melhor. Quer que eu já te passe o valor parcelado?',
    ],
  },
  {
    chave: 'objecao_repetida',
    grupo: 'objecao',
    titulo: 'Reclamação de preço ou marca (cliente insiste)',
    quando: 'O cliente volta a reclamar de preço/marca DEPOIS que o robô já respondeu a objeção. Evita repetir os mesmos argumentos.',
    exemplos: ['continua caro', 'não gostei mesmo assim'],
    partes: ['Entendo! Se quiser, vem até a loja ver o pneu de perto — pessoalmente a gente consegue negociar melhor.'],
  },
  {
    chave: 'agradecimento',
    grupo: 'objecao',
    titulo: 'Agradece, diz "ok", que vai pensar ou que não tem interesse',
    quando: 'O cliente só agradece, confirma ("ok", "blz"), se despede, diz que vai pensar ou que não tem mais interesse, SEM pedir nada. O robô responde UMA vez; se o cliente repetir, fica em silêncio (não enche a conversa de mensagem) e nunca solta horário ou outro assunto por conta própria.',
    exemplos: ['ok obrigado', 'blz', 'valeu', 'vou pensar e te falo', 'sem interesse', 'já comprei'],
    partes: ['Tranquilo! Qualquer dúvida ou se quiser fechar, é só me chamar por aqui.'],
  },
  {
    chave: 'agradecimento_atendente',
    grupo: 'objecao',
    titulo: 'Agradece numa conversa que a atendente assumiu',
    quando: 'A atendente atendeu o cliente (a conversa fica dela por 12h) e ele fecha só agradecendo ou dizendo que vai olhar e entra em contato. O robô agradece UMA vez, só quando a atendente está há 10 min ou mais sem falar na conversa e o cliente não ficou esperando retorno ("fico no aguardo" — aí quem responde é ela).',
    exemplos: ['obrigada vou olhar eu entro em contato com você', 'valeu, depois eu vejo', 'blz, obg'],
    partes: ['Eu que agradeço! Fico no aguardo 😊'],
  },
  {
    chave: 'pedir_medida_repetida',
    grupo: 'preco',
    titulo: 'Pedir a medida (cliente não deu ainda)',
    quando: 'O robô JÁ pediu a medida há pouco e o cliente pergunta preço de novo sem dar a medida. Evita repetir a mesma pergunta palavra por palavra.',
    exemplos: ['e o valor?', 'quanto custa?', 'aro 14 o preço'],
    partes: ['É só me passar a medida que está escrita na lateral do pneu (ex.: 175/65/14) ou o modelo do carro que eu já te passo o valor certinho.'],
  },

  // ---------- Quem o robo nao responde (o codigo decide o silencio) ----------
  {
    chave: 'fornecedor',
    grupo: 'filtro',
    titulo: 'Fornecedor oferecendo pra loja',
    quando: 'Quem escreve é vendedor, importadora ou distribuidora oferecendo produto/cotação PRA LOJA (não é cliente comprando). O robô fica calado — nem pede medida — e a mensagem fica no painel pra equipe decidir.',
    exemplos: ['Sou da importadora X, estou à disposição para cotações', 'segue nossa tabela de preços atualizada'],
    silencio: true,
  },
  {
    chave: 'so_pontuacao',
    grupo: 'filtro',
    titulo: 'Mensagem sem texto',
    quando: 'A mensagem é só pontuação ou sinal ("." ou "!!"), sem palavra nem número. O robô não responde.',
    exemplos: ['.', '..', '!'],
    silencio: true,
  },
  {
    chave: 'equipe_interna',
    grupo: 'filtro',
    titulo: 'Equipe, lojas e números bloqueados',
    quando: 'Quem escreve é da equipe (ex.: Danúbia), outra loja do grupo, um fornecedor cadastrado ou um número da lista de bloqueio. O robô nem lê a mensagem.',
    exemplos: ['Reforçando sobre a nova forma de solicitar reposição…'],
    silencio: true,
  },
];

// Respostas que, se o robo JA mandou o mesmo texto ha pouco na conversa, trocam pela variante
// (achado 18/09: cliente disse "remold to fora" e o robo repetiu a explicacao palavra por palavra).
// condicao ("e novo?") -> na 2a vez a "variante" e a resposta honesta de remold: o robo nao se precipita
// (19/09, caso Maxwell) mas tambem nunca sustenta a duvida do cliente sem responder de verdade.
// pedir_medida ("quanto custa?" sem medida, de novo) -> na 2a vez pede de outro jeito (21/09, caso Carlos Gomes: 3 pedidos iguais em 40s).
export const VARIANTE_REPETICAO: Record<string, string> = { remold: 'remold_insistencia', objecao: 'objecao_repetida', condicao: 'remold', pedir_medida: 'pedir_medida_repetida' };

// Respostas que o robo manda UMA vez e, se o cliente repetir o gesto, NAO repete nem cai na IA livre: fica em
// silencio (ex.: agradecimento — o cliente diz "ok" e "obrigado" em seguida; responder a cada um vira spam).
export const SILENCIO_SE_REPETIR: string[] = ['agradecimento', 'saudacao_retorno'];

export const TEXTOS_PADRAO: Record<string, string[]> = Object.fromEntries(
  CATALOGO_FLUXO.filter((c) => c.partes).map((c) => [c.chave, c.partes as string[]])
);

export type TextosFluxo = Record<string, string[]>;

// Compara sem se importar com negrito/italico do WhatsApp (*...*, _..._), maiuscula, acento, pontuacao e espacos:
// a mesma pergunta as vezes sai gravada com asteriscos ("Poderia me informar a *medida do pneu*...", 3 de 7 aberturas
// reais) e a comparacao exata nao a reconhecia (revisao 21/09).
function normalizarParaBusca(texto: string): string {
  return String(texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Quais respostas (e variantes) o robo JA mandou nesta conversa: compara cada bolha (25+ caracteres)
// do texto atual da resposta com o texto recente das mensagens do robo.
export function chavesJaRespondidas(textos: TextosFluxo | undefined, textoRecenteDoRobo: string): string[] {
  const chaves = [...new Set([...Object.entries(VARIANTE_REPETICAO).flat(), ...SILENCIO_SE_REPETIR])];
  const recente = ` ${normalizarParaBusca(textoRecenteDoRobo)} `;
  return chaves.filter((chave) => textoFluxo(textos, chave).some((p) => {
    if (p.length < 25) return false;
    const n = normalizarParaBusca(p);
    return n.length >= 20 && recente.includes(` ${n} `);
  }));
}

export function categoriaPorChave(chave: string): CategoriaFluxo | undefined {
  return CATALOGO_FLUXO.find((c) => c.chave === chave);
}

// AUDIO (15/10, gravacoes do dono): coloca o marcador do audio nas partes da resposta da chave.
//  - 'antes':    ['[ENVIAR_AUDIO:x]', ...texto]
//  - 'depois':   [...texto, '[ENVIAR_AUDIO:x]']
//  - 'substitui': ['[ENVIAR_AUDIO:x!N]', ...texto] — N = quantas partes de texto o audio substitui. Quem envia
//    (botAtendimentoService) manda o audio e PULA essas N partes; se o audio nao puder ser enviado (arquivo
//    ausente, falha de envio), o texto sai normalmente. O nome do arquivo so aceita [a-z0-9_-].
export function transcricaoDoAudioFluxo(arquivo: string): string {
  return CATALOGO_FLUXO.find((c) => c.audio?.arquivo === arquivo)?.audio?.transcricao || '';
}

export function aplicarAudioFluxo(chave: string, partes: string[]): string[] {
  const audio = categoriaPorChave(chave)?.audio;
  if (!audio || partes.length === 0 || !/^[a-z0-9_-]+$/i.test(audio.arquivo)) return partes;
  if (audio.modo === 'antes') return [`[ENVIAR_AUDIO:${audio.arquivo}]`, ...partes];
  if (audio.modo === 'depois') return [...partes, `[ENVIAR_AUDIO:${audio.arquivo}]`];
  return [`[ENVIAR_AUDIO:${audio.arquivo}!${partes.length}]`, ...partes];
}

// Texto que vale AGORA pra uma chave: o editado pelo dono (se houver e for valido), senao o padrao.
export function textoFluxo(textos: TextosFluxo | undefined, chave: string): string[] {
  const editado = textos?.[chave];
  if (Array.isArray(editado) && editado.length > 0 && editado.every((p) => typeof p === 'string' && p.trim())) return editado;
  return TEXTOS_PADRAO[chave] ?? [];
}

// Limpa o que chega de fora (payload do whatsapp-crm -> bot-service): so chaves conhecidas
// e editaveis, arrays de textos nao vazios dentro dos limites. Qualquer coisa fora disso e
// descartada e cai no texto padrao.
export function sanitizarTextosFluxo(bruto: unknown): TextosFluxo {
  const saida: TextosFluxo = {};
  if (!bruto || typeof bruto !== 'object') return saida;
  for (const [chave, valor] of Object.entries(bruto as Record<string, unknown>)) {
    if (!(chave in TEXTOS_PADRAO)) continue;
    if (!Array.isArray(valor) || valor.length === 0 || valor.length > MAX_BOLHAS) continue;
    if (!valor.every((p) => typeof p === 'string' && p.trim() && p.length <= MAX_CARACTERES_BOLHA)) continue;
    saida[chave] = valor as string[];
  }
  return saida;
}

// Preenche {PLACEHOLDER} com valores calculados pelo codigo.
export function preencherPlaceholders(partes: string[], valores: Record<string, string | number>): string[] {
  return partes.map((p) => p.replace(/\{([A-Z_]+)\}/g, (inteiro, nome: string) => (nome in valores ? String(valores[nome]) : inteiro)));
}

export const MAX_BOLHAS = 4;
export const MAX_CARACTERES_BOLHA = 600;

// Confere um texto editado ANTES de gravar. Devolve a lista de problemas (vazia = ok).
// Barra o que causaria dano: tag de acao ([...]), afirmar "sem juros" (o parcelamento tem
// juros), texto com cara de instrucao/sugestao (voz do vendedor sempre), placeholder que o
// codigo nao sabe preencher.
export function validarTextoFluxo(chave: string, partes: unknown): string[] {
  const cat = categoriaPorChave(chave);
  if (!cat || !cat.partes) return ['Esta resposta não é editável.'];
  if (!Array.isArray(partes) || partes.length === 0) return ['Escreva pelo menos uma mensagem.'];
  const problemas: string[] = [];
  if (partes.length > MAX_BOLHAS) problemas.push(`No máximo ${MAX_BOLHAS} mensagens por resposta.`);
  const permitidos = new Set(cat.placeholders || []);
  partes.forEach((p, i) => {
    const n = i + 1;
    if (typeof p !== 'string' || !p.trim()) { problemas.push(`Mensagem ${n} está vazia.`); return; }
    if (p.length > MAX_CARACTERES_BOLHA) problemas.push(`Mensagem ${n} passa de ${MAX_CARACTERES_BOLHA} caracteres — quebre em duas.`);
    if (/\[[A-Za-z_]+[^\]]*\]/.test(p)) problemas.push(`Mensagem ${n} tem um trecho entre colchetes [ ] — isso é reservado ao sistema.`);
    if (/sem\s+juros/i.test(p)) problemas.push(`Mensagem ${n} diz "sem juros" — o parcelamento tem juros, não pode prometer isso.`);
    if (/sugest[aã]o|copiar e enviar|modelo de mensagem/i.test(p)) problemas.push(`Mensagem ${n} parece uma instrução/sugestão — escreva a frase final, na voz do vendedor.`);
    for (const m of p.matchAll(/\{([A-Za-z_]+)\}/g)) {
      if (!permitidos.has(m[1] as string)) problemas.push(`Mensagem ${n} usa {${m[1]}}, que não existe nesta resposta.`);
    }
  });
  return problemas;
}
