// Servico ISOLADO do robo de vendas (gera o TEXTO da resposta apenas).
// Roda num processo PROPRIO (pm2 "bot-service"), separado do whatsapp-crm de proposito:
// mudanca de prompt/logica do bot as vezes precisa de reload, e antes disso reiniciava
// o processo INTEIRO que segura as conexoes de WhatsApp de todo mundo, derrubando
// atendentes que nao tem nada a ver com o robo (achado e corrigido em 25-26/08/2026).
// Esse servico nao guarda nenhuma sessao de WhatsApp — reiniciar ele nunca desconecta ninguem.
import dotenv from 'dotenv';
import express from 'express';
import {
  montarBriefingComercialDeterministico,
} from '../data/tabelaPrecos';
import { precosForaDaTabela, valoresEmReais } from '../data/precoGuard';
import { prometeuTransferenciaFalsa, removerReperguntaPosPreco, removerRepeticaoRecente } from '../data/comportamentoGuard';
import { lerBotPneusConfig, montarPromptAtendimentoBot } from '../services/botPneusConfig';
import { decidirAcaoPreco, EstadoPrecoFluxo, DadosPrecoFluxo } from '../data/fluxoPreco';
import { extrairIntencaoPreco, podeSerSobrePreco } from '../data/fluxoPrecoExtrator';

dotenv.config();

const app = express();
app.use(express.json({ limit: '15mb' }));

interface RespostaBotBridge {
  partes: string[];
}

function extrairTextoOpenAI(payload: any): string {
  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text.trim();
  }
  const partes: string[] = [];
  for (const item of Array.isArray(payload?.output) ? payload.output : []) {
    for (const content of Array.isArray(item?.content) ? item.content : []) {
      const texto = typeof content?.text === 'string'
        ? content.text
        : typeof content?.output_text === 'string'
          ? content.output_text
          : '';
      if (texto.trim()) partes.push(texto.trim());
    }
  }
  return partes.join('\n').trim();
}

function parsearRespostaBot(payload: string): RespostaBotBridge {
  const texto = String(payload || '').trim();
  if (!texto) return { partes: [] };
  try {
    const parsed = JSON.parse(texto);
    if (Array.isArray(parsed?.partes)) {
      return {
        partes: parsed.partes
          .map((parte: any) => String(parte || '').trim())
          .filter(Boolean)
          .slice(0, 4),
      };
    }
  } catch {}
  return { partes: [texto.slice(0, 3500)] };
}

// Transcreve audio do cliente (WhatsApp manda em audio/ogg). A API de "responses" nao
// aceita ogg como input_file — devolvia 400 e o cliente que mandou audio ficava sem
// resposta nenhuma (achado 01/09). Aqui usamos a rota de transcricao, que aceita ogg,
// e injetamos o texto na conversa. Se a transcricao falhar, devolve null e o fluxo
// segue pedindo pro cliente repetir por escrito — nunca derruba a resposta inteira.
async function transcreverAudio(apiKey: string, base64: string, mime: string): Promise<string | null> {
  try {
    const buffer = Buffer.from(base64, 'base64');
    const extensao = String(mime).includes('mp4') || String(mime).includes('m4a') ? 'm4a'
      : String(mime).includes('mpeg') || String(mime).includes('mp3') ? 'mp3'
      : String(mime).includes('wav') ? 'wav'
      : 'ogg';
    const form = new FormData();
    form.append('file', new Blob([buffer], { type: mime || 'audio/ogg' }), `audio-cliente.${extensao}`);
    form.append('model', process.env.OPENAI_MODEL_AUDIO || 'whisper-1');
    form.append('language', 'pt');

    const r = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: AbortSignal.timeout(45_000),
    });
    if (!r.ok) {
      const detalhe = await r.text().catch(() => '');
      console.error('[BotService] Falha ao transcrever audio:', r.status, detalhe.slice(0, 200));
      return null;
    }
    const dados: any = await r.json().catch(() => null);
    const texto = String(dados?.text || '').trim();
    return texto || null;
  } catch (e: any) {
    console.error('[BotService] Erro ao transcrever audio:', e?.message || e);
    return null;
  }
}

