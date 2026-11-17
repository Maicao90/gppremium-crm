// LOTE 3 (17/11): situacoes que o Cerebro ja ensina, mas que dependiam de a IA "casar" o ensinamento ou de improviso.
// So entram quando o fluxo fixo nao respondeu (ficam no lugar da IA livre). Uso: node patch-1711d.js <server.ts>
//  D1 ja comprou na loja / D2 ja resolveu / D3 desistiu  -> o TEXTO do ensinamento do dono (lido do Cerebro pelo id).
//  D5 quantidade ("so 2", "o par") depois de "Quantos pneus?" -> total pela tabela.
//  D6 "so tem essa marca?" -> regra de outra marca.
//  D7 cidade/bairro ("moro em Valparaiso") -> perto/longe + proximo passo (ensinamento Lmvk9192l4m5).
//  D8 "vou ver" / "depois te falo" -> agradece e aguarda (ensinamento Lmvtv5rzz3ew).
//  D9 "falo com o Charles?" / "Atendente" -> nome da atendente.
const fs = require('fs');
const arq = process.argv[2];
let s = fs.readFileSync(arq, 'utf8');
if (s.includes('CORRECOES 17/11d')) { console.log('ja aplicado'); process.exit(0); }
if (!s.includes('CORRECOES 17/11c')) { console.error('FALHOU: aplique antes os patches 1711, 1711b e 1711c'); process.exit(1); }
const trocas = [];
const troca = (nome, de, para) => trocas.push({ nome, de, para });

troca('D9 nome',
`|^\\s*atendente\\s*\\?)/im;`,
`|^\\s*atendente\\s*\\?|falo com (o|a|quem)\\b[^?\\n]{0,25}\\?|^\\s*atend[a-z]{3,8}\\s*\\??\\s*$)/im;`);

