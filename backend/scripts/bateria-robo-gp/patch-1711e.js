// LOTE 4 (17/11 noite). Uso: node patch-1711e.js <server.ts>
// RESPOSTAS DO DONO (17/11, por escrito):
//  1) "A loja separa pneu?"  -> "separamos mediante ao pagamento"  (e o robo para de OFERECER "deixo separadinho")
//  2) "Quanto tempo leva a troca?" -> "e bem rapido na nossa propria oficina"
//  3) "Vende sem montar?" -> "sim e so comprar e levar a gente vende o pneu apenas sem te obrigar montar e sem enganacao aqui"
//  4) "Link de pagamento?" -> "apenas com pagamento fisico"
//  5) cliente cita preco diferente que viu no anuncio -> "passa para a atendente usando aquela msg la" (so um instante)
// MAIS: tabela de carros respeita o aro dito antes (Mauricio 19h14), medida/veiculo pesado vai pra atendente, audio que
// nao abre usa o ensinamento do dono, Peugeot 208 e EcoSport na tabela de carros.
const fs = require('fs');
const arq = process.argv[2];
let s = fs.readFileSync(arq, 'utf8');
if (s.includes('CORRECOES 17/11e')) { console.log('ja aplicado'); process.exit(0); }
if (!s.includes('CORRECOES 17/11d')) { console.error('FALHOU: aplique antes os patches ate o 1711d'); process.exit(1); }
const trocas = [];
const troca = (nome, de, para) => trocas.push({ nome, de, para });

troca('aro dito antes vale pra tabela de carros',
`          const opcoes = aroDito ? naTabela.filter((m) => m.endsWith('/' + aroDito)) : naTabela;`,
`          // CORRECOES 17/11e: o aro que o cliente ja disse antes ("Preco do pneu aro 13" -> "Corsa 1996") tambem filtra as opcoes.
          const aroAnterior = aroDito ? null : (/Show, aro (1[2-9]|2[0-2])!/.exec(lojaRecentes.join('\\n'))?.[1] || /(?:aro|roda|rodas|raio)\\s*:?\\s*(1[2-9]|2[0-2])(?!\\d)/i.exec(anteriores.filter((m: any) => m?.role === 'user').slice(-3).map((m: any) => String(m?.content ?? '')).join('\\n'))?.[1] || null);
          const doAroAnterior = aroAnterior ? naTabela.filter((m) => m.endsWith('/' + aroAnterior)) : [];
          const opcoes = aroDito ? naTabela.filter((m) => m.endsWith('/' + aroDito)) : doAroAnterior.length ? doAroAnterior : naTabela;`);

troca('mais carros',
`  kwid: { nome: 'Kwid', medidas: ['165/70/14'] },`,
`  kwid: { nome: 'Kwid', medidas: ['165/70/14'] },
  peugeot208: { nome: 'Peugeot 208', medidas: ['195/55/16', '185/65/15'] },
  ecosport: { nome: 'EcoSport', medidas: ['205/65/15', '205/60/16'] },`);
troca('nomes de carro',
`.replace(/grand siena/g, 'siena').replace(/novo /g, '');`,
`.replace(/grand siena/g, 'siena').replace(/novo /g, '')
    .replace(/(peugeot|peugeout|pegeot|pegeout|pegout|pegeuot|pejo)\\s*208/g, 'peugeot208').replace(/eco ?sporte?/g, 'ecosport');`);