async function gerarRespostaViaOpenAI(args: {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  imagem?: any;
  audio?: any;
  lojas: Array<{ nome: string | null; cidade: string | null; estado: string | null; whatsapp: string | null; telefone_fixo: string | null }>;
  briefingComercial: string;
}): Promise<RespostaBotBridge> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error('OPENAI_API_KEY nao configurada.');

  const model = process.env.OPENAI_MODEL || 'gpt-5-mini';
  const config = lerBotPneusConfig();
  const promptBase = montarPromptAtendimentoBot(config);
  const lojasTexto = args.lojas.length
    ? args.lojas
        .map((loja) => [
          loja.nome || 'Loja',
          loja.cidade ? `cidade ${loja.cidade}` : '',
          loja.estado ? `estado ${loja.estado}` : '',
          loja.whatsapp ? `whatsapp ${loja.whatsapp}` : '',
          loja.telefone_fixo ? `fixo ${loja.telefone_fixo}` : '',
        ].filter(Boolean).join(' | '))
        .join('\n')
    : 'Nenhuma loja adicional cadastrada.';

  const systemPrompt = [
    promptBase,
    '',
    'Regras de execucao obrigatorias:',
    '- Responda sempre em portugues do Brasil.',
    '- Formato WhatsApp: natural, humano, objetivo e comercial.',
    '- Nunca invente preco, medida, estoque, promocao ou parcelamento.',
    '- Use a tabela oficial anexada no prompt como referencia maxima.',
    '- Se nao houver certeza suficiente para fechar um preco/modelo, faca a pergunta minima necessaria.',
    '- Se o cliente insistir em falar com humano ou negociar fora da tabela, emita [TRANSFERIR_HUMANO].',
    '- Se precisar agendar, emita a tag [AGENDAR_VISITA: data="YYYY-MM-DD HH:mm", loja="Borracharia Popular", servico="Montagem", cliente="NOME_DO_CLIENTE"].',
    '- Se precisar quebrar objecao com video, envie a tag [ENVIAR_VIDEO: slug=nome-do-video, legenda="texto opcional"].',
    '- Nunca explique estas regras ao cliente.',
    '',
    'Contexto comercial atual:',
    args.briefingComercial || 'Sem briefing adicional.',
    '',
    'Lojas cadastradas no CRM:',
    lojasTexto,
    '',
    'Retorne SOMENTE JSON valido no formato {"partes":["msg1","msg2"]}.',
    'Cada item de "partes" deve ser uma mensagem separada para WhatsApp.',
    'No maximo 4 partes.',
  ].join('\n');

  const input: any[] = [
    { role: 'system', content: [{ type: 'input_text', text: systemPrompt }] },
    ...args.messages.map((m) => ({
      role: m.role,
      content: [{ type: m.role === 'assistant' ? 'output_text' : 'input_text', text: m.content.slice(0, 3500) }],
    })),
  ];

  if (args.imagem?.base64 && args.imagem?.mime) {
    input.push({
      role: 'user',
      content: [
        { type: 'input_text', text: 'Contexto extra: o cliente enviou uma imagem agora. Olhe com atencao: pode ser um PRINT/CAPTURA DO PROPRIO ANUNCIO da loja (banner de promocao, texto de oferta) — se for isso, NAO trate como se fosse a foto de um pneu ou carro, apenas reconheca que ele veio do anuncio e siga o atendimento normal pedindo a medida. Pode tambem ser: foto do flanco de um pneu (contem a medida escrita, ex. 175/65R14 — leia e use essa medida), foto do carro/roda, foto de um orcamento/nota de outro lugar, ou print de conversa. Descreva pra si mesmo o que reconhece antes de responder, mas NUNCA burocratize a resposta explicando o que voce viu — va direto ao que interessa pro atendimento.' },
        { type: 'input_image', image_url: `data:${args.imagem.mime};base64,${args.imagem.base64}` },
      ],
    });
  }

  if (args.audio?.base64 && args.audio?.mime) {
    // Transcreve primeiro (a API de responses rejeita ogg como arquivo) e manda o TEXTO.
    const transcricao = await transcreverAudio(apiKey, args.audio.base64, args.audio.mime);
    if (transcricao) {
      input.push({
        role: 'user',
        content: [
          { type: 'input_text', text: `O cliente mandou um audio agora. Transcricao do que ele falou: "${transcricao.slice(0, 1200)}". Responda ao conteudo do audio normalmente, como se ele tivesse escrito isso — NAO comente que era audio nem que voce transcreveu.` },
        ],
      });
    } else {
      input.push({
        role: 'user',
        content: [
          { type: 'input_text', text: 'O cliente mandou um audio agora, mas nao foi possivel entender o conteudo. Peça de forma natural e educada pra ele repetir por escrito.' },
        ],
      });
    }
  }

  const resposta = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      input,
      text: { format: { type: 'text' } },
    }),
    signal: AbortSignal.timeout(55_000),
  });

  const body = await resposta.json().catch(() => null);
  if (!resposta.ok) {
    throw new Error(`openai ${resposta.status}: ${body?.error?.message || 'resposta invalida'}`);
  }

  return parsearRespostaBot(extrairTextoOpenAI(body));
}

