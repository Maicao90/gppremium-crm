// Roda sem chamar IA nenhuma — so a logica pura. Cobre os casos reais que
// quebraram em 09-10/09/2026. Fica no repo como regressao (unico jeito de saber
// se uma mudanca futura na tabela ou no motor voltou a quebrar algum destes casos).
import { decidirAcaoPreco, decidirSequenciaPreco, MARCADOR_PINO, IntencaoExtraida, EstadoPrecoFluxo, DadosPrecoFluxo } from './fluxoPreco';
import { encontrarPrecosExatosPorMedida, brl } from './tabelaPrecos';
import { CATALOGO_FLUXO, TEXTOS_PADRAO, textoFluxo, validarTextoFluxo, sanitizarTextosFluxo, chavesJaRespondidas } from './fluxoCatalogo';

let erros = 0;
function checar(nome: string, condicao: boolean, detalhe?: string) {
  if (!condicao) { erros++; console.log('ERRO ' + nome + (detalhe ? ' | ' + detalhe : '')); }
  else console.log('OK   ' + nome);
}

// ===== Caso Elvania (10/09): medida real, valida, mas que NAO existe na tabela =====
// NOTA: o caso real da Elvania foi com 225/70/17. Trocado aqui pra 195/70/14
// (mesmo aro-14 real, tambem inexistente) porque as 3 alternativas reais do aro 17
// incluem 205/55/17 a R$349,00 — colidindo com o proprio valor que este teste
// precisa garantir que NUNCA aparece (o R$349 que a IA tinha inventado). O aro 14
// nao tem esse problema (top 3 reais: R$239, R$249, R$279). A intencao do teste
// (medida real inexistente -> oferece alternativas reais do mesmo aro, nunca
// inventa preco) continua a mesma.
{
  const intencao: IntencaoExtraida = { intencao: 'DAR_MEDIDA', medidaExtraida: '195/70/14', quantidadeExtraida: null, escolhaAlternativa: null };
  const r = decidirAcaoPreco(intencao, 'sem_estado', {});
  checar('Elvania: nao inventa preco pra medida inexistente', r.acao.tipo === 'OFERECER_ALTERNATIVAS');
  checar('Elvania: estado vira medida_sem_match', r.novoEstado === 'medida_sem_match');
  checar('Elvania: oferece medida REAL do aro 14 (nao lista vazia)', r.acao.tipo === 'OFERECER_ALTERNATIVAS' && /165\/70\/14|175\/65\/14|175\/70\/14/.test(r.acao.partes[0]!));
  checar('Elvania: nunca cita R$399 nem R$349 (os valores que a IA tinha inventado)', r.acao.tipo === 'OFERECER_ALTERNATIVAS' && !/399|349/.test(r.acao.partes[0]!));
}

// ===== Caso Paulo David (08/09): mesma medida inexistente perguntada de novo =====
// NOTA: este teste cobre so a repeticao do MESMO DAR_MEDIDA — o branch DAR_MEDIDA
// e state-independent por design (nao olha estadoAtual/dadosAtuais), entao ele NAO
// prova continuidade de estado. Pra isso ver o teste "medida_sem_match + pergunta
// de preco sem medida nova" logo abaixo, que exercita de verdade o fix do gap de
// estado (PERGUNTAR_PRECO_SEM_MEDIDA depois de medida_sem_match).
{
  const intencao: IntencaoExtraida = { intencao: 'DAR_MEDIDA', medidaExtraida: '185/35/17', quantidadeExtraida: null, escolhaAlternativa: null };
  const r1 = decidirAcaoPreco(intencao, 'sem_estado', {});
  const r2 = decidirAcaoPreco(intencao, r1.novoEstado, r1.novosDados);
  checar('Paulo David: 1a vez oferece alternativa (nao pede medida)', r1.acao.tipo === 'OFERECER_ALTERNATIVAS');
  checar('Paulo David: 2a vez tambem oferece alternativa (nao volta a PEDIR_MEDIDA)', r2.acao.tipo === 'OFERECER_ALTERNATIVAS');
}

// ===== medida_sem_match + pergunta de preco sem medida nova: precisa RE-OFERECER
// as mesmas alternativas (fix pos-review ebbffe36), nao resetar pra PEDIR_MEDIDA
// =====
// Este e o teste que de fato prova continuidade de estado: 1o turno com uma
// medida inexistente (vira medida_sem_match + aroSemMatch salvo), 2o turno com
// intencao DIFERENTE (PERGUNTAR_PRECO_SEM_MEDIDA, nao DAR_MEDIDA de novo) — so
// funciona certo se o motor realmente ler estadoAtual/dadosAtuais do 2o turno.
{
  const intencaoMedida: IntencaoExtraida = { intencao: 'DAR_MEDIDA', medidaExtraida: '185/35/17', quantidadeExtraida: null, escolhaAlternativa: null };
  const r1 = decidirAcaoPreco(intencaoMedida, 'sem_estado', {});
  const aroDoTurno1 = r1.novosDados.aroSemMatch;
  const intencaoPreco: IntencaoExtraida = { intencao: 'PERGUNTAR_PRECO_SEM_MEDIDA', medidaExtraida: null, quantidadeExtraida: null, escolhaAlternativa: null };
  const r2 = decidirAcaoPreco(intencaoPreco, r1.novoEstado, r1.novosDados);
  checar('medida_sem_match + preco sem medida: 1o turno realmente salvou aroSemMatch', r1.novoEstado === 'medida_sem_match' && !!aroDoTurno1);
  checar('medida_sem_match + preco sem medida: 2o turno ainda oferece alternativas (nao reseta pra PEDIR_MEDIDA)', r2.acao.tipo === 'OFERECER_ALTERNATIVAS');
  checar('medida_sem_match + preco sem medida: alternativas do 2o turno sao do MESMO aro salvo no 1o turno', r2.acao.tipo === 'OFERECER_ALTERNATIVAS' && r2.acao.partes[0]!.includes(`aro ${aroDoTurno1}`));
  checar('medida_sem_match + preco sem medida: estado continua medida_sem_match (nao reseta pra aguardando_medida)', r2.novoEstado === 'medida_sem_match');
}

// ===== Pergunta tecnica: nunca vira cotacao (era o bug do "aguenta quantos kg") =====
{
  const intencao: IntencaoExtraida = { intencao: 'PERGUNTA_TECNICA', medidaExtraida: null, quantidadeExtraida: null, escolhaAlternativa: null };
  const r = decidirAcaoPreco(intencao, 'preco_confirmado', { medida: '215/65/16' });
  checar('Pergunta tecnica: sai do fluxo (NADA), nao repete preco', r.acao.tipo === 'NADA');
  checar('Pergunta tecnica: nao perde o estado/dados salvos', r.novoEstado === 'preco_confirmado' && r.novosDados.medida === '215/65/16');
}

// ===== Medida exata existe: preco vem certo da tabela =====
{
  const intencao: IntencaoExtraida = { intencao: 'DAR_MEDIDA', medidaExtraida: '195/55/15', quantidadeExtraida: null, escolhaAlternativa: null };
  const r = decidirAcaoPreco(intencao, 'sem_estado', {});
  checar('Medida existe: CONFIRMAR_PRECO', r.acao.tipo === 'CONFIRMAR_PRECO');
  // 195/55/15 na TABELA_PRECOS_GP tem aVista=289.00 -> brl() formata "289,00", e o
  // texto monta "R$ 289,00" (com espaco). Checar so "R$" no meio da resposta
  // passaria mesmo com o preco ERRADO (linha/medida trocada) — aqui a gente
  // ancora no valor REAL da tabela pra pegar essa regressao.
  checar('Medida existe: preco bate com o valor REAL da tabela (R$ 289,00)', r.acao.tipo === 'CONFIRMAR_PRECO' && /R\$ 289,00/.test(r.acao.partes.join(' ')));
  checar('Medida existe: estado vira preco_confirmado', r.novoEstado === 'preco_confirmado' && r.novosDados.medida === '195/55/15');
}

// ===== Quantidade depois do preco: usa a MESMA medida ja confirmada, conta certa =====
{
  const intencaoQtd: IntencaoExtraida = { intencao: 'RESPONDER_QUANTIDADE', medidaExtraida: null, quantidadeExtraida: 4, escolhaAlternativa: null };
  const r = decidirAcaoPreco(intencaoQtd, 'preco_confirmado', { medida: '195/55/15' });
  checar('Quantidade: CONFIRMAR_PRECO com a medida ja salva', r.acao.tipo === 'CONFIRMAR_PRECO');
  // Um "/4/" solto pegaria qualquer 4 incidental num numero formatado (ex.: um
  // total tipo "R$ 1.4xx,00"). Aqui a gente ancora na frase REAL que
  // montarPartesPreco gera pra quantidade>1 ("os N pneus", N=4 = cobradas, ja que
  // 195/55/15 nao e item compre3Leve4).
  checar('Quantidade: resposta diz "os 4 pneus" (frase real de montarPartesPreco pra quantidade=4)', r.acao.tipo === 'CONFIRMAR_PRECO' && /os 4 pneus/.test(r.acao.partes.join(' ')));
}

