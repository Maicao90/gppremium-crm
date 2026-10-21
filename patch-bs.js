const fs = require('fs');
const f = 'src/bot-service/server.ts';
let s = fs.readFileSync(f, 'utf8');
const rep = (a, b, n = 1) => { const c = s.split(a).length - 1; if (c !== n) { console.error('ocorrencias', c, JSON.stringify(a.slice(0, 90))); process.exit(1); } s = s.split(a).join(b); };

// 1) IA livre com os dados da loja certa
rep("  briefingComercial: string;\n", "  briefingComercial: string;\n  lojaBot?: LojaBot | null;\n");
rep(`  const config = lerBotPneusConfig();
  const promptBase = montarPromptAtendimentoBot(config);`,
`  // 21/10: no numero de outra loja (GP, City...) o prompt usa nome/telefone/horario/endereco DESSA loja.
  const lb = args.lojaBot;
  const configGeral = lerBotPneusConfig();
  const config = lb ? { ...configGeral, NOME_LOJA: lb.nome, TELEFONE: lb.telefone || configGeral.TELEFONE, HORARIO: lb.horario || configGeral.HORARIO, LOCALIZACAO: lb.localizacao || configGeral.LOCALIZACAO } : configGeral;
  let promptBase = montarPromptAtendimentoBot(config);
  if (lb) {
    promptBase = promptBase.replace(/Borracharia Popular/g, lb.nome);
    if (lb.telefone) promptBase = promptBase.replace(/\\(?61\\)? ?3774-2114/g, lb.telefone);
  }`);
rep(`loja="Borracharia Popular"`, `loja="\${(args.lojaBot && args.lojaBot.nome) || 'Borracharia Popular'}"`);

// 2) tipo
rep("interface RespostaBotBridge {", `// Dados da loja do numero que recebeu a mensagem (vem do whatsapp-crm; null = config geral).
interface LojaBot { nome: string; telefone: string; horario: string; localizacao: string; localizacaoTexto: string }

interface RespostaBotBridge {`);

// 3) no handler: le a loja e troca os textos de horario/endereco do fluxo
rep("    const textosFluxo = sanitizarTextosFluxo(req.body?.textosFluxo);\n",
`    const textosFluxo = sanitizarTextosFluxo(req.body?.textosFluxo);
    const lb = req.body?.lojaBot;
    const lojaBot: LojaBot | null = lb && typeof lb === 'object' && typeof lb.nome === 'string' && lb.nome.trim()
      ? { nome: String(lb.nome).trim(), telefone: String(lb.telefone || ''), horario: String(lb.horario || ''), localizacao: String(lb.localizacao || ''), localizacaoTexto: String(lb.localizacaoTexto || '') }
      : null;
    if (lojaBot?.horario) textosFluxo.horario = [\`A gente atende \${lojaBot.horario}.\`];
    if (lojaBot?.localizacaoTexto) textosFluxo.localizacao_repetida = [\`Te mandei o pino da localização aqui em cima na conversa. A gente fica \${lojaBot.localizacaoTexto}.\`];
`);
rep("gerarRespostaViaOpenAI({\n", "gerarRespostaViaOpenAI({\n      lojaBot,\n", 4);
fs.writeFileSync(f, s);
console.log('ok');
