import { TABELA_PRECOS_GP, ItemPreco, extrairMedidasDoTexto } from './tabelaPrecos';

// TRAVA DE PRECO (achado 01/09).
//
// O robo tem dois caminhos de resposta:
//   1. DETERMINISTICO — o preco vem montado da tabela, e confiavel.
//   2. IA — quando a pergunta nao e um pedido de preco puro, quem escreve o texto e o
//      modelo. E ai que ele pode digitar um numero errado. Caso real capturado em
//      teste: ele fez 269,00 x 0,95 de cabeca e escreveu R$255,55.
//
// Preco errado no WhatsApp e prejuizo pra loja ou cliente irritado no balcao. Esta
// trava confere, ANTES de enviar: todo valor em R$ da resposta precisa ser DERIVAVEL
// dos itens que estao em jogo na conversa.
//
// POR QUE SO OS ITENS DA CONVERSA: conferir contra a tabela inteira gera ~20 mil
// valores validos (61 itens x quantidades x 11 formas de pagamento x descontos) e
// qualquer numero inventado acaba colidindo com algum deles — em teste, um errado
// R$1.315,60 passou batido. Limitando as medidas citadas na conversa, o conjunto cai
// pra algumas dezenas e a trava fica precisa.

const QTD_MAX = 10; // ninguem cota mais que 10 pneus por conversa

// Servicos que a loja cobra e que NAO estao na tabela de pneus. Sem isso a trava
// barrava valores legitimos: em teste, o robo tentou responder "balanceamento R$25,00
// por roda" e foi bloqueado, deixando o cliente sem resposta (achado 02/09).
// Alinhamento nao entra aqui de proposito: a loja NAO faz esse servico.
const PRECOS_DE_SERVICO = [25.0];

function cent(n: number): string {
  return (Math.round(n * 100) / 100).toFixed(2);
}

function unidadesCobradasGuard(item: ItemPreco, q: number): number {
  // Campanha "compre 3 e leve 4": a cada 4 pneus, um sai de graca.
  if (!(item as any).compre3Leve4 || q < 4) return q;
  return q - Math.floor(q / 4);
}

function valoresDoItem(item: ItemPreco, set: Set<string>): void {
  const add = (n: number) => {
    if (!Number.isFinite(n) || n <= 0) return;
    set.add(cent(n));
    set.add(cent(n * 0.95)); // 5% a vista no PIX/dinheiro
    set.add(cent(n * 0.9)); // ate 10% nos itens da campanha
  };
  for (let q = 1; q <= QTD_MAX; q++) {
    const cobradas = unidadesCobradasGuard(item, q);
    add(item.aVista * cobradas);
    const parcelado = (item.parcelado || {}) as Record<string, number>;
    for (let n = 1; n <= 10; n++) {
      const total = parcelado['x' + n];
      if (typeof total !== 'number') continue;
      add(total * cobradas); // total financiado
      add((total * cobradas) / n); // valor de cada parcela
    }
  }
  if (typeof (item as any).portaria === 'number') add((item as any).portaria);
}

/** Extrai valores monetarios de um texto, normalizados como "269.00". */
export function valoresEmReais(texto: string): string[] {
  const achados = new Set<string>();
  const re = /R\$?\s*(\d{1,3}(?:\.\d{3})*(?:,\d{2})?|\d+(?:,\d{2})?)/gi;
  let m: RegExpExecArray | null = null;
  const alvo = String(texto || '');
  while ((m = re.exec(alvo))) {
    const bruto = String(m[1] || '').replace(/\./g, '').replace(',', '.');
    const n = Number(bruto);
    if (Number.isFinite(n) && n > 0) achados.add(cent(n));
  }
  return [...achados];
}

/**
 * Valores citados na resposta que NAO sao derivaveis dos itens em jogo.
 * Lista vazia = pode enviar.
 *
 * @param partes   as mensagens que o robo quer enviar
 * @param contexto o texto da conversa, pra saber quais medidas estao em jogo
 */
export function precosForaDaTabela(partes: string[], contexto: string): string[] {
  const usados = valoresEmReais(partes.join(' '));
  if (!usados.length) return [];

  const medidas = extrairMedidasDoTexto(contexto);
  const permitidos = new Set<string>();

  // servicos (balanceamento) e os multiplos por roda: 1 a 6 rodas
  for (const preco of PRECOS_DE_SERVICO) {
    for (let rodas = 1; rodas <= 6; rodas++) permitidos.add(cent(preco * rodas));
  }

  // Recape sempre vale: e a opcao barata e nao tem medida no nome.
  for (const item of TABELA_PRECOS_GP) {
    if (String((item as any).categoria || '') === 'recape') valoresDoItem(item, permitidos);
  }

  if (medidas.length) {
    for (const item of TABELA_PRECOS_GP) {
      if (medidas.includes(item.medida)) valoresDoItem(item, permitidos);
    }
  } else {
    // Sem medida na conversa o robo nao deveria estar cotando. Nao barra tudo (pra nao
    // travar respostas legitimas sobre recape ou servicos), mas aceita so o que sai da
    // tabela inteira — que ja pega os casos mais grosseiros de valor inventado.
    for (const item of TABELA_PRECOS_GP) valoresDoItem(item, permitidos);
  }

  // tolerancia de 1 centavo pra arredondamento de parcela
  return usados.filter((v) => {
    if (permitidos.has(v)) return false;
    const n = Number(v);
    return !permitidos.has(cent(n + 0.01)) && !permitidos.has(cent(n - 0.01));
  });
}
