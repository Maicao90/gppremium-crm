// 22/10 — revisao das 71 conversas do robo (bot-service, sem reiniciar o WhatsApp):
// 1) O robo lia o EXEMPLO da propria pergunta ("ex.: 175/65/14") como medida do cliente: "14" virava "14 pneus
//    175/65/14 = R$ 3.486"; audio pedindo 195/55/15 virava 175/65/14. Exemplos saem do historico e do contexto.
// 2) "14" / "aro 15" sozinho (sem medida conhecida) = ARO, nunca quantidade: pergunta o carro numa frase.
// 3) Medida com varios modelos (265/60/18 H/T, ATR, Brutus): o cliente que cita o modelo (ou veio do anuncio do
//    Brutus) recebe o preco DESSE modelo — antes o total dos 4 saia com o preco do H/T.
// 4) Resposta da IA em lista JSON (["...","..."]) e lida como bolhas, nunca vai crua.
const fs = require('fs');
const base = process.argv[2];
function patch(rel, trocas, marca) {
  const f = base + '/' + rel;
  let s = fs.readFileSync(f, 'utf8');
  const crlf = s.includes('\r\n'); s = s.replace(/\r\n/g, '\n');
  if (s.includes(marca)) { console.log(rel, 'ja aplicado'); return; }
  for (const [a, b, n] of trocas) {
    const c = s.split(a).length - 1;
    if (c !== (n || 1)) { console.error(rel, 'ocorrencias', c, JSON.stringify(a.slice(0, 90))); process.exit(1); }
    s = s.split(a).join(b);
  }
  if (crlf) s = s.replace(/\n/g, '\r\n');
  fs.writeFileSync(f, s); console.log(rel, 'ok');
}

// ---------- fluxoPreco: modelo escolhido pelo cliente ----------
patch('src/data/fluxoPreco.ts', [
  [`  intencaoPendente?: 'parcelamento_especifico' | 'desconto_avista';
  parcelasPendentes?: number;
}`,
`  intencaoPendente?: 'parcelamento_especifico' | 'desconto_avista';
  parcelasPendentes?: number;
  // Modelo que o cliente escolheu/citou (ex.: 'BRUTUS') quando a medida tem mais de um (22/10).
  modelo?: string;
}

// Medida com mais de um modelo: usa o que o cliente citou; senao o primeiro da tabela (decisivo, achado 09/09).
export function escolherItem(itens: ItemPreco[], modelo?: string): ItemPreco {
  const alvo = String(modelo || '').toUpperCase().replace(/\\s+/g, '');
  const achado = alvo ? itens.find((i) => i.modelo.toUpperCase().replace(/\\s+/g, '').includes(alvo)) : undefined;
  return (achado || itens[0]) as ItemPreco;
}`],
  [`function montarAcaoParaMedida(medida: string, textos: TextosFluxo, quantidade: number | null = null, pedido?: PedidoEspecifico, comAvista = false): ResultadoDecisao {
  const itens = encontrarPrecosExatosPorMedida(medida);
  if (itens.length > 0) {
    // Achado 09/09 (SEJA DECISIVO): quando ha mais de um modelo pra mesma medida,
    // pega o primeiro em vez de perguntar — a loja ja escolhe por preco/uso.
    const item: ItemPreco = itens[0]!;
    const novosDados = dadosComQuantidade({ medida: item.medida }, quantidade);`,
`function montarAcaoParaMedida(medida: string, textos: TextosFluxo, quantidade: number | null = null, pedido?: PedidoEspecifico, comAvista = false, modelo?: string): ResultadoDecisao {
  const itens = encontrarPrecosExatosPorMedida(medida);
  if (itens.length > 0) {
    // Achado 09/09 (SEJA DECISIVO): quando ha mais de um modelo pra mesma medida, pega o que o cliente citou
    // (22/10, caso Brutus) ou o primeiro — sem perguntar.
    const item: ItemPreco = escolherItem(itens, modelo);
    const novosDados = dadosComQuantidade({ medida: item.medida, ...(modelo ? { modelo } : {}) }, quantidade);`],
  [`      return montarAcaoParaMedida(medida, textos, quantidadeAplicavel(intencao, estadoAtual, dadosAtuais, medida), pedido);`,
   `      return montarAcaoParaMedida(medida, textos, quantidadeAplicavel(intencao, estadoAtual, dadosAtuais, medida), pedido, false, dadosAtuais.modelo);`, 2],
  [`    return montarAcaoParaMedida(intencao.medidaExtraida, textos, quantidadeAplicavel(intencao, estadoAtual, dadosAtuais, intencao.medidaExtraida), pendente, !!pendente);`,
   `    return montarAcaoParaMedida(intencao.medidaExtraida, textos, quantidadeAplicavel(intencao, estadoAtual, dadosAtuais, intencao.medidaExtraida), pendente, !!pendente, dadosAtuais.modelo);`],
  [`    return montarAcaoParaMedida(intencao.escolhaAlternativa, textos, quantidadeConhecida, pendente, !!pendente);`,
   `    return montarAcaoParaMedida(intencao.escolhaAlternativa, textos, quantidadeConhecida, pendente, !!pendente, dadosAtuais.modelo);`],
  [`          acao: { tipo: 'CONFIRMAR_PRECO', partes: montarPartesPreco(itens[0]!, null, quantidadeConhecida) },`,
   `          acao: { tipo: 'CONFIRMAR_PRECO', partes: montarPartesPreco(escolherItem(itens, dadosAtuais.modelo), null, quantidadeConhecida) },`],
  [`        acao: { tipo: 'CONFIRMAR_PRECO', partes: montarPartesPreco(itens[0]!, null, intencao.quantidadeExtraida) },`,
   `        acao: { tipo: 'CONFIRMAR_PRECO', partes: montarPartesPreco(escolherItem(itens, dadosAtuais.modelo), null, intencao.quantidadeExtraida) },`],
], 'export function escolherItem');

