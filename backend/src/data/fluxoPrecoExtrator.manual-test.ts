// Chama a OpenAI de verdade — precisa de OPENAI_API_KEY no ambiente (o processo
// bot-service ja tem via dotenv; rodar este script de dentro da pasta backend).
import 'dotenv/config';
import { extrairIntencaoPreco } from './fluxoPrecoExtrator';

const apiKey = process.env.OPENAI_API_KEY?.trim();
if (!apiKey) { console.log('SEM OPENAI_API_KEY — nao da pra rodar este teste'); process.exit(1); }

const casos: { nome: string; msg: string; contexto: string; esperado: string; medidaEsperada?: string; quantidadeEsperada?: number; escolhaEsperada?: string }[] = [
  { nome: 'Elvania: "225/70 aro 17"', msg: '225/70 aro 17', contexto: '', esperado: 'DAR_MEDIDA', medidaEsperada: '225/70/17' },
  { nome: 'medida falada: "16r 205 55"', msg: '16r 205 55', contexto: '', esperado: 'DAR_MEDIDA', medidaEsperada: '205/55/16' },
  { nome: 'pergunta tecnica: "aguenta quantos kg"', msg: 'Ele aguenta até quantos kg', contexto: 'CLIENTE: quanto ta o 215/65/16\nROBO: R$349 a vista', esperado: 'PERGUNTA_TECNICA' },
  { nome: 'quantidade: "preciso de 4"', msg: 'preciso de 4', contexto: 'ROBO: o pneu 195/55/15 sai por R$289', esperado: 'RESPONDER_QUANTIDADE', quantidadeEsperada: 4 },
  { nome: 'outro assunto: "onde fica a loja"', msg: 'onde fica a loja', contexto: '', esperado: 'OUTRO_ASSUNTO' },
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
];

(async () => {
  let erros = 0;
  for (const c of casos) {
    const r = await extrairIntencaoPreco(c.msg, c.contexto, apiKey!);
    const ok = !!r
      && r.intencao === c.esperado
      && (!c.medidaEsperada || r.medidaExtraida === c.medidaEsperada)
      && (c.quantidadeEsperada === undefined || r.quantidadeExtraida === c.quantidadeEsperada)
      && (!c.escolhaEsperada || r.escolhaAlternativa === c.escolhaEsperada);
    if (!ok) erros++;
    console.log((ok ? 'OK   ' : 'ERRO ') + c.nome + ' -> ' + JSON.stringify(r));
  }
  console.log(erros === 0 ? '\nTODOS OK' : '\n' + erros + ' ERRO(S)');
  process.exit(erros === 0 ? 0 : 1);
})();