// ===== Pergunta de preco sem medida nenhuma: pede a medida, so uma vez, nao repete =====
{
  const intencao: IntencaoExtraida = { intencao: 'PERGUNTAR_PRECO_SEM_MEDIDA', medidaExtraida: null, quantidadeExtraida: null, escolhaAlternativa: null };
  const r = decidirAcaoPreco(intencao, 'sem_estado', {});
  checar('Sem medida: PEDIR_MEDIDA', r.acao.tipo === 'PEDIR_MEDIDA');
  checar('Sem medida: estado vira aguardando_medida', r.novoEstado === 'aguardando_medida');
}

// ===== Caso Stephanie (15/09, achado ao vivo apos Task 5, commit 2af2a8ad):
// medida E quantidade na MESMA mensagem — montarAcaoParaMedida jogava a
// quantidade fora (hardcoded montarPartesPreco(item, null, null)), entao o robo
// cotava so o preco de 1 unidade mesmo quando o cliente ja tinha dito "quero 4"
// junto com a medida. Mensagem real: "Aro 16 265x70 R Queria 4 pneu desse, qual
// valor?" -> extrator acerta intencao=DAR_MEDIDA + medidaExtraida=265/70/16 +
// quantidadeExtraida=4, mas a resposta saia so com R$559,00 (1 unidade) em vez
// do total de 4. 265/70/16 tem 3 modelos (ATR/H-T/T-A) — montarAcaoParaMedida
// pega itens[0] (ADVENTURE ATR, aVista=559.00), entao o total esperado pra 4
// unidades e 4 x R$559,00 = R$2.236,00.
{
  const intencao: IntencaoExtraida = { intencao: 'DAR_MEDIDA', medidaExtraida: '265/70/16', quantidadeExtraida: 4, escolhaAlternativa: null };
  const r = decidirAcaoPreco(intencao, 'sem_estado', {});
  checar('Stephanie: CONFIRMAR_PRECO', r.acao.tipo === 'CONFIRMAR_PRECO');
  // Ancora na frase real de montarPartesPreco pra quantidade>1 ("os N pneus"),
  // igual ao teste de RESPONDER_QUANTIDADE acima — nao so em "R$" solto.
  checar('Stephanie: resposta diz "os 4 pneus" (nao fica no singular "o pneu")', r.acao.tipo === 'CONFIRMAR_PRECO' && /os 4 pneus/.test(r.acao.partes.join(' ')));
  // O bug era exatamente este: sem o fix, o total ficava R$ 559,00 (so 1
  // unidade) em vez de 4x559 = R$ 2.236,00.
  checar('Stephanie: preco TOTAL das 4 unidades (R$ 2.236,00), nao so a unidade (R$ 559,00)', r.acao.tipo === 'CONFIRMAR_PRECO' && /R\$ 2\.236,00/.test(r.acao.partes.join(' ')) && !/R\$ 559,00/.test(r.acao.partes.join(' ')));
  checar('Stephanie: estado vira preco_confirmado com a medida certa', r.novoEstado === 'preco_confirmado' && r.novosDados.medida === '265/70/16');
}

// ===== ESCOLHER_ALTERNATIVA + quantidade na mesma mensagem: mesmo bug do caso
// Stephanie, so que no segundo branch que tambem chama montarAcaoParaMedida
// (cliente responde qual das alternativas oferecidas serve, ja dizendo quantos
// quer, ex.: "pode ser essa de 205/50/17, quero 2") =====
{
  // 1o turno: medida inexistente no aro 17 -> oferece alternativas reais
  // (a 1a da lista, por ordem da tabela, e 205/50/17 a R$339,00).
  const intencaoMedida: IntencaoExtraida = { intencao: 'DAR_MEDIDA', medidaExtraida: '185/35/17', quantidadeExtraida: null, escolhaAlternativa: null };
  const r1 = decidirAcaoPreco(intencaoMedida, 'sem_estado', {});
  checar('Escolha+qtd: 1o turno realmente ofereceu 205/50/17 como alternativa', r1.acao.tipo === 'OFERECER_ALTERNATIVAS' && /205\/50\/17/.test(r1.acao.partes[0]!));

  // 2o turno: cliente escolhe a alternativa E ja diz a quantidade junto.
  const intencaoEscolha: IntencaoExtraida = { intencao: 'ESCOLHER_ALTERNATIVA', medidaExtraida: null, quantidadeExtraida: 2, escolhaAlternativa: '205/50/17' };
  const r2 = decidirAcaoPreco(intencaoEscolha, r1.novoEstado, r1.novosDados);
  checar('Escolha+qtd: CONFIRMAR_PRECO pra medida escolhida', r2.acao.tipo === 'CONFIRMAR_PRECO' && r2.novosDados.medida === '205/50/17');
  checar('Escolha+qtd: resposta diz "os 2 pneus" (quantidade nao foi jogada fora)', r2.acao.tipo === 'CONFIRMAR_PRECO' && /os 2 pneus/.test(r2.acao.partes.join(' ')));
  // 205/50/17 aVista=339,00 -> total de 2 unidades = R$ 678,00 (sem o fix ficaria
  // R$ 339,00, so 1 unidade).
  checar('Escolha+qtd: preco TOTAL das 2 unidades (R$ 678,00), nao so a unidade (R$ 339,00)', r2.acao.tipo === 'CONFIRMAR_PRECO' && /R\$ 678,00/.test(r2.acao.partes.join(' ')) && !/R\$ 339,00/.test(r2.acao.partes.join(' ')));
}

// ===== Pergunta se é remold (18/09): confirma (nunca nega), cita os fatos certos, e
// NUNCA mexe no estado/dados do fluxo de preco em andamento (mesmo tratamento de
// PERGUNTA_TECNICA acima) =====
{
  const intencao: IntencaoExtraida = { intencao: 'PERGUNTOU_SE_E_REMOLD', medidaExtraida: null, quantidadeExtraida: null, escolhaAlternativa: null };
  const r = decidirAcaoPreco(intencao, 'preco_confirmado', { medida: '215/65/16' });
  const texto = r.acao.tipo === 'RESPONDER_REMOLD' ? r.acao.partes.join(' ') : '';
  checar('Remold: RESPONDER_REMOLD', r.acao.tipo === 'RESPONDER_REMOLD');
  checar('Remold: nao perde o estado/dados salvos (igual PERGUNTA_TECNICA)', r.novoEstado === 'preco_confirmado' && r.novosDados.medida === '215/65/16');
  checar('Remold: confirma que e remold (nunca nega)', /remold/i.test(texto));
  checar('Remold: cita borracha padrao europeu', /europeu/i.test(texto));
  checar('Remold: cita garantia de 50 mil km', /50 mil/i.test(texto));
  checar('Remold: cita dinheiro de volta', /dinheiro de volta/i.test(texto));
  checar('Remold: NUNCA nega que e remold (guarda contra a framing antiga/falsa)', !/n[aã]o[,]?\s*n[aã]o é remold|nunca remold|pneu novo/i.test(texto));
}

// =====================================================================================
// ATENDIMENTO COMPLETO (18/09): categorias novas. Helpers pra montar a intencao e ler
// o texto da acao (so as acoes com `partes`).
// =====================================================================================
function intencaoDe(intencao: IntencaoExtraida['intencao'], extra: Partial<IntencaoExtraida> = {}): IntencaoExtraida {
  return { intencao, medidaExtraida: null, quantidadeExtraida: null, escolhaAlternativa: null, parcelasExtraida: null, formaPagamentoExtraida: null, ...extra };
}
function textoDe(r: { acao: { tipo: string; partes?: string[] } }): string {
  return (r.acao.partes || []).join(' ');
}
const ITEM_195_55_15 = encontrarPrecosExatosPorMedida('195/55/15')[0]!; // aVista 289,00, nao e compre3leve4

// ----- Parcelamento generico: so "ate 10x", NUNCA valor em R$ -----
{
  const r = decidirAcaoPreco(intencaoDe('PERGUNTOU_PARCELAMENTO_GENERICO'), 'preco_confirmado', { medida: '195/55/15' });
  checar('Parcelamento generico: acao certa', r.acao.tipo === 'RESPONDER_PARCELAMENTO_GENERICO');
  checar('Parcelamento generico: diz ate 10x', /10x/.test(textoDe(r)));
  checar('Parcelamento generico: NUNCA cita valor em R$', !/R\$/.test(textoDe(r)));
  checar('Parcelamento generico: nao mexe no estado/dados', r.novoEstado === 'preco_confirmado' && r.novosDados.medida === '195/55/15');
}

