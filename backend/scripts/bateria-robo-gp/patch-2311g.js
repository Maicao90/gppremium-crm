// 23/11g — FERIADO (dono: "nao quero relatorios, quero que ele nao tenha erro"). 20/11 (feriado) o robo disse "Estamos abertos agora, ate as 18h"
// e a Josy fechou as 12h; 19/11 "amanha vocês trabalham?" recebeu "Combinado!". Nos feriados nacionais o robo NAO afirma horario nem confirma
// visita: avisa que e feriado e a Josy confirma. Fora de feriado nada muda.
const fs = require('fs');
const arq = process.argv[2];
let s = fs.readFileSync(arq, 'utf8');
if (s.includes('CORRECOES 23/11g')) { console.log('ja aplicado'); process.exit(0); }
if (!s.includes('CORRECOES 23/11f')) { console.error('FALHOU: aplique antes o patch 2311f'); process.exit(1); }
const trocas = [];
const troca = (nome, de, para) => trocas.push({ nome, de, para });

troca('calendario de feriados nacionais',
String.raw`function funcionamentoAgora(agora: Date) {`,
String.raw`// CORRECOES 23/11g — feriados nacionais (data fixa + Sexta-feira Santa e Corpus Christi 2026/2027). Municipais (Luziania/Goias) o dono avisa.
const FERIADOS_FIXOS_BR: Record<string, string> = { '01/01': 'Confraternização Universal', '21/04': 'Tiradentes', '01/05': 'Dia do Trabalho', '07/09': 'Independência', '12/10': 'Nossa Senhora Aparecida', '02/11': 'Finados', '15/11': 'Proclamação da República', '20/11': 'Consciência Negra', '25/12': 'Natal' };
const FERIADOS_MOVEIS_BR: Record<string, string> = { '03/04/2026': 'Sexta-feira Santa', '04/06/2026': 'Corpus Christi', '26/03/2027': 'Sexta-feira Santa', '27/05/2027': 'Corpus Christi' };
function feriadoBR(d: Date): string | null {
  const p = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
  const [dd, mm, aaaa] = p.split('/');
  return FERIADOS_FIXOS_BR[dd + '/' + mm] || FERIADOS_MOVEIS_BR[dd + '/' + mm + '/' + aaaa] || null;
}
function funcionamentoAgora(agora: Date) {`);

troca('guarda de feriado antes das outras regras de horario',
String.raw`    const confirmaVisita = /Combinado|Te esperamos|te espero|satisfa[cç][aã]o receber|Fica anotado/i.test(resp) || (Array.isArray(body.chaves) && body.chaves.some((c: string) => /^visita_/.test(c)));`,
String.raw`    const confirmaVisita = /Combinado|Te esperamos|te espero|satisfa[cç][aã]o receber|Fica anotado/i.test(resp) || (Array.isArray(body.chaves) && body.chaves.some((c: string) => /^visita_/.test(c)));
    // CORRECOES 23/11g: feriado — nao afirma horario nem confirma visita; a atendente confirma.
    {
      // So conta feriado em dia em que a loja normalmente abre (domingo ja e "nao abre").
      const feriadoHoje = f.hoje ? feriadoBR(agora) : null, feriadoAmanha = !f.amanhaFechado ? feriadoBR(new Date(agora.getTime() + 864e5)) : null;
      if (feriadoHoje || feriadoAmanha) {
        const Ah = '(?<![A-Za-zÀ-ÿ0-9])', Zh = '(?![A-Za-zÀ-ÿ0-9])';
        const hojeH = new RegExp(Ah + '(hoje|hj|agora|j[aá] j[aá]|daqui a pouco|t[oô] indo|estou indo|indo a[ií]|chegando|mais tarde|[aà] tarde|de tarde)' + Zh, 'i').test(txt);
        const amanhaH = new RegExp(Ah + 'amanh[aã]' + Zh, 'i').test(txt);
        const pergAbreH = PERGUNTA_HORARIO.test(txt) || /\b(abert[oa]s?|fechad[oa]s?|funcionando|atendendo|trabalhando|trabalham)\b/i.test(txt);
        const vindaH = confirmaVisita || (body.via === 'ia_livre' && new RegExp(Ah + '(t[oô]u? indo|estou indo|vou|passo|passar|chego|chegar|indo|ir a[ií]|pode ser)' + Zh, 'i').test(txt) && !/\?/.test(txt));
        const doHoje = !!feriadoHoje && !amanhaH && (pergAbreH || (vindaH && hojeH));
        const doAmanha = !!feriadoAmanha && amanhaH && !hojeH && (pergAbreH || vindaH);
        if (doHoje || doAmanha) {
          console.log('[BotService][Feriado] ' + (doHoje ? 'hoje' : 'amanha') + ' e feriado (' + (doHoje ? feriadoHoje : feriadoAmanha) + ') — nao afirma horario; a atendente confirma.');
          return semAudio({ ...body, partes: [(doHoje ? 'Hoje' : 'Amanhã') + ' é feriado 😊 O horário pode ser diferente do normal. Só um instante que eu confirmo aqui pra você, tá bem?'], acaoTipo: 'PASSAR_ATENDENTE', chaves: ['assunto_atendente', 'feriado'], visita: null, deterministico: true });
        }
      }
    }`);

troca('conferente nao mexe na resposta de feriado',
String.raw`  if (!body || !Array.isArray(body.partes) || !body.partes.length || body.acaoTipo === 'SILENCIO') return false;`,
String.raw`  if (!body || !Array.isArray(body.partes) || !body.partes.length || body.acaoTipo === 'SILENCIO') return false;
  if (Array.isArray(body.chaves) && body.chaves.includes('feriado')) return false;`);

for (const t of trocas) {
  const n = s.split(t.de).length - 1;
  if (n !== 1) { console.error('FALHOU: ancora de "' + t.nome + '" apareceu ' + n + 'x (esperado 1). Nada foi gravado.'); process.exit(1); }
}
for (const t of trocas) s = s.replace(t.de, () => t.para);
fs.writeFileSync(arq, s);
console.log('aplicadas ' + trocas.length + ' trocas (23/11g feriado) em ' + arq);
