// Chama a OpenAI de verdade — precisa de OPENAI_API_KEY no ambiente (o processo
// bot-service ja tem via dotenv; rodar este script de dentro da pasta backend).
import 'dotenv/config';
import { extrairIntencaoPreco, extrairIntencoesPreco } from './fluxoPrecoExtrator';

const apiKey = process.env.OPENAI_API_KEY?.trim();
if (!apiKey) { console.log('SEM OPENAI_API_KEY — nao da pra rodar este teste'); process.exit(1); }

const casos: { nome: string; msg: string; contexto: string; esperado: string; medidaEsperada?: string; quantidadeEsperada?: number; escolhaEsperada?: string; parcelasEsperada?: number; formaEsperada?: string }[] = [
  { nome: 'Elvania: "225/70 aro 17"', msg: '225/70 aro 17', contexto: '', esperado: 'DAR_MEDIDA', medidaEsperada: '225/70/17' },
  { nome: 'medida falada: "16r 205 55"', msg: '16r 205 55', contexto: '', esperado: 'DAR_MEDIDA', medidaEsperada: '205/55/16' },
  { nome: 'pergunta tecnica: "aguenta quantos kg"', msg: 'Ele aguenta até quantos kg', contexto: 'CLIENTE: quanto ta o 215/65/16\nROBO: R$349 a vista', esperado: 'PERGUNTA_TECNICA' },
  { nome: 'quantidade: "preciso de 4"', msg: 'preciso de 4', contexto: 'ROBO: o pneu 195/55/15 sai por R$289', esperado: 'RESPONDER_QUANTIDADE', quantidadeEsperada: 4 },
  // (era OUTRO_ASSUNTO ate 18/09 — agora "onde fica" e a categoria de localizacao)
  // (era OUTRO_ASSUNTO ate 21/09 — agradecimento/despedida/"vou pensar" agora e categoria propria: responde 1 vez e cala)
  { nome: 'agradecimento: "obrigado, vou pensar"', msg: 'obrigado, vou pensar', contexto: '', esperado: 'AGRADECEU_OU_ENCERROU' },
  { nome: 'agradecimento: "OK obrigado" depois do pino (caso real Giovanio)', msg: 'OK obrigado', contexto: 'CLIENTE: Onde fica a loja de vcs\nROBO: Segue a nossa localização:', esperado: 'AGRADECEU_OU_ENCERROU' },
  { nome: 'agradecimento: "Ok obrigado." depois do preco (caso real Belchior)', msg: 'Ok obrigado.', contexto: 'CLIENTE: Sem juros?\nROBO: Tem sim um jurinho em cada parcela.', esperado: 'AGRADECEU_OU_ENCERROU' },
  { nome: 'agradecimento: "Blz"', msg: 'Blz', contexto: 'ROBO: o pneu 185/70/14 sai por R$289,00 à vista', esperado: 'AGRADECEU_OU_ENCERROU' },
  { nome: 'agradecimento: "valeu"', msg: 'valeu', contexto: 'ROBO: o pneu 185/70/14 sai por R$289,00 à vista', esperado: 'AGRADECEU_OU_ENCERROU' },
  { nome: 'agradecimento: "vou pensar e te falo"', msg: 'vou pensar e te falo', contexto: 'ROBO: o pneu 185/70/14 sai por R$289,00 à vista', esperado: 'AGRADECEU_OU_ENCERROU' },
  { nome: 'agradecimento: "Mais, obrigado pela atenção" (caso real Juliano)', msg: 'Mais , obrigado pela atenção', contexto: 'CLIENTE: Fica onde ?\nROBO: Segue a nossa localização:', esperado: 'AGRADECEU_OU_ENCERROU' },
  { nome: 'agradecimento COM pergunta: "ok, e em 6x fica quanto?" vale a pergunta (nao e agradecimento)', msg: 'ok, e em 6x fica quanto?', contexto: 'ROBO: o pneu 195/55/15 sai por R$289,00 à vista', esperado: 'PERGUNTOU_PARCELAMENTO_ESPECIFICO', parcelasEsperada: 6 },
  { nome: 'agradecimento COM pergunta: "obrigado, vcs fazem balanceamento?" vale a pergunta', msg: 'obrigado, vcs fazem balanceamento?', contexto: 'ROBO: o pneu sai por R$289,00 à vista', esperado: 'PERGUNTOU_BALANCEAMENTO' },
  { nome: 'outro assunto: "bom dia" (saudacao NAO e agradecimento)', msg: 'bom dia', contexto: '', esperado: 'OUTRO_ASSUNTO' },
  { nome: 'outro assunto: "Tudo bem graças à Deus" (resposta a saudacao, caso real Carlos Gomes)', msg: 'Tudo bem graças à Deus', contexto: 'ROBO: Oi, tudo bem?\nROBO: Poderia me informar a medida do pneu ou o modelo do seu carro?', esperado: 'OUTRO_ASSUNTO' },
  { nome: 'outro assunto: "fica contra mão mim" (informacao, nao pedido nem agradecimento)', msg: 'fica na contra mão pra mim', contexto: 'CLIENTE: Fica onde ?\nROBO: Segue a nossa localização:', esperado: 'OUTRO_ASSUNTO' },
  // Gap (a) do review da Task 4: preco sem medida e a pergunta mais comum na vida real.
  { nome: 'preco sem medida: "quanto custa?"', msg: 'quanto custa?', contexto: '', esperado: 'PERGUNTAR_PRECO_SEM_MEDIDA' },
  // Gap (b) do review da Task 4: cliente escolhendo uma das alternativas ja oferecidas.
  {
    nome: 'escolher alternativa: "pode ser essa de 205/55/17"',
    msg: 'pode ser essa de 205/55/17',
    contexto: 'CLIENTE: 225/70/17\nROBO: Essa medida a gente não tem, infelizmente. No mesmo aro eu tenho: 205/50/17: R$ 339,00 à vista; 205/55/17: R$ 349,00 à vista; 215/50/17: R$ 329,00 à vista. Alguma dessas serve pra você?',
    esperado: 'ESCOLHER_ALTERNATIVA',
    escolhaEsperada: '205/55/17',
  },
  // Task remold (18/09): pergunta direta e pergunta indireta/desconfiada precisam cair
  // em PERGUNTOU_SE_E_REMOLD, nunca em PERGUNTA_TECNICA (durabilidade/kg/etc, sem
  // relacao com procedencia) nem em OUTRO_ASSUNTO.
  { nome: 'remold direto: "é remold isso?"', msg: 'é remold isso?', contexto: '', esperado: 'PERGUNTOU_SE_E_REMOLD' },
  { nome: 'remold indireto: "por que é tão barato, é chinês?"', msg: 'por que é tão barato, é chinês?', contexto: '', esperado: 'PERGUNTOU_SE_E_REMOLD' },
  { nome: 'remold indireto: "por que é tão barato?"', msg: 'por que é tão barato?', contexto: '', esperado: 'PERGUNTOU_SE_E_REMOLD' },
  { nome: 'remold indireto: "é original mesmo?"', msg: 'é original mesmo?', contexto: '', esperado: 'PERGUNTOU_SE_E_REMOLD' },

  // ===== Atendimento completo (18/09) =====
  // Chines (categoria propria) x remold — a colisao que exigiu mexer na description do CAT_G.
  { nome: 'chines explicito: "isso é chinês?"', msg: 'isso é chinês?', contexto: '', esperado: 'PERGUNTOU_SE_E_CHINES' },
  { nome: 'chines explicito: "é pneu chinês?"', msg: 'é pneu chinês?', contexto: '', esperado: 'PERGUNTOU_SE_E_CHINES' },
  // Parcelamento generico x especifico x juros
  { nome: 'parcelamento generico: "parcela?"', msg: 'parcela?', contexto: '', esperado: 'PERGUNTOU_PARCELAMENTO_GENERICO' },
  { nome: 'parcelamento generico: "dá pra parcelar?"', msg: 'dá pra parcelar?', contexto: 'ROBO: o pneu sai por R$289,00 à vista', esperado: 'PERGUNTOU_PARCELAMENTO_GENERICO' },
  { nome: 'parcelamento especifico: "quanto fica em 6x?"', msg: 'quanto fica em 6x?', contexto: 'ROBO: o pneu 195/55/15 sai por R$289,00 à vista', esperado: 'PERGUNTOU_PARCELAMENTO_ESPECIFICO', parcelasEsperada: 6 },
  { nome: 'parcelamento especifico: "Qual o valor passeando em 6 vezes" (erro de digitacao real)', msg: 'Qual o valor passeando em 6 vezes', contexto: 'ROBO: o pneu 195/55/15 sai por R$289,00 à vista', esperado: 'PERGUNTOU_PARCELAMENTO_ESPECIFICO', parcelasEsperada: 6 },
  { nome: 'parcelamento especifico: "e em 10x?"', msg: 'e em 10x?', contexto: 'ROBO: o pneu 195/55/15 sai por R$289,00 à vista', esperado: 'PERGUNTOU_PARCELAMENTO_ESPECIFICO', parcelasEsperada: 10 },
  { nome: 'parcelamento + medida na mesma mensagem', msg: '195/55/15 em 6x fica quanto?', contexto: '', esperado: 'PERGUNTOU_PARCELAMENTO_ESPECIFICO', parcelasEsperada: 6, medidaEsperada: '195/55/15' },
  { nome: 'sem juros: "é sem juros?"', msg: 'é sem juros?', contexto: 'ROBO: da pra parcelar em ate 10x no cartão', esperado: 'PERGUNTOU_SE_TEM_JUROS' },
  { nome: 'sem juros: "esse parcelamento tem juros?"', msg: 'esse parcelamento tem juros?', contexto: '', esperado: 'PERGUNTOU_SE_TEM_JUROS' },
  // Desconto a vista
  { nome: 'desconto: "à vista tem desconto?"', msg: 'à vista tem desconto?', contexto: 'ROBO: o pneu sai por R$289,00 à vista', esperado: 'PERGUNTOU_DESCONTO_AVISTA' },
  { nome: 'desconto: "faz desconto?"', msg: 'faz desconto?', contexto: '', esperado: 'PERGUNTOU_DESCONTO_AVISTA' },
  { nome: 'desconto no pix: "no pix tem desconto?"', msg: 'no pix tem desconto?', contexto: 'ROBO: o pneu sai por R$289,00 à vista', esperado: 'PERGUNTOU_DESCONTO_AVISTA', formaEsperada: 'pix' },
  { nome: 'desconto no dinheiro: "no dinheiro tem desconto?"', msg: 'no dinheiro tem desconto?', contexto: 'ROBO: o pneu sai por R$289,00 à vista', esperado: 'PERGUNTOU_DESCONTO_AVISTA', formaEsperada: 'dinheiro' },
  // Base de troca / usado / nota / balanceamento / alinhamento / localizacao
  { nome: 'base de troca: "posso dar meu pneu velho na troca?"', msg: 'posso dar meu pneu velho na troca?', contexto: '', esperado: 'OFERECEU_BASE_TROCA' },
  { nome: 'compra de usado: "vocês compram pneu usado?"', msg: 'vocês compram pneu usado?', contexto: '', esperado: 'OFERECEU_VENDER_USADO' },
  { nome: 'nota fiscal: "emite nota fiscal?"', msg: 'emite nota fiscal?', contexto: '', esperado: 'PERGUNTOU_NOTA_FISCAL' },
  { nome: 'balanceamento: "quanto é o balanceamento?"', msg: 'quanto é o balanceamento?', contexto: 'ROBO: o pneu sai por R$289,00 à vista', esperado: 'PERGUNTOU_BALANCEAMENTO' },
  { nome: 'balanceamento com quantidade: "faz balanceamento? são 4 pneus"', msg: 'faz balanceamento? são 4 pneus', contexto: '', esperado: 'PERGUNTOU_BALANCEAMENTO', quantidadeEsperada: 4 },
  { nome: 'alinhamento: "vocês fazem alinhamento?"', msg: 'vocês fazem alinhamento?', contexto: '', esperado: 'PERGUNTOU_ALINHAMENTO' },
  { nome: 'localizacao: "onde fica a loja"', msg: 'onde fica a loja', contexto: '', esperado: 'PEDIU_LOCALIZACAO' },
  { nome: 'localizacao: "manda a localização"', msg: 'manda a localização', contexto: '', esperado: 'PEDIU_LOCALIZACAO' },
  // Objecao de preco/marca (sem pergunta concreta)
  { nome: 'objecao: "achei caro"', msg: 'achei caro', contexto: 'ROBO: o pneu sai por R$289,00 à vista', esperado: 'OBJETOU_PRECO_OU_MARCA' },
  { nome: 'objecao real (conv-1204): "Essa marca nao presta,sem contar o preço que esta muito caro"', msg: 'Essa marca nao presta,sem contar o preço que esta muito caro', contexto: 'ROBO: o pneu sai por R$328,90 à vista', esperado: 'OBJETOU_PRECO_OU_MARCA' },
  { nome: 'objecao: "vi mais barato em outro lugar"', msg: 'vi mais barato em outro lugar', contexto: 'ROBO: o pneu sai por R$289,00 à vista', esperado: 'OBJETOU_PRECO_OU_MARCA' },
  // Garantia / tecnica continua sendo tecnica
  { nome: 'tecnica: "qual a garantia?"', msg: 'qual a garantia?', contexto: 'ROBO: o pneu sai por R$289,00 à vista', esperado: 'PERGUNTA_TECNICA' },
  // Outra marca (caso Marcia Lima, 18/09)
  { nome: 'outra marca: "vc tem Pirelli ou Dunlop?"', msg: 'vc tem Pirelli ou Dunlop?', contexto: 'ROBO: o pneu sai por R$289,00 à vista', esperado: 'PERGUNTOU_POR_OUTRA_MARCA' },
  { nome: 'outra marca real (com erro de digitacao): "Mais vc tem odulop oupireli"', msg: 'Mais vc tem odulop oupireli', contexto: 'ROBO: o pneu 175/70/14 sai por R$279,00 à vista', esperado: 'PERGUNTOU_POR_OUTRA_MARCA' },
  { nome: 'outra marca: "tem michelin?"', msg: 'tem michelin?', contexto: '', esperado: 'PERGUNTOU_POR_OUTRA_MARCA' },
  // Caso real 19/09 (conversa 7): "tem somente novos dele?" foi lido como OUTRA MARCA — e pergunta se o pneu e novo (remold)
  // (19/09, Maxwell: o robo confessou "sim, e remold" logo de cara pra quem so perguntou se e novo/meia-vida — o dono:
  // "ele se precipitou". Pergunta de condicao = categoria propria, sem confissao na 1a vez.)
  { nome: 'REAL: "tem somente novos dele?" = pergunta de condicao (novo?)', msg: 'tem somente novos dele?', contexto: 'CLIENTE: 205/55 aro 17\nROBO: Temos o pneu 205/55/17 da marca GP Premium por R$ 349,00 à vista.', esperado: 'PERGUNTOU_SE_E_NOVO' },
  { nome: 'REAL Maxwell: "mas tem meia vida ou somente pneus novos?"', msg: 'mas tem meia vida ou somente pneus novos?', contexto: 'CLIENTE: tem somente novos dele?\nROBO: Aqui a gente trabalha só com o GP Premium — não temos outras marcas.', esperado: 'PERGUNTOU_SE_E_NOVO' },
  { nome: 'novo: "esse pneu é novo?"', msg: 'esse pneu é novo?', contexto: 'ROBO: o pneu sai por R$289,00 à vista', esperado: 'PERGUNTOU_SE_E_NOVO' },
  { nome: 'novo: "é novo mesmo ou usado?"', msg: 'é novo mesmo ou usado?', contexto: '', esperado: 'PERGUNTOU_SE_E_NOVO' },
  { nome: 'citou a palavra remold -> continua remold: "esse pneu é remold ou novo?"', msg: 'esse pneu é remold ou novo?', contexto: '', esperado: 'PERGUNTOU_SE_E_REMOLD' },
  { nome: 'citou recauchutado -> remold: "é recauchutado?"', msg: 'é recauchutado?', contexto: '', esperado: 'PERGUNTOU_SE_E_REMOLD' },
  // Caso real 18/09: "Ta aberto agora?" recebeu o PINO da localizacao (foi lido como pedido de endereco)
  { nome: 'REAL: "Ta aberto agora?" -> horario (nao localizacao)', msg: 'Ta aberto agora?', contexto: 'CLIENTE: Eu quero\nROBO: Perfeito! Quando você consegue vir aqui na loja para fechar a compra?', esperado: 'PERGUNTOU_HORARIO' },
  { nome: 'horario: "que horas vocês fecham?"', msg: 'que horas vocês fecham?', contexto: '', esperado: 'PERGUNTOU_HORARIO' },
  { nome: 'horario: "qual o horário de funcionamento?"', msg: 'qual o horário de funcionamento?', contexto: '', esperado: 'PERGUNTOU_HORARIO' },
  { nome: 'horario: "abre sábado?"', msg: 'abre sábado?', contexto: '', esperado: 'PERGUNTOU_HORARIO' },
  // Caso real 19/09: "Foto" -> robo disse "segue foto" e nao mandou nada
  { nome: 'REAL: "Foto" depois do preco -> pedido de foto', msg: 'Foto', contexto: 'CLIENTE: 195 55 15\nROBO: Temos o pneu 195/55/15 da marca GP Premium por R$ 289,00 à vista.', esperado: 'PEDIU_FOTO' },
  { nome: 'foto: "manda foto do pneu"', msg: 'manda foto do pneu', contexto: '', esperado: 'PEDIU_FOTO' },
  // Nao confundir: endereco continua endereco
  { nome: 'endereco continua endereco: "qual o endereço de vocês?"', msg: 'qual o endereço de vocês?', contexto: '', esperado: 'PEDIU_LOCALIZACAO' },
  // Caso real 18/09 (conversa 3): cliente recusa remold depois da explicacao
  { nome: 'REAL: "Não amigo. Remold tô fora." depois da explicacao -> remold (a variante evita repetir)', msg: 'Não amigo. Remold tô fora.', contexto: 'CLIENTE: Não é remold certo?\nROBO: Vou ser sincero com você: sim, é remold — mas não é um remold comum...\nROBO: A gente dá garantia de 50 mil km ou seu dinheiro de volta.', esperado: 'PERGUNTOU_SE_E_REMOLD' },
];