// ----- Parcelamento especifico com medida ja confirmada: valor vem da tabela -----
{
  const r = decidirAcaoPreco(intencaoDe('PERGUNTOU_PARCELAMENTO_ESPECIFICO', { parcelasExtraida: 6 }), 'preco_confirmado', { medida: '195/55/15' });
  const total = ITEM_195_55_15.parcelado.x6;
  checar('Parcelamento especifico: acao certa', r.acao.tipo === 'RESPONDER_PARCELAMENTO_ESPECIFICO');
  checar('Parcelamento especifico: valor de CADA parcela = total da tabela / 6', textoDe(r).includes(`R$ ${brl(total / 6)} cada`), textoDe(r));
  checar('Parcelamento especifico: total bate com a tabela', textoDe(r).includes(`R$ ${brl(total)}`), textoDe(r));
  checar('Parcelamento especifico: mantem preco_confirmado + medida', r.novoEstado === 'preco_confirmado' && r.novosDados.medida === '195/55/15');
}

// ----- Parcelamento especifico usa a QUANTIDADE ja confirmada (senao cotava 1 pneu so) -----
{
  const r1 = decidirAcaoPreco(intencaoDe('RESPONDER_QUANTIDADE', { quantidadeExtraida: 4 }), 'preco_confirmado', { medida: '195/55/15' });
  checar('Quantidade fica guardada no estado', r1.novosDados.quantidade === 4);
  const r2 = decidirAcaoPreco(intencaoDe('PERGUNTOU_PARCELAMENTO_ESPECIFICO', { parcelasExtraida: 6 }), r1.novoEstado, r1.novosDados);
  const total4 = ITEM_195_55_15.parcelado.x6 * 4;
  checar('Parcelamento com 4 pneus ja confirmados: total das 4 unidades', textoDe(r2).includes(`R$ ${brl(total4)}`) && /4 unidades/.test(textoDe(r2)), textoDe(r2));
}

// ----- Parcelamento especifico SEM medida: pede a medida e LEMBRA a pergunta -----
{
  const r1 = decidirAcaoPreco(intencaoDe('PERGUNTOU_PARCELAMENTO_ESPECIFICO', { parcelasExtraida: 6 }), 'sem_estado', {});
  checar('Parcelamento sem medida: pede a medida', r1.acao.tipo === 'PEDIR_MEDIDA' && r1.novoEstado === 'aguardando_medida');
  checar('Parcelamento sem medida: guarda a pergunta pendente (6x)', r1.novosDados.intencaoPendente === 'parcelamento_especifico' && r1.novosDados.parcelasPendentes === 6);
  const r2 = decidirAcaoPreco(intencaoDe('DAR_MEDIDA', { medidaExtraida: '195/55/15' }), r1.novoEstado, r1.novosDados);
  checar('Parcelamento pendente: quando a medida chega responde o 6x (nao so o preco a vista)', r2.acao.tipo === 'RESPONDER_PARCELAMENTO_ESPECIFICO' && textoDe(r2).includes(`R$ ${brl(ITEM_195_55_15.parcelado.x6 / 6)} cada`), textoDe(r2));
  checar('Parcelamento pendente: tambem traz o preco a vista (cliente pode nem lembrar da pergunta)', textoDe(r2).includes(`R$ ${brl(ITEM_195_55_15.aVista)} à vista`), textoDe(r2));
  checar('Parcelamento pendente: limpa a pendencia depois de responder', !r2.novosDados.intencaoPendente && !r2.novosDados.parcelasPendentes && r2.novosDados.medida === '195/55/15');
}

// ----- Parcelamento: medida + parcelas na MESMA mensagem -----
{
  const r = decidirAcaoPreco(intencaoDe('PERGUNTOU_PARCELAMENTO_ESPECIFICO', { parcelasExtraida: 3, medidaExtraida: '195/55/15' }), 'sem_estado', {});
  checar('Parcelamento + medida na mesma msg: responde as 3 parcelas', r.acao.tipo === 'RESPONDER_PARCELAMENTO_ESPECIFICO' && textoDe(r).includes(`R$ ${brl(ITEM_195_55_15.parcelado.x3 / 3)} cada`), textoDe(r));
}

// ----- Parcelamento acima do maximo (10x) ou sem numero entendido: nunca inventa valor -----
{
  const r12 = decidirAcaoPreco(intencaoDe('PERGUNTOU_PARCELAMENTO_ESPECIFICO', { parcelasExtraida: 12 }), 'preco_confirmado', { medida: '195/55/15' });
  checar('Parcelamento 12x: nao inventa valor, diz o maximo de 10x', !/R\$/.test(textoDe(r12)) && /10x/.test(textoDe(r12)));
  const r0 = decidirAcaoPreco(intencaoDe('PERGUNTOU_PARCELAMENTO_ESPECIFICO', { parcelasExtraida: null }), 'preco_confirmado', { medida: '195/55/15' });
  checar('Parcelamento sem numero entendido: cai na resposta generica (sem R$)', r0.acao.tipo === 'RESPONDER_PARCELAMENTO_GENERICO' && !/R\$/.test(textoDe(r0)));
}

// ----- "E sem juros?": confirma o jurinho, pergunta quantas vezes, chama pra loja; NUNCA diz "sem juros" -----
{
  const r = decidirAcaoPreco(intencaoDe('PERGUNTOU_SE_TEM_JUROS'), 'preco_confirmado', { medida: '195/55/15' });
  const t = textoDe(r);
  checar('Juros: acao certa', r.acao.tipo === 'RESPONDER_JUROS');
  checar('Juros: admite o jurinho em cada parcela', /jurinho/i.test(t));
  checar('Juros: pergunta em quantas vezes quer parcelar', /quantas vezes/i.test(t));
  checar('Juros: convida pra negociar na loja', /loja/i.test(t) && /negociar/i.test(t));
  checar('Juros: NUNCA afirma "sem juros"', !/sem juros/i.test(t));
  checar('Juros: nao mexe no estado', r.novoEstado === 'preco_confirmado' && r.novosDados.medida === '195/55/15');
}

// ----- Desconto a vista: SO dinheiro, calculado da tabela (5%) -----
{
  const r = decidirAcaoPreco(intencaoDe('PERGUNTOU_DESCONTO_AVISTA'), 'preco_confirmado', { medida: '195/55/15' });
  const t = textoDe(r);
  checar('Desconto: acao certa', r.acao.tipo === 'RESPONDER_DESCONTO');
  checar('Desconto: 5% sobre R$ 289,00 = R$ 274,55 (da tabela, nao estimativa)', /R\$ 274,55/.test(t) && /R\$ 289,00/.test(t), t);
  checar('Desconto: fala em DINHEIRO', /dinheiro/i.test(t));
  checar('Desconto: NUNCA promete desconto no PIX', !/pix/i.test(t));
}
{
  const r1 = decidirAcaoPreco(intencaoDe('RESPONDER_QUANTIDADE', { quantidadeExtraida: 4 }), 'preco_confirmado', { medida: '195/55/15' });
  const r = decidirAcaoPreco(intencaoDe('PERGUNTOU_DESCONTO_AVISTA', { formaPagamentoExtraida: 'dinheiro' }), r1.novoEstado, r1.novosDados);
  checar('Desconto com 4 pneus: 5% sobre 4 x R$ 289,00 = R$ 1.098,20', /R\$ 1\.098,20/.test(textoDe(r)) && /R\$ 1\.156,00/.test(textoDe(r)), textoDe(r));
}
{
  const r = decidirAcaoPreco(intencaoDe('PERGUNTOU_DESCONTO_AVISTA', { formaPagamentoExtraida: 'pix' }), 'preco_confirmado', { medida: '195/55/15' });
  const t = textoDe(r);
  checar('Desconto no PIX: esclarece que o desconto e so em dinheiro', r.acao.tipo === 'RESPONDER_DESCONTO' && /só pra pagamento em dinheiro/i.test(t) && /PIX não tem desconto/i.test(t), t);
  checar('Desconto no PIX: nao muda estado/dados', r.novoEstado === 'preco_confirmado' && r.novosDados.medida === '195/55/15');
}
{
  const r1 = decidirAcaoPreco(intencaoDe('PERGUNTOU_DESCONTO_AVISTA'), 'sem_estado', {});
  checar('Desconto sem medida: pede a medida e guarda a pergunta', r1.acao.tipo === 'PEDIR_MEDIDA' && r1.novosDados.intencaoPendente === 'desconto_avista');
  const r2 = decidirAcaoPreco(intencaoDe('DAR_MEDIDA', { medidaExtraida: '195/55/15' }), r1.novoEstado, r1.novosDados);
  checar('Desconto pendente: quando a medida chega responde o desconto', r2.acao.tipo === 'RESPONDER_DESCONTO' && /R\$ 274,55/.test(textoDe(r2)), textoDe(r2));
  checar('Desconto pendente: limpa a pendencia', !r2.novosDados.intencaoPendente && r2.novoEstado === 'preco_confirmado');
}