// ---------- tabelaPrecos: diz o modelo quando a medida tem mais de um ----------
patch('src/data/tabelaPrecos.ts', [
  [`      \`Temos \${sujeito} *\${item.medida}* da marca *GP Premium* \${ehPlural ? 'saem' : 'está saindo'} por *R$ \${valorTotal} à vista*\${complementoTotal}.\`,`,
   `      \`Temos \${sujeito} *\${item.medida}* da marca *GP Premium*\${modeloVisivel(item)} \${ehPlural ? 'saem' : 'está saindo'} por *R$ \${valorTotal} à vista*\${complementoTotal}.\`,`],
  [`function primeiroModelo(modelo: string): string {`,
`// Medida com mais de um modelo na tabela (ex.: 265/60/18 H/T, ATR, Brutus): o cliente precisa saber QUAL modelo
// tem esse preco (22/10, caso Brutus). Codigo interno GP-1/GP-7 nao aparece.
function modeloVisivel(item: ItemPreco): string {
  if (TABELA_PRECOS_GP.filter((i) => i.medida === item.medida).length < 2) return '';
  const nome = primeiroModelo(item.modelo);
  return /^GP-/i.test(nome) ? '' : \` (modelo *\${nome}*)\`;
}

function primeiroModelo(modelo: string): string {`],
], 'function modeloVisivel');

