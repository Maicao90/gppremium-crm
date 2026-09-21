// Teste standalone (sem framework, sem banco) do novo criterio de anti-loop
// (decidirAntiLoop, 18/09). Roda com: npx ts-node --transpile-only src/data/comportamentoGuard.manual-test.ts
//
// Cobre o caso real que motivou a reescrita: "Pwa" (18/09) — cliente engajado com 5
// falas reais gerou 9 bolhas do robo (preco deterministico manda 1 bolha por parte,
// sem limite; fluxo livre manda ate 4) e quase foi pausado pela contagem antiga, que
// contava BOLHA do robo em vez de TURNO real do cliente. E cobre o oposto: um loop de
// verdade (robo repetindo a mesma frase sem novidade nenhuma do cliente) TEM que
// pausar. Deliberadamente NAO importa nada de botAtendimentoService.ts/server.ts —
// aquele import dispara o bootstrap inteiro do app (express.listen, connectToWhatsApp
// etc) como efeito colateral, o que seria perigoso rodar so pra testar uma funcao pura.
import { decidirAntiLoop, MsgAntiLoop, removerPromessaDeFoto, removerHorarioNaoPedido, removerLocalizacaoRepetida, pareceAgradecimento } from './comportamentoGuard';

let erros = 0;
function checar(nome: string, condicao: boolean, detalhe?: string) {
  if (!condicao) { erros++; console.log('ERRO ' + nome + (detalhe ? ' | ' + detalhe : '')); }
  else console.log('OK   ' + nome);
}

const AGORA = new Date();
const JANELA_MS = 5 * 60 * 1000;
const DESDE = new Date(AGORA.getTime() - JANELA_MS);
const seg = (n: number) => n * 1000;
const min = (n: number) => n * 60 * 1000;

function cliente(waId: string, texto: string, offsetMsAntesDeAgora: number): MsgAntiLoop {
  return { waId, texto, timestamp: new Date(AGORA.getTime() - offsetMsAntesDeAgora) };
}
function bot(texto: string, offsetMsAntesDeAgora: number): MsgAntiLoop {
  return { texto, timestamp: new Date(AGORA.getTime() - offsetMsAntesDeAgora) };
}

// ===== Caso real "Pwa" (18/09): 5 falas reais, 9 bolhas do robo, NAO pode pausar =====
// Cliente manda 5 mensagens distintas ao longo de ~4min; cada uma gera de 1 a 3 bolhas
// do robo (preco deterministico + fluxo livre), todas com texto DIFERENTE entre si (o
// robo esta progredindo a conversa, nao girando na mesma frase) e nenhuma delas repete
// o que o cliente acabou de mandar.
{
  const mensagensCliente: MsgAntiLoop[] = [
    cliente('wa-c1', 'Oi, vcs tem pneu 175 70 14 pra Fiesta?', min(4)),
    cliente('wa-c2', 'Quanto fica esse a vista e parcelado no cartao?', min(3) + seg(20)),
    cliente('wa-c3', 'Da pra colocar hoje ainda, ai na loja?', min(2) + seg(30)),
    cliente('wa-c4', 'Qual o endereco exato de voces em Luziania?', min(1) + seg(40)),
    cliente('wa-c5', 'Fechado, vou ai as 17h entao, obrigado', seg(30)),
  ];
  const respostasBot: MsgAntiLoop[] = [
    bot('Oi! Sim, temos o 175/70/14 disponivel aqui na loja, montagem gratis inclusa.', min(4) - seg(5)),
    bot('Fica R$249,00 a vista no pix ou em ate 3x sem juros no cartao.', min(3) + seg(15)),
    bot('Da sim! Podemos montar hoje mesmo, sem hora marcada.', min(2) + seg(25)),
    bot('Ficamos na Avenida Minas Gerais, 1200, Setor Central, Luziania-GO.', min(1) + seg(35)),
    bot('E perto do posto BR, de frente pro Ceasa, facil de achar!', min(1) + seg(30)),
    bot('Perfeito, vamos te esperar as 17h entao. Ate ja!', seg(25)),
    bot('Se precisar de qualquer coisa antes, e so chamar aqui.', seg(20)),
  ];
  const r = decidirAntiLoop(mensagensCliente, respostasBot, DESDE);
  checar('Pwa: 5 turnos reais (nao 9 bolhas) fica abaixo do limite de 8 — nao pausa', r.pausar === false, JSON.stringify(r));
}