// ----- Pendencia sobrevive a medida inexistente + escolha de alternativa -----
{
  const r1 = decidirAcaoPreco(intencaoDe('PERGUNTOU_PARCELAMENTO_ESPECIFICO', { parcelasExtraida: 6 }), 'sem_estado', {});
  const r2 = decidirAcaoPreco(intencaoDe('DAR_MEDIDA', { medidaExtraida: '185/35/17' }), r1.novoEstado, r1.novosDados);
  checar('Pendencia + medida inexistente: oferece alternativas e mantem a pendencia', r2.acao.tipo === 'OFERECER_ALTERNATIVAS' && r2.novosDados.intencaoPendente === 'parcelamento_especifico' && r2.novosDados.parcelasPendentes === 6);
  const r3 = decidirAcaoPreco(intencaoDe('ESCOLHER_ALTERNATIVA', { escolhaAlternativa: '205/50/17' }), r2.novoEstado, r2.novosDados);
  checar('Pendencia + escolha de alternativa: responde o 6x da alternativa escolhida', r3.acao.tipo === 'RESPONDER_PARCELAMENTO_ESPECIFICO' && /6x fica R\$/.test(textoDe(r3)), textoDe(r3));
}

// ----- Repetir "quanto custa?" sem medida nao perde a pendencia -----
{
  const r1 = decidirAcaoPreco(intencaoDe('PERGUNTOU_DESCONTO_AVISTA'), 'sem_estado', {});
  const r2 = decidirAcaoPreco(intencaoDe('PERGUNTAR_PRECO_SEM_MEDIDA'), r1.novoEstado, r1.novosDados);
  checar('Pedir medida de novo: preserva a pendencia de desconto', r2.acao.tipo === 'PEDIR_MEDIDA' && r2.novosDados.intencaoPendente === 'desconto_avista');
}

// ----- Medida DIFERENTE da confirmada nao herda a quantidade do pneu anterior -----
{
  const r1 = decidirAcaoPreco(intencaoDe('RESPONDER_QUANTIDADE', { quantidadeExtraida: 4 }), 'preco_confirmado', { medida: '195/55/15' });
  const r2 = decidirAcaoPreco(intencaoDe('DAR_MEDIDA', { medidaExtraida: '175/65/14' }), r1.novoEstado, r1.novosDados);
  checar('Medida nova: NAO reaproveita a quantidade (4) da medida anterior', r2.acao.tipo === 'CONFIRMAR_PRECO' && !/4 pneus/.test(textoDe(r2)) && r2.novosDados.quantidade === undefined, textoDe(r2));
}

// ----- Chines: nega, categoria separada do remold -----
{
  const r = decidirAcaoPreco(intencaoDe('PERGUNTOU_SE_E_CHINES'), 'preco_confirmado', { medida: '195/55/15' });
  const t = textoDe(r);
  checar('Chines: acao certa (separada de remold)', r.acao.tipo === 'RESPONDER_CHINES');
  checar('Chines: nega (nao trabalha com pneu chines)', /não trabalha/i.test(t) && /chinês/i.test(t));
  checar('Chines: NAO confunde com a resposta de remold', !/remold/i.test(t));
  checar('Chines: nao mexe no estado', r.novoEstado === 'preco_confirmado' && r.novosDados.medida === '195/55/15');
}

// ----- Base de troca / compra de usado / nota fiscal / alinhamento -----
{
  const troca = decidirAcaoPreco(intencaoDe('OFERECEU_BASE_TROCA'), 'sem_estado', {});
  checar('Base de troca: recusa', troca.acao.tipo === 'RESPONDER_BASE_TROCA' && /não trabalha com base de troca/i.test(textoDe(troca)));
  const usado = decidirAcaoPreco(intencaoDe('OFERECEU_VENDER_USADO'), 'sem_estado', {});
  checar('Compra de usado: recusa', usado.acao.tipo === 'RESPONDER_COMPRA_USADO' && /não compra pneu usado/i.test(textoDe(usado)));
  const nf = decidirAcaoPreco(intencaoDe('PERGUNTOU_NOTA_FISCAL'), 'sem_estado', {});
  checar('Nota fiscal: confirma que SEMPRE emite', nf.acao.tipo === 'RESPONDER_NOTA_FISCAL' && /sempre emite nota fiscal/i.test(textoDe(nf)));
  const alin = decidirAcaoPreco(intencaoDe('PERGUNTOU_ALINHAMENTO'), 'sem_estado', {});
  checar('Alinhamento: nao faz, so balanceamento', alin.acao.tipo === 'RESPONDER_ALINHAMENTO' && /não faz alinhamento/i.test(textoDe(alin)) && /balanceamento/i.test(textoDe(alin)));
}

// ----- Balanceamento: R$25 por roda, multiplica pela quantidade quando ha -----
{
  const sem = decidirAcaoPreco(intencaoDe('PERGUNTOU_BALANCEAMENTO'), 'sem_estado', {});
  checar('Balanceamento sem quantidade: R$ 25,00 por roda, sem multiplicar', sem.acao.tipo === 'RESPONDER_BALANCEAMENTO' && /R\$ 25,00 por roda/.test(textoDe(sem)) && !/no total/.test(textoDe(sem)), textoDe(sem));
  const com = decidirAcaoPreco(intencaoDe('PERGUNTOU_BALANCEAMENTO', { quantidadeExtraida: 4 }), 'sem_estado', {});
  checar('Balanceamento com 4 rodas na mensagem: R$ 100,00 no total', /R\$ 100,00 no total/.test(textoDe(com)), textoDe(com));
  const guardada = decidirAcaoPreco(intencaoDe('PERGUNTOU_BALANCEAMENTO'), 'preco_confirmado', { medida: '195/55/15', quantidade: 2 });
  checar('Balanceamento com quantidade ja confirmada (2): R$ 50,00 no total', /R\$ 50,00 no total/.test(textoDe(guardada)), textoDe(guardada));
}

// ----- Localizacao: texto + acao que faz o CODIGO disparar o pino real -----
{
  const r = decidirAcaoPreco(intencaoDe('PEDIU_LOCALIZACAO'), 'preco_confirmado', { medida: '195/55/15' });
  checar('Localizacao: acao que dispara o pino', r.acao.tipo === 'ENVIAR_LOCALIZACAO_FIXA');
  checar('Localizacao: nao mexe no estado', r.novoEstado === 'preco_confirmado' && r.novosDados.medida === '195/55/15');
}

// ----- Localizacao repetida (caso Marcia Lima, 18/09: 3 pinos em 5 minutos) -----
{
  const ctx = (m: number | null) => ({ minutosDesdeLocalizacao: m });
  const r1 = decidirAcaoPreco(intencaoDe('PEDIU_LOCALIZACAO'), 'preco_confirmado', { medida: '195/55/15' }, {}, ctx(null));
  checar('Localizacao nunca enviada: manda o pino', r1.acao.tipo === 'ENVIAR_LOCALIZACAO_FIXA');
  const r2 = decidirAcaoPreco(intencaoDe('PEDIU_LOCALIZACAO'), 'preco_confirmado', { medida: '195/55/15' }, {}, ctx(2));
  checar('Pino mandado ha 2 min: NAO manda de novo, responde so em texto', r2.acao.tipo === 'RESPONDER_LOCALIZACAO_REPETIDA' && /pino da localização aqui em cima/i.test(textoDe(r2)) && /Pont[aã]o/.test(textoDe(r2)), textoDe(r2));
  checar('Localizacao repetida: nao mexe no estado', r2.novoEstado === 'preco_confirmado' && r2.novosDados.medida === '195/55/15');
  const r3 = decidirAcaoPreco(intencaoDe('PEDIU_LOCALIZACAO'), 'sem_estado', {}, {}, ctx(29));
  checar('Pino mandado ha 29 min: ainda nao repete', r3.acao.tipo === 'RESPONDER_LOCALIZACAO_REPETIDA');
  const r4 = decidirAcaoPreco(intencaoDe('PEDIU_LOCALIZACAO'), 'sem_estado', {}, {}, ctx(45));
  checar('Pino mandado ha 45 min e o cliente pediu de novo: pode mandar', r4.acao.tipo === 'ENVIAR_LOCALIZACAO_FIXA');
  const r5 = decidirAcaoPreco(intencaoDe('PEDIU_LOCALIZACAO'), 'sem_estado', {});
  checar('Sem contexto (padrao): manda o pino', r5.acao.tipo === 'ENVIAR_LOCALIZACAO_FIXA');
  const r6 = decidirAcaoPreco(intencaoDe('PEDIU_LOCALIZACAO'), 'sem_estado', {}, { localizacao_repetida: ['Editado pelo dono.'] }, ctx(1));
  checar('Localizacao repetida: texto editavel pela tela Fluxo', textoDe(r6) === 'Editado pelo dono.');
}

// ----- Objecao de preco/marca: resposta propria (nao repete o bloco de preco) -----
{
  const r = decidirAcaoPreco(intencaoDe('OBJETOU_PRECO_OU_MARCA'), 'preco_confirmado', { medida: '195/55/15' });
  const t = textoDe(r);
  checar('Objecao: acao certa', r.acao.tipo === 'RESPONDER_OBJECAO');
  checar('Objecao: NAO repete o bloco de preco (sem R$)', !/R\$/.test(t));
  checar('Objecao: cita garantia de 50 mil km / dinheiro de volta', /50 mil km/.test(t) && /dinheiro de volta/i.test(t));
  checar('Objecao: convida pra negociar na loja e oferece o parcelado', /loja/i.test(t) && /10x/.test(t));
  checar('Objecao: nao mexe no estado', r.novoEstado === 'preco_confirmado' && r.novosDados.medida === '195/55/15');
}