troca('respostas do dono e atendente (antes da leitura da IA)',
`          partes: novas, acaoTipo: novas.length ? acaoTipo : "SILENCIO", chaves: novas.length ? [chave] : [chave, "sem_repetir"] });
        return true;
      };
`,
`          partes: novas, acaoTipo: novas.length ? acaoTipo : "SILENCIO", chaves: novas.length ? [chave] : [chave, "sem_repetir"] });
        return true;
      };
      // CORRECOES 17/11e (lote 4)
      const baseE4 = { deterministico: true, novoEstadoPreco: estadoPrecoAtual, novosDadosPreco: JSON.stringify(dadosPrecoAtuais), via: 'fluxo', assuntos: [], rajada, simulado: !!req.body?.simular };
      const textoFixoE = (partes: string[], acaoTipo: string, chave: string): void => {
        const novas = partes.filter((x) => !ditasE.includes(x));
        res.json({ ...baseE4, partes: novas, acaoTipo: novas.length ? acaoTipo : 'SILENCIO', chaves: novas.length ? [chave] : [chave, 'sem_repetir'] });
      };
      const praAtendenteE = (chave: string): void => {
        res.json({ ...baseE4, partes: ['Só um instante que eu vou verificar aqui pra você, tá bem?'], acaoTipo: 'PASSAR_ATENDENTE', chaves: ['assunto_atendente', chave] });
      };
      const temMedidaDaTabelaE = medidasEscritasNaRajada(rajada).some((m) => encontrarPrecosExatosPorMedida(m).length > 0);
      const lojaDeuPrecoE = ditasE.some((t) => /R\\$\\s*\\d/.test(t));
      // Pneu de caminhao / onibus / medida de veiculo pesado: a atendente cuida (ensinamento Lmvqsuz0e27y).
      if (!temMedidaDaTabelaE && /(\\d{3}\\s*\\/\\s*\\d{2}\\s*r?\\s*(17|19|22|24)[.,]5(?!\\d)|(?<!\\d)(9|10|11|12)00\\s*[-xX ]\\s*(20|22)(?!\\d)|(?<![a-zà-ú])(caminh[aã]o|caminh[oõ]es|carreta|[oô]nibus|bitrem|semirreboque|trator|empilhadeira)(?![a-zà-ú]))/i.test(ditoE)) { praAtendenteE('veiculo_pesado'); return; }
      // 5) Preco diferente visto no anuncio -> atendente. (189 e 199 sao a base de troca do anuncio: esses o robo explica.)
      // O titulo do anuncio clicado ("📢 [Anúncio] Pneus a partir de R$ 479") nao e o cliente falando: sai antes de conferir.
      const ditoSemAnuncioE = ditoE.split('\\n').filter((l: string) => !/^\\s*📢/u.test(l) && !/\\[An[uú]ncio\\]/i.test(l)).join('\\n');
      if (!temMedidaDaTabelaE && !/(?<!\\d)(189|199)(?!\\d)/.test(ditoSemAnuncioE) && /((an[uú]ncio|propaganda|instagram|facebook|(?<![a-z])face(?![a-z])|(?<![a-z])site(?![a-z])|status)[^\\n]{0,40}(r\\$ ?\\d|\\d{2,4} ?reais|\\d{3},\\d{2}|(est[aá]|t[aá]|de|por|era|tava|estava|[eé]) \\d{3}(?!\\s*\\/))|(r\\$ ?\\d{2,4}|\\d{3} ?reais|\\d{3},\\d{2})[^\\n]{0,40}(an[uú]ncio|propaganda|instagram|facebook)|(valor|pre[cç]o) (do|da|no|na) (an[uú]ncio|propaganda) ([eé]|era|est[aá]|t[aá]) (outro|diferente|menor|mais barato))/i.test(ditoSemAnuncioE)) { praAtendenteE('preco_do_anuncio'); return; }
      // Audio que o cliente nao consegue abrir: texto do ensinamento do dono (Lmvkvzwcp3bf).
      if (/([aá]udio (n[aã]o )?(est[aá] |t[aá] |fica )?(dispon[ií]vel|indispon[ií]vel|abrindo|abre|abriu|carrega|carregou)|n[aã]o (consigo|consegui|d[aá] pra|deu pra) (abrir|ouvir|escutar)( o| esse| os)? [aá]udios?)/i.test(ditoE) && fixoE('Lmvkvzwcp3bf', 'RESPONDER_AUDIO_INDISPONIVEL', 'audio_indisponivel')) return;
      // 1) Separar / reservar pneu: so mediante o pagamento (que e presencial — resposta 4).
      const pediuReservaE = /((separ(a|ar|e)|reserv(a|ar|e)|guard(a|ar|e)) (pra|para) mim|deixa(r)? (separad|reservad|guardad)|(pode|consegue|tem como) (separar|reservar|guardar|deixar separad)|j[aá] separa|faz(em)? reserva)/i.test(ditoE);
      const aceitouSepararE = /separadinhos/i.test(ditasE[ditasE.length - 1] || '') && /^(sim+|s|ss|quero( sim)?|pode( ser| sim)?|claro|isso|por favor|pfv|pf|opa|uhum|aham|ok|blz|beleza|deixa|separa)[\\s!.,😊👍🙏]*$/iu.test(ditoE.trim());
      if (!temMedidaDaTabelaE && (pediuReservaE || aceitouSepararE)) { textoFixoE(['A gente separa os pneus mediante o pagamento, que é feito aqui na loja 😊', ...(lojaDeuPrecoE ? ['Quando você consegue passar aqui?'] : [])], 'RESPONDER_RESERVA', 'reserva'); return; }
      // 4) Link de pagamento / pagar antes: so pagamento presencial.
      if (!temMedidaDaTabelaE && /(link[, ]+(de |pra |para |do )?pagamento|pagamento (por|pelo|via|com) link|pag(ar|o|amento) (online|antecipad|adiantad)|pagar (antes|por aqui|pelo whats)|manda (o|a) (pix|chave)|chave (do )?pix|qual ([eé] )?(o|a) (seu |sua )?(pix|chave)|fazer (um |o )?pix (agora|antes|daqui))/i.test(ditoE)) { textoFixoE(['A gente trabalha só com pagamento presencial, aqui na loja 😊'], 'RESPONDER_PAGAMENTO_PRESENCIAL', 'pagamento_presencial'); return; }
      // 3) Comprar sem montar na loja: pode.
      if (!temMedidaDaTabelaE && !/alinh|balanc/i.test(ditoE) && /(sem (a )?montagem|sem montar|sem instalar|comprar e levar|levar (pra|para) (montar|casa|outro)|montar (em outro|fora|em casa|na minha|por conta)|trocar fora|tem que montar a[ií]|obrigad[oa] a montar|(?<![a-zà-ú])s[oó] comprar( ou|,| e |\\?|$))/im.test(ditoE)) { textoFixoE(['Sim! É só comprar e levar 😉', 'A gente vende só o pneu, sem te obrigar a montar aqui, e sem enganação.'], 'RESPONDER_VENDA_SEM_MONTAGEM', 'venda_sem_montagem'); return; }
      // 2) Quanto tempo leva a troca: e rapida, na propria oficina.
      if (!temMedidaDaTabelaE && /((quanto tempo|demora|demorad|leva quanto|em quanto tempo)[^\\n]{0,40}(troc|mont|instal|coloc|servi[cç]o)|(troc|mont|instal|coloc)[a-zçã]*[^\\n]{0,30}(demora|quanto tempo|[eé] na hora|[eé] r[aá]pid)|quanto tempo (leva|demora)|leva quanto tempo|fica pronto (em|na)|d[aá] (pra|para) esperar|(troca|monta|faz) na hora)/i.test(ditoE)) { textoFixoE(['A troca é bem rápida, feita na nossa própria oficina 😊'], 'RESPONDER_TEMPO_TROCA', 'tempo_troca'); return; }
`);