troca('bloco do lote 3',
`    // 12/11 (dono: "reduz bastante o fluxo de IA livre, a IA ta errando muito"): loja com IA_LIVRE_RESTRITA so deixa a`,
`    // CORRECOES 17/11d (lote 3): respostas fixas pro que o fluxo nao respondeu, antes de cair na IA livre.
    if (lb && iaLivreRestrita(lb.nome) && !temFoto && motivoLivre !== 'midia_sem_texto' && rabo.length && rajada.length) {
      const baseL3 = { deterministico: true, novoEstadoPreco: estadoPrecoAtual, novosDadosPreco: JSON.stringify(dadosPrecoAtuais), via: 'fluxo', assuntos: assuntosLidos, rajada, simulado: !!req.body?.simular };
      const ditoL3 = rajada.join('\\n');
      const semPerguntaL3 = !/\\?/.test(ditoL3);
      const semMedidaNovaL3 = !medidasEscritasNaRajada(rajada).length && !/\\d{3}\\s*[\\/xX.\\-]\\s*\\d{2}/.test(ditoL3);
      const ditasL3 = anteriores.filter((m: any) => m?.role === 'assistant').slice(-6).map((m: any) => String(m?.content ?? ''));
      const lojaDeuPrecoL3 = ditasL3.some((t) => /R\\$\\s*\\d/.test(t));
      const medidaL3 = [dadosPrecoAtuais.medida, medidaDoHistorico(anteriores)].find((m) => !!m && encontrarPrecosExatosPorMedida(m).length > 0);
      // Texto do ensinamento do dono (Cerebro), pelo id: se ele editar ou desligar la, vale aqui.
      const licaoFixa = (id: string): string[] | null => {
        const l = licoesAtivasDaLoja(lojaBot?.nome).find((x) => x.id === id && x.acao === 'responder');
        const p = l ? partesDaLicao(l, req.body?.audioFluxo === true) : [];
        return p.length ? p : null;
      };
      const responderFixo = (partes: string[], acaoTipo: string, chave: string, extra: any = {}) => {
        const novas = partes.filter((p) => !ditasL3.includes(p));
        if (!novas.length) return res.json({ ...baseL3, partes: [], acaoTipo: 'SILENCIO', chaves: [chave, 'sem_repetir'] });
        return res.json({ ...baseL3, ...extra, partes: novas, acaoTipo, chaves: [chave] });
      };
      const cotarL3 = (medida: string, quantidade: number | null) => decidirSequenciaPreco([{ intencao: 'DAR_MEDIDA', medidaExtraida: medida, quantidadeExtraida: quantidade, escolhaAlternativa: null } as any], 'preco_confirmado', dadosPrecoAtuais, textosFluxo, { minutosDesdeLocalizacao, jaRespondidas: [], lojaFalouHaPouco: true });
      // D5 — quantidade respondendo "Quantos pneus voce vai precisar?".
      if (medidaL3 && ditasL3.slice(-2).some((t) => /Quantos pneus/i.test(t)) && ditoL3.length <= 40) {
        const q = /^\\s*(?:s[oó] |somente |apenas |os |as |uns |umas |de |[eé] |seria |seriam |vou querer |quero )?(\\d{1,2}|um|uma|dois|duas|tr[eê]s|quatro|cinco|seis|oito|o par|um par|par|o jogo|um jogo|jogo)(?: pneus?| unidades?| pe[cç]as?)?(?: mesmo| s[oó]| por enquanto)?[\\s!.]*$/i.exec(ditoL3.trim());
        if (q) {
          const palavra = String(q[1]).toLowerCase();
          const mapa: Record<string, number> = { um: 1, uma: 1, dois: 2, duas: 2, tres: 3, 'três': 3, quatro: 4, cinco: 5, seis: 6, oito: 8, par: 2, 'o par': 2, 'um par': 2, jogo: 4, 'o jogo': 4, 'um jogo': 4 };
          const qtd = /^\\d+$/.test(palavra) ? Number(palavra) : (mapa[palavra] ?? 0);
          if (qtd >= 1 && qtd <= 20) {
            const cot = cotarL3(medidaL3, qtd);
            if (cot.partes.length && cot.chaves.includes('preco_medida')) {
              const partesQ = cot.partes.filter((p: string) => req.body?.audioFluxo === true || !/^\\[ENVIAR_AUDIO:[^\\]]+\\]$/i.test(p.trim()));
              if (cot.chaves.length === 1) partesQ.push('Quando você consegue passar aqui na loja pra gente fazer a troca?');
              return res.json({ ...baseL3, partes: partesQ, acaoTipo: cot.acaoPrincipal, novoEstadoPreco: cot.novoEstado, novosDadosPreco: JSON.stringify(cot.novosDados), assuntos: cot.assuntos, chaves: cot.chaves });
            }
          }
        }
      }
      // D6 — "so tem essa marca?" / "tem outra marca?": regra de outra marca (na GP, a atendente assume).
      if (semMedidaNovaL3 && /(s[oó] (tem|t[eê]m|trabalha[m]?|vende[m]?) (com )?(ess[ae]|uma|a) marca|tem (de )?outra[s]? marca[s]?|outras marcas|s[oó] (tem )?gp)/i.test(ditoL3)) {
        return res.json({ ...baseL3, partes: textoFluxo(textosFluxo, 'outra_marca'), acaoTipo: 'RESPONDER_OUTRA_MARCA', chaves: ['outra_marca'] });
      }
      // D7 — o cliente diz a cidade/bairro onde mora (ensinamento Lmvk9192l4m5: perto = "pertinho"; mais longe = "relativamente proximos", nunca "pertinho"; sempre puxar o proximo passo).
      if (semPerguntaL3 && semMedidaNovaL3 && ditoL3.length <= 60) {
        const PERTO = /(luzi[aâ]nia|jardim ing[aá]|\\bing[aá]\\b|valpara[ií]so|cidade ocidental|\\bocidental\\b|novo gama|\\bgama\\b|c[eé]u azul|pedregal|lago azul)/i;
        const MEDIO = /(bras[ií]lia|taguatinga|ceil[aâ]ndia|recanto|samambaia|santa maria|\\bguar[aá]\\b|[aá]guas lindas|planaltina|sobradinho|riacho fundo|n[uú]cleo bandeirante|s[aã]o sebasti[aã]o|parano[aá]|cristalina|santo ant[oô]nio do descoberto)/i;
        const falaOndeMora = /(?<![a-zà-ú])(moro|sou|estou|fico|trabalho|t[oô]|resido|somos|estamos)\\s+(aqui\\s+)?(em|no|na|de|do|da)(?![a-zà-ú])/i.test(ditoL3);
        // "E em Luziania" / "Ficam em Luziania" e pergunta sobre a LOJA, nao onde o cliente mora: nao entra aqui.
        const sobreALojaL3 = /(?<![a-zà-ú])(fica|ficam|loja|voc[eê]s|vcs|onde|aonde)(?![a-zà-ú])/i.test(ditoL3);
        const semCumprimentoL3 = ditoL3.replace(/(bom dia|boa tarde|boa noite|oi+|ol[aá])[\\s!.,]*/gi, '').trim();
        const soACidade = /^(?:aqui (?:em|no|na)\\s+)?[a-zà-ú]+(?: [a-zà-ú]+){0,3}(?:\\s*[-,\\/]?\\s*(?:go|df))?[\\s!.]*$/i.test(semCumprimentoL3) && !/^(e|é|em|no|na)\\s/i.test(semCumprimentoL3);
        const perto = PERTO.test(ditoL3), medio = !perto && MEDIO.test(ditoL3);
        if ((perto || medio) && (falaOndeMora || soACidade) && !sobreALojaL3) {
          const reacao = perto ? 'Que bom, é pertinho da gente! 😊' : 'Estamos relativamente próximos, vale a pena vir! 😊';
          if (!medidaL3) return responderFixo([reacao, ...textoFluxo(textosFluxo, 'pedir_medida')], 'RESPONDER_CIDADE', 'cidade', { novoEstadoPreco: 'aguardando_medida' });
          if (lojaDeuPrecoL3) return responderFixo([reacao, 'Não precisa agendar: é só chegar que a gente te atende. Quer que eu te mande a localização?'], 'RESPONDER_CIDADE', 'cidade');
          const cot = cotarL3(medidaL3, dadosPrecoAtuais.quantidade ?? null);
          if (cot.partes.length && cot.chaves.includes('preco_medida')) {
            return res.json({ ...baseL3, partes: [reacao, ...cot.partes.filter((p: string) => !/^\\[ENVIAR_AUDIO:[^\\]]+\\]$/i.test(p.trim()))], acaoTipo: 'RESPONDER_CIDADE', novoEstadoPreco: cot.novoEstado, novosDadosPreco: JSON.stringify(cot.novosDados), chaves: ['cidade', ...cot.chaves] });
          }
        }
      }
      // D8 — "vou ver" / "depois te falo" (ensinamento Lmvtv5rzz3ew: agradecer e dizer que fica aguardando).
      if (semPerguntaL3 && semMedidaNovaL3 && ditoL3.length <= 60 && /^\\s*(ok[,.!]?\\s*|blz[,.!]?\\s*|certo[,.!]?\\s*|beleza[,.!]?\\s*)?(vou (ver|olhar|conferir|verificar|dar uma olhada|perguntar|falar com|pensar)|vou te (mandar|falar|avisar|passar)|depois (eu )?(vejo|falo|mando|te falo|te aviso|te mando)|te aviso|qualquer coisa (eu )?(te )?(aviso|falo|chamo))/i.test(ditoL3)) {
        return responderFixo(['Obrigada! Fico no aguardo 😊'], 'RESPONDER_VAI_VER', 'vai_ver_depois');
      }
    }
    // 12/11 (dono: "reduz bastante o fluxo de IA livre, a IA ta errando muito"): loja com IA_LIVRE_RESTRITA so deixa a`);

