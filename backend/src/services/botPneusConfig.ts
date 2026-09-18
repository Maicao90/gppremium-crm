import fs from 'fs';
import path from 'path';
import { TABELA_PRECOS_GP } from '../data/tabelaPrecos';

export type BotPneusConfig = Record<string, string>;

const CONFIG_PATH = path.resolve(__dirname, '../../data/bot-pneus-config.json');

function garantirDirConfig() {
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
}

function moeda(valor: number): string {
  return valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function gerarTabelaPadrao(): string {
  return TABELA_PRECOS_GP.map((item) => {
    const parcelas = [
      `1x ${moeda(item.parcelado.x1)}`,
      `2x ${moeda(item.parcelado.x2)}`,
      `3x ${moeda(item.parcelado.x3)}`,
      `4x ${moeda(item.parcelado.x4)}`,
      `5x ${moeda(item.parcelado.x5)}`,
      `6x ${moeda(item.parcelado.x6)}`,
      `7x ${moeda(item.parcelado.x7)}`,
      `8x ${moeda(item.parcelado.x8)}`,
      `9x ${moeda(item.parcelado.x9)}`,
      `10x ${moeda(item.parcelado.x10)}`,
    ].join(' | ');
    const flags = [
      item.promocao ? 'PROMO' : '',
      item.compre3Leve4 ? 'COMPRE 3 LEVE 4' : '',
    ].filter(Boolean).join(' | ');
    return [
      item.medida,
      item.modelo,
      `avista ${moeda(item.aVista)}`,
      parcelas,
      flags,
    ].filter(Boolean).join(' | ');
  }).join('\n');
}

function promptPadrao(): string {
  return [
    'Você é Charles, consultor comercial humano da Borracharia Popular.',
    'Seu foco é vender pneus GP Premium no WhatsApp com conversa natural, curta e segura.',
    'Nunca erre preço, medida, modelo, promoção, condição de pagamento ou parcelamento.',
    'Nunca fale espontaneamente sobre remold na abertura, na apresentação comercial ou ao passar preços.',
    'Se o cliente perguntar se é remold (ou insistir/desconfiar), responda com transparência, sem parecer defensivo: confirme que sim, é remold, mas não é um remold comum — borracha padrão europeu, controle rígido de qualidade, e garantia de 50 mil km ou dinheiro de volta. Depois volte rápido para segurança, prova social e custo-benefício. Nunca negue que é remold nem diga que é "novo".',
    'Se a objeção de remold ficar forte, envie automaticamente o vídeo certo sem pedir permissão antes.',
    'Se o cliente mencionar dois carros, duas medidas ou mais de um item, organize a resposta por medida e confirme tudo claramente.',
    'A conversa e fluida, como um vendedor humano de verdade: NUNCA jogue preco, parcelamento ou tabela inteira assim que o cliente so passar a medida/carro. Confirme a medida e o modelo indicado primeiro, e SO fale o preco quando o cliente perguntar quanto custa, o valor, ou pedir pra fechar.',
    'Preco se revela em ETAPAS, cada etapa em mensagem separada dentro de "partes" (nunca tudo numa mensagem so): (1) Quando o cliente perguntar o preco pela primeira vez, responda APENAS o valor a vista, direto e curto — nao fale de parcelamento nem desconto ainda. (2) So se o cliente perguntar especificamente sobre parcelar (ex.: "parcela?", "da pra fazer em 10x?"), responda quanto fica CADA parcela pra aquele numero de vezes e qual o total resultante (ex.: "em 10x fica R$X cada, total R$Y"). (3) Em mensagem separada logo depois dessa, avise que pagando a vista no PIX ou dinheiro sai 5% mais barato.',
    'Quando a tabela listar mais de um modelo pra mesma medida (nomes separados por "/", ex: "GP-1 / GP-7 / ATR"), escolha e indique APENAS UM (o primeiro da lista) como a recomendacao — nunca liste varios modelos de uma vez. So mencione as outras opcoes se o cliente pedir alternativa ou perguntar se tem outra marca.',
    'Se a mesma medida existir em mais de um modelo, confirme o uso do carro ou a preferência antes de fechar a indicação.',
    'Se o cliente pedir dia e hora para montagem, responda normalmente e emita a tag [AGENDAR_VISITA: data="YYYY-MM-DD HH:mm", loja="Borracharia Popular", servico="Montagem", cliente="NOME_DO_CLIENTE"].',
    'Não existe atendente humano pra assumir: você é quem atende, sozinho. Se o cliente pedir negociação fora da tabela ou desconto inventado, recuse com educação (o único desconto é 5% à vista em DINHEIRO, PIX não tem desconto) e convide pra negociar na loja.',
    'Quando precisar enviar vídeo, use [ENVIAR_VIDEO: slug=nome-do-video, legenda="texto opcional"].',
    'A loja do atendimento é a Borracharia Popular e o telefone da loja é 61 3774-2114.',
  ].join('\n');
}

export function botPneusConfigPadrao(): BotPneusConfig {
  return {
    NOME_LOJA: 'Borracharia Popular',
    TELEFONE: '(61) 3774-2114',
    NOME_ATENDENTE: 'Charles',
    HORARIO: 'Segunda a sexta de 08h às 18h\nSábado de 08h às 12h',
    LOCALIZACAO: 'Borracharia Popular\nTelefone: (61) 3774-2114',
    PRIMEIRA_MENSAGEM: 'Olá! Sou o Charles da Borracharia Popular. Me passa por favor a medida do pneu e, se quiser, o modelo do carro pra eu te passar a opção certa.',
    TABELA_PRECOS: gerarTabelaPadrao(),
    PROMPT_ATENDIMENTO: promptPadrao(),
  };
}

export function lerBotPneusConfig(): BotPneusConfig {
  try {
    garantirDirConfig();
    if (!fs.existsSync(CONFIG_PATH)) {
      const base = botPneusConfigPadrao();
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(base, null, 2), 'utf-8');
      return base;
    }
    const bruto = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    return { ...botPneusConfigPadrao(), ...(bruto || {}) };
  } catch {
    return botPneusConfigPadrao();
  }
}

export function salvarBotPneusConfig(config: BotPneusConfig): BotPneusConfig {
  const base = botPneusConfigPadrao();
  const limpandoVazios = Object.fromEntries(
    Object.entries(config || {}).filter(([, valor]) => String(valor ?? '').trim() !== ''),
  );
  const finalCfg = { ...base, ...limpandoVazios };
  garantirDirConfig();
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(finalCfg, null, 2), 'utf-8');
  return finalCfg;
}

export function montarPromptAtendimentoBot(config?: BotPneusConfig): string {
  const cfg = config || lerBotPneusConfig();
  return [
    cfg.PROMPT_ATENDIMENTO || promptPadrao(),
    '',
    `Loja: ${cfg.NOME_LOJA || 'Borracharia Popular'}`,
    `Telefone: ${cfg.TELEFONE || '(61) 3774-2114'}`,
    `Atendente: ${cfg.NOME_ATENDENTE || 'Charles'}`,
    `Horario: ${cfg.HORARIO || ''}`,
    `Localizacao: ${cfg.LOCALIZACAO || ''}`,
    `Mensagem inicial oficial: ${cfg.PRIMEIRA_MENSAGEM || ''}`,
    '',
    'Tabela oficial de apoio:',
    cfg.TABELA_PRECOS || gerarTabelaPadrao(),
  ].join('\n').trim();
}
