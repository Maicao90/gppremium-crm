// 22/10: a IA as vezes responde "<invoke name=...><parameter name="partes">[...]</parameter></invoke>".
// Antes a trava descartava (cliente ficava sem resposta); agora le as frases de dentro do <parameter>.
const fs = require('fs');
const f = process.argv[2] + '/src/bot-service/server.ts';
let s = fs.readFileSync(f, 'utf8');
if (s.includes('<parameter name="partes">')) { console.log('ja aplicado'); process.exit(0); }
const a = `  // A IA as vezes escreve algo antes/depois do JSON (cerca \`\`\`json, "<invoke ...>"): acha o {"partes": ...} onde estiver.`;
if (s.split(a).length !== 2) { console.error('ancora nao achada'); process.exit(1); }
s = s.replace(a, () => `  // A IA as vezes "chama uma ferramenta" em vez de escrever o JSON: <parameter name="partes">[...]</parameter> (22/10).
  const noParametro = /<parameter\\s+name="partes"\\s*>([\\s\\S]*?)<\\/parameter>/i.exec(bruto);
  if (noParametro && noParametro[1]) {
    const r = tentar(noParametro[1].trim()) || tentar(\`{"partes":\${noParametro[1].trim()}}\`);
    if (r && r.length) return { partes: r };
  }
${a}`);
fs.writeFileSync(f, s); console.log('ok');