// ----- Cliente insiste no mesmo assunto (caso real 18/09: "Remold to fora" recebeu a MESMA explicacao) -----
{
  const remoldPadrao = TEXTOS_PADRAO['remold']!.join('\n');
  const insist = TEXTOS_PADRAO['remold_insistencia']!.join('\n');
  checar('Ja respondido: nada dito ainda -> []', chavesJaRespondidas(undefined, 'Oi, tudo bem?').length === 0);
  checar('Ja respondido: robo ja explicou o remold -> ["remold"]', chavesJaRespondidas(undefined, 'Oi\n' + remoldPadrao).join() === 'remold');
  checar('Ja respondido: explicou E ja mandou a variante -> as duas', chavesJaRespondidas(undefined, remoldPadrao + '\n' + insist).sort().join() === 'remold,remold_insistencia');
  checar('Ja respondido: respeita texto EDITADO pelo dono', chavesJaRespondidas({ remold: ['Texto editado longo do dono sobre remold.'] }, 'x Texto editado longo do dono sobre remold. y').join() === 'remold');
  const primeira = decidirAcaoPreco(intencaoDe('PERGUNTOU_SE_E_REMOLD'), 'preco_confirmado', { medida: '195/55/15' }, {}, { jaRespondidas: [] });
  checar('Remold 1a vez: explicacao completa', /sim, é remold/i.test(textoDe(primeira)));
  const segunda = decidirAcaoPreco(intencaoDe('PERGUNTOU_SE_E_REMOLD'), 'preco_confirmado', { medida: '195/55/15' }, {}, { jaRespondidas: ['remold'] });
  checar('Remold 2a vez (cliente insiste): NAO repete a explicacao, usa a variante', segunda.acao.tipo === 'RESPONDER_REMOLD' && !/Vou ser sincero/.test(textoDe(segunda)) && /garantia de 50 mil km ou seu dinheiro de volta/.test(textoDe(segunda)) && /vem até a loja/.test(textoDe(segunda)), textoDe(segunda));
  checar('Remold 2a vez: nao mexe no estado', segunda.novoEstado === 'preco_confirmado' && segunda.novosDados.medida === '195/55/15');
  const terceira = decidirAcaoPreco(intencaoDe('PERGUNTOU_SE_E_REMOLD'), 'preco_confirmado', { medida: '195/55/15' }, {}, { jaRespondidas: ['remold', 'remold_insistencia'] });
  checar('Remold 3a vez: nao repete de novo -> sai do fluxo (NADA)', terceira.acao.tipo === 'NADA' && terceira.novoEstado === 'preco_confirmado');
  const obj2 = decidirAcaoPreco(intencaoDe('OBJETOU_PRECO_OU_MARCA'), 'preco_confirmado', { medida: '195/55/15' }, {}, { jaRespondidas: ['objecao'] });
  checar('Objecao 2a vez: variante curta (sem repetir os argumentos)', obj2.acao.tipo === 'RESPONDER_OBJECAO' && !/controle de qualidade rígido/.test(textoDe(obj2)) && /negociar melhor/.test(textoDe(obj2)), textoDe(obj2));
  const obj3 = decidirAcaoPreco(intencaoDe('OBJETOU_PRECO_OU_MARCA'), 'sem_estado', {}, {}, { jaRespondidas: ['objecao', 'objecao_repetida'] });
  checar('Objecao 3a vez: sai do fluxo (NADA)', obj3.acao.tipo === 'NADA');
  const noLote = decidirSequenciaPreco([intencaoDe('PERGUNTOU_SE_E_REMOLD'), intencaoDe('PERGUNTOU_NOTA_FISCAL')], 'sem_estado', {}, {}, { jaRespondidas: ['remold'] });
  checar('Rajada com remold ja explicado: variante + nota fiscal', /Entendo sua preocupação/.test(noLote.partes.join(' ')) && /sempre emite nota fiscal/i.test(noLote.partes.join(' ')));
  const soRemoldNada = decidirSequenciaPreco([intencaoDe('PERGUNTOU_SE_E_REMOLD')], 'sem_estado', {}, {}, { jaRespondidas: ['remold', 'remold_insistencia'] });
  checar('Rajada so com remold ja dito 2x -> NADA', soRemoldNada.acaoPrincipal === 'NADA');
}

// ----- "E novo? / tem meia-vida?" (caso Maxwell 19/09: o robo se precipitou confessando remold) -----
{
  const ctxNovo = (ja: string[]) => ({ jaRespondidas: ja });
  const c1 = decidirAcaoPreco(intencaoDe('PERGUNTOU_SE_E_NOVO'), 'preco_confirmado', { medida: '195/55/15' }, {}, ctxNovo([]));
  checar('Condicao 1a vez: resposta de qualidade/garantia', c1.acao.tipo === 'RESPONDER_CONDICAO' && /borracha padrão europeu/.test(textoDe(c1)) && /50 mil km ou seu dinheiro de volta/.test(textoDe(c1)), textoDe(c1));
  checar('Condicao 1a vez: NAO se precipita — nao confessa remold', !/remold|sincero/i.test(textoDe(c1)), textoDe(c1));
  checar('Condicao 1a vez: NAO afirma que o pneu e novo', !/\b(é|e|são|sao) (um )?(pneu )?(novo|nova|novos)\b/i.test(textoDe(c1)) && !/pneu novo/i.test(textoDe(c1)), textoDe(c1));
  checar('Condicao 1a vez: NAO nega meia-vida/remold (dodge honesto, nunca mentira — GP Premium E remold)', !/n[ãa]o (é|e|são|sao) (um )?(pneu )?(de )?(meia|remold|recap|usado)|nunca foi usado|sem uso/i.test(textoDe(c1)), textoDe(c1));
  checar('Condicao 1a vez: nao mexe no estado', c1.novoEstado === 'preco_confirmado' && c1.novosDados.medida === '195/55/15');
  const c2 = decidirAcaoPreco(intencaoDe('PERGUNTOU_SE_E_NOVO'), 'preco_confirmado', { medida: '195/55/15' }, {}, ctxNovo(['condicao']));
  checar('Condicao 2a vez (cliente insiste): agora SIM a resposta honesta de remold', c2.acao.tipo === 'RESPONDER_CONDICAO' && /sim, é remold/i.test(textoDe(c2)) && /50 mil km ou seu dinheiro de volta/.test(textoDe(c2)), textoDe(c2));
  const c3 = decidirAcaoPreco(intencaoDe('PERGUNTOU_SE_E_NOVO'), 'preco_confirmado', { medida: '195/55/15' }, {}, ctxNovo(['condicao', 'remold']));
  checar('Condicao 3a vez: ja disse tudo -> sai do fluxo (NADA)', c3.acao.tipo === 'NADA');
  const r = decidirAcaoPreco(intencaoDe('PERGUNTOU_SE_E_REMOLD'), 'sem_estado', {}, {}, ctxNovo(['condicao']));
  checar('Pergunta DIRETA de remold depois da condicao: responde a confissao normal', /sim, é remold/i.test(textoDe(r)));
  checar('chavesJaRespondidas: pitch da condicao ja dito -> ["condicao"]', chavesJaRespondidas(undefined, TEXTOS_PADRAO['condicao']!.join('\n')).includes('condicao'));
}

// ----- Horario (dono confirmou 19/09: seg-sex 8h-18h, sab 8h-12h) e pedido de foto -----
{
  const h = decidirAcaoPreco(intencaoDe('PERGUNTOU_HORARIO'), 'preco_confirmado', { medida: '195/55/15' });
  checar('Horario: resposta fixa com o horario confirmado', h.acao.tipo === 'RESPONDER_HORARIO' && /segunda a sexta, das 8h às 18h/.test(textoDe(h)) && /sábados, das 8h às 12h/.test(textoDe(h)), textoDe(h));
  checar('Horario: NAO manda o pino (o caso "Ta aberto agora?" recebeu localizacao)', !textoDe(h).includes('[ENVIAR_LOCALIZACAO]') && h.acao.tipo !== 'ENVIAR_LOCALIZACAO_FIXA');
  checar('Horario: nao mexe no estado', h.novoEstado === 'preco_confirmado' && h.novosDados.medida === '195/55/15');
  const f = decidirAcaoPreco(intencaoDe('PEDIU_FOTO'), 'preco_confirmado', { medida: '195/55/15' });
  checar('Foto: chama pra ver o pneu na loja', f.acao.tipo === 'RESPONDER_FOTO' && /passar aqui na loja/i.test(textoDe(f)) && /Quando você consegue vir/.test(textoDe(f)), textoDe(f));
  checar('Foto: NUNCA promete enviar foto (nem cita foto)', !/foto|imagem|\bsegue\b|\bmand(o|ar)\b|\benvi/i.test(textoDe(f)), textoDe(f));
  checar('Foto: nao mexe no estado', f.novoEstado === 'preco_confirmado' && f.novosDados.medida === '195/55/15');
}

