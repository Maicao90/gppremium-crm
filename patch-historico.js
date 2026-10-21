// 21/10 (pedido do dono): o robo pedia a medida pra cliente ANTIGO que ja tinha falado a medida com a atendente.
// Agora, sem estado do robo nessa conversa, ele LE o historico: a medida mais recente que o CLIENTE escreveu (ou,
// se o cliente nao escreveu, a unica medida que a atendente cotou) vira a medida da conversa. So pergunta quem
// nunca disse a medida.
const fs = require('fs');
const f = 'src/bot-service/server.ts';
let s = fs.readFileSync(f, 'utf8');
const rep = (a, b) => { const c = s.split(a).length - 1; if (c !== 1) { console.error('ocorrencias', c, JSON.stringify(a.slice(0, 80))); process.exit(1); } s = s.replace(a, () => b); };

rep("  montarBriefingComercialDeterministico,\n} from '../data/tabelaPrecos';",
    "  montarBriefingComercialDeterministico,\n  extrairMedidasDoTexto,\n  encontrarPrecosExatosPorMedida,\n} from '../data/tabelaPrecos';");

rep("          const decisao = decidirSequenciaPreco(intencoes, estadoPrecoAtual, dadosPrecoAtuais, textosFluxo, { minutosDesdeLocalizacao, jaRespondidas, lojaFalouHaPouco });",
`          // Cliente antigo (o robo nao tem estado dessa conversa): le a medida do historico antes de responder.
          let estadoUsado = estadoPrecoAtual;
          let dadosUsados = dadosPrecoAtuais;
          if (!dadosPrecoAtuais.medida && (estadoPrecoAtual === 'sem_estado' || estadoPrecoAtual === 'aguardando_medida')) {
            const medidaHistorico = medidaDoHistorico(anteriores);
            if (medidaHistorico) {
              estadoUsado = 'preco_confirmado';
              dadosUsados = { ...dadosPrecoAtuais, medida: medidaHistorico };
              console.log(\`[BotService] medida \${medidaHistorico} lida do historico da conversa (nao pergunta de novo).\`);
            }
          }
          const decisao = decidirSequenciaPreco(intencoes, estadoUsado, dadosUsados, textosFluxo, { minutosDesdeLocalizacao, jaRespondidas, lojaFalouHaPouco });`);

rep("app.get('/health', (_req, res) => res.json({ ok: true }));",
`app.get('/health', (_req, res) => res.json({ ok: true }));

// Medida que ja apareceu na conversa (mais recente primeiro). Cliente vale mais que a loja: o que a loja escreveu
// pode ser lista de alternativas, entao da loja so conta quando a mensagem tem UMA medida so. Só medida que existe
// na tabela (senao o robo cotaria algo que nao vende).
function medidaDoHistorico(mensagens: any[]): string | null {
  const valida = (m: string) => encontrarPrecosExatosPorMedida(m).length > 0;
  for (let i = mensagens.length - 1; i >= 0; i--) {
    const m = mensagens[i];
    if (m?.role !== 'user') continue;
    const achadas = extrairMedidasDoTexto(String(m?.content || '')).filter(valida);
    if (achadas.length) return achadas[achadas.length - 1] as string;
  }
  for (let i = mensagens.length - 1; i >= 0; i--) {
    const m = mensagens[i];
    if (m?.role !== 'assistant') continue;
    const achadas = extrairMedidasDoTexto(String(m?.content || '')).filter(valida);
    if (achadas.length === 1) return achadas[0] as string;
  }
  return null;
}`);
fs.writeFileSync(f, s);
console.log('ok');