// ===== RAJADAS (18/09): varias mensagens seguidas -> lista de assuntos, na ordem =====
const rajadas: { nome: string; msgs: string[]; contexto: string; esperado: string[]; exato?: boolean; conferir?: (itens: any[]) => string | null }[] = [
  // ACHADO NO E2E (18/09): assuntos JA respondidos que estao so no contexto NUNCA podem virar item
  // (senao o robo repetiria o preco, a marca e o PINO da localizacao a cada mensagem nova).
  {
    nome: 'contexto ja respondido (endereco+preco): mensagem nova "e em 6x?" -> so as parcelas',
    msgs: ['e em 6x fica quanto?'],
    contexto: 'CLIENTE: onde fica a loja?\nROBO: Segue a nossa localização:\nCLIENTE: quanto custa o 195/55/15?\nROBO: Temos o pneu 195/55/15 por R$ 289,00 à vista.',
    esperado: ['PERGUNTOU_PARCELAMENTO_ESPECIFICO'],
    exato: true,
  },
  {
    nome: 'contexto = a rajada inteira da Marcia ja respondida: "e em 6x?" -> so as parcelas (sem repetir preco/marca/endereco)',
    msgs: ['e em 6x fica quanto?'],
    contexto: 'CLIENTE: Quanto e 2 pneus do gol g 5. 175 .70.AR 14 Pirelli ou dulop\nCLIENTE: Vc tem esses ai\nCLIENTE: Moro em Alexânia não vou coloca aí não só vou busca ai\nCLIENTE: Essa loja aí fica em qual endereço\nROBO: Temos os 2 pneus 175/70/14 da marca GP Premium saindo por R$ 558,00 à vista. Aqui a gente trabalha só com o GP Premium. Segue a nossa localização:',
    esperado: ['PERGUNTOU_PARCELAMENTO_ESPECIFICO'],
    exato: true,
  },
  {
    nome: 'contexto ja respondido (remold + chines): "obrigado" -> agradecimento (e so isso)',
    msgs: ['obrigado'],
    contexto: 'CLIENTE: é remold?\nROBO: Vou ser sincero com você: sim, é remold...\nCLIENTE: e é chinês?\nROBO: Não, a gente não trabalha com pneu chinês...',
    esperado: ['AGRADECEU_OU_ENCERROU'],
    exato: true,
  },
  { nome: 'caso real Valentino: "Blz" + "Obrigado" -> UM agradecimento so', msgs: ['Blz', 'Obrigado'], contexto: 'ROBO: Temos o pneu 185/70/14 por R$ 289,00 à vista.', esperado: ['AGRADECEU_OU_ENCERROU'], exato: true },
  // A extratora as vezes devolve o agradecimento como item extra junto de um pedido; nao e problema — o motor
  // (decidirSequenciaPreco) descarta o agradecimento quando ha pedido de verdade (testado no teste do motor). Aqui so
  // exigimos que o pedido apareca e que nao haja mais de 1 item alem dele.
  { nome: 'pedido + "obrigado": o pedido aparece (agradecimento extra e descartado pelo motor)', msgs: ['quanto custa o 195/55/15?', 'obrigado'], contexto: '', esperado: ['DAR_MEDIDA'] },
  { nome: 'endereco + "ok, obrigado": o endereco aparece (agradecimento extra e descartado pelo motor)', msgs: ['onde fica a loja?', 'ok obrigado'], contexto: '', esperado: ['PEDIU_LOCALIZACAO'] },
  {
    nome: 'CASO REAL Marcia Lima (13:56, 18/09): preco+marca / "tem esses ai" / "moro em Alexânia" / endereco',
    msgs: ['Quanto e 2 pneus do gol g 5.   175 .70.AR 14   \nPirelli ou  dulop', 'Vc tem esses ai', 'Moro em Alexânia não vou coloca aí não só vou busca ai', 'Essa loja aí fica em qual endereço'],
    contexto: '',
    esperado: ['DAR_MEDIDA', 'PERGUNTOU_POR_OUTRA_MARCA', 'PEDIU_LOCALIZACAO'],
    conferir: (itens) => (itens[0].medidaExtraida === '175/70/14' && itens[0].quantidadeExtraida === 2 ? null : `1o item deveria ter medida 175/70/14 e quantidade 2: ${JSON.stringify(itens[0])}`),
  },
  { nome: 'saudacao + medida + parcelamento', msgs: ['boa tarde', 'quanto custa o 195/55/15?', 'e em 6x?'], contexto: '', esperado: ['DAR_MEDIDA', 'PERGUNTOU_PARCELAMENTO_ESPECIFICO'], conferir: (i) => (i[i.length - 1].parcelasExtraida === 6 ? null : 'faltou parcelas=6') },
  { nome: 'so cumprimentos -> 1 item de papo solto', msgs: ['oi', 'tudo bem?'], contexto: '', esperado: ['OUTRO_ASSUNTO'] },
  { nome: 'saudacao + preco sem medida', msgs: ['boa tarde', 'quanto custa?'], contexto: '', esperado: ['PERGUNTAR_PRECO_SEM_MEDIDA'] },
  { nome: 'remold + nota fiscal', msgs: ['é remold?', 'e vocês dão nota fiscal?'], contexto: '', esperado: ['PERGUNTOU_SE_E_REMOLD', 'PERGUNTOU_NOTA_FISCAL'] },
  { nome: 'balanceamento (4 pneus) + endereco', msgs: ['quanto é o balanceamento dos 4?', 'onde fica a loja'], contexto: '', esperado: ['PERGUNTOU_BALANCEAMENTO', 'PEDIU_LOCALIZACAO'], conferir: (i) => (i[0].quantidadeExtraida === 4 ? null : 'faltou quantidade 4') },
  { nome: 'desconto + parcelamento generico', msgs: ['tem desconto à vista?', 'parcela também?'], contexto: 'ROBO: o pneu sai por R$289,00 à vista', esperado: ['PERGUNTOU_DESCONTO_AVISTA', 'PERGUNTOU_PARCELAMENTO_GENERICO'] },
  { nome: 'mesmo assunto repetido nao duplica', msgs: ['onde fica a loja?', 'me manda a localização', 'qual o endereço?'], contexto: '', esperado: ['PEDIU_LOCALIZACAO'] },
  { nome: 'preco + pergunta tecnica no meio (o codigo nao responde a tecnica)', msgs: ['quanto custa o 195/55/15?', 'ele aguenta quantos kg?'], contexto: '', esperado: ['DAR_MEDIDA', 'PERGUNTA_TECNICA'] },
  {
    nome: 'legenda do anuncio junto com a medida nao vira pergunta de preco',
    msgs: ['📢 [Anúncio] Pneus a partir de R$ 239\n\nOlá! Posso ter mais informações sobre isso?', '175/65/14'],
    contexto: '',
    esperado: ['DAR_MEDIDA'],
  },
];