troca("lote 3 parte 1 (antes da leitura da IA)",
`    // CORRECOES 17/11c (lote 2)`,
`    // CORRECOES 17/11d (lote 3, parte 1): ja comprou na loja / ja resolveu / desistiu. Decidido pelo codigo ANTES da leitura da IA
    // (ela as vezes lia "eu ja coloquei" como cumprimento). O texto e o do ensinamento do dono no Cerebro, pelo id.
    if (lb && iaLivreRestrita(lb.nome) && rajada.length && rabo.length && !imagem && !audio?.base64) {
      const ditoE = rajada.join("\\n");
      const semMedidaE = !medidasEscritasNaRajada(rajada).length && !/\\d{3}\\s*[\\/xX.\\-]\\s*\\d{2}/.test(ditoE);
      const semPerguntaE = !/\\?/.test(ditoE);
      const ditasE = anteriores.filter((m: any) => m?.role === "assistant").slice(-6).map((m: any) => String(m?.content ?? ""));
      const fixoE = (id: string, acaoTipo: string, chave: string): boolean => {
        const l = licoesAtivasDaLoja(lojaBot?.nome).find((x) => x.id === id && x.acao === "responder");
        const p = l ? partesDaLicao(l, req.body?.audioFluxo === true) : [];
        if (!p.length) return false;
        const novas = p.filter((x) => !ditasE.includes(x));
        res.json({ deterministico: true, novoEstadoPreco: estadoPrecoAtual, novosDadosPreco: JSON.stringify(dadosPrecoAtuais), via: "fluxo", assuntos: [], rajada, simulado: !!req.body?.simular,
          partes: novas, acaoTipo: novas.length ? acaoTipo : "SILENCIO", chaves: novas.length ? [chave] : [chave, "sem_repetir"] });
        return true;
      };
      if (semMedidaE && /(j[aá] (foi|fui|fomos|passou|passei) a[ií]|(foi|fomos|fui) a[ií] (e )?(j[aá] )?(comprou|compramos|comprei)|(comprou|compramos|comprei) a[ií](?![a-zà-ú])|j[aá] comprou (a[ií]|com voc[eê]s))/i.test(ditoE) && fixoE("Lmvv3thl12am", "RESPONDER_JA_COMPROU", "ja_comprou_na_loja")) return;
      if (semMedidaE && semPerguntaE && /(j[aá] (coloquei|instalei|troquei|resolvi|montei|arrumei)(?![a-zà-ú])|j[aá] est[aá] (montad|instalad|resolvid)|j[aá] esta montando)/i.test(ditoE) && fixoE("Lmvv3thls1jw", "RESPONDER_JA_RESOLVEU", "ja_resolveu")) return;
      if (semMedidaE && semPerguntaE && /(n[aã]o (vou|vai|vamos) (mais )?(querer|precisar|comprar)|n[aã]o quero mais|n[aã]o precis[oa] mais|por enquanto n[aã]o|vou deixar (pra|para) (a )?pr[oó]xima|fica (pra|para) (a )?pr[oó]xima|deixa (pra|para) (depois|a pr[oó]xima)|desisti(?![a-zà-ú])|vendi o carro|n[aã]o tenho (mais )?interesse|sem interesse)/i.test(ditoE) && fixoE("Lmvk919212kn", "RESPONDER_DESISTIU", "desistiu")) return;
    }
    // CORRECOES 17/11c (lote 2)`);

for (const t of trocas) {
  const n = s.split(t.de).length - 1;
  if (n !== 1) { console.error(`FALHOU: ancora de "${t.nome}" apareceu ${n}x (esperado 1). Nada foi gravado.`); process.exit(1); }
}
for (const t of trocas) s = s.replace(t.de, () => t.para);
fs.writeFileSync(arq, s);
console.log(`aplicadas ${trocas.length} trocas (lote 3) em ${arq}`);