// A leitura da IA as vezes falha (erro/timeout da API) e o robo pedia a medida mesmo com ela escrita na mensagem
// ("pneus 205/70 aro 15"). Se o codigo ja achou uma medida da tabela na mensagem, cota por ela mesmo sem a leitura.
troca('medida escrita vale mesmo se a leitura da IA falhar',
`        const intencoes = await extrairIntencoesPreco(rajada.length ? rajada : [gatilho], contextoRecente, apiKeyFluxo);`,
`        let intencoes = await extrairIntencoesPreco(rajada.length ? rajada : [gatilho], contextoRecente, apiKeyFluxo);
        if (!intencoes) {
          const medidaSemLeitura = [medidaJuntada, ...medidasEscritas].find((m) => !!m && encontrarPrecosExatosPorMedida(m).length > 0);
          if (medidaSemLeitura) {
            console.error(\`[BotService] leitura da IA falhou — cotando a medida \${medidaSemLeitura} que o cliente escreveu.\`);
            intencoes = [{ intencao: 'DAR_MEDIDA', medidaExtraida: medidaSemLeitura, quantidadeExtraida: null, escolhaAlternativa: null }] as any;
          }
        }`);

// Medida da tabela escrita na mensagem e o fluxo nao cotou (a leitura da IA as vezes marca "pneus 205/70 aro 15 de carga"
// como pergunta tecnica e o robo pedia a medida que ja estava escrita): o codigo cota pela tabela.
troca('medida escrita e sempre cotada',
`      // D5 — quantidade respondendo "Quantos pneus voce vai precisar?".`,
`      {
        const escritasL4 = Array.from(new Set([medidaJuntada, ...medidasEscritas].filter((m): m is string => !!m && encontrarPrecosExatosPorMedida(m).length > 0)));
        if (escritasL4.length) {
          const cot = decidirSequenciaPreco(escritasL4.map((m) => ({ intencao: 'DAR_MEDIDA', medidaExtraida: m, quantidadeExtraida: null, escolhaAlternativa: null } as any)), estadoPrecoAtual, dadosPrecoAtuais, textosFluxo, { minutosDesdeLocalizacao, jaRespondidas: [], lojaFalouHaPouco: true });
          if (cot.partes.length && cot.chaves.includes('preco_medida')) {
            const partesM = cot.partes.filter((p: string) => req.body?.audioFluxo === true || !/^\\[ENVIAR_AUDIO:[^\\]]+\\]$/i.test(p.trim()));
            if (cot.chaves.length === 1) partesM.push((cot.novosDados as any)?.quantidade ? 'Quando você consegue passar aqui na loja pra gente fazer a troca?' : 'Quantos pneus você vai precisar? A montagem do GP Premium é por nossa conta 😉');
            console.log(\`[BotService] medida \${escritasL4.join(', ')} escrita na mensagem e o fluxo nao cotou — cotando pela tabela.\`);
            return res.json({ ...baseL3, partes: partesM, acaoTipo: cot.acaoPrincipal, novoEstadoPreco: cot.novoEstado, novosDadosPreco: JSON.stringify(cot.novosDados), assuntos: cot.assuntos, chaves: cot.chaves });
          }
        }
      }
      // D5 — quantidade respondendo "Quantos pneus voce vai precisar?".`);