(async () => {
  let erros = 0;
  for (const c of casos) {
    const r = await extrairIntencaoPreco(c.msg, c.contexto, apiKey!);
    const ok = !!r
      && r.intencao === c.esperado
      && (!c.medidaEsperada || r.medidaExtraida === c.medidaEsperada)
      && (c.quantidadeEsperada === undefined || r.quantidadeExtraida === c.quantidadeEsperada)
      && (!c.escolhaEsperada || r.escolhaAlternativa === c.escolhaEsperada)
      && (c.parcelasEsperada === undefined || r.parcelasExtraida === c.parcelasEsperada)
      && (!c.formaEsperada || r.formaPagamentoExtraida === c.formaEsperada);
    if (!ok) erros++;
    console.log((ok ? 'OK   ' : 'ERRO ') + c.nome + ' -> ' + JSON.stringify(r));
  }
  // Rajadas: a lista esperada tem que aparecer NA ORDEM (pode haver no maximo 1 item a mais), sem repeticao.
  for (const c of rajadas) {
    const itens = await extrairIntencoesPreco(c.msgs, c.contexto, apiKey!);
    const tipos = (itens || []).map((i) => i.intencao);
    let k = 0;
    for (const t of tipos) if (t === c.esperado[k]) k++;
    const naOrdem = k === c.esperado.length;
    const semRepetir = new Set(tipos).size === tipos.length;
    const tamanhoOk = c.exato ? tipos.length === c.esperado.length : tipos.length <= c.esperado.length + 1;
    const extra = itens && naOrdem && c.conferir ? c.conferir(itens) : null;
    const ok = !!itens && naOrdem && semRepetir && tamanhoOk && !extra;
    if (!ok) erros++;
    console.log((ok ? 'OK   ' : 'ERRO ') + 'RAJADA ' + c.nome + ' -> ' + tipos.join(', ') + (extra ? ' | ' + extra : '') + (ok ? '' : ' | esperado: ' + c.esperado.join(', ')));
  }
  console.log(erros === 0 ? '\nTODOS OK' : '\n' + erros + ' ERRO(S)');
  process.exit(erros === 0 ? 0 : 1);
})();
