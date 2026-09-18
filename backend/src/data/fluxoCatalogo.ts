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

export type GrupoFluxo = 'preco' | 'pagamento' | 'produto' | 'servicos' | 'loja' | 'objecao';

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
}

export const GRUPOS_FLUXO: Record<GrupoFluxo, { titulo: string; descricao: string }> = {
  preco: { titulo: 'Medida e preço', descricao: 'Do "quanto custa?" até o preço confirmado' },
  pagamento: { titulo: 'Pagamento', descricao: 'Parcelamento, juros e desconto' },
  produto: { titulo: 'Sobre o pneu', descricao: 'Remold e desconfiança de procedência' },
  servicos: { titulo: 'Serviços e políticas', descricao: 'Balanceamento, alinhamento, troca, usado, nota fiscal' },
  loja: { titulo: 'Loja', descricao: 'Endereço e localização' },
  objecao: { titulo: 'Objeções', descricao: 'Cliente reclama de preço ou marca' },
};

export const CATALOGO_FLUXO: CategoriaFluxo[] = [
  // ---------- Medida e preco ----------
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
  },
  {
    chave: 'sem_alternativa',
    grupo: 'preco',
    titulo: 'Sem alternativa no aro',
    quando: 'A medida não existe e também não há nenhuma medida do mesmo aro na tabela.',
    exemplos: ['medida de aro que a loja não trabalha'],
    partes: ['Pra eu te passar o valor certinho sem risco de errar, me confirma a medida exata que esta escrita na lateral do pneu (ex.: 175/65/14)?'],
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
      'A gente dá garantia de 50 mil km ou seu dinheiro de volta. Muitos clientes já aprovaram esse modelo.',
    ],
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
  {
    chave: 'localizacao',
    grupo: 'loja',
    titulo: 'Localização da loja',
    quando: 'O cliente pede o endereço ou a localização.',
    exemplos: ['onde fica a loja?', 'manda a localização'],
    partes: ['Segue a nossa localização:'],
    acao: 'Depois do texto, o sistema envia o pino de localização real da loja (mapa).',
  },

  // ---------- Objecoes ----------
  {
    chave: 'objecao',
    grupo: 'objecao',
    titulo: 'Reclamação de preço ou marca',
    quando: 'O cliente diz que está caro, que achou mais barato, ou desqualifica a marca — sem fazer uma pergunta nova.',
    exemplos: ['achei caro', 'essa marca não presta', 'vi mais barato em outro lugar'],
    partes: [
      'Entendo! Mas o GP Premium tem controle de qualidade rígido e garantia de 50 mil km ou seu dinheiro de volta — poucos por aí oferecem isso nessa faixa de preço.',
      'Dá pra parcelar em até 10x também, e vindo até a loja a gente consegue negociar melhor. Quer que eu já te passe o valor parcelado?',
    ],
  },
];

export const TEXTOS_PADRAO: Record<string, string[]> = Object.fromEntries(
  CATALOGO_FLUXO.filter((c) => c.partes).map((c) => [c.chave, c.partes as string[]])
);

export type TextosFluxo = Record<string, string[]>;

export function categoriaPorChave(chave: string): CategoriaFluxo | undefined {
  return CATALOGO_FLUXO.find((c) => c.chave === chave);
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
