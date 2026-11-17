// 22/10: liga o Cerebro no bot-service: rotas /api/cerebro (painel) e o ensinamento do dono valendo antes do fluxo.
const fs = require('fs');
const base = process.argv[2];
fs.copyFileSync(base + '/../cerebro.ts', base + '/src/bot-service/cerebro.ts');
console.log('src/bot-service/cerebro.ts ok');
const f = base + '/src/bot-service/server.ts';
let s = fs.readFileSync(f, 'utf8');
if (s.includes('rotasCerebro')) { console.log('server.ts ja aplicado'); process.exit(0); }
const rep = (a, b) => { const c = s.split(a).length - 1; if (c !== 1) { console.error('ocorrencias', c, JSON.stringify(a.slice(0, 90))); process.exit(1); } s = s.replace(a, () => b); };

rep(`import { resolverDiaVisita } from '../data/visita';`,
    `import { resolverDiaVisita } from '../data/visita';\nimport { rotasCerebro, licoesAtivasDaLoja, casarLicao, partesDaLicao, registrarUso } from './cerebro';`);

rep(`app.use(express.json({ limit: '15mb' }));`,
    `app.use(express.json({ limit: '15mb' }));\n// Cerebro do robo (painel): ensinamentos do dono + revisao diaria das conversas. O nginx manda /api/cerebro pra ca.\napp.use('/api/cerebro', rotasCerebro(\`http://127.0.0.1:\${process.env.BOT_SERVICE_PORT || process.env.PORT || 3010}/gerar-resposta\`));`);

rep(`    // Toda mensagem com texto passa pela leitura (23/09, "mais fechado"): antes um filtro de palavras-chave`,
`    // CEREBRO (22/10): ensinamento do dono que casa com a mensagem vale ANTES do fluxo (o dono manda).
    // responder = o texto dele; atendente = "so um instante" + etiqueta; silencio = nao responde; orientar = a IA segue a orientacao.
    let instrucaoCerebro = '';
    if (!temMidiaSemTexto && gatilho.trim()) {
      const licoes = licoesAtivasDaLoja(lojaBot?.nome);
      if (licoes.length) {
        const ctx = anteriores.slice(-6).map((m: any) => \`\${m.role === 'user' ? 'CLIENTE' : 'LOJA'}: \${semExemplos(String(m.content || '')).slice(0, 300)}\`).join('\\n');
        const l = await casarLicao(rajada.length ? rajada : [gatilho], ctx, licoes);
        if (l) {
          console.log(\`[BotService][Cerebro] ensinamento \${l.id} (\${l.acao}): \${l.situacao}\`);
          if (!req.body?.simular && !req.body?.teste) registrarUso(l.id);
          const baseCerebro = { deterministico: true, novoEstadoPreco: estadoPrecoAtual, novosDadosPreco: JSON.stringify(dadosPrecoAtuais), via: 'cerebro', assuntos: [l.situacao], rajada, simulado: !!req.body?.simular, licao: { id: l.id, situacao: l.situacao, acao: l.acao } };
          if (l.acao === 'responder') return res.json({ ...baseCerebro, partes: partesDaLicao(l), acaoTipo: 'CEREBRO', chaves: ['cerebro'] });
          if (l.acao === 'silencio') return res.json({ ...baseCerebro, partes: [], acaoTipo: 'SILENCIO', chaves: ['cerebro_silencio'] });
          if (l.acao === 'atendente') return res.json({ ...baseCerebro, partes: ['Só um instante que eu vou verificar aqui pra você, tá bem?'], acaoTipo: 'CEREBRO', chaves: ['sem_alternativa'] });
          instrucaoCerebro = \`\\nORIENTACAO DO DONO DA LOJA PARA ESTA SITUACAO ("\${l.situacao}") — siga a risca, acima das outras regras: \${l.resposta}\`;
        }
      }
    }
    // Toda mensagem com texto passa pela leitura (23/09, "mais fechado"): antes um filtro de palavras-chave`);

rep(`    if (!temMidiaSemTexto && gatilho.trim()) {
      const apiKeyFluxo = chaveDoFluxo();`,
    `    if (!temMidiaSemTexto && gatilho.trim() && !instrucaoCerebro) {
      const apiKeyFluxo = chaveDoFluxo();`);

rep(`      briefingComercial: briefingComercial + avisoData + avisoCoerencia,
    });`,
    `      briefingComercial: briefingComercial + avisoData + avisoCoerencia + instrucaoCerebro,
    });`);

fs.writeFileSync(f, s);
console.log('server.ts ok');
