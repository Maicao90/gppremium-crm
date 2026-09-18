// Chama a OpenAI de verdade — precisa de OPENAI_API_KEY no ambiente (o processo
// bot-service ja tem via dotenv; rodar este script de dentro da pasta backend).
import 'dotenv/config';
import { extrairIntencaoPreco } from './fluxoPrecoExtrator';

const apiKey = process.env.OPENAI_API_KEY?.trim();
if (!apiKey) { console.log('SEM OPENAI_API_KEY — nao da pra rodar este teste'); process.exit(1); }

const casos: { nome: string; msg: string; contexto: string; esperado: string; medidaEsperada?: string; quantidadeEsperada?: number; escolhaEsperada?: string; parcelasEsperada?: number; formaEsperada?: string }[] = [
  { nome: 'Elvania: "225/70 aro 17"', msg: '225/70 aro 17', contexto: '', esperado: 'DAR_MEDIDA', medidaEsperada: '225/70/17' },
  { nome: 'medida falada: "16r 205 55"', msg: '16r 205 55', contexto: '', esperado: 'DAR_MEDIDA', medidaEsperada: '205/55/16' },
  { nome: 'pergunta tecnica: "aguenta quantos kg"', msg: 'Ele aguenta até quantos kg', contexto: 'CLIENTE: quanto ta o 215/65/16\nROBO: R$349 a vista', esperado: 'PERGUNTA_TECNICA' },
  { nome: 'quantidade: "preciso de 4"', msg: 'preciso de 4', contexto: 'ROBO: o pneu 195/55/15 sai por R$289', esperado: 'RESPONDER_QUANTIDADE', quantidadeEsperada: 4 },
  // (era OUTRO_ASSUNTO ate 18/09 — agora "onde fica" e a categoria de localizacao)
  { nome: 'outro assunto: "obrigado, vou pensar"', msg: 'obrigado, vou pensar', contexto: '', esperado: 'OUTRO_ASSUNTO' },
  { nome: 'outro assunto: "bom dia"', msg: 'bom dia', contexto: '', esperado: 'OUTRO_ASSUNTO' },
  // Gap (a) do review da Task 4: preco sem medida e a pergunta mais comum na vida real.
  { nome: 'preco sem medida: "quanto custa?"', msg: 'quanto custa?', contexto: '', esperado: 'PERGUNTAR_PRECO_SEM_MEDIDA' },
  // Gap (b) do review da Task 4: cliente escolhendo uma das alternativas ja oferecidas.
  {
    nome: 'escolher alternativa: "pode ser essa de 205/55/17"',
    msg: 'pode ser essa de 205/55/17',
    contexto: 'CLIENTE: 225/70/17\nROBO: Essa medida a gente não tem, infelizmente. No mesmo aro eu tenho: 205/50/17: R$ 339,00 à vista; 205/55/17: R$ 349,00 à vista; 215/50/17: R$ 329,00 à vista. Alguma dessas serve pra você?',
    esperado: 'ESCOLHER_ALTERNATIVA',
    escolhaEsperada: '205/55/17',
  },
  // Task remold (18/09): pergunta direta e pergunta indireta/desconfiada precisam cair
  // em PERGUNTOU_SE_E_REMOLD, nunca em PERGUNTA_TECNICA (durabilidade/kg/etc, sem
  // relacao com procedencia) nem em OUTRO_ASSUNTO.
  { nome: 'remold direto: "é remold isso?"', msg: 'é remold isso?', contexto: '', esperado: 'PERGUNTOU_SE_E_REMOLD' },
  { nome: 'remold indireto: "por que é tão barato, é chinês?"', msg: 'por que é tão barato, é chinês?', contexto: '', esperado: 'PERGUNTOU_SE_E_REMOLD' },
  { nome: 'remold indireto: "por que é tão barato?"', msg: 'por que é tão barato?', contexto: '', esperado: 'PERGUNTOU_SE_E_REMOLD' },
  { nome: 'remold indireto: "é original mesmo?"', msg: 'é original mesmo?', contexto: '', esperado: 'PERGUNTOU_SE_E_REMOLD' },

  // ===== Atendimento completo (18/09) =====
  // Chines (categoria propria) x remold — a colisao que exigiu mexer na description do CAT_G.
  { nome: 'chines explicito: "isso é chinês?"', msg: 'isso é chinês?', contexto: '', esperado: 'PERGUNTOU_SE_E_CHINES' },
  { nome: 'chines explicito: "é pneu chinês?"', msg: 'é pneu chinês?', contexto: '', esperado: 'PERGUNTOU_SE_E_CHINES' },
  // Parcelamento generico x especifico x juros
  { nome: 'parcelamento generico: "parcela?"', msg: 'parcela?', contexto: '', esperado: 'PERGUNTOU_PARCELAMENTO_GENERICO' },
  { nome: 'parcelamento generico: "dá pra parcelar?"', msg: 'dá pra parcelar?', contexto: 'ROBO: o pneu sai por R$289,00 à vista', esperado: 'PERGUNTOU_PARCELAMENTO_GENERICO' },
  { nome: 'parcelamento especifico: "quanto fica em 6x?"', msg: 'quanto fica em 6x?', contexto: 'ROBO: o pneu 195/55/15 sai por R$289,00 à vista', esperado: 'PERGUNTOU_PARCELAMENTO_ESPECIFICO', parcelasEsperada: 6 },
  { nome: 'parcelamento especifico: "Qual o valor passeando em 6 vezes" (erro de digitacao real)', msg: 'Qual o valor passeando em 6 vezes', contexto: 'ROBO: o pneu 195/55/15 sai por R$289,00 à vista', esperado: 'PERGUNTOU_PARCELAMENTO_ESPECIFICO', parcelasEsperada: 6 },
  { nome: 'parcelamento especifico: "e em 10x?"', msg: 'e em 10x?', contexto: 'ROBO: o pneu 195/55/15 sai por R$289,00 à vista', esperado: 'PERGUNTOU_PARCELAMENTO_ESPECIFICO', parcelasEsperada: 10 },
  { nome: 'parcelamento + medida na mesma mensagem', msg: '195/55/15 em 6x fica quanto?', contexto: '', esperado: 'PERGUNTOU_PARCELAMENTO_ESPECIFICO', parcelasEsperada: 6, medidaEsperada: '195/55/15' },
  { nome: 'sem juros: "é sem juros?"', msg: 'é sem juros?', contexto: 'ROBO: da pra parcelar em ate 10x no cartão', esperado: 'PERGUNTOU_SE_TEM_JUROS' },
  { nome: 'sem juros: "esse parcelamento tem juros?"', msg: 'esse parcelamento tem juros?', contexto: '', esperado: 'PERGUNTOU_SE_TEM_JUROS' },
  // Desconto a vista
  { nome: 'desconto: "à vista tem desconto?"', msg: 'à vista tem desconto?', contexto: 'ROBO: o pneu sai por R$289,00 à vista', esperado: 'PERGUNTOU_DESCONTO_AVISTA' },
  { nome: 'desconto: "faz desconto?"', msg: 'faz desconto?', contexto: '', esperado: 'PERGUNTOU_DESCONTO_AVISTA' },
  { nome: 'desconto no pix: "no pix tem desconto?"', msg: 'no pix tem desconto?', contexto: 'ROBO: o pneu sai por R$289,00 à vista', esperado: 'PERGUNTOU_DESCONTO_AVISTA', formaEsperada: 'pix' },
  { nome: 'desconto no dinheiro: "no dinheiro tem desconto?"', msg: 'no dinheiro tem desconto?', contexto: 'ROBO: o pneu sai por R$289,00 à vista', esperado: 'PERGUNTOU_DESCONTO_AVISTA', formaEsperada: 'dinheiro' },
  // Base de troca / usado / nota / balanceamento / alinhamento / localizacao
  { nome: 'base de troca: "posso dar meu pneu velho na troca?"', msg: 'posso dar meu pneu velho na troca?', contexto: '', esperado: 'OFERECEU_BASE_TROCA' },
  { nome: 'compra de usado: "vocês compram pneu usado?"', msg: 'vocês compram pneu usado?', contexto: '', esperado: 'OFERECEU_VENDER_USADO' },
  { nome: 'nota fiscal: "emite nota fiscal?"', msg: 'emite nota fiscal?', contexto: '', esperado: 'PERGUNTOU_NOTA_FISCAL' },
  { nome: 'balanceamento: "quanto é o balanceamento?"', msg: 'quanto é o balanceamento?', contexto: 'ROBO: o pneu sai por R$289,00 à vista', esperado: 'PERGUNTOU_BALANCEAMENTO' },
  { nome: 'balanceamento com quantidade: "faz balanceamento? são 4 pneus"', msg: 'faz balanceamento? são 4 pneus', contexto: '', esperado: 'PERGUNTOU_BALANCEAMENTO', quantidadeEsperada: 4 },
  { nome: 'alinhamento: "vocês fazem alinhamento?"', msg: 'vocês fazem alinhamento?', contexto: '', esperado: 'PERGUNTOU_ALINHAMENTO' },
  { nome: 'localizacao: "onde fica a loja"', msg: 'onde fica a loja', contexto: '', esperado: 'PEDIU_LOCALIZACAO' },
  { nome: 'localizacao: "manda a localização"', msg: 'manda a localização', contexto: '', esperado: 'PEDIU_LOCALIZACAO' },
  // Objecao de preco/marca (sem pergunta concreta)
  { nome: 'objecao: "achei caro"', msg: 'achei caro', contexto: 'ROBO: o pneu sai por R$289,00 à vista', esperado: 'OBJETOU_PRECO_OU_MARCA' },
  { nome: 'objecao real (conv-1204): "Essa marca nao presta,sem contar o preço que esta muito caro"', msg: 'Essa marca nao presta,sem contar o preço que esta muito caro', contexto: 'ROBO: o pneu sai por R$328,90 à vista', esperado: 'OBJETOU_PRECO_OU_MARCA' },
  { nome: 'objecao: "vi mais barato em outro lugar"', msg: 'vi mais barato em outro lugar', contexto: 'ROBO: o pneu sai por R$289,00 à vista', esperado: 'OBJETOU_PRECO_OU_MARCA' },
  // Garantia / tecnica continua sendo tecnica
  { nome: 'tecnica: "qual a garantia?"', msg: 'qual a garantia?', contexto: 'ROBO: o pneu sai por R$289,00 à vista', esperado: 'PERGUNTA_TECNICA' },
];

(async () => {
  let erros = 0;
  for (const c of casos) {
    const r = await extrairIntencaoPreco(c.msg, c.contexto, apiKey!);
    const ok = !!r
      && r.intencao === c.esperado
      && (!c.medidaEsperada || r.medidaExtraida === c.medidaEsperada)
      && (c.quantidadeEsperada === undefined || r.quantidadeExtraida === c.quantidadeEsperada)
      && (!c.escolhaEsperada || r.escolhaAlternativa === c.escolhaEsperada)
      && (c.parcelasEsperada === undefined || r.parcelasExtraida === c.parcelasEsperada)
      && (!c.formaEsperada || r.formaPagamentoExtraida === c.formaEsperada);
    if (!ok) erros++;
    console.log((ok ? 'OK   ' : 'ERRO ') + c.nome + ' -> ' + JSON.stringify(r));
  }
  console.log(erros === 0 ? '\nTODOS OK' : '\n' + erros + ' ERRO(S)');
  process.exit(erros === 0 ? 0 : 1);
})();
