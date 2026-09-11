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
