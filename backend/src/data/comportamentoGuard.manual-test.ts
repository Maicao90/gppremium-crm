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
import { decidirAntiLoop, MsgAntiLoop, removerPromessaDeFoto } from './comportamentoGuard';

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

console.log(erros === 0 ? '\nTODOS OK' : '\n' + erros + ' ERRO(S)');
process.exit(erros === 0 ? 0 : 1);
