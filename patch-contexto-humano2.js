// 21/10 ajuste: conversa da atendente -> marca como tratada (o Vigia nao aciona o robo de novo a cada minuto)
// e a transcricao de audio so roda depois de saber que o robo vai mesmo responder.
const fs = require('fs');
const f = process.argv[2] + '/src/workers/botAtendimentoService.ts';
let s = fs.readFileSync(f, 'utf8');
if (s.includes('// (transcricao so depois de saber que o robo responde)')) { console.log('ja aplicado'); process.exit(0); }
const rep = (a, b) => { const c = s.split(a).length - 1; if (c !== 1) { console.error('ocorrencias', c, JSON.stringify(a.slice(0, 90))); process.exit(1); } s = s.replace(a, () => b); };
rep(`    historico.reverse();
    await transcreverAudiosDoCliente(historico, params.chatJid);
    if (versoes.get(key) !== versao) return; // chegou mensagem nova enquanto transcrevia: a rodada nova responde
`, `    historico.reverse();
`);
rep(`          console.log(\`[Bot IA] \${params.chatJid}: atendente atendeu \${new Date((humano as any).timestamp).toISOString()} (< \${horas}h) — conversa e dela, robo nao entra.\`);
          return;
        }
      }
    }
`, `          console.log(\`[Bot IA] \${params.chatJid}: atendente atendeu \${new Date((humano as any).timestamp).toISOString()} (< \${horas}h) — conversa e dela, robo nao entra.\`);
          const ultimaCliente = [...historico].reverse().find((m: any) => !m.fromMe) as any;
          if (ultimaCliente?.timestamp) await marcarConversaTratada(params, new Date(ultimaCliente.timestamp)); // Vigia nao insiste
          return;
        }
      }
    }

    // Audio do cliente vira texto (transcricao so depois de saber que o robo responde).
    await transcreverAudiosDoCliente(historico, params.chatJid);
    if (versoes.get(key) !== versao) return; // chegou mensagem nova enquanto transcrevia: a rodada nova responde
`);
fs.writeFileSync(f, s); console.log('ok');
