// Roda sem chamar IA nenhuma — so a logica pura. Cobre os casos reais que
// quebraram em 09-10/09/2026. Fica no repo como regressao (unico jeito de saber
// se uma mudanca futura na tabela ou no motor voltou a quebrar algum destes casos).
import { decidirAcaoPreco, IntencaoExtraida, EstadoPrecoFluxo, DadosPrecoFluxo } from './fluxoPreco';

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

console.log(erros === 0 ? '\nTODOS OK' : '\n' + erros + ' ERRO(S)');
process.exit(erros === 0 ? 0 : 1);
