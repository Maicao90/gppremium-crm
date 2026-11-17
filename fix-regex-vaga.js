// "vaga aí" com acento: \b do JS nao funciona depois de "í". Troca por um olhar-a-frente.
const fs = require('fs');
const f = '/root/ant-lab/src/workers/botAtendimentoService.ts';
let s = fs.readFileSync(f, 'utf8');
const a = String.raw`\bvagas?\s+(que|aberta|abertas|dispon[ií]ve(l|is)|na loja|a[ií])\b|`;
const b = String.raw`\bvagas?\s+(que|aberta|abertas|dispon[ií]ve(l|is)|na loja|a[ií](?![a-z]))|`;
if (s.includes(b)) console.log('ja aplicado');
else if (s.split(a).length === 2) { s = s.replace(a, () => b); fs.writeFileSync(f, s); console.log('ok'); }
else { console.error('trecho nao achado'); process.exit(1); }
const re = eval(/const REGEX_CANDIDATO = (\/.*\/i);/.exec(s)[1]);
for (const t of ['Para a vaga que está aberta ai', 'vi que tem vaga aí na loja', 'vagas disponíveis?', 'tem vaga de estacionamento?', 'qual o valor do 175/70/14', 'tem vaga pra carro?'])
  console.log(re.test(t) ? 'CURRICULO' : 'cliente  ', '|', t);