// ----- Outra marca (Pirelli/Dunlop...): resposta fixa, sem falar mal de ninguem -----
{
  const r = decidirAcaoPreco(intencaoDe('PERGUNTOU_POR_OUTRA_MARCA'), 'preco_confirmado', { medida: '195/55/15' });
  checar('Outra marca: resposta fixa (so GP Premium)', r.acao.tipo === 'RESPONDER_OUTRA_MARCA' && /só com o GP Premium/i.test(textoDe(r)) && /não temos outras marcas/i.test(textoDe(r)), textoDe(r));
  checar('Outra marca: NUNCA fala mal de marca nenhuma', !/ruim|péssim|pior|não presta/i.test(textoDe(r)));
  checar('Outra marca: nao mexe no estado', r.novoEstado === 'preco_confirmado' && r.novosDados.medida === '195/55/15');
}

// ----- Agradecimento / "ok" / "vou pensar" (conversas reais de 21/09): responde UMA vez, depois silencio -----
{
  const a1 = decidirAcaoPreco(intencaoDe('AGRADECEU_OU_ENCERROU'), 'preco_confirmado', { medida: '195/55/15' });
  checar('Agradecimento 1a vez: resposta fixa curta', a1.acao.tipo === 'RESPONDER_AGRADECIMENTO' && /Qualquer dúvida ou se quiser fechar/.test(textoDe(a1)), textoDe(a1));
  checar('Agradecimento: NAO cita horario, endereco nem pergunta de fechamento por conta propria', !/hor[aá]rio|segunda|s[aá]bado|\d\s?h\b|endere|localiza|quando voc[eê] consegue/i.test(textoDe(a1)), textoDe(a1));
  checar('Agradecimento: nao mexe no estado', a1.novoEstado === 'preco_confirmado' && a1.novosDados.medida === '195/55/15');
  const a2 = decidirAcaoPreco(intencaoDe('AGRADECEU_OU_ENCERROU'), 'preco_confirmado', { medida: '195/55/15' }, {}, { jaRespondidas: ['agradecimento'] });
  checar('Agradecimento 2a vez ("ok" e depois "obrigado"): SILENCIO decidido pelo codigo (nao NADA = IA livre)', a2.acao.tipo === 'SILENCIO' && textoDe(a2) === '');
  const s2 = decidirSequenciaPreco([intencaoDe('AGRADECEU_OU_ENCERROU')], 'preco_confirmado', { medida: '195/55/15' }, {}, { jaRespondidas: ['agradecimento'] });
  checar('Agradecimento repetido em sequencia: acaoPrincipal SILENCIO, sem partes (a IA livre NAO responde)', s2.acaoPrincipal === 'SILENCIO' && s2.partes.length === 0 && s2.chaves.includes('agradecimento'));
  const s1 = decidirSequenciaPreco([intencaoDe('AGRADECEU_OU_ENCERROU')], 'preco_confirmado', { medida: '195/55/15' });
  checar('Agradecimento 1a vez em sequencia: manda o texto', s1.acaoPrincipal === 'RESPONDER_AGRADECIMENTO' && s1.partes.length === 1);
  const sMix = decidirSequenciaPreco([intencaoDe('DAR_MEDIDA', { medidaExtraida: '195/55/15' }), intencaoDe('AGRADECEU_OU_ENCERROU')], 'sem_estado', {});
  checar('"Obrigado" junto com um pedido de verdade: responde so o pedido (nada de "Tranquilo!" depois do preco)', sMix.acaoPrincipal === 'CONFIRMAR_PRECO' && !sMix.partes.some((p) => /Tranquilo/.test(p)) && !sMix.chaves.includes('agradecimento'), sMix.partes.join(' | '));
  const sSolto = decidirSequenciaPreco([intencaoDe('OUTRO_ASSUNTO'), intencaoDe('AGRADECEU_OU_ENCERROU')], 'preco_confirmado', { medida: '195/55/15' });
  checar('Papo solto + "obrigado pela atencao" (caso real Juliano): continua sendo um agradecimento (nada de endereco)', sSolto.acaoPrincipal === 'RESPONDER_AGRADECIMENTO' && sSolto.partes.length === 1, sSolto.partes.join(' | '));
  const sSolto2 = decidirSequenciaPreco([intencaoDe('OUTRO_ASSUNTO'), intencaoDe('AGRADECEU_OU_ENCERROU')], 'preco_confirmado', { medida: '195/55/15' }, {}, { jaRespondidas: ['agradecimento'] });
  checar('Papo solto + agradecimento repetido: silencio', sSolto2.acaoPrincipal === 'SILENCIO' && sSolto2.partes.length === 0);
  const sMix2 = decidirSequenciaPreco([intencaoDe('AGRADECEU_OU_ENCERROU'), intencaoDe('PERGUNTA_TECNICA')], 'preco_confirmado', { medida: '195/55/15' });
  checar('"Obrigado" + pergunta tecnica: sai do fluxo (IA livre responde a tecnica)', sMix2.acaoPrincipal === 'NADA');
  const editado = decidirAcaoPreco(intencaoDe('AGRADECEU_OU_ENCERROU'), 'sem_estado', {}, { agradecimento: ['Por nada, ta? Chama a gente quando quiser.'] });
  checar('Agradecimento: respeita o texto EDITADO pelo dono', /Por nada, ta\?/.test(textoDe(editado)), textoDe(editado));
  checar('chavesJaRespondidas: agradecimento ja dito ha pouco -> ["agradecimento"]', chavesJaRespondidas(undefined, 'Oi\n' + TEXTOS_PADRAO['agradecimento']!.join('\n')).includes('agradecimento'));
  checar('chavesJaRespondidas: agradecimento EDITADO tambem e reconhecido', chavesJaRespondidas({ agradecimento: ['Por nada, ta? Chama a gente quando quiser.'] }, 'x Por nada, ta? Chama a gente quando quiser. y').includes('agradecimento'));
}

// ----- Pedir a medida de novo (caso Carlos Gomes 21/09: a mesma pergunta 3x em 40 s) -----
{
  const p1 = decidirAcaoPreco(intencaoDe('PERGUNTAR_PRECO_SEM_MEDIDA'), 'sem_estado', {});
  checar('Pedir medida 1a vez: texto padrao', p1.acao.tipo === 'PEDIR_MEDIDA' && /Poderia me informar a medida/.test(textoDe(p1)) && p1.novoEstado === 'aguardando_medida', textoDe(p1));
  const p2 = decidirAcaoPreco(intencaoDe('PERGUNTAR_PRECO_SEM_MEDIDA'), 'aguardando_medida', {}, {}, { jaRespondidas: ['pedir_medida'] });
  checar('Pedir medida 2a vez: pede DE OUTRO JEITO (nao repete a frase)', p2.acao.tipo === 'PEDIR_MEDIDA' && /É só me passar a medida/.test(textoDe(p2)) && !/Poderia me informar/.test(textoDe(p2)) && p2.novoEstado === 'aguardando_medida', textoDe(p2));
  checar('Pedir medida 2a vez: continua guardando o estado aguardando_medida', p2.novoEstado === 'aguardando_medida');
  const p3 = decidirAcaoPreco(intencaoDe('PERGUNTAR_PRECO_SEM_MEDIDA'), 'aguardando_medida', {}, {}, { jaRespondidas: ['pedir_medida', 'pedir_medida_repetida'] });
  checar('Pedir medida 3a vez: ja disse as duas -> sai do fluxo (IA livre segue, com as travas)', p3.acao.tipo === 'NADA' && p3.novoEstado === 'aguardando_medida');
  const p4 = decidirAcaoPreco(intencaoDe('PERGUNTOU_PARCELAMENTO_ESPECIFICO', { parcelasExtraida: 6 }), 'aguardando_medida', {}, {}, { jaRespondidas: ['pedir_medida'] });
  checar('Parcelamento sem medida, depois de ja ter pedido a medida: usa a variante e guarda a pergunta (6x)', /É só me passar a medida/.test(textoDe(p4)) && p4.novosDados.intencaoPendente === 'parcelamento_especifico' && p4.novosDados.parcelasPendentes === 6, textoDe(p4));
  checar('chavesJaRespondidas: pedir_medida gravado com NEGRITO (*medida do pneu*, caso real 3 de 7 aberturas) tambem e reconhecido', chavesJaRespondidas(undefined, 'Oi, tudo bem?\nPoderia me informar a *medida do pneu* (ex.: 175/65/14) ou o *modelo do seu carro*?').includes('pedir_medida'));
  checar('chavesJaRespondidas: reconhece sem se importar com maiuscula/pontuacao', chavesJaRespondidas(undefined, 'PODERIA ME INFORMAR A MEDIDA DO PNEU (EX: 175/65/14) OU O MODELO DO SEU CARRO').includes('pedir_medida'));
  checar('chavesJaRespondidas: texto parecido mas DIFERENTE nao conta', !chavesJaRespondidas(undefined, 'Me passa a medida do pneu que eu te passo o valor').includes('pedir_medida'));
  checar('chavesJaRespondidas: pedir_medida ja dito -> ["pedir_medida"]', chavesJaRespondidas(undefined, 'Oi\n' + TEXTOS_PADRAO['pedir_medida']!.join('\n')).join() === 'pedir_medida');
  // Dar a medida depois de ja ter pedido 2x continua normal
  const d = decidirAcaoPreco(intencaoDe('DAR_MEDIDA', { medidaExtraida: '195/55/15' }), 'aguardando_medida', {}, {}, { jaRespondidas: ['pedir_medida', 'pedir_medida_repetida'] });
  checar('Depois de pedir a medida 2x, quando ele da a medida o preco sai normal', d.acao.tipo === 'CONFIRMAR_PRECO' && /R\$ 289,00 à vista/.test(textoDe(d)), textoDe(d));
}