// ===== Caso de loop real: robo repete a MESMA frase 3x sem nenhuma msg nova do cliente =====
// Nenhuma mensagem do cliente na janela (turnosReais = 0, longe do limite de volume) —
// so a repeticao de conteudo pode e deve pausar aqui.
{
  const mensagensCliente: MsgAntiLoop[] = [];
  const fraseRepetida = 'Aguarde um instante, vou verificar a disponibilidade do pneu pra voce aqui na loja.';
  const respostasBot: MsgAntiLoop[] = [
    bot(fraseRepetida, min(4)),
    bot('So um momento, ja te retorno com a informacao certinha.', min(3)),
    bot(fraseRepetida, min(2)),
    bot(fraseRepetida, min(1)),
  ];
  const r = decidirAntiLoop(mensagensCliente, respostasBot, DESDE);
  checar('Loop real: 0 turnos do cliente mas 3x a mesma frase do robo — pausa', r.pausar === true, JSON.stringify(r));
  checar('Loop real: motivo é anti_loop_repeticao (nao volume, nao eco)', r.motivo === 'anti_loop_repeticao', JSON.stringify(r));
}

// ===== Eco: cliente "manda" de volta o que o robo tinha acabado de mandar =====
// Assinatura de eco de plataforma / bot do outro lado ecoando — so 1 turno de cliente
// (longe do limite de volume de 8), mas e prova direta de loop e pausa na hora.
{
  const textoEcoado = 'Sua garantia e de 90 dias em qualquer defeito de fabricacao do pneu, sem custo nenhum pra voce.';
  const respostasBot: MsgAntiLoop[] = [bot(textoEcoado, seg(90))];
  const mensagensCliente: MsgAntiLoop[] = [cliente('wa-eco1', textoEcoado, seg(30))];
  const r = decidirAntiLoop(mensagensCliente, respostasBot, DESDE);
  checar('Eco: mensagem do cliente repete o que o robo mandou 60s antes — pausa', r.pausar === true, JSON.stringify(r));
  checar('Eco: motivo é anti_loop_eco', r.motivo === 'anti_loop_eco', JSON.stringify(r));
}

// ===== Volume como rede de seguranca: 8 turnos reais e distintos, sem eco/repeticao =====
// Continua existindo pra pegar loop NAO-textual (ex.: troca de midia em circulo) que os
// dois sub-sinais de conteudo nao cobrem.
{
  const mensagensCliente: MsgAntiLoop[] = Array.from({ length: 8 }, (_, i) =>
    cliente(`wa-vol${i}`, `mensagem numero ${i} bem diferente das outras, sem repetir nada`, min(4) - seg(i * 20)),
  );
  const respostasBot: MsgAntiLoop[] = Array.from({ length: 8 }, (_, i) =>
    bot(`resposta numero ${i} tambem diferente das outras, sem repetir nada`, min(4) - seg(i * 20) - seg(5)),
  );
  const r = decidirAntiLoop(mensagensCliente, respostasBot, DESDE);
  checar('Volume: 8 turnos DISTINTOS do cliente (sem eco/repeticao) — pausa pelo eixo de volume', r.pausar === true, JSON.stringify(r));
  checar('Volume: motivo é anti_loop_volume', r.motivo === 'anti_loop_volume', JSON.stringify(r));
}

// ===== Confirmacoes curtas nao contam pra repeticao nem eco (< 40 chars) =====
// "Ok", "certo" etc podem repetir varias vezes sem disparar nada — so o texto com
// corpo de verdade (>=40 chars) e que prova loop de conteudo.
{
  const mensagensCliente: MsgAntiLoop[] = [];
  const respostasBot: MsgAntiLoop[] = [bot('Ok', min(4)), bot('Ok', min(3)), bot('Ok', min(2)), bot('Ok', min(1))];
  const r = decidirAntiLoop(mensagensCliente, respostasBot, DESDE);
  checar('Confirmacoes curtas repetidas (<40 chars) NAO disparam anti_loop_repeticao', r.pausar === false, JSON.stringify(r));
}

// ===== Promessa de foto (caso real 19/09: "Foto" -> "Claro — segue foto do pneu..." e nao mandou nada) =====
{
  const f = (partes: string[]) => removerPromessaDeFoto(partes);
  checar('Foto: "segue foto do pneu" e cortado', f(['Claro — segue foto do pneu 195/55/15 GP Premium.']).length === 0);
  checar('Foto: "vou te mandar uma foto" e cortado', f(['Vou te mandar uma foto do pneu já já.']).length === 0);
  checar('Foto: "te mando a foto" / "enviei a foto" cortados', f(['Te mando a foto agora']).length === 0 && f(['Enviei a foto acima']).length === 0);
  checar('Foto: "Conseguiu ver a foto?" (pergunta sobre foto que nunca foi mandada) e cortado', f(['Oi! Conseguiu ver a foto?']).length === 0);
  checar('Foto: preserva o resto da bolha (so a linha da promessa sai)', f(['O pneu 195/55/15 sai por R$ 289,00 à vista.\nSegue a foto do pneu:']).join('|') === 'O pneu 195/55/15 sai por R$ 289,00 à vista.');
  checar('Foto: preserva outras bolhas normais', f(['Segue foto do pneu', 'Quando você consegue vir até a loja?']).join('|') === 'Quando você consegue vir até a loja?');
  checar('Foto: texto sem foto passa intacto', f(['Temos o pneu 195/55/15 por R$ 289,00 à vista.']).length === 1);
  checar('Foto: "segue a nossa localização" NAO e promessa de foto', f(['Segue a nossa localização:']).length === 1);
  checar('Foto: "foto" em outro contexto (garantia/fotos do carro) nao e cortado', f(['Se quiser, traz uma foto do seu carro pra gente indicar.']).length === 1);
}