app.get('/health', (_req, res) => res.json({ ok: true }));

// O robo precisa saber QUE DIA E HOJE pra agendar remarketing ("dia 10", "semana que
// vem", "quando eu receber"). Sem isso ele chutava a data ou nem conseguia agendar.
// Tudo em horario de Brasilia, que e como a loja e o cliente pensam.
function contextoDeData(): string {
  const agora = new Date();
  const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', ...opts }).format(agora);
  const diaSemana = fmt({ weekday: 'long' });
  const dataLonga = fmt({ day: '2-digit', month: 'long', year: 'numeric' });
  const hora = fmt({ hour: '2-digit', minute: '2-digit' });
  // formato AAAA-MM-DD, que e o que a marca [LEMBRAR] espera
  const iso = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(agora);
  return `DATA_DE_HOJE: hoje e ${diaSemana}, ${dataLonga} (${iso}), e agora sao ${hora} no horario de Brasilia. Use isso pra calcular qualquer data que o cliente citar ("dia 10", "semana que vem", "amanha") e pra montar a data da marca [LEMBRAR] no formato AAAA-MM-DD HH:MM.`;
}

app.post('/gerar-resposta', async (req, res) => {
  try {
    const { messages, imagem, audio, lojas, ultimosTextosCliente } = req.body || {};
    const estadoPrecoAtual: EstadoPrecoFluxo = (req.body?.estadoPreco as EstadoPrecoFluxo) || 'sem_estado';
    let dadosPrecoAtuais: DadosPrecoFluxo = {};
    try { dadosPrecoAtuais = JSON.parse(req.body?.dadosPreco || '{}'); } catch { dadosPrecoAtuais = {}; }
    if (!Array.isArray(messages)) {
      return res.status(400).json({ error: 'messages (array) e obrigatorio.' });
    }

    const textosCliente = String(ultimosTextosCliente || '');
    // Gatilho = so a mensagem MAIS RECENTE do cliente (ultimo item role:'user' do proprio
    // array messages que ja recebemos), usada pra decidir SE e pedido de preco. Sem isso,
    // uma medida mencionada 2-3 mensagens atras "contaminava" qualquer pergunta seguinte
    // sem relacao — ex.: cliente perguntou "e remold?" e recebia preco de novo, porque a
    // janela de contexto (ultimosTextosCliente) ainda continha a medida (achado 26/08).
    const ultimaDoCliente = Array.isArray(messages)
      ? [...messages].reverse().find((m: any) => m?.role === 'user')
      : null;
    const gatilho = String(ultimaDoCliente?.content ?? textosCliente);

    // FLUXO DETERMINISTICO DE PRECO (Camadas 1+2, Tasks 3-4, ligado aqui no Task 5). So
    // roda se valer a pena chamar a IA extratora; se ela decidir que a mensagem e sobre
    // medida/preco, a resposta sai 100% do codigo (motor + tabela) — nunca chega no
    // caminho livre abaixo, que e onde a IA podia inventar numero ou escolher o modelo
    // errado (ver commits 688b1eef/46b91911 do dia 15/09, agora supersedidos por isto
    // pra qualquer caso que o fluxo abaixo decida tratar).
    if (podeSerSobrePreco(gatilho, estadoPrecoAtual)) {
      const apiKeyFluxo = process.env.OPENAI_API_KEY?.trim();
      if (apiKeyFluxo) {
        const contextoRecente = (Array.isArray(messages) ? messages : [])
          .slice(-6)
          .map((m: any) => `${m.role === 'user' ? 'CLIENTE' : 'ROBO'}: ${String(m.content || '').slice(0, 200)}`)
          .join('\n');
        const intencao = await extrairIntencaoPreco(gatilho, contextoRecente, apiKeyFluxo);
        if (intencao) {
          const decisao = decidirAcaoPreco(intencao, estadoPrecoAtual, dadosPrecoAtuais);
          if (decisao.acao.tipo !== 'NADA') {
            return res.json({
              partes: decisao.acao.partes,
              deterministico: true,
              novoEstadoPreco: decisao.novoEstado,
              novosDadosPreco: JSON.stringify(decisao.novosDados),
            });
          }
        }
      }
    }

    const briefingComercial = montarBriefingComercialDeterministico(textosCliente);

    // COERENCIA DE PRECO NA MESMA CONVERSA (achado 02/09, caso real do Elan): a
    // atendente ja tinha passado um preco e o robo, na sequencia, passou OUTRO valor
    // pra mesma coisa. Pro cliente isso parece enganacao e queima a loja. Aqui a gente
    // varre o que JA foi dito nesta conversa (pelo robo, pela atendente ou por
    // qualquer canal) e avisa o robo pra nao se contradizer.
    const jaFalados = valoresEmReais(
      (Array.isArray(messages) ? messages : [])
        .filter((m: any) => m && m.role === 'assistant')
        .map((m: any) => String(m.content || ''))
        .join(' ')
    );
    const avisoData = '\n' + contextoDeData();
    const avisoCoerencia = jaFalados.length
      ? '\nPRECOS_JA_PASSADOS_NESTA_CONVERSA: ' +
        jaFalados.map((v) => 'R$ ' + v.replace('.', ',')).join(', ') +
        '. Esses valores JA foram ditos ao cliente nesta conversa (por voce ou por um atendente). NAO passe valor diferente pra mesma coisa — o cliente vai achar que a loja mudou o preco. Se o valor que voce ia dizer nao bate com o que ja foi dito, MANTENHA o que ja foi passado. Se o cliente perguntar de novo, repita o MESMO valor. So mude se o pedido dele mudou (quantidade, medida ou forma de pagamento diferente) — e nesse caso deixe explicito o que mudou.'
      : '';
    const resposta = await gerarRespostaViaOpenAI({
      messages,
      imagem,
      audio,
      lojas: Array.isArray(lojas) ? lojas : [],
      briefingComercial: briefingComercial + avisoData + avisoCoerencia,
    });


    // TRAVA DE PRECO: a IA escreveu o texto com as proprias palavras. Antes de mandar
    // pro cliente, confere se todo valor em R$ citado existe no briefing (que vem da
    // tabela). Se ela inventou ou errou uma conta, tenta UMA vez avisando do erro;
    // se insistir, responde sem preco em vez de mandar valor errado no WhatsApp.
    let partesFinais = resposta.partes;
    const invalidos = precosForaDaTabela(partesFinais, textosCliente);
    if (invalidos.length) {
      console.error(
        '[BotService][TRAVA DE PRECO] A IA citou valor(es) que nao estao na tabela:',
        invalidos.join(', '),
        '| resposta recusada, tentando de novo.'
      );
      const segunda = await gerarRespostaViaOpenAI({
        messages,
        imagem,
        audio,
        lojas: Array.isArray(lojas) ? lojas : [],
        briefingComercial:
          briefingComercial +
          '\nATENCAO: na tentativa anterior voce escreveu um valor que NAO existe na tabela (' +
          invalidos.join(', ') +
          '). NUNCA invente nem calcule preco de cabeca. Use SOMENTE os valores exatos que aparecem acima. Se nao houver preco aqui pra situacao, responda SEM citar valor nenhum e peca a medida.',
      });
      const aindaInvalidos = precosForaDaTabela(segunda.partes, textosCliente);
      if (aindaInvalidos.length) {
        console.error(
          '[BotService][TRAVA DE PRECO] Segunda tentativa tambem errou:',
          aindaInvalidos.join(', '),
          '| respondendo sem preco.'
        );
        partesFinais = ['Deixa eu confirmar uma coisa com você — pode repetir, por favor?'];
      } else {
        partesFinais = segunda.partes;
      }
    }


    // TRAVA DE COMPORTAMENTO: erros graves que uma regra em texto no prompt nao
    // consegue garantir 100% (o prompt ja passa de 30 mil caracteres). Confere padroes
    // conhecidos de promessa vazia (ex.: "vou te transferir para o Fulano") — achado
    // real 03/09. Mesma estrategia da trava de preco: tenta de novo avisando do erro;
    // se insistir, cai numa resposta segura.
    if (prometeuTransferenciaFalsa(partesFinais)) {
      console.error('[BotService][TRAVA DE COMPORTAMENTO] A IA prometeu uma transferencia que nao pode cumprir — tentando de novo.');
      const segundaTentativa = await gerarRespostaViaOpenAI({
        messages,
        imagem,
        audio,
        lojas: Array.isArray(lojas) ? lojas : [],
        briefingComercial:
          briefingComercial +
          '\nATENCAO: na tentativa anterior voce prometeu transferir a conversa pra uma pessoa especifica — voce NAO TEM esse mecanismo e essa promessa e vazia. Reconheca o pedido sem prometer transferencia (\'anotado, vou avisar por aqui\') e continue ajudando com o que voce sabe.',
      });
      if (!prometeuTransferenciaFalsa(segundaTentativa.partes)) {
        partesFinais = segundaTentativa.partes;
      } else {
        console.error('[BotService][TRAVA DE COMPORTAMENTO] Segunda tentativa tambem prometeu transferencia — usando resposta segura.');
        partesFinais = ['Anotado — vou avisar aqui pra alguem da loja te dar atenção. Enquanto isso, posso te ajudar com medida, preço ou endereço, se quiser.'];
      }
    }


    // TRAVA DE COMPORTAMENTO 2 (04/09): corta cirurgicamente qualquer repescada de
    // modelo/ano/marca preferida/servico adicional depois do preco — achado em 4
    // conversas reais no mesmo dia mesmo com a regra explicita no prompt.
    partesFinais = removerReperguntaPosPreco(partesFinais);

    // TRAVA DE COMPORTAMENTO 3 (09/09): nao repetir o que ja foi dito nesta conversa.
    // Se sobrar nada, tenta de novo avisando; se ainda assim repetir, manda o que veio
    // (ficar em silencio com o cliente esperando seria pior).
    const jaDitas = (Array.isArray(messages) ? messages : [])
      .filter((m: any) => m && m.role === 'assistant')
      .map((m: any) => String(m.content || ''));
    const semRepeticao = removerRepeticaoRecente(partesFinais, jaDitas);
    if (semRepeticao.length) {
      partesFinais = semRepeticao;
    } else {
      console.error('[BotService][TRAVA DE REPETICAO] A resposta era so repeticao do que ja foi dito — tentando de novo.');
      const outra = await gerarRespostaViaOpenAI({
        messages,
        imagem,
        audio,
        lojas: Array.isArray(lojas) ? lojas : [],
        briefingComercial:
          briefingComercial +
          '\nATENCAO: voce JA disse exatamente isso nesta conversa. Nao repita frase, pergunta nem lista que ja mandou. Avance: se ja tem a medida e o preco, chame pro fechamento (quando ele pode vir na loja). Se falta um dado essencial, faca UMA pergunta curta e diferente das anteriores.',
      });
      const limpa = removerRepeticaoRecente(outra.partes, jaDitas);
      partesFinais = limpa.length ? limpa : outra.partes;
    }

    res.json({
      partes: partesFinais,
      deterministico: false,
      novoEstadoPreco: estadoPrecoAtual,
      novosDadosPreco: JSON.stringify(dadosPrecoAtuais),
    });
  } catch (e: any) {
    console.error('[BotService] Erro em /gerar-resposta:', e?.message || e);
    res.status(500).json({ error: e?.message || 'Erro interno no bot-service.' });
  }
});

const PORT = Number(process.env.BOT_SERVICE_PORT || 3010);
app.listen(PORT, '127.0.0.1', () => {
  console.log(`[BotService] rodando isolado na porta ${PORT} (nao afeta conexoes de WhatsApp)`);
});