// =====================================================================================
// RAJADA (18/09, caso Marcia Lima): varias mensagens seguidas -> o robo responde TUDO, na ordem.
// =====================================================================================
{
  const seq = (itens: IntencaoExtraida[], estado: EstadoPrecoFluxo = 'sem_estado', dados: DadosPrecoFluxo = {}, textos = {}, ctx = {}) => decidirSequenciaPreco(itens, estado, dados, textos, ctx);

  // O caso real: preco de 2 pneus 175/70/14 + "pirelli ou dunlop?" + endereco
  const marcia = seq([
    intencaoDe('DAR_MEDIDA', { medidaExtraida: '175/70/14', quantidadeExtraida: 2 }),
    intencaoDe('PERGUNTOU_POR_OUTRA_MARCA'),
    intencaoDe('PEDIU_LOCALIZACAO'),
  ]);
  const t = marcia.partes.join(' | ');
  const iPreco = marcia.partes.findIndex((p) => /os 2 pneus \*175\/70\/14\*/.test(p));
  const iMarca = marcia.partes.findIndex((p) => /só com o GP Premium/.test(p));
  const iLoc = marcia.partes.findIndex((p) => /Segue a nossa localização/.test(p));
  const iPino = marcia.partes.indexOf(MARCADOR_PINO);
  checar('Rajada Marcia: responde o PRECO dos 2 pneus', iPreco >= 0, t);
  checar('Rajada Marcia: responde a pergunta da marca', iMarca >= 0, t);
  checar('Rajada Marcia: manda a localizacao', iLoc >= 0 && iPino === iLoc + 1, t);
  checar('Rajada Marcia: na ORDEM em que ele perguntou (preco -> marca -> endereco+pino)', iPreco < iMarca && iMarca < iLoc, t);
  checar('Rajada Marcia: exatamente 1 pino', marcia.partes.filter((p) => p === MARCADOR_PINO).length === 1);
  checar('Rajada Marcia: estado final = preco confirmado da medida dele, com a quantidade', marcia.novoEstado === 'preco_confirmado' && marcia.novosDados.medida === '175/70/14' && marcia.novosDados.quantidade === 2);
  checar('Rajada Marcia: acao principal = a primeira que respondeu', marcia.acaoPrincipal === 'CONFIRMAR_PRECO');

  // Estado encadeado: 1o assunto da a medida, 2o usa
  const enc = seq([intencaoDe('DAR_MEDIDA', { medidaExtraida: '195/55/15' }), intencaoDe('PERGUNTOU_PARCELAMENTO_ESPECIFICO', { parcelasExtraida: 6 })]);
  checar('Rajada: medida do 1o assunto vale pro 2o (preco e depois 6x, sem pedir a medida de novo)', /R\$ 289,00 à vista/.test(enc.partes.join(' ')) && new RegExp(`R\\$ ${brl(ITEM_195_55_15.parcelado.x6 / 6)} cada`).test(enc.partes.join(' ')) && !enc.partes.some((p) => /Poderia me informar a medida/.test(p)), enc.partes.join(' | '));

  // Pergunta de preco sem medida + parcelamento sem medida: pede a medida UMA vez so, guarda a pergunta
  const semMed = seq([intencaoDe('PERGUNTAR_PRECO_SEM_MEDIDA'), intencaoDe('PERGUNTOU_PARCELAMENTO_ESPECIFICO', { parcelasExtraida: 6 })]);
  checar('Rajada: preco + parcelamento sem medida -> pede a medida 1 vez so (sem bolha repetida)', semMed.partes.filter((p) => /Poderia me informar a medida/.test(p)).length === 1 && semMed.partes.length === 1, semMed.partes.join(' | '));
  checar('Rajada: e guarda a pergunta de 6x pra quando a medida chegar', semMed.novoEstado === 'aguardando_medida' && semMed.novosDados.intencaoPendente === 'parcelamento_especifico' && semMed.novosDados.parcelasPendentes === 6);

  // Pino no maximo 1x, mesmo pedindo o endereco 2 vezes na mesma rajada
  const doisEnderecos = seq([intencaoDe('PEDIU_LOCALIZACAO'), intencaoDe('PEDIU_LOCALIZACAO')]);
  checar('Rajada: pedir o endereco 2x na mesma rajada manda o pino 1 vez', doisEnderecos.partes.filter((p) => p === MARCADOR_PINO).length === 1);

  // Pino ja mandado ha pouco: nao repete, responde em texto
  const pinoRecente = seq([intencaoDe('PEDIU_LOCALIZACAO')], 'sem_estado', {}, {}, { minutosDesdeLocalizacao: 3 });
  checar('Rajada: pino ja mandado ha 3 min -> so texto, sem pino', !pinoRecente.partes.includes(MARCADOR_PINO) && /pino da localização aqui em cima/.test(pinoRecente.partes.join(' ')));

  // Pergunta tecnica no meio: o codigo nao sabe responder -> sai do fluxo inteiro (IA livre responde a rajada toda)
  const tecnica = seq([intencaoDe('DAR_MEDIDA', { medidaExtraida: '195/55/15' }), intencaoDe('PERGUNTA_TECNICA')]);
  checar('Rajada: pergunta tecnica no meio -> NADA (IA livre cuida da rajada toda)', tecnica.acaoPrincipal === 'NADA' && tecnica.partes.length === 0 && tecnica.novoEstado === 'sem_estado');

  // Papo solto e ignorado quando ha outro assunto; sozinho, sai do fluxo
  const solto = seq([intencaoDe('OUTRO_ASSUNTO'), intencaoDe('PEDIU_LOCALIZACAO')]);
  checar('Rajada: papo solto + endereco -> responde so o endereco', solto.acaoPrincipal === 'ENVIAR_LOCALIZACAO_FIXA' && solto.partes.length === 2);
  checar('Rajada: so papo solto -> NADA', seq([intencaoDe('OUTRO_ASSUNTO')]).acaoPrincipal === 'NADA');
  checar('Rajada: lista vazia -> NADA', seq([]).acaoPrincipal === 'NADA');

  // Um assunto so continua igual ao de antes
  const um = seq([intencaoDe('PERGUNTOU_NOTA_FISCAL')]);
  checar('Rajada de 1 assunto = resposta do assunto', um.acaoPrincipal === 'RESPONDER_NOTA_FISCAL' && /sempre emite nota fiscal/i.test(um.partes.join(' ')));

  // Limites: no maximo 4 assuntos e 8 bolhas
  const muitos = seq(Array.from({ length: 6 }, () => intencaoDe('PERGUNTOU_SE_E_REMOLD')).concat([intencaoDe('PERGUNTOU_SE_E_CHINES')]));
  checar('Rajada: assunto repetido nao duplica bolha', muitos.partes.filter((p) => /remold/i.test(p)).length === 1);
  const cheio = seq([intencaoDe('PERGUNTOU_SE_E_REMOLD'), intencaoDe('PERGUNTOU_SE_E_CHINES'), intencaoDe('PERGUNTOU_SE_TEM_JUROS'), intencaoDe('OBJETOU_PRECO_OU_MARCA')]);
  checar('Rajada: teto de 8 bolhas', cheio.partes.length <= 8 && cheio.partes.length >= 6, String(cheio.partes.length));
  const passaDe4 = seq([intencaoDe('PERGUNTOU_NOTA_FISCAL'), intencaoDe('PERGUNTOU_ALINHAMENTO'), intencaoDe('OFERECEU_BASE_TROCA'), intencaoDe('OFERECEU_VENDER_USADO'), intencaoDe('PERGUNTOU_SE_E_CHINES')]);
  checar('Rajada: so os 4 primeiros assuntos entram', !/chinês/i.test(passaDe4.partes.join(' ')) && passaDe4.partes.length === 4);

  // Texto editado pelo dono vale dentro da rajada
  const editado = seq([intencaoDe('PERGUNTOU_NOTA_FISCAL'), intencaoDe('PERGUNTOU_ALINHAMENTO')], 'sem_estado', {}, { alinhamento: ['Alinhamento a gente não faz.'] });
  checar('Rajada: usa o texto editado na tela Fluxo', editado.partes.includes('Alinhamento a gente não faz.'));
}