// ===== Horario que a IA cita sozinho (casos reais de 21/09: depois de "OK obrigado" vinha "Nosso horario: ...") =====
{
  const h = (partes: string[], cliente: string) => removerHorarioNaoPedido(partes, cliente);
  const real1 = ['Por nada! Quando você consegue passar aqui na loja?', 'Nosso horário é: Segunda a sexta, das 08h às 18h, e sábado, das 08h às 12h.'];
  checar('Horario: cliente so agradeceu -> a bolha do horario e cortada, o resto fica', h(real1, 'OK obrigado').join('|') === 'Por nada! Quando você consegue passar aqui na loja?');
  checar('Horario: "Horário: Segunda a sexta de 08h às 18h. Sábado de 08h às 12h." cortado', h(['Por nada! Qualquer coisa, aqui a gente está à disposição.', 'Horário: Segunda a sexta de 08h às 18h. Sábado de 08h às 12h.'], 'Blz\nObrigado').length === 1);
  const misturada = h(['Se mudar de ideia, aqui a gente atende Segunda a Sexta das 08h às 18h e Sábado das 08h às 12h. Qualquer coisa, estou por aqui.'], 'Mais , obrigado pela atenção');
  checar('Horario: frase misturada — corta so a frase do horario, guarda "Qualquer coisa, estou por aqui."', misturada.join('|') === 'Qualquer coisa, estou por aqui.', misturada.join('|'));
  checar('Horario: cliente PERGUNTOU o horario -> intacto', h(real1, 'ta aberto agora?').join('|') === real1.join('|'));
  checar('Horario: cliente falou de "sabado" -> intacto', h(real1, 'posso passar sabado?').join('|') === real1.join('|'));
  checar('Horario: cliente perguntou "que horas" -> intacto', h(real1, 'que horas posso ir?').join('|') === real1.join('|'));
  checar('Horario: cliente disse "amanha eu passo" -> intacto', h(real1, 'amanhã eu passo aí').join('|') === real1.join('|'));
  checar('Horario: texto sem horario passa intacto', h(['Temos o pneu 195/55/15 por R$ 289,00 à vista.'], 'quanto custa').length === 1);
  checar('Horario: pergunta "Quando voce consegue vir?" NAO e cortada (nao cita horario da loja)', h(['Quando você consegue vir até a loja?'], 'ok').length === 1);
  checar('Horario: "vem ate as 18h" (so um horario, sem faixa) NAO e cortado', h(['Pode vir até as 18h.'], 'ok').length === 1);

  // ---- Revisao adversarial 21/09: a trava NUNCA pode deixar mudo quem perguntou ----
  const HORARIO_LOJA = 'A gente atende de segunda a sexta, das 08h às 18h, e sábado das 08h às 12h.';
  for (const pergunta of ['vcs ficam ate q hrs?', 'vcs ficam ate que hr', 'vcs almocam?', 'posso ir depois do almoço?', 'vcs trabalham hj?', 'posso passar agora?', 'passo aí às 15h', 'vou passar na segunda', 'quinta às 10 eu passo aí', 'posso passar na sexta depois do almoço?', 'vcs tão aí segunda de manhã?', 'ok obrigado, e vcs abrem sábado?', 'obrigado, qual o horário?']) {
    checar('Horario NAO corta quando o cliente perguntou/falou de horario-dia: "' + pergunta + '"', h([HORARIO_LOJA], pergunta).join('|') === HORARIO_LOJA);
  }
  checar('Horario: "Pode sim!" + horario para "posso ir depois do almoço?" — resposta inteira preservada', h(['Pode sim!', HORARIO_LOJA], 'posso ir depois do almoço?').length === 2);
  checar('pareceAgradecimento: "ok obrigado" / "Blz" / "valeu" / "vou pensar e te falo" = sim', ['ok obrigado', 'Blz', 'valeu', 'vou pensar e te falo', 'Mais , obrigado pela atenção'].every((t) => pareceAgradecimento(t)));
  checar('pareceAgradecimento: pergunta, horario ou dia = nao', ['ok, e em 6x?', 'obrigado, abrem sábado?', 'ok amanhã eu passo aí', 'quanto custa', 'boa tarde, obrigado'].every((t) => !pareceAgradecimento(t)));

  // ---- Tags de acao nunca sao cortadas nem partidas ----
  const agendar = h(['Combinado, quinta às 10h! A loja atende de segunda a sexta, das 08h às 18h [AGENDAR_VISITA: data="2026-09-24 10:00", loja="Borracharia Popular", servico="Montagem", cliente="Carlos"]'], 'ok obrigado');
  checar('Tag [AGENDAR_VISITA] colada na frase do horario SOBREVIVE (o horario sai, a tag fica inteira)', agendar.length === 1 && /\[AGENDAR_VISITA: data="2026-09-24 10:00", loja="Borracharia Popular", servico="Montagem", cliente="Carlos"\]/.test(agendar[0]!) && !/segunda a sexta/.test(agendar[0]!) && /Combinado/.test(agendar[0]!), agendar.join('|'));
  const lembrar = h(['Fechado, te aviso depois! [LEMBRAR: data="2026-09-30 09:00" texto="Oi! Ainda quer o pneu? A gente atende de segunda a sexta, das 08h às 18h."]'], 'depois eu vejo');
  checar('Tag [LEMBRAR] com horario no texto NAO e partida (nada de pedaco cru indo pro cliente)', lembrar.length === 1 && /\[LEMBRAR: [^\]]*\]$/.test(lembrar[0]!) && (lembrar[0]!.match(/\[/g) || []).length === (lembrar[0]!.match(/\]/g) || []).length, lembrar.join('|'));
  const soTag = h(['A gente atende de segunda a sexta, das 08h às 18h. [AGENDAR_VISITA: data="2026-09-24 10:00", loja="X", servico="Y", cliente="Z"]'], 'ok obrigado');
  checar('Sobrando so a tag: a tag fica (e o horario sai)', soTag.length === 1 && /^\[AGENDAR_VISITA/.test(soTag[0]!), soTag.join('|'));
}