troca('robo nao oferece mais separar pneu',
`      if (FALA_GARANTIA.test(t)) { if (jaGarantia) return false; jaGarantia = true; }`,
`      // CORRECOES 17/11e: a loja so separa pneu mediante pagamento — o robo nao oferece "deixo separadinho".
      if (/Quer que eu deixe os pneus separadinhos/i.test(t)) return false;
      if (FALA_GARANTIA.test(t)) { if (jaGarantia) return false; jaGarantia = true; }`);

troca('IA livre nao nega a reserva',
`    // CORRECOES 17/11b: a IA livre nunca diz ao cliente que a loja nao tem o pneu/medida — isso e assunto da atendente.`,
`    // CORRECOES 17/11e: a IA livre dizia "nao trabalhamos com reserva" — a regra do dono e separar mediante o pagamento.
    if (lb && iaLivreRestrita(lb.nome)) {
      partesFinais = partesFinais.map((p: string) => /n[aã]o (a gente )?(trabalha|trabalhamos|fazemos|faz|temos) (com )?reservas?|n[aã]o consigo (deixar|separar|reservar|guardar)/i.test(p) ? 'A gente separa os pneus mediante o pagamento, que é feito aqui na loja 😊' : p);
    }
    // CORRECOES 17/11b: a IA livre nunca diz ao cliente que a loja nao tem o pneu/medida — isso e assunto da atendente.`);

for (const t of trocas) {
  const n = s.split(t.de).length - 1;
  if (n !== 1) { console.error(`FALHOU: ancora de "${t.nome}" apareceu ${n}x (esperado 1). Nada foi gravado.`); process.exit(1); }
}
for (const t of trocas) s = s.replace(t.de, () => t.para);
fs.writeFileSync(arq, s);
console.log(`aplicadas ${trocas.length} trocas (lote 4) em ${arq}`);