// ----- Regra de escrita: nenhum texto fixo pode ser meta-comentario/instrucao -----
{
  const todas: IntencaoExtraida['intencao'][] = [
    'PERGUNTOU_SE_E_REMOLD', 'PERGUNTOU_PARCELAMENTO_GENERICO', 'PERGUNTOU_SE_TEM_JUROS', 'PERGUNTOU_SE_E_CHINES',
    'OFERECEU_BASE_TROCA', 'OFERECEU_VENDER_USADO', 'PERGUNTOU_NOTA_FISCAL', 'PERGUNTOU_BALANCEAMENTO',
    'PERGUNTOU_ALINHAMENTO', 'PEDIU_LOCALIZACAO', 'OBJETOU_PRECO_OU_MARCA', 'PERGUNTOU_HORARIO', 'PEDIU_FOTO', 'PERGUNTOU_POR_OUTRA_MARCA', 'PERGUNTOU_SE_E_NOVO',
  ];
  const meta = /sugest[aã]o|copiar|voc[eê] pode (enviar|responder|dizer)|responda (que|com)|mensagem (para|pro) (o )?cliente|\bmodelo de mensagem\b/i;
  const ruins = todas.filter((i) => meta.test(textoDe(decidirAcaoPreco(intencaoDe(i), 'sem_estado', {}))));
  checar('Regra de escrita: nenhum texto fixo tem cara de meta-comentario/sugestao', ruins.length === 0, ruins.join(', '));
}

// =====================================================================================
// TELA "FLUXO" (18/09): textos editaveis pelo dono. O motor usa o texto editado quando
// existe e o padrao do catalogo quando nao; numeros continuam vindo do codigo.
// =====================================================================================
{
  const editado = { chines: ['Texto novo do dono sobre chinês.'] };
  const r = decidirAcaoPreco(intencaoDe('PERGUNTOU_SE_E_CHINES'), 'sem_estado', {}, editado);
  checar('Texto editado: o motor usa o texto do dono no lugar do padrao', r.acao.tipo === 'RESPONDER_CHINES' && textoDe(r) === 'Texto novo do dono sobre chinês.', textoDe(r));
  const outra = decidirAcaoPreco(intencaoDe('PERGUNTOU_NOTA_FISCAL'), 'sem_estado', {}, editado);
  checar('Texto editado: edicao de uma resposta nao afeta as outras', /sempre emite nota fiscal/i.test(textoDe(outra)));
  const vazio = decidirAcaoPreco(intencaoDe('PERGUNTOU_SE_E_CHINES'), 'sem_estado', {}, { chines: [] });
  checar('Texto editado vazio: cai no padrao (robo nunca fica mudo)', /não trabalha com pneu chinês/i.test(textoDe(vazio)));
  const lixo = decidirAcaoPreco(intencaoDe('PERGUNTOU_SE_E_CHINES'), 'sem_estado', {}, { chines: ['ok', '   '] });
  checar('Texto editado com bolha em branco: cai no padrao', /não trabalha com pneu chinês/i.test(textoDe(lixo)));

  const pm = decidirAcaoPreco(intencaoDe('PERGUNTAR_PRECO_SEM_MEDIDA'), 'sem_estado', {}, { pedir_medida: ['Qual a medida do seu pneu?'] });
  checar('Texto editado: "pedir medida" usa o texto do dono', pm.acao.tipo === 'PEDIR_MEDIDA' && textoDe(pm) === 'Qual a medida do seu pneu?');

  const bal = decidirAcaoPreco(intencaoDe('PERGUNTOU_BALANCEAMENTO', { quantidadeExtraida: 4 }), 'sem_estado', {}, { balanceamento_quantidade: ['São {QTD} rodas: R$ {TOTAL} ({VALOR_RODA} cada).'] });
  checar('Placeholders: {QTD} {TOTAL} {VALOR_RODA} preenchidos pelo CODIGO', textoDe(bal) === 'São 4 rodas: R$ 100,00 (25,00 cada).', textoDe(bal));
  const balSem = decidirAcaoPreco(intencaoDe('PERGUNTOU_BALANCEAMENTO'), 'sem_estado', {}, { balanceamento: ['Custa R$ {VALOR_RODA} cada roda.'] });
  checar('Placeholders: balanceamento sem quantidade usa o texto simples editado', textoDe(balSem) === 'Custa R$ 25,00 cada roda.', textoDe(balSem));
}

// ----- Integridade do catalogo (a tela e o robo dependem dele) -----
{
  const chaves = CATALOGO_FLUXO.map((c) => c.chave);
  checar('Catalogo: chaves unicas', new Set(chaves).size === chaves.length);
  const usadas = ['pedir_medida', 'sem_alternativa', 'remold', 'chines', 'juros', 'base_troca', 'compra_usado', 'nota_fiscal', 'alinhamento', 'localizacao', 'localizacao_repetida', 'horario', 'foto', 'condicao', 'outra_marca', 'remold_insistencia', 'objecao', 'objecao_repetida', 'parcelamento_generico', 'parcelamento_maximo', 'desconto_pix', 'balanceamento', 'balanceamento_quantidade'];
  checar('Catalogo: toda chave usada pelo motor existe e tem texto padrao', usadas.every((k) => (TEXTOS_PADRAO[k] || []).length > 0), usadas.filter((k) => !(TEXTOS_PADRAO[k] || []).length).join(','));
  const ruins = CATALOGO_FLUXO.filter((c) => c.partes && validarTextoFluxo(c.chave, c.partes).length > 0).map((c) => c.chave);
  checar('Catalogo: TODO texto padrao passa na propria validacao (nao tem "sem juros", tag, meta-texto)', ruins.length === 0, ruins.join(','));
  checar('Catalogo: categoria calculada nao tem texto editavel', CATALOGO_FLUXO.filter((c) => c.calculado).every((c) => !c.partes));
  checar('Catalogo: toda categoria tem gatilho e exemplos', CATALOGO_FLUXO.every((c) => c.quando && c.exemplos.length > 0));
  checar('Catalogo: textoFluxo sem edicao devolve o padrao', textoFluxo(undefined, 'remold') === TEXTOS_PADRAO['remold']);
}

// ----- Validacao do que o dono digita na tela -----
{
  const v = (chave: string, partes: unknown) => validarTextoFluxo(chave, partes);
  checar('Validacao: texto normal passa', v('nota_fiscal', ['Emitimos nota fiscal em todas as vendas.']).length === 0);
  checar('Validacao: barra "sem juros" (parcelamento TEM juros)', v('parcelamento_generico', ['Parcelamos em 10x sem juros!']).length > 0);
  checar('Validacao: barra tag de acao entre colchetes', v('nota_fiscal', ['Sim. [TRANSFERIR_HUMANO]']).length > 0);
  checar('Validacao: barra texto com cara de sugestao/instrucao (incidente da Josy)', v('nota_fiscal', ['Aqui está uma sugestão de mensagem que você pode copiar e enviar']).length > 0);
  checar('Validacao: barra placeholder que nao existe naquela resposta', v('nota_fiscal', ['Total {TOTAL}']).length > 0);
  checar('Validacao: aceita placeholder que existe (balanceamento_quantidade)', v('balanceamento_quantidade', ['{QTD} rodas = R$ {TOTAL}']).length === 0);
  checar('Validacao: barra lista vazia e bolha em branco', v('nota_fiscal', []).length > 0 && v('nota_fiscal', ['   ']).length > 0);
  checar('Validacao: barra mais de 4 bolhas', v('nota_fiscal', ['a', 'b', 'c', 'd', 'e']).length > 0);
  checar('Validacao: barra bolha gigante (>600 caracteres)', v('nota_fiscal', ['x'.repeat(601)]).length > 0);
  checar('Validacao: categoria calculada / desconhecida nao e editavel', v('preco_medida', ['x']).length > 0 && v('nao_existe', ['x']).length > 0);
}

// ----- O que chega de fora no bot-service e limpo antes de usar -----
{
  const s = sanitizarTextosFluxo({ chines: ['ok'], nao_existe: ['x'], remold: 'texto solto', juros: [], nota_fiscal: ['a', 5], objecao: ['x'.repeat(700)], alinhamento: ['Não fazemos alinhamento.'] });
  checar('Sanitizar: mantem so chave conhecida com array de texto valido', Object.keys(s).sort().join(',') === 'alinhamento,chines', Object.keys(s).join(','));
  checar('Sanitizar: lixo/null/undefined viram mapa vazio', Object.keys(sanitizarTextosFluxo(null)).length === 0 && Object.keys(sanitizarTextosFluxo('x')).length === 0 && Object.keys(sanitizarTextosFluxo(undefined)).length === 0);
}

console.log(erros === 0 ? '\nTODOS OK' : '\n' + erros + ' ERRO(S)');
process.exit(erros === 0 ? 0 : 1);