// ===== Pino da localizacao ja enviado (casos reais de 21/09: "Segue nossa localizacao!" solto, sem pino, 2x) =====
{
  const l = (partes: string[]) => removerLocalizacaoRepetida(partes);
  checar('Pino repetido: "Segue nossa localização!" + marca -> some (a marca e o anuncio)', l(['Segue nossa localização! [ENVIAR_LOCALIZACAO]']).length === 0);
  checar('Pino repetido: "Segue a nossa localização:" sem marca tambem some', l(['Segue a nossa localização:']).length === 0);
  checar('Pino repetido: "Aqui está o endereço:" some', l(['Aqui está o endereço:']).length === 0);
  checar('Pino repetido: bolha so com a marca some', l(['[ENVIAR_LOCALIZACAO]']).length === 0);
  checar('Pino repetido: preserva o resto da bolha (pergunta de fechamento)', l(['Quando você consegue vir? Segue nossa localização! [ENVIAR_LOCALIZACAO]']).join('|') === 'Quando você consegue vir?');
  checar('Pino repetido: preserva bolhas normais', l(['Quando você consegue vir até a loja?', 'Segue nossa localização!']).join('|') === 'Quando você consegue vir até a loja?');
  checar('Pino repetido: texto com endereco de verdade (rua, numero) fica', l(['A gente fica na Rua das Flores, 123, em frente ao posto.']).length === 1);
  const lp = l(['Segue nossa localização! [AGENDAR_VISITA: data="2026-09-24 10:00", loja="X", servico="Y", cliente="Z"]']);
  checar('Pino repetido: tag de agendamento na mesma bolha SOBREVIVE (so o anuncio do pino sai)', lp.length === 1 && /^\[AGENDAR_VISITA: data="2026-09-24 10:00", loja="X", servico="Y", cliente="Z"\]$/.test(lp[0]!), lp.join('|'));
  const lp2 = l(['Segue nossa localização [LEMBRAR: data="2026-09-30 09:00" texto="Oi! Ainda quer o pneu? A gente fica na Rua A, 1."]']);
  checar('Pino repetido: [LEMBRAR] colada no anuncio NAO e partida', lp2.length === 1 && (lp2[0]!.match(/\[/g) || []).length === (lp2[0]!.match(/\]/g) || []).length, lp2.join('|'));
  checar('Pino repetido: conversa sem localizacao passa intacta', l(['Temos o pneu por R$ 289,00 à vista.']).join('|') === 'Temos o pneu por R$ 289,00 à vista.');
}

console.log(erros === 0 ? '\nTODOS OK' : '\n' + erros + ' ERRO(S)');
process.exit(erros === 0 ? 0 : 1);