// ---------- server.ts ----------
patch('src/bot-service/server.ts', [
  // exemplos fora do historico
  [`function medidaDoHistorico(mensagens: any[]): string | null {
  const valida = (m: string) => encontrarPrecosExatosPorMedida(m).length > 0;`,
`// "(ex.: 175/65/14)" na pergunta do robo NAO e medida de ninguem (22/10: virou "14 pneus 175/65/14").
function semExemplos(texto: string): string {
  return String(texto || '').replace(/\\(\\s*(ex|exemplo)\\b[^)]*\\)/gi, ' ').replace(/\\b(ex|exemplo)\\.?\\s*:\\s*[\\d/ .,rR-]+/gi, ' ');
}

// Modelo citado pelo cliente (ou pelo anuncio que ele clicou): Brutus, ATR, H/T, A/T, Verde, Duramax, Drift, Zero.
function modeloCitado(textos: string[]): string | undefined {
  const t = textos.join('\\n');
  const regras: Array<[RegExp, string]> = [[/brutus/i, 'BRUTUS'], [/\\batr\\b/i, 'ATR'], [/\\bh\\s*\\/\\s*t\\b|\\bht\\b/i, 'H/T'], [/\\ba\\s*\\/\\s*t\\b/i, 'A/T'], [/\\bverde\\b/i, 'VERDE'], [/duramax|\\bcargo\\b/i, 'DURAMAX'], [/drift/i, 'DRIFT'], [/\\bzero\\b/i, 'ZERO']];
  let achado: string | undefined;
  for (const [re, nome] of regras) if (re.test(t)) achado = nome;
  return achado;
}

function medidaDoHistorico(mensagens: any[]): string | null {
  const valida = (m: string) => encontrarPrecosExatosPorMedida(m).length > 0;`],
  [`    const achadas = extrairMedidasDoTexto(String(m?.content || '')).filter(valida);
    if (achadas.length) return achadas[achadas.length - 1] as string;`,
   `    const achadas = extrairMedidasDoTexto(semExemplos(String(m?.content || ''))).filter(valida);
    if (achadas.length) return achadas[achadas.length - 1] as string;`],
  [`    const achadas = extrairMedidasDoTexto(String(m?.content || '')).filter(valida);
    if (achadas.length === 1) return achadas[0] as string;`,
   `    const achadas = extrairMedidasDoTexto(semExemplos(String(m?.content || ''))).filter(valida);
    if (achadas.length === 1) return achadas[0] as string;`],
  // contexto da leitura sem exemplos
  [`.map((m: any) => { const t = String(m.content || ''); const daAtendente`,
   `.map((m: any) => { const t = semExemplos(String(m.content || '')); const daAtendente`],
  // aro sozinho
  [`    // Toda mensagem com texto passa pela leitura (23/09, "mais fechado"): antes um filtro de palavras-chave`,
`    // "14" / "aro 15" sozinho e sem medida conhecida = ARO (22/10: virava "14 pneus"). Pergunta o carro numa frase.
    {
      const soAro = /^\\s*(aro\\s*)?(1[2-9]|2[0-2])\\s*\\.?\\s*$/i.exec(rajada.join(' ').trim());
      if (soAro && !dadosPrecoAtuais.medida && !medidaDoHistorico(anteriores)) {
        return res.json({
          partes: [\`Show, aro \${soAro[2]}! 👍\`, 'Qual é o carro? Já te passo a medida certa e o valor.'],
          deterministico: true, acaoTipo: 'PEDIR_CARRO', novoEstadoPreco: estadoPrecoAtual, novosDadosPreco: JSON.stringify(dadosPrecoAtuais),
          via: 'fluxo', assuntos: ['INFORMOU_ARO'], chaves: ['aro_sem_medida'], rajada, simulado: !!req.body?.simular,
        });
      }
    }
    // Toda mensagem com texto passa pela leitura (23/09, "mais fechado"): antes um filtro de palavras-chave`],
  // modelo citado entra nos dados
  [`          let estadoUsado = estadoPrecoAtual;
          let dadosUsados = dadosPrecoAtuais;`,
   `          let estadoUsado = estadoPrecoAtual;
          let dadosUsados = dadosPrecoAtuais;
          {
            const textosCliente = [...anteriores.filter((m: any) => m?.role === 'user').slice(-6).map((m: any) => String(m?.content || '')), ...rajada];
            const modelo = modeloCitado(textosCliente);
            if (modelo && modelo !== dadosUsados.modelo) dadosUsados = { ...dadosUsados, modelo };
          }`],
  // resposta em lista JSON
  [`    for (const t of [s, escaparQuebrasNasFrases(s)]) {
      try { const p = JSON.parse(t); if (Array.isArray(p?.partes)) return limpar(p.partes); } catch {}
    }`,
   `    for (const t of [s, escaparQuebrasNasFrases(s)]) {
      try {
        const p = JSON.parse(t);
        if (Array.isArray(p?.partes)) return limpar(p.partes);
        if (Array.isArray(p) && p.every((x: any) => typeof x === 'string')) return limpar(p); // ["...","..."] (22/10, caso Spin)
      } catch {}
    }`],
], 'function semExemplos');
