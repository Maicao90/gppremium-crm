import { makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers, delay, WASocket, proto, downloadMediaMessage, fetchLatestWaWebVersion } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import qrcodeTerminal from 'qrcode-terminal';
import qrcode from 'qrcode';
import path from 'path';
import fs from 'fs';
import { cloudManager } from '../cloudManager';
import { PrismaClient } from '@prisma/client';

const prisma = new Proxy({} as PrismaClient, {
  get(target, prop) {
    return cloudManager.getPrisma()[prop as keyof PrismaClient];
  }
});

function getIo() {
  return require('../server').io;
}
import { agendarRespostaBotIA, pausarConversaBotIA } from './botAtendimentoService';
import { configBotDaLoja, caminhoFotoFachada } from '../services/botLojas';

// Pasta onde as mídias recebidas são salvas (servida estaticamente em /midias)
const MIDIAS_DIR = path.join(__dirname, '../../public/midias');
try { fs.mkdirSync(MIDIAS_DIR, { recursive: true }); } catch (e) {}
const EXT_POR_TIPO: Record<string, string> = { imagem: 'jpg', video: 'mp4', audio: 'ogg', documento: 'bin', figurinha: 'webp' };

// Baixa a mídia de uma mensagem e salva em /public/midias, retornando a URL pública.
async function baixarMidia(sock: any, msg: any, tipo: string, waId: string): Promise<string | null> {
  try {
    const buffer = await downloadMediaMessage(msg, 'buffer', {}, { logger: console as any, reuploadRequest: sock.updateMediaMessage });
    if (!buffer) return null;
    const ext = EXT_POR_TIPO[tipo] || 'bin';
    const nome = `${(waId || 'm').replace(/[^a-zA-Z0-9]/g, '')}_${Math.floor(Math.random() * 1000000)}.${ext}`;
    fs.writeFileSync(path.join(MIDIAS_DIR, nome), buffer as Buffer);
    return `/midias/${nome}`;
  } catch (e) {
    console.error('[Inbox] Erro ao baixar mídia:', (e as any)?.message);
    return null;
  }
}

// Detecta se a mensagem veio de um ANÚNCIO (Click-to-WhatsApp). Retorna o externalAdReply.
function getAnuncio(message: any): any {
  if (!message) return null;
  for (const key of Object.keys(message)) {
    const ci = message[key] && message[key].contextInfo;
    if (ci && ci.externalAdReply) return ci.externalAdReply;
  }
  return null;
}

// Salva a miniatura (foto) do anúncio e retorna a URL pública.
async function salvarFotoAnuncio(adReply: any): Promise<string | null> {
  try {
    let buffer: Buffer | null = null;
    if (adReply.thumbnail && adReply.thumbnail.length) {
      buffer = Buffer.from(adReply.thumbnail);
    } else if (adReply.thumbnailUrl) {
      const resp = await fetch(adReply.thumbnailUrl);
      if (resp.ok) buffer = Buffer.from(await resp.arrayBuffer());
    }
    if (!buffer) return null;
    const nome = `ad_${Math.floor(Math.random() * 1000000000)}.jpg`;
    fs.writeFileSync(path.join(MIDIAS_DIR, nome), buffer);
    return `/midias/${nome}`;
  } catch (e) {
    console.error('[Inbox] Erro ao salvar foto do anúncio:', (e as any)?.message);
    return null;
  }
}

// Versão ATUAL do WhatsApp Web (com cache de 6h). O rc13 do Baileys embute uma versão
// velha que faz o TELEFONE recusar o vínculo de aparelho novo (QR e código) — issue
// #2679. Buscamos a atual; se a busca falhar, devolve a última em cache (ou undefined,
// que faz o Baileys usar a embutida — pior, mas não derruba nada).
let waWebVersaoCache: { versao: any; em: number } | null = null;
// Uma busca só por vez: no boot as ~10 lojas pedem a versão juntas (revisão 24/09).
let buscaVersaoEmAndamento: Promise<any | undefined> | null = null;
const LIMITE_BUSCA_VERSAO_MS = 8000;
// Depois de uma falha, não tenta de novo por 2 min: senão cada reconexão de cada loja esperaria os 8s de novo.
let waWebVersaoFalhaEm = 0;
const ESPERA_APOS_FALHA_VERSAO_MS = 2 * 60 * 1000;
function versaoValidaDoResultado(r: any): any | null {
  // Na falha o rc13 NÃO lança erro: devolve a versão EMBUTIDA (velha) com `error` — ela não pode ir pro cache
  // por 6h (era o que acontecia), senão pareamento novo volta a ser recusado pelo celular.
  const v: any = r && !r.error ? r.version : null;
  return Array.isArray(v) && v.length === 3 ? v : null;
}
// `paraPareamento`: socket de QR/código ignora a espera pós-falha — com a versão embutida o celular RECUSA o
// pareamento, então vale sempre tentar de novo (ainda com o prazo de 8s e uma busca só por vez).
async function obterVersaoWaWeb(paraPareamento = false): Promise<any | undefined> {
  if (waWebVersaoCache && Date.now() - waWebVersaoCache.em < 6 * 60 * 60 * 1000) {
    return waWebVersaoCache.versao;
  }
  if (!paraPareamento && Date.now() - waWebVersaoFalhaEm < ESPERA_APOS_FALHA_VERSAO_MS) {
    return waWebVersaoCache ? waWebVersaoCache.versao : undefined;
  }
  if (buscaVersaoEmAndamento) return buscaVersaoEmAndamento;
  buscaVersaoEmAndamento = (async () => {
    try {
      // Com prazo: o fetch do Baileys não tem timeout e, se o web.whatsapp.com não responder, a conexão (e a trava
      // conectandoAgora) ficava presa por minutos. Se a resposta chegar DEPOIS do prazo, ainda entra no cache.
      const busca: Promise<any> = fetchLatestWaWebVersion({}).then((r: any) => {
        const v = versaoValidaDoResultado(r);
        if (v) {
          waWebVersaoCache = { versao: v, em: Date.now() };
          waWebVersaoFalhaEm = 0;
        }
        return r;
      }).catch(() => null);
      const r: any = await Promise.race([
        busca,
        new Promise((resolve) => { const t = setTimeout(() => resolve(null), LIMITE_BUSCA_VERSAO_MS); (t as any).unref?.(); }),
      ]);
      const v = versaoValidaDoResultado(r);
      if (v) {
        console.log(`[Baileys] Versão do WA Web em uso: ${v.join('.')}`);
        return v;
      }
      waWebVersaoFalhaEm = Date.now();
      console.error(`[Baileys] Versão atual do WA Web indisponível (${r === null ? `passou de ${LIMITE_BUSCA_VERSAO_MS / 1000}s ou falhou` : String(r?.error?.message || r?.error || 'resposta inválida')}) — usando a última conhecida.`);
    } catch (e: any) {
      waWebVersaoFalhaEm = Date.now();
      console.error('[Baileys] Falha ao buscar versão atual do WA Web (usando a última conhecida):', e?.message);
    }
    return waWebVersaoCache ? waWebVersaoCache.versao : undefined;
  })();
  try {
    return await buscaVersaoEmAndamento;
  } finally {
    buscaVersaoEmAndamento = null;
  }
}

// Resolve o número de telefone REAL do contato. O WhatsApp agora usa @lid (um ID interno
// que esconde o número), então buscamos o PN: 1) o alternativo na própria mensagem;
// 2) o mapeamento LID->PN que o Baileys mantém. Retorna só os dígitos (sem @dominio).
async function resolverNumeroReal(sock: any, msg: any, remoteJid: string): Promise<string> {
  if (!remoteJid || !remoteJid.includes('@lid')) return (remoteJid || '').split('@')[0] || '';
  const alt = msg?.key?.remoteJidAlt || msg?.key?.participantPn || msg?.key?.participantAlt;
  if (alt && typeof alt === 'string' && alt.includes('@')) return alt.split('@')[0] || '';
  try {
    const lm = sock?.signalRepository?.lidMapping;
    if (lm && typeof lm.getPNForLID === 'function') {
      const pn = await lm.getPNForLID(remoteJid);
      if (pn && typeof pn === 'string' && pn.includes('@')) return pn.split('@')[0] || '';
    }
  } catch (e) {}
  return '';
}

// Preenche o número real dos chats @lid já existentes no banco (roda quando a sessão conecta).
async function backfillNumerosReais(usuarioId: string, sock: any) {
  try {
    const chats: any[] = await prisma.$queryRaw`
      SELECT DISTINCT "chatJid" FROM "Mensagem"
      WHERE "usuarioId" = ${usuarioId} AND "chatJid" LIKE '%@lid'
      AND ("numeroReal" IS NULL OR "numeroReal" = '')
    `;
    let resolvidos = 0;
    for (const ch of chats) {
      const num = await resolverNumeroRealPorJid(sock, ch.chatJid);
      if (num) {
        await prisma.mensagem.updateMany({ where: { usuarioId, chatJid: ch.chatJid }, data: { numeroReal: num } });
        resolvidos++;
      }
    }
    if (resolvidos > 0) console.log(`[Inbox] Backfill: ${resolvidos} contato(s) @lid resolvidos para número real (usuário ${usuarioId}).`);
  } catch (e) { console.error('[Inbox] Erro no backfill de números:', (e as any)?.message); }
}

// Resolve o número real de um JID @lid avulso (sem mensagem em mãos), usando só o mapeamento.
async function resolverNumeroRealPorJid(sock: any, jid: string): Promise<string> {
  if (!jid || !jid.includes('@lid')) return (jid || '').split('@')[0] || '';
  try {
    const lm = sock?.signalRepository?.lidMapping;
    if (lm && typeof lm.getPNForLID === 'function') {
      const pn = await lm.getPNForLID(jid);
      if (pn && typeof pn === 'string' && pn.includes('@')) return pn.split('@')[0] || '';
    }
  } catch (e) {}
  return '';
}

// Mapa para guardar as sessões ativas por usuário
export const sessions = new Map<string, WASocket>();

// Conexões EM ANDAMENTO: entre o "ainda não tem sessão" e o sessions.set do connectToWhatsApp há vários
// await (lê as credenciais do disco, busca a versão do WhatsApp Web). No boot, 5 caminhos chamam a conexão
// quase juntos (boot do server, Vigia 1s depois, extensão reconectando, agendaWorker, retry) — sem esta trava
// dois passavam pela checagem e abriam DOIS sockets com a mesma credencial. O WhatsApp tratou como conflito e
// REMOVEU o aparelho do Daniel Amaral (23/09 16:55, "device_removed", logo depois de um reinício por memória).
const conectandoAgora = new Set<string>();

// Número (telefone) da própria sessão — ex.: "556137742115" de "556137742115:26@s.whatsapp.net".
function numeroDaSessao(sock: WASocket | undefined): string {
  const bruto = String(sock?.user?.id || '');
  const semDevice = bruto.split(':')[0] ?? bruto;
  return (semDevice.split('@')[0] ?? semDevice) || '';
}

// Impede que numeros da propria equipe sejam contabilizados como clientes.
export function numerosDasSessoesAtivas(): string[] {
  const numeros = new Set<string>();
  sessions.forEach((sock) => {
    const numero = numeroDaSessao(sock).replace(/\D/g, '');
    if (numero) numeros.add(numero);
  });
  return [...numeros];
}

// Usuários com sessão CONECTADA no MESMO telefone (inclui o próprio). Existe porque
// 2 atendentes podem parear cada um a própria sessão no MESMO chip (ex.: Ana e Marina)
// — toda mensagem chega em dobro e as travas por usuarioId não se enxergavam.
function usuariosComSessaoNoMesmoNumero(usuarioId: string, meuNumero: string): string[] {
  const ids = new Set([usuarioId]);
  if (meuNumero) {
    sessions.forEach((s, uid) => { if (numeroDaSessao(s) === meuNumero) ids.add(uid); });
  }
  return [...ids];
}

interface LatestQrPayload {
  qrCode: string;
  generatedAt: number;
  expiresAt: number;
}

// Guarda o QR Code mais recente (base64) de cada usuário enquanto ele ainda não escaneou.
// Serve para REENVIAR o QR a uma extensão que conecta DEPOIS do QR ter sido gerado
// (ex.: QR gerado no boot da VPS, antes do navegador da pessoa estar aberto).
// O QR do WhatsApp expira rápido; por isso carregamos também timestamps para a tela
// nunca reapresentar um QR morto como se ainda fosse válido.
export const latestQR = new Map<string, LatestQrPayload>();

// Conjunto de usuários com a conexão realmente ABERTA (autenticada e pronta).
export const connectedUsers = new Set<string>();

// Nomes de contatos (jid -> nome), preenchido pelos eventos de contatos do WhatsApp.
// Usado para mostrar o NOME do contato na Caixa de Entrada em vez do número/ID interno.
export const contatosNomes = new Map<string, string>();
function registrarNomeContato(jid?: string | null, nome?: string | null) {
  if (jid && nome && String(nome).trim()) contatosNomes.set(jid, String(nome).trim());
}

// PERSISTE na tabela Contato os nomes que o WhatsApp/Baileys entrega (agenda
// sincronizada). Antes esses nomes só iam pro mapa em memória (Caixa de Entrada) e
// a busca do agendamento não os via — por isso "digitar o nome não puxava o número".
// Só grava nome de verdade (não o próprio número, não grupo/@lid) e faz "upgrade" de
// registros que estavam salvos só com o número, sem sobrescrever nomes já bons.
async function persistirContatosBaileys(usuarioId: string, lista: any[]) {
  try {
    if (!usuarioId || !Array.isArray(lista) || lista.length === 0) return;
    const mapa = new Map<string, string>();
    for (const c of lista) {
      const jid = String(c?.id || '');
      if (!jid || jid.includes('@g.us') || jid.includes('@lid') || jid.includes('-')) continue;
      const numero = (jid.split('@')[0] || '').replace(/\D/g, '');
      if (!numero || numero.length < 10 || numero.length > 15) continue;
      const nome = String(c?.name || c?.notify || c?.verifiedName || '').trim();
      if (!nome || nome === numero) continue;
      mapa.set(numero, nome);
    }
    if (mapa.size === 0) return;

    const numeros = [...mapa.keys()];
    const existentes = await prisma.contato.findMany({
      where: { usuarioId, numero: { in: numeros } },
      select: { numero: true, nome: true },
    });
    const nomeAtual = new Map<string, string>();
    for (const e of existentes) nomeAtual.set(e.numero, e.nome);

    const novos: { usuarioId: string; numero: string; nome: string }[] = [];
    const atualizar: { numero: string; nome: string }[] = [];
    for (const [numero, nome] of mapa) {
      const atual = nomeAtual.get(numero);
      if (atual === undefined) novos.push({ usuarioId, numero, nome });
      else if (atual !== nome && (atual === '' || atual === numero)) atualizar.push({ numero, nome });
    }

    for (let i = 0; i < novos.length; i += 500) {
      await prisma.contato.createMany({ data: novos.slice(i, i + 500), skipDuplicates: true });
    }
    for (let i = 0; i < atualizar.length; i += 100) {
      await prisma.$transaction(atualizar.slice(i, i + 100).map((c) =>
        prisma.contato.update({ where: { usuarioId_numero: { usuarioId, numero: c.numero } }, data: { nome: c.nome } })
      ));
    }
    if (novos.length || atualizar.length) {
      console.log(`[contatos-baileys] user ${usuarioId}: +${novos.length} novos, ${atualizar.length} nomes preenchidos`);
    }
  } catch (e) {
    console.error('[contatos-baileys] erro ao persistir:', (e as any)?.message);
  }
}

// IDs de mensagens já salvas pelo envio da Caixa de Entrada (evita duplicar se o
// evento messages.upsert também disparar para a mesma mensagem que nós enviamos).
const waIdsRecentes = new Set<string>();
const waIdsBotIA = new Set<string>();
const chatsBotEnviando = new Set<string>();
const filasEnvioBotIA = new Map<string, Promise<unknown>>();
interface MidiaBotIA {
  // 'audio' = mensagem de voz (PTT, ogg/opus) do fluxo do robo; `legenda` vira o texto/transcricao salvo na mensagem.
  tipo: 'video' | 'audio';
  caminho?: string;
  url?: string;
  legenda?: string;
  nome?: string;
}

function lembrarWaId(id?: string | null) {
  if (!id) return;
  waIdsRecentes.add(id);
  if (waIdsRecentes.size > 3000) {
    const maisAntigo = waIdsRecentes.values().next().value;
    if (maisAntigo) waIdsRecentes.delete(maisAntigo);
  }
}

function lembrarWaIdBotIA(id?: string | null) {
  if (!id) return;
  waIdsBotIA.add(id);
  if (waIdsBotIA.size > 3000) {
    const maisAntigo = waIdsBotIA.values().next().value;
    if (maisAntigo) waIdsBotIA.delete(maisAntigo);
  }
}

async function carregarMidiaBotIA(midia: MidiaBotIA): Promise<{ buffer: Buffer; midiaUrl: string | null; nomeArquivo: string }> {
  if (midia.url) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const resp = await fetch(midia.url, { signal: controller.signal });
      if (!resp.ok) throw new Error(`download ${resp.status}`);
      const buffer = Buffer.from(await resp.arrayBuffer());
      const nomeArquivo = (() => {
        try {
          return new URL(midia.url!).pathname.split('/').pop() || 'video.mp4';
        } catch {
          return 'video.mp4';
        }
      })();
      return { buffer, midiaUrl: null, nomeArquivo };
    } finally {
      clearTimeout(timeout);
    }
  }

  const caminhoOriginal = String(midia.caminho || '').trim();
  if (!caminhoOriginal) throw new Error('video sem caminho/url');

  const publicRoot = path.resolve(__dirname, '../../public');
  const absoluto = path.isAbsolute(caminhoOriginal)
    ? path.resolve(caminhoOriginal)
    : path.resolve(publicRoot, caminhoOriginal.replace(/^[/\\]+/, ''));
  if (!fs.existsSync(absoluto)) throw new Error(`arquivo nao encontrado: ${caminhoOriginal}`);

  const buffer = fs.readFileSync(absoluto);
  const midiaUrl = absoluto.startsWith(publicRoot + path.sep)
    ? '/' + path.relative(publicRoot, absoluto).replace(/\\/g, '/')
    : null;
  return { buffer, midiaUrl, nomeArquivo: path.basename(absoluto) || 'video.mp4' };
}

// Achado 26/08: durante um blip de reconexao (ex.: erro 440 "conflict" oscilando),
// sessions.get(usuarioId) fica momentaneamente undefined por alguns segundos. Antes,
// enviarParteBotIA/enviarMidiaBotIA desistiam na hora, em silencio (sem log nenhum),
// e a resposta do robo era perdida pra sempre (o debounce so dispara 1x por rajada de
// mensagens do cliente; sem nova mensagem, nao ha nova tentativa). Agora esperamos o
// socket voltar por ate ~10s (janela observada dos blips reais) antes de desistir.
// Achado 01/09: a fila de envio do robo (filasEnvioBotIA) encadeia TODOS os envios de
// uma conta. Se um sock.sendMessage ficar pendurado (socket morto durante um erro 440,
// por exemplo), a promise nunca resolve e TUDO que vier depois fica preso atras dela —
// o robo para de responder a conta inteira, sem erro nenhum no log. Foi exatamente o
// que aconteceu: 67 minutos sem uma unica resposta, em todas as conversas.
// Este limite garante que um envio travado falha e LIBERA a fila.
function comLimiteDeTempo<T>(promessa: Promise<T>, ms: number, oQue: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout de ${ms}ms em ${oQue}`)), ms);
    promessa.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

// Ultimo 440 (conflict) por sessao. Numa tempestade de conflitos (outra instancia disputando
// a sessao), a conexao vive poucos segundos — entao o envio pula a simulacao de "digitando",
// que so alonga o tempo em que a conexao precisa ficar viva (08/09).
const ultimoConflitoEm = new Map<string, number>();
function emTempestadeDeConflito(usuarioId: string): boolean {
  return Date.now() - (ultimoConflitoEm.get(usuarioId) || 0) < 60_000;
}

async function aguardarSocketBotIA(usuarioId: string, tentativas = 4, intervaloMs = 2500): Promise<any> {
  for (let i = 0; i < tentativas; i++) {
    const sock = sessions.get(usuarioId);
    if (sock) return sock;
    if (i < tentativas - 1) await delay(intervaloMs);
  }
  return null;
}

// Envio com retentativa (08/09): durante um "conflict storm" (outra instancia disputando a
// mesma sessao — milhares de 440 por dia na Borracharia), a conexao cai e reabre a cada
// poucos segundos. Antes, um "Connection Closed" no meio do envio perdia a resposta do robo
// pra sempre (caso real: Augusto, 08/09). Agora tenta de novo pegando a conexao NOVA, ate 3x.
async function enviarTextoComRetentativa(sockInicial: any, usuarioId: string, chatJid: string, texto: string, tempoDigitacaoMs: number): Promise<any> {
  let ultimoErro: any = null;
  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    const sock = tentativa === 1 ? sockInicial : await aguardarSocketBotIA(usuarioId, 6, 2500);
    if (!sock) { ultimoErro = new Error('sem conexao WhatsApp ativa'); continue; }
    try {
      await comLimiteDeTempo(sock.sendPresenceUpdate('composing', chatJid), 10_000, 'presence').catch(() => {});
      const delayParte = emTempestadeDeConflito(usuarioId) ? Math.min(tempoDigitacaoMs, 800) : (tentativa === 1 ? tempoDigitacaoMs : Math.min(tempoDigitacaoMs, 1500));
      await delay(delayParte);
      const enviada = await comLimiteDeTempo<any>(sock.sendMessage(chatJid, { text: texto }), 45_000, 'sendMessage(texto)');
      await comLimiteDeTempo(sock.sendPresenceUpdate('unavailable'), 10_000, 'presence').catch(() => {});
      return enviada;
    } catch (e) {
      ultimoErro = e;
      console.error(`[Bot IA] Falha ao enviar parte (tentativa ${tentativa}/3): ${(e as any)?.message || e}`);
      if (tentativa < 3) await delay(4000);
    }
  }
  throw ultimoErro || new Error('falha ao enviar');
}

async function enviarParteBotIA(usuarioId: string, chatJid: string, numeroReal: string, texto: string, tempoDigitacaoMs: number): Promise<boolean> {
  const anterior = filasEnvioBotIA.get(usuarioId) || Promise.resolve();
  const atual = anterior.catch(() => {}).then(async () => {
    const sock = await aguardarSocketBotIA(usuarioId);
    if (!sock) {
      console.error(`[Bot IA] Sem conexao WhatsApp ativa para ${usuarioId} (chat ${chatJid}) apos varias tentativas — resposta NAO enviada.`);
      return false;
    }
    const key = `${usuarioId}:${chatJid}`;
    chatsBotEnviando.add(key);
    try {
      const enviada = await enviarTextoComRetentativa(sock, usuarioId, chatJid, texto, tempoDigitacaoMs);
      const waId = enviada?.key?.id || null;
      lembrarWaId(waId);
      lembrarWaIdBotIA(waId);
      const salva = await prisma.mensagem.create({
        data: {
          usuarioId,
          chatJid,
          chatNome: '',
          fromMe: true,
          texto,
          tipo: 'texto',
          waId,
          numeroReal: numeroReal || null,
          // Marca que foi o ROBO que mandou (nao um atendente humano) — sentinela 'bot' em vez
          // de um usuarioId real. O painel usa isso pra rotular "Robo" em vez de "Atendente"
          // (achado 26/08 — painel mostrava toda mensagem automatica como atendente).
          enviadoPorId: 'bot',
        },
      });
      getIo().to(usuarioId).emit('NOVA_MENSAGEM', salva);
      return true;
    } catch (e) {
      console.error('[Bot IA] Falha ao enviar parte:', (e as any)?.message || e);
      return false;
    } finally {
      setTimeout(() => chatsBotEnviando.delete(key), 5000).unref?.();
    }
  });
  filasEnvioBotIA.set(usuarioId, atual);
  atual.finally(() => {
    if (filasEnvioBotIA.get(usuarioId) === atual) filasEnvioBotIA.delete(usuarioId);
  });
  return atual as Promise<boolean>;
}

// Envia a localizacao da loja como PINO NATIVO do WhatsApp (nao um link de texto) —
// pedido do dono em 05/09, comparando com o que ia antes (so um link do Google Maps
// digitado manualmente). Mesmo padrao de fila/presenca das outras funcoes do robo.
// Foto da fachada da loja (05/09) — arquivo fixo, opcional. Se nao existir, o envio da
// localizacao segue normal sem a foto (nao trava nada esperando um arquivo que falta).
// Pra ativar: colocar o arquivo em data/fachada-loja.jpg no servidor.
const CAMINHO_FOTO_FACHADA = path.join(__dirname, '../../data/fachada-loja.jpg');

// Disparo MANUAL da localizacao (05/09) — usado pelo painel/admin quando alguem pede
// pra mandar a localizacao pra um contato especifico, fora do fluxo automatico da IA.
// Le as coordenadas do mesmo config do bot.
export async function enviarLocalizacaoManual(usuarioId: string, chatJid: string): Promise<boolean> {
  try {
    // Loja do atendente (bot-lojas.json), senao o config geral do robo.
    const cfg = await configBotDaLoja(usuarioId);
    const lat = Number(cfg.LOCALIZACAO_LAT);
    const lng = Number(cfg.LOCALIZACAO_LNG);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      console.error('[Localizacao] LOCALIZACAO_LAT/LNG nao configurados.');
      return false;
    }
    const numeroReal = chatJid.split('@')[0] || '';
    return enviarLocalizacaoBotIA(usuarioId, chatJid, numeroReal, lat, lng, cfg.NOME_LOJA, cfg.LOCALIZACAO, caminhoFotoFachada(cfg));
  } catch (e: any) {
    console.error('[Localizacao] Falha no disparo manual:', e?.message || e);
    return false;
  }
}

// Etiqueta do WhatsApp Business no chat (21/10): o robo marca a conversa pra atendente assumir (ex.: cliente
// pediu pneu que nao esta na tabela). Cria a etiqueta da loja se ainda nao existir e aplica no chat. So funciona
// em conta WhatsApp Business; falha aqui nunca derruba o atendimento.
export async function etiquetarChatBotIA(usuarioId: string, chatJid: string, etiqueta: { id: string; nome: string; cor?: number }): Promise<boolean> {
  try {
    const sock: any = await aguardarSocketBotIA(usuarioId);
    if (!sock || typeof sock.addChatLabel !== 'function') return false;
    await comLimiteDeTempo(sock.addLabel(chatJid, { id: String(etiqueta.id), name: etiqueta.nome, color: Number.isFinite(etiqueta.cor) ? etiqueta.cor : 0, deleted: false }), 20_000, 'addLabel').catch((e: any) => console.error('[Bot IA] criar etiqueta:', e?.message || e));
    await comLimiteDeTempo(sock.addChatLabel(chatJid, String(etiqueta.id)), 20_000, 'addChatLabel');
    console.log(`[Bot IA] ${chatJid}: etiqueta "${etiqueta.nome}" aplicada.`);
    return true;
  } catch (e: any) {
    console.error('[Bot IA] Falha ao etiquetar chat:', e?.message || e);
    return false;
  }
}

async function enviarLocalizacaoBotIA(usuarioId: string, chatJid: string, numeroReal: string, lat: number, lng: number, nome: string, endereco: string, fotoFachada?: string): Promise<boolean> {
  // Foto da fachada DA LOJA do atendente (bot-lojas.json); sem ela, a foto geral antiga (se existir).
  const caminhoFoto = fotoFachada || CAMINHO_FOTO_FACHADA;
  const anterior = filasEnvioBotIA.get(usuarioId) || Promise.resolve();
  const atual = anterior.catch(() => {}).then(async () => {
    const sock = await aguardarSocketBotIA(usuarioId);
    if (!sock) {
      console.error(`[Bot IA] Sem conexao WhatsApp ativa para ${usuarioId} (chat ${chatJid}) — localizacao NAO enviada.`);
      return false;
    }
    const key = `${usuarioId}:${chatJid}`;
    chatsBotEnviando.add(key);
    try {
      await comLimiteDeTempo(sock.sendPresenceUpdate('composing', chatJid), 10_000, 'presence').catch(() => {});
      await delay(700);
      const enviada = await comLimiteDeTempo<any>(
        sock.sendMessage(chatJid, { location: { degreesLatitude: lat, degreesLongitude: lng, name: nome, address: endereco } }),
        45_000, 'sendMessage(localizacao)'
      );
      await comLimiteDeTempo(sock.sendPresenceUpdate('unavailable'), 10_000, 'presence').catch(() => {});
      const waId = enviada?.key?.id || null;
      lembrarWaId(waId);
      lembrarWaIdBotIA(waId);
      const salva = await prisma.mensagem.create({
        data: {
          usuarioId, chatJid, chatNome: '', fromMe: true,
          texto: `${lat},${lng} — ${nome}`,
          tipo: 'localizacao', waId, numeroReal: numeroReal || null, enviadoPorId: 'bot',
        },
      });
      getIo().to(usuarioId).emit('NOVA_MENSAGEM', salva);

      // Depois de mandar o pino, espera alguns segundos e sobe a foto da fachada —
      // se o arquivo existir. Sem foto cadastrada, nao faz nada (nao quebra o fluxo).
      if (fs.existsSync(caminhoFoto)) {
        await delay(3000);
        try {
          const bufferFoto = fs.readFileSync(caminhoFoto);
          await comLimiteDeTempo(sock.sendPresenceUpdate('composing', chatJid), 10_000, 'presence').catch(() => {});
          await delay(500);
          const enviadaFoto = await comLimiteDeTempo<any>(
            sock.sendMessage(chatJid, { image: bufferFoto, caption: nome }),
            60_000, 'sendMessage(foto fachada)'
          );
          await comLimiteDeTempo(sock.sendPresenceUpdate('unavailable'), 10_000, 'presence').catch(() => {});
          const waIdFoto = enviadaFoto?.key?.id || null;
          lembrarWaId(waIdFoto);
          lembrarWaIdBotIA(waIdFoto);
          const nomeArquivo = `out_${(waIdFoto || 'm').replace(/[^a-zA-Z0-9]/g, '')}_${Math.floor(Math.random() * 1000000)}.jpg`;
          fs.writeFileSync(path.join(MIDIAS_DIR, nomeArquivo), bufferFoto);
          const salvaFoto = await prisma.mensagem.create({
            data: {
              usuarioId, chatJid, chatNome: '', fromMe: true, texto: nome, tipo: 'imagem',
              midiaUrl: `/midias/${nomeArquivo}`, waId: waIdFoto, numeroReal: numeroReal || null, enviadoPorId: 'bot',
            },
          });
          getIo().to(usuarioId).emit('NOVA_MENSAGEM', salvaFoto);
        } catch (e) {
          console.error('[Bot IA] Falha ao enviar foto da fachada:', (e as any)?.message || e);
        }
      }
      return true;
    } catch (e) {
      console.error('[Bot IA] Falha ao enviar localizacao:', (e as any)?.message || e);
      return false;
    } finally {
      setTimeout(() => chatsBotEnviando.delete(key), 5000).unref?.();
    }
  });
  filasEnvioBotIA.set(usuarioId, atual);
  atual.finally(() => {
    if (filasEnvioBotIA.get(usuarioId) === atual) filasEnvioBotIA.delete(usuarioId);
  });
  return atual as Promise<boolean>;
}

async function enviarMidiaBotIA(usuarioId: string, chatJid: string, numeroReal: string, midia: MidiaBotIA, tempoDigitacaoMs: number): Promise<boolean> {
  const anterior = filasEnvioBotIA.get(usuarioId) || Promise.resolve();
  const atual = anterior.catch(() => {}).then(async () => {
    const sock = await aguardarSocketBotIA(usuarioId);
    if (!sock) {
      console.error(`[Bot IA] Sem conexao WhatsApp ativa para ${usuarioId} (chat ${chatJid}) apos varias tentativas — resposta NAO enviada.`);
      return false;
    }
    const key = `${usuarioId}:${chatJid}`;
    chatsBotEnviando.add(key);
    try {
      const ehAudio = midia.tipo === 'audio';
      const carregada = await carregarMidiaBotIA(midia);
      // Audio: aparece "gravando audio..." (e nao "digitando...") antes de a mensagem de voz chegar.
      await comLimiteDeTempo(sock.sendPresenceUpdate(ehAudio ? 'recording' : 'composing', chatJid), 10_000, 'presence').catch(() => {});
      await delay(tempoDigitacaoMs);

      const conteudo: any = ehAudio
        ? { audio: carregada.buffer, mimetype: 'audio/ogg; codecs=opus', ptt: true }
        : { video: carregada.buffer };
      if (!ehAudio && midia.legenda?.trim()) conteudo.caption = midia.legenda.trim();
      const enviada = await comLimiteDeTempo<any>(sock.sendMessage(chatJid, conteudo), 90_000, 'sendMessage(midia)');
      await comLimiteDeTempo(sock.sendPresenceUpdate('unavailable'), 10_000, 'presence').catch(() => {});

      const waId = enviada?.key?.id || null;
      lembrarWaId(waId);
      lembrarWaIdBotIA(waId);

      let midiaUrl = carregada.midiaUrl;
      if (!midiaUrl) {
        const nome = `out_${(waId || 'm').replace(/[^a-zA-Z0-9]/g, '')}_${Math.floor(Math.random() * 1000000)}.mp4`;
        fs.writeFileSync(path.join(MIDIAS_DIR, nome), carregada.buffer);
        midiaUrl = `/midias/${nome}`;
      }

      const salva = await prisma.mensagem.create({
        data: {
          usuarioId,
          chatJid,
          chatNome: '',
          fromMe: true,
          texto: midia.legenda || '',
          tipo: ehAudio ? 'audio' : 'video',
          midiaUrl,
          waId,
          numeroReal: numeroReal || null,
          enviadoPorId: 'bot', // marca que foi o ROBO (video), nao atendente humano
        },
      });
      getIo().to(usuarioId).emit('NOVA_MENSAGEM', salva);
      return true;
    } catch (e) {
      console.error('[Bot IA] Falha ao enviar video:', (e as any)?.message || e);
      return false;
    } finally {
      setTimeout(() => chatsBotEnviando.delete(key), 5000).unref?.();
    }
  });
  filasEnvioBotIA.set(usuarioId, atual);
  atual.finally(() => {
    if (filasEnvioBotIA.get(usuarioId) === atual) filasEnvioBotIA.delete(usuarioId);
  });
  return atual as Promise<boolean>;
}

// ─── MENSAGENS APAGADAS ───────────────────────────────────────────────────
// Guarda em memória as mensagens recebidas (id -> conteúdo), para que, quando o
// cliente APAGAR uma mensagem, ainda tenhamos o texto original para mostrar.
// Limitado para não crescer infinito (LRU simples: descarta as mais antigas).
const MAX_MENSAGENS_ARMAZENADAS = 4000;
const mensagensRecentes = new Map<string, { usuarioId: string; numero: string; nome: string; texto: string; timestamp: number }>();

function armazenarMensagemRecente(id: string, dados: { usuarioId: string; numero: string; nome: string; texto: string; timestamp: number }) {
  mensagensRecentes.set(id, dados);
  if (mensagensRecentes.size > MAX_MENSAGENS_ARMAZENADAS) {
    const maisAntiga = mensagensRecentes.keys().next().value;
    if (maisAntiga) mensagensRecentes.delete(maisAntiga);
  }
}

// Desembrulha os "envelopes" do WhatsApp que escondem a mensagem real lá dentro:
// mensagens temporárias (ephemeral), visualização única (viewOnce), documento com
// legenda e mensagem editada. Sem isso, um TEXTO normal de um contato com
// "mensagens temporárias" ligadas era salvo como tipo "outro" (ilegível no painel).
// Eco do "Assistente de IA" nativo do WhatsApp Business (Meta), que responde sozinho no
// mesmo numero se apresentando como "Pneu Express" (nome que a loja nunca teve). Nao e
// uma pessoa assumindo — tratar como tal pausava o nosso robo a conversa inteira, porque
// a Meta responde em ~10s a CADA mensagem do cliente e cada eco renovava a pausa.
// Achado 08/09 (chat do Augusto): 15 chats da Borracharia silenciados assim em 24h, e o
// cliente ficou so com a resposta errada da Meta ("alguem te atendera em breve").
// Fingerprint FORTE marca o chat; depois disso, mensagens no mesmo estilo tambem nao
// pausam. Texto sem esse estilo (atendente humano digitando) continua pausando normal.
const chatsComAgenteMeta = new Set<string>();
const FINGERPRINT_META_FORTE: RegExp[] = [
  // nossa equipe promovida a forte (09/09): sao frases que o nosso robo tem PROIBIDO
  // dizer (nunca existe equipe por tras dele), entao numa mensagem de saida so pode ser
  // a Meta. Antes eram so fracas (exigiam "Pneu Express" antes no mesmo chat) e 7 das 18
  // mensagens de equipe de ontem escaparam sem rotulo.
  /conectei\s+voc[eê]\s+(a|à|com)\s+(a\s+)?nossa\s+equipe/i,
  /(compartilhei|enviei|repassei)\s+[^.]{0,60}(para|com)\s+(a\s+)?nossa\s+equipe/i,
  /vou\s+conectar\s+voc[eê]\s+com\s+(a\s+)?nossa\s+equipe/i,
  /nossa\s+equipe\s+para\s+(te\s+)?(passar|verificar|confirmar)/i,
  /um\s+de\s+nossos\s+(consultores|especialistas)/i,
  /pneu\s*express/i,
  /meta\s+business\s+agent/i,
  /sou\s+o\s+assistente\s+da\s+\*/i,
];
const FINGERPRINT_META_FRACO: RegExp[] = [
  /nossa\s+equipe/i,
  /marca\s+preferida/i,
  /servi[cç]os?\s+adicion/i,
  /atender[aá]\s+em\s+breve/i,
  /conectei\s+voc[eê]/i,
  /(compartilhei|repassei|enviei)\s+.{0,40}equipe/i,
  /j[aá]\s+conectei/i,
  /2\s+anos\s+de\s+garantia/i,
  /conferir\s+a\s+compatibilidade/i,
]; 
function ehEcoDoAgenteMeta(usuarioId: string, chatJid: string, texto: string): boolean {
  const t = String(texto || '');
  if (!t.trim()) return false;
  const key = `${usuarioId}:${chatJid}`;
  if (FINGERPRINT_META_FORTE.some((re) => re.test(t))) {
    chatsComAgenteMeta.add(key);
    return true;
  }
  return chatsComAgenteMeta.has(key) && FINGERPRINT_META_FRACO.some((re) => re.test(t));
}

function desembrulharMensagem(message: any): any {
  let m = message;
  for (let i = 0; i < 5 && m; i++) {
    const interno =
      m.ephemeralMessage?.message ||
      m.viewOnceMessage?.message ||
      m.viewOnceMessageV2?.message ||
      m.viewOnceMessageV2Extension?.message ||
      m.documentWithCaptionMessage?.message ||
      m.deviceSentMessage?.message ||
      m.editedMessage?.message?.protocolMessage?.editedMessage ||
      m.editedMessage?.message;
    if (!interno) break;
    m = interno;
  }
  return m;
}

// Extrai o texto de uma mensagem do WhatsApp (cobre os tipos mais comuns)
function extrairTextoMensagem(message: any): string | null {
  if (!message) return null;
  return message.conversation
    || message.extendedTextMessage?.text
    || message.imageMessage?.caption
    || message.videoMessage?.caption
    || message.documentMessage?.caption
    || message.contactMessage?.displayName && `👤 ${message.contactMessage.displayName}`
    || message.locationMessage && `${message.locationMessage.degreesLatitude},${message.locationMessage.degreesLongitude}${message.locationMessage.name ? ' — ' + message.locationMessage.name : ''}`
    || (message.pollCreationMessage || message.pollCreationMessageV2 || message.pollCreationMessageV3)?.name
    || null;
}

// Identifica o tipo da mensagem (para a Caixa de Entrada)
function tipoMensagem(message: any): string {
  if (!message) return 'outro';
  if (message.conversation || message.extendedTextMessage) return 'texto';
  if (message.imageMessage) return 'imagem';
  if (message.videoMessage || message.ptvMessage) return 'video';
  if (message.audioMessage) return 'audio';
  if (message.documentMessage) return 'documento';
  if (message.stickerMessage) return 'figurinha';
  if (message.contactMessage || message.contactsArrayMessage) return 'contato';
  if (message.locationMessage || message.liveLocationMessage) return 'localizacao';
  if (message.pollCreationMessage || message.pollCreationMessageV2 || message.pollCreationMessageV3) return 'enquete';
  return 'outro';
}

// ─── AUTO-RESPOSTA POR "SILÊNCIO" ───
// A saudação só sai quando a conversa estava PARADA: se houve qualquer troca de
// mensagem com o contato nas últimas AUTO_REPLY_SILENCIO_HORAS, não envia.
// Quem conversa todo dia nunca recebe; quem sumiu 5+ dias recebe de novo.
// Trava extra: nunca mais de 1 por contato a cada 24h (sobrevive a reinícios via banco).
// Prazo definido a pedido do Maicon (06/07/2026): antes eram 48h (2 dias), agora 5 dias.
const SILENCIO_HORAS = Number(process.env.AUTO_REPLY_SILENCIO_HORAS || 120);
const TRAVA_24H_MS = 24 * 60 * 60 * 1000;
// Memória rápida: última auto-resposta por contato (evita rajada entre mensagens seguidas)
const ultimaAutoMem = new Map<string, number>();

// ─── VIGIA DE CONEXÃO ───
// A cada 60s, garante que TODO atendente com credenciais salvas tenha uma sessão ativa.
// Pega os casos raros em que a sessão morre SEM disparar o evento 'close' (congelamento
// silencioso) ou em que um retry falhou. Reconecta sozinho — sem precisar de QR novo.
// ESPERA PROGRESSIVA ENTRE RECONEXOES (03/09).
// Antes o retry era fixo em 2 segundos, pra sempre. Quando o WhatsApp recusa a
// conexao (conflito de sessao, 428, 440), isso vira uma tempestade: em 02/09 uma
// conta acumulou 11.157 quedas e outra 4.391 no mesmo dia. Pior: essa insistencia
// aciona o limitador do WhatsApp contra o IP da VPS, entao a tentativa numero 5.000
// tem MENOS chance de sucesso que a primeira — o remedio virava a doenca.
// Agora a espera dobra a cada falha seguida (2s, 4s, 8s... ate 5 min) e volta pro
// inicio assim que conecta. Quem cai por um soluco de rede volta em 2s como antes;
// quem esta sendo recusado de verdade para de martelar.
// BACKUP DAS CREDENCIAIS (03/09). A conta da Borracharia parou de conectar porque o
// creds.json ficou com 0 BYTES — o arquivo zerou (provavelmente uma escrita
// interrompida) e sem ele os 6.894 arquivos de chave viram lixo: so resta parear de
// novo, com a loja sem WhatsApp ate alguem perceber.
// Aqui a gente guarda uma copia boa toda vez que a conexao abre, e restaura sozinho
// se encontrar o arquivo vazio na proxima tentativa.
function caminhoAuth(usuarioId: string): string {
  return path.join(__dirname, '../../../prisma', 'auth_info_baileys_' + usuarioId);
}

function salvarBackupCredenciais(usuarioId: string): void {
  try {
    const origem = path.join(caminhoAuth(usuarioId), 'creds.json');
    if (!fs.existsSync(origem)) return;
    const conteudo = fs.readFileSync(origem, 'utf8');
    // so guarda se estiver realmente valido — backup de arquivo quebrado nao serve
    if (!conteudo.trim()) return;
    const dados = JSON.parse(conteudo);
    if (!dados || !dados.me || !dados.me.id) return;
    fs.writeFileSync(origem + '.backup', conteudo, 'utf8');
  } catch (e) { /* backup e melhor-esforco, nunca pode derrubar a conexao */ }
}

function protegerCredenciais(usuarioId: string): void {
  try {
    const dir = caminhoAuth(usuarioId);
    const arq = path.join(dir, 'creds.json');
    const bkp = arq + '.backup';
    if (!fs.existsSync(arq) || !fs.existsSync(bkp)) return;
    const atual = fs.readFileSync(arq, 'utf8');
    let valido = false;
    try { const d = JSON.parse(atual); valido = !!(d && d.me && d.me.id); } catch (e) { valido = false; }
    if (valido) return;
    const copia = fs.readFileSync(bkp, 'utf8');
    const d2 = JSON.parse(copia);
    if (!d2 || !d2.me || !d2.me.id) return;
    fs.writeFileSync(arq, copia, 'utf8');
    console.log(`[Baileys] creds.json do usuário ${usuarioId} estava vazio/corrompido — restaurado do backup.`);
  } catch (e) { /* idem */ }
}

const tentativasReconexao = new Map<string, number>();
// UMA reconexao pendente por usuario (08/09). Antes, cada close agendava mais um timer e
// varios podiam ficar pendentes; cada um criava um socket novo que derrubava o anterior com
// 440 — cuja queda agendava outro timer. Corrente infinita, milhares de 440 por dia.
const reconexoesPendentes = new Map<string, NodeJS.Timeout>();
const timersEstabilidade = new Map<string, NodeJS.Timeout>();

// So considera a conexao "boa" depois que ela AGUENTA 60s de pe. Sem isso o contador
// zerava a cada abertura — e numa conta em conflito, que abre e cai em seguida, a
// espera nunca saia de 2s (o caso do Diogo: 11.157 quedas em um dia, sempre
// "tentativa 1").
function marcarConexaoEstavel(usuarioId: string): void {
  const anterior = timersEstabilidade.get(usuarioId);
  if (anterior) clearTimeout(anterior);
  const t = setTimeout(() => {
    tentativasReconexao.delete(usuarioId);
    timersEstabilidade.delete(usuarioId);
  }, 60_000);
  t.unref?.();
  timersEstabilidade.set(usuarioId, t);
}

function esperaReconexao(usuarioId: string): number {
  const n = (tentativasReconexao.get(usuarioId) || 0) + 1;
  tentativasReconexao.set(usuarioId, n);
  const base = Math.min(2000 * Math.pow(2, n - 1), 5 * 60 * 1000);
  // jitter de ate 30%: se varias contas caem juntas (ex.: queda de rede da VPS), elas
  // nao voltam todas no mesmo milissegundo criando um pico de conexoes.
  return Math.round(base * (1 + Math.random() * 0.3));
}

let vigiaIniciado = false;
// Uma sessao esta PAREADA quando ja tem identidade da conta (creds.me.id) —
// gravada tanto no pareamento por QR quanto por codigo. NAO use creds.registered:
// o Baileys so marca esse flag no fluxo de CODIGO, entao toda conta pareada por QR
// ficava eternamente "nao registrada" e era barrada da reconexao automatica
// (achado 01/09 — era por isso que as sessoes so ficavam de pe com o PC do
// atendente ligado).
function sessaoJaPareada(creds: any): boolean {
  if (!creds) return false;
  if (creds.registered) return true;
  return !!(creds.me && creds.me.id);
}

function iniciarVigiaConexao() {
  if (vigiaIniciado) return;
  vigiaIniciado = true;
  const checarSessoes = () => {
    try {
      const dir = path.join(__dirname, '../../../prisma');
      if (!fs.existsSync(dir)) return;
      const sessoes: string[] = fs.readdirSync(dir).filter((d: string) => d.startsWith('auth_info_baileys_'));
      for (const s of sessoes) {
        const uid = s.replace('auth_info_baileys_', '');
        // Tem credencial salva, mas não está conectado NEM conectando → ressuscita.
        // (Pula quem está pausado, para não ficar gerando QR de conta travada.)
        if (uid && !sessions.has(uid) && !conectandoAgora.has(uid) && !connectedUsers.has(uid) && !pausados.has(uid)) {
          // SÓ ressuscita sessão REGISTRADA (creds.registered = true). Sessão sem
          // registro ressuscitada vira LOOP ETERNO de QR que ninguém escaneia —
          // isso alimenta o rate-limit do WhatsApp contra o IP da VPS e atrapalha
          // os pareamentos de verdade. QR de conta nova só sob demanda humana.
          let registrada = false;
          try {
            const creds = JSON.parse(fs.readFileSync(path.join(dir, s, 'creds.json'), 'utf8'));
            registrada = sessaoJaPareada(creds);
          } catch (e) { registrada = false; }
          if (!registrada) continue;
          console.log(`[Baileys][Vigia] Sessão de ${uid} caída — reconectando automaticamente...`);
          connectToWhatsApp(uid).catch(() => {});
        }
      }
    } catch (e) {}
  };

  // Roda imediatamente no boot após 1 segundo e depois a cada 10 segundos
  setTimeout(checarSessoes, 1000);
  setInterval(checarSessoes, 10000);
}
iniciarVigiaConexao();

// VIGIA DE RESPOSTAS PENDENTES (01/09) — o papel do robo e responder TODO MUNDO.
// O fluxo normal responde alguns segundos depois de cada mensagem que chega. Mas se
// naquele exato momento algo atrapalhar (WhatsApp oscilando, robo pausado por engano,
// o servico do robo fora do ar), a resposta se perde e o cliente fica esperando pra
// sempre — so voltaria a ser atendido se escrevesse de novo. Caso real: um cliente
// mandou 5 mensagens seguidas e ficou sem NENHUMA resposta.
// Esta varredura roda de tempos em tempos, acha as conversas em que o CLIENTE falou por
// ultimo e o robo nao respondeu, e aciona o robo pra elas.
const tentativasResposta = new Map<string, number>(); // waId -> quantas vezes tentamos
// Motivos pelos quais o vigia NAO acionou uma conversa parada ha 2+ min (logado 1x por mensagem+motivo).
// Achado 18/09 (caso Marcia Lima): ficou ~10 min sem resposta e nao havia nenhum log dizendo por que.
const motivosVigiaLogados = new Set<string>();
let vigiaRespostasIniciado = false;
function iniciarVigiaRespostasPendentes() {
  if (vigiaRespostasIniciado) return;
  vigiaRespostasIniciado = true;

  const varrer = async () => {
    try {
      const contasBot = await prisma.usuario.findMany({
        where: { ativo: true, botIaAtivo: true },
        select: { id: true },
      });
      if (!contasBot.length) return;

      const agora = Date.now();
      // Janela: mensagens com mais de 60s (o fluxo normal ja teve tempo de agir: espera de
      // 5,5-8,5s + resposta; menos que isso arrisca responder em dobro) e menos de 6h (nao
      // ressuscita conversa velha do nada). Varredura a cada 45s: pior caso ~105s de espera.
      const limiteNovo = new Date(agora - 60 * 1000);
      const limiteVelho = new Date(agora - 6 * 60 * 60 * 1000);

      for (const conta of contasBot) {
        // Sem WhatsApp conectado nao adianta. Confere tambem a conexao EFETIVA (conta que usa o
        // WhatsApp de outra — whatsappDonoId), que e a que o robo realmente usa pra enviar.
        const idConexao = await resolverConexaoEfetiva(conta.id).catch(() => conta.id);
        if (!sessions.has(conta.id) && !connectedUsers.has(conta.id) && !sessions.has(idConexao) && !connectedUsers.has(idConexao)) continue;

        const recentes = await prisma.mensagem.findMany({
          where: { usuarioId: conta.id, timestamp: { gte: limiteVelho } },
          orderBy: { timestamp: 'desc' },
          take: 500,
          select: { chatJid: true, fromMe: true, waId: true, timestamp: true },
        });

        // Ultima mensagem de cada conversa.
        const ultimaPorChat = new Map<string, typeof recentes[number]>();
        for (const m of recentes) {
          if (!ultimaPorChat.has(m.chatJid)) ultimaPorChat.set(m.chatJid, m);
        }

        for (const [chatJid, ultima] of ultimaPorChat.entries()) {
          if (ultima.fromMe) continue;                       // ja respondida
          if (ultima.timestamp > limiteNovo) continue;       // fresca: o fluxo normal cuida
          if (!ultima.waId) continue;
          if (chatJid.includes('@g.us') || chatJid.includes('@newsletter') || chatJid.includes('status@broadcast')) continue;

          const estado = await prisma.botConversa.findUnique({
            where: { usuarioId_chatJid: { usuarioId: conta.id, chatJid } },
            select: { pausadoAte: true, ultimaRespostaEm: true, motivoPausa: true },
          });
          const idadeMs = agora - ultima.timestamp.getTime();
          const registrarPulo = (motivo: string) => {
            if (idadeMs < 2 * 60 * 1000) return;
            const k = `${ultima.waId}|${motivo}`;
            if (motivosVigiaLogados.has(k)) return;
            if (motivosVigiaLogados.size > 500) motivosVigiaLogados.clear();
            motivosVigiaLogados.add(k);
            console.log(`[Bot IA][Vigia] ${chatJid} sem resposta ha ${Math.round(idadeMs / 1000)}s mas NAO acionado: ${motivo}.`);
          };
          // Pausa de verdade (humano assumiu) continua sendo respeitada.
          if (estado?.pausadoAte && estado.pausadoAte.getTime() > agora) { registrarPulo(`conversa pausada (${estado.motivoPausa || 'sem motivo'}) ate ${estado.pausadoAte.toISOString()}`); continue; }
          // Ja respondemos DEPOIS dessa mensagem? entao esta em dia.
          if (estado?.ultimaRespostaEm && estado.ultimaRespostaEm >= ultima.timestamp) { registrarPulo('ja consta resposta do robo depois dela (ultimaRespostaEm)'); continue; }

          const tentativas = tentativasResposta.get(ultima.waId) || 0;
          if (tentativas >= 4) { registrarPulo('ja tentou 4 vezes'); continue; } // nao insiste pra sempre na mesma mensagem
          tentativasResposta.set(ultima.waId, tentativas + 1);
          if (tentativasResposta.size > 500) {
            // limpeza simples pra nao crescer sem fim
            const primeira = tentativasResposta.keys().next().value;
            if (primeira) tentativasResposta.delete(primeira);
          }

          console.log(`[Bot IA][Vigia] Conversa ${chatJid} ficou sem resposta — acionando o robo.`);
          await dispararRespostaBotAgora(conta.id, chatJid).catch(() => {});
        }
      }
    } catch (e: any) {
      console.error('[Bot IA][Vigia] Erro na varredura:', e?.message || e);
    }
  };

  setTimeout(() => { varrer().catch(() => {}); }, 30_000).unref?.();
  setInterval(() => { varrer().catch(() => {}); }, 45_000).unref?.();
}
iniciarVigiaRespostasPendentes();

// ─── LEMBRETE DE AGENDAMENTOS (no WhatsApp do PRÓPRIO atendente) ───
// No expediente, manda um lembrete pro número do próprio atendente (conversa
// "Mensagens para mim") — mas SÓ quando existe um cliente de verdade pendente, citando
// o nome dele. Mensagem genérica solta num timer era ignorada (não dizia QUEM);
// virou reativo: só fala quando tem algo acionável (24/07/2026, a pedido do Maicon —
// "essa mensagem não tá dando efeito").
const LEMBRETE_INTERVALO_MS = Number(process.env.LEMBRETE_INTERVALO_H || 2.5) * 60 * 60 * 1000;
const ultimoLembrete = new Map<string, number>();

function estaNoExpedienteLembrete(): boolean {
  const agoraBR = new Date(Date.now() - 3 * 60 * 60 * 1000); // fuso BR (UTC-3)
  const hora = agoraBR.getUTCHours();
  const dia = agoraBR.getUTCDay(); // 0=dom ... 6=sáb
  return dia >= 1 && dia <= 6 && hora >= 8 && hora < 18; // seg a sáb, 8h às 18h
}

// Acha UM cliente que o atendente já atendeu (mandou msg nessa conversa alguma vez),
// a conversa esfriou (última msg, de qualquer lado, entre 24h e 30 dias atrás — recente
// o bastante pra ainda fazer sentido cutucar, velha o bastante pra não ser prematuro) e
// NENHUM agendamento (de qualquer status) existe pra esse número, criado por ele. Sem
// candidato = null, e nesse caso não manda nada (melhor calado que chato à toa).
async function buscarClienteSemAgendamento(usuarioId: string): Promise<{ nome: string; numero: string } | null> {
  const agora = Date.now();
  const ha24h = new Date(agora - 24 * 60 * 60 * 1000).getTime();
  const ha30d = new Date(agora - 30 * 24 * 60 * 60 * 1000).getTime();

  // Última mensagem de cada chat (mesmo filtro de ruído de sistema do inbox)
  const ultimas: any[] = await prisma.$queryRaw`
    SELECT DISTINCT ON ("chatJid") "chatJid", "chatNome", "numeroReal", "timestamp"
    FROM "Mensagem"
    WHERE "usuarioId" = ${usuarioId}
      AND NOT (tipo = 'outro' AND ("midiaUrl" IS NULL OR "midiaUrl" = '') AND texto IN ('', 'protocolMessage'))
    ORDER BY "chatJid", "timestamp" DESC
  `;
  const esfriados = ultimas.filter((m) => {
    const t = new Date(m.timestamp).getTime();
    return t < ha24h && t > ha30d && m.numeroReal;
  });
  if (esfriados.length === 0) return null;

  // Só conta se o ATENDENTE já respondeu nessa conversa alguma vez (não é lead intocado)
  const respondidos: any[] = await prisma.$queryRaw`
    SELECT DISTINCT "chatJid" FROM "Mensagem" WHERE "usuarioId" = ${usuarioId} AND "fromMe" = true
  `;
  const setRespondidos = new Set(respondidos.map((r: any) => r.chatJid));
  const candidatos = esfriados.filter((m) => setRespondidos.has(m.chatJid));
  if (candidatos.length === 0) return null;

  // Números que já têm QUALQUER agendamento criado por esse atendente
  const existentes = await prisma.agendamento.findMany({ where: { criadoPorId: usuarioId }, select: { numero: true } });
  const setAgendados = new Set(existentes.map((a) => a.numero.replace(/\D/g, '')));

  // O mais recente "esfriado" primeiro — mais fresco na memória do atendente
  candidatos.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  for (const c of candidatos) {
    const numDigitos = String(c.numeroReal || '').replace(/\D/g, '');
    if (!numDigitos || setAgendados.has(numDigitos)) continue;
    return { nome: c.chatNome || numDigitos, numero: numDigitos };
  }
  return null;
}

function textoLembrete(nome: string): string {
  return `🔔 *Lembrete:* Você atendeu *${nome}* e ainda não agendou um retorno.\nQuer marcar agora? Cada agendamento marcado é uma venda a mais 📈`;
}

let lembretesIniciado = false;
function iniciarLembretes() {
  if (lembretesIniciado) return;
  lembretesIniciado = true;
  setInterval(() => {
    try {
      if (!estaNoExpedienteLembrete()) return;
      const agora = Date.now();
      for (const [uid, sock] of sessions.entries()) {
        if (!connectedUsers.has(uid)) continue;
        const last = ultimoLembrete.get(uid);
        if (last === undefined) { ultimoLembrete.set(uid, agora); continue; } // 1ª vez: só marca, não envia já
        if (last > agora - LEMBRETE_INTERVALO_MS) continue;
        const proprio = (sock as any).user?.id;
        if (!proprio) continue;
        const num = String(proprio).replace(/[:@].*$/, ''); // só os dígitos do número do atendente
        if (!num) continue;
        buscarClienteSemAgendamento(uid)
          .then((candidato) => {
            if (!candidato) return; // ninguém pendente agora — tenta de novo no próximo ciclo (5min)
            ultimoLembrete.set(uid, agora); // só conta a janela de 2h30 quando REALMENTE manda algo
            return (sock as any).sendMessage(num + '@s.whatsapp.net', { text: textoLembrete(candidato.nome) })
              .then((sent: any) => { lembrarWaId(sent?.key?.id); console.log(`[Lembrete] enviado para o atendente ${uid} sobre ${candidato.nome}`); });
          })
          .catch((e: any) => console.error('[Lembrete] erro:', e?.message));
      }
    } catch (e) {}
  }, 5 * 60 * 1000); // checa a cada 5 min
}
iniciarLembretes();

// Dispara o lembrete AGORA para os atendentes conectados que TENHAM candidato (uso manual/teste).
export async function dispararLembretesAgora(): Promise<number> {
  let enviados = 0;
  for (const [uid, sock] of sessions.entries()) {
    if (!connectedUsers.has(uid)) continue;
    const proprio = (sock as any).user?.id;
    if (!proprio) continue;
    const num = String(proprio).replace(/[:@].*$/, '');
    if (!num) continue;
    const candidato = await buscarClienteSemAgendamento(uid);
    if (!candidato) continue;
    ultimoLembrete.set(uid, Date.now());
    try {
      const sent = await (sock as any).sendMessage(num + '@s.whatsapp.net', { text: textoLembrete(candidato.nome) });
      lembrarWaId(sent?.key?.id);
      enviados++;
      console.log(`[Lembrete] disparado manualmente para o atendente ${uid} sobre ${candidato.nome}`);
    } catch (e) { console.error('[Lembrete] erro ao disparar:', (e as any)?.message); }
  }
  return enviados;
}

// Códigos de pareamento (8 dígitos) por usuário — alternativa ao QR.
// A pessoa digita esse código no WhatsApp (Aparelhos conectados → Conectar com
// número de telefone), sem precisar escanear QR nenhum.
export const pairingCodes = new Map<string, string>();

// Usuários com a conexão PAUSADA: o servidor para de tentar conectar (não gera QR
// nem reconecta) até ser retomado. Serve para contas travadas pelo WhatsApp,
// evitando a enxurrada de QR Codes na tela do atendente.
export const pausados = new Set<string>();

// Resolve a conexão EFETIVA de um usuário: se ele COMPARTILHA o WhatsApp de outro
// atendente (whatsappDonoId preenchido), retorna o ID do DONO — é a sessão Baileys
// dele que deve ser usada para conectar/enviar/consultar. Caso contrário, retorna o
// próprio usuarioId (ele é dono da sua própria conexão, comportamento de sempre).
// Só resolve 1 nível (não segue cadeias) — cadeias são bloqueadas na rota de gestão.
// Sem cache: é uma consulta simples, a tabela Usuario é pequena.
export async function resolverConexaoEfetiva(usuarioId: string): Promise<string> {
  if (!usuarioId) return usuarioId;
  try {
    const usuario = await prisma.usuario.findUnique({ where: { id: usuarioId }, select: { whatsappDonoId: true } });
    if (usuario?.whatsappDonoId) return usuario.whatsappDonoId;
  } catch (e) {
    console.error(`[Baileys] Erro ao resolver conexão efetiva de ${usuarioId}:`, (e as any)?.message);
  }
  return usuarioId;
}

export async function connectToWhatsApp(
  usuarioId: string,
  socketId?: string,
  numeroPareamento?: string,
  permitirQrNovo = false,
  // Só o pareamento manual (QR/código pelo CRM) passa true: ele JÁ segura a trava conectandoAgora desde antes de
  // apagar a credencial, pra ninguém conectar no meio. Toda saída abaixo libera a trava do mesmo jeito.
  travaJaReservada = false,
) {
  if (!usuarioId) return;

  // COMPARTILHAMENTO: quem compartilha o WhatsApp de outro atendente NÃO pode ter
  // sessão Baileys própria — se ela existisse, o WhatsApp trataria como um 2º
  // aparelho vinculado da MESMA conta do dono, duplicando toda mensagem recebida
  // (a causa raiz do bug de duplicidade). Então aqui é um no-op puro.
  try {
    const usuario = await prisma.usuario.findUnique({ where: { id: usuarioId }, select: { whatsappDonoId: true } });
    if (usuario?.whatsappDonoId) {
      if (travaJaReservada) conectandoAgora.delete(usuarioId);
      console.log(`[Baileys] Usuário ${usuarioId} compartilha WhatsApp de ${usuario.whatsappDonoId} — não cria sessão própria.`);
      return;
    }
  } catch (e) {
    console.error(`[Baileys] Erro ao checar compartilhamento de ${usuarioId}:`, (e as any)?.message);
  }

  // Conexão pausada: não tenta nada até ser retomada. EXCEÇÃO: um pareamento por
  // código (numeroPareamento presente) sempre passa — é uma ação intencional, e a
  // pausa serve justamente para BLOQUEAR as reconexões automáticas que competiam
  // com o pareamento (a "corrida" que contaminava a sessão).
  if (pausados.has(usuarioId) && !numeroPareamento && !permitirQrNovo) {
    if (travaJaReservada) conectandoAgora.delete(usuarioId);
    console.log(`[Baileys] Conexão do usuário ${usuarioId} está PAUSADA. Ignorando.`);
    return;
  }

  // Evita criar múltiplas instâncias para o mesmo usuário se já estiver rodando — ou se outra chamada já
  // estiver no meio da criação (ver conectandoAgora). A marca é posta ANTES do primeiro await abaixo e sai
  // em todo caminho (retorno, erro ou sessions.set).
  if (sessions.has(usuarioId) || (conectandoAgora.has(usuarioId) && !travaJaReservada)) {
    if (travaJaReservada) conectandoAgora.delete(usuarioId);
    console.log(`[Baileys] Sessão já existe${sessions.has(usuarioId) ? '' : ' (conexão em andamento)'} para o usuário ${usuarioId}. Ignorando recriação.`);
    return;
  }
  conectandoAgora.add(usuarioId);

  const authDir = path.join(__dirname, `../../../prisma/auth_info_baileys_${usuarioId}`);
  let auth: Awaited<ReturnType<typeof useMultiFileAuthState>>;
  try {
    auth = await useMultiFileAuthState(authDir);
  } catch (e) {
    conectandoAgora.delete(usuarioId);
    throw e;
  }
  const { state, saveCreds } = auth;

  // Conta sem credenciais registradas só entra em fluxo de pareamento quando um
  // humano pedir explicitamente (QR pelo CRM ou código de pareamento). Isso evita
  // QR aparecendo sozinho no boot/vigia e reduz o risco de rate-limit.
  const jaRegistrado = sessaoJaPareada(state.creds as any);
  if (!jaRegistrado && !numeroPareamento && !permitirQrNovo) {
    conectandoAgora.delete(usuarioId);
    console.log(`[Baileys] Usuário ${usuarioId} sem sessão registrada — aguardando solicitação manual de QR/código.`);
    return;
  }

  // BUG conhecido do Baileys 7.0.0-rc13 (issue #2679): a versão do WA Web EMBUTIDA
  // está velha e o telefone RECUSA o vínculo ("Não foi possível conectar o aparelho")
  // no QR e no código. Fix: buscar a versão atual com fetchLatestWaWebVersion e passar
  // no socket. Com cache de 6h e fallback pra embutida se a busca falhar.
  let versaoWa: Awaited<ReturnType<typeof obterVersaoWaWeb>>;
  try {
    versaoWa = await obterVersaoWaWeb(!jaRegistrado);
  } catch (e) {
    conectandoAgora.delete(usuarioId);
    throw e;
  }

  // Alguém PAUSOU (ou começou um pareamento manual, que pausa) enquanto esta reconexão automática esperava:
  // desiste aqui, sem criar socket com a credencial lida antes (revisão 24/09).
  if (pausados.has(usuarioId) && !numeroPareamento && !permitirQrNovo) {
    conectandoAgora.delete(usuarioId);
    console.log(`[Baileys] Conexão do usuário ${usuarioId} foi PAUSADA enquanto conectava — reconexão automática cancelada.`);
    return;
  }

  // IDENTIDADE do cliente: pra PAREAMENTO NOVO usamos "Chrome no Ubuntu" — o
  // "Windows Desktop" anuncia o WhatsApp Desktop APOSENTADO pela Meta e o servidor
  // rejeita o vínculo (428 antes do QR valer -> loop 408 -> 401; issue #2677 do
  // Baileys, mesma rc13). Sessões JÁ registradas mantêm a identidade antiga pra
  // não arriscar as lojas conectadas.
  const configSocket: any = {
    auth: state,
    printQRInTerminal: false,
    browser: jaRegistrado ? Browsers.windows('Desktop') : Browsers.ubuntu('Chrome'),
    syncFullHistory: false,
    // Mantém a conexão viva 24/7 na VPS: envia pings periódicos ao WhatsApp.
    // Sem isso a conexão pode "congelar em silêncio" sem disparar o evento de queda.
    keepAliveIntervalMs: 30000,
    connectTimeoutMs: 60000,
    retryRequestDelayMs: 2000,
    // PAREAMENTO: mantém o socket vivo por 3 min em cada QR. Sem isso o Baileys encerra
    // rápido ("QR refs attempts ended" / 408) e o CÓDIGO DE PAREAMENTO expira antes de a
    // pessoa digitar no celular → "Não foi possível conectar o dispositivo".
    qrTimeout: 180000,
    // Não marca o aparelho como "online" ao conectar — evita roubar as notificações do celular.
    markOnlineOnConnect: false
  };
  if (versaoWa) configSocket.version = versaoWa;

  let sock: ReturnType<typeof makeWASocket>;
  try {
    sock = makeWASocket(configSocket);
  } catch (e) {
    conectandoAgora.delete(usuarioId);
    throw e;
  }

  // DETECTOR do fluxo "Shortcake" (passkey nova da Meta, ~30/06 — issue #2672):
  // se essas notificações aparecerem no log durante um pareamento, a conta exige o
  // fluxo de passkey que o Baileys rc13 ainda não fala — aí o caminho é o PR #2689.
  // O ack evita o stall imediato (paliativo), e o log é o nosso diagnóstico.
  if (!jaRegistrado) {
    try {
      const ackShortcake = async (node: any, tipo: string) => {
        console.log(`[Baileys][Shortcake] Notificação "${tipo}" recebida no pareamento de ${usuarioId} — conta exige fluxo de passkey CRSC (issue #2672).`);
        try {
          await (sock as any).sendNode({ tag: 'ack', attrs: { id: node?.attrs?.id || '', class: 'notification', to: node?.attrs?.from || '', type: node?.attrs?.type || '' } });
        } catch (e) { /* ack é melhor-esforço */ }
      };
      (sock.ws as any).on('CB:notification,type:passkey_prologue_request', (node: any) => { ackShortcake(node, 'passkey_prologue_request').catch(() => {}); });
      (sock.ws as any).on('CB:notification,type:crsc_continuation', (node: any) => { ackShortcake(node, 'crsc_continuation').catch(() => {}); });
    } catch (e) { /* diagnóstico opcional; nunca derruba a conexão */ }
  }

  // Salva a instância no mapa (e só agora libera a marca de "em andamento": daqui pra frente sessions.has vale)
  sessions.set(usuarioId, sock);
  conectandoAgora.delete(usuarioId);

  // ─── PAREAMENTO POR CÓDIGO (alternativa ao QR) ───
  // Se veio um número e a conta ainda NÃO está registrada, pede à WhatsApp um
  // código de 8 dígitos. O momento CERTO de pedir é quando o 1º QR chega (prova
  // que o socket está pronto) — pedir num timer cego gerava código que o telefone
  // recusava/expirava. Mantemos um fallback por tempo caso o QR demore.
  let pareamentoPedido = false;
  const pedirCodigoPareamento = async (origem: string) => {
    if (pareamentoPedido || !numeroPareamento) return;
    if (sock.authState?.creds?.registered) return;
    pareamentoPedido = true;
    try {
      const code = await sock.requestPairingCode(numeroPareamento);
      pairingCodes.set(usuarioId, code);
      getIo().to(usuarioId).emit('WHATSAPP_PAIRING_CODE', code);
      console.log(`[Baileys] Código de pareamento gerado para o usuário ${usuarioId} (via ${origem}).`);
    } catch (e: any) {
      // Libera pra tentar de novo no próximo QR/fallback (falha costuma ser socket ainda subindo)
      pareamentoPedido = false;
      console.error(`[Baileys] Erro ao gerar código de pareamento (${usuarioId}, via ${origem}):`, e?.message);
    }
  };
  if (numeroPareamento && !sock.authState.creds.registered) {
    setTimeout(() => { pedirCodigoPareamento('fallback-6s').catch(() => {}); }, 6000);
  }

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;
    
    if (qr) {
      console.log(`\n[Baileys] QR Code gerado para o usuário ${usuarioId}`);

      // Modo pareamento por código: o 1º QR prova que o socket está PRONTO —
      // este é o momento certo de pedir o código (o timer é só fallback).
      pedirCodigoPareamento('qr-pronto').catch(() => {});

      try {
        const qrBase64 = await qrcode.toDataURL(qr);
        // Socket já substituído/encerrado enquanto o QR era desenhado: não publica um QR morto (revisão 24/09).
        if (sessions.get(usuarioId) === sock) {
          const agora = Date.now();
          const qrPayload: LatestQrPayload = {
            qrCode: qrBase64,
            generatedAt: agora,
            // Janela curta proposital: melhor forçar QR novo do que deixar QR velho na tela.
            expiresAt: agora + 45_000,
          };
          // Guarda o QR no cache para reenviar a quem conectar depois
          latestQR.set(usuarioId, qrPayload);
          connectedUsers.delete(usuarioId);
          // Emite o QR Code apenas para a sala do usuário específico. Só a IMAGEM (data URL): a extensão faz
          // <img src={qr}> — mandando o objeto inteiro ({qrCode, generatedAt, expiresAt}, desde 26/08) a imagem virava
          // "[object Object]" e a tela de bloqueio mostrava um quadro BRANCO no lugar do QR (achado 24/09, Daniel Amaral).
          getIo().to(usuarioId).emit('WHATSAPP_QR_CODE', qrPayload.qrCode);

          // Atualiza status no banco
          await prisma.usuario.update({
            where: { id: usuarioId },
            data: { whatsappConectado: false }
          });
        }
      } catch (err) {
        console.error(`[Baileys] Erro ao gerar Base64 do QR para usuário ${usuarioId}:`, err);
      }
    }

    if (connection === 'close') {
      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
      const isLoggedOut = statusCode === DisconnectReason.loggedOut;

      console.log(`[Baileys] Conexão fechada (Usuário ${usuarioId}). Código: ${statusCode}. Motivo:`, lastDisconnect?.error, 'Deslogado:', isLoggedOut);
      if (statusCode === 440) ultimoConflitoEm.set(usuarioId, Date.now());

      // Socket ANTIGO fechando depois que um novo ja assumiu: ignora. Antes, o close do antigo
      // apagava o socket NOVO do mapa (sessions.delete por usuarioId) e agendava mais uma
      // reconexao — que criava outro socket, que derrubava o novo, e assim sem fim (08/09).
      // Efeito colateral do bug: o socket vivo ficava FORA do mapa e sessions.get() dava vazio
      // mesmo com "Conexão aberta com sucesso" no log — por isso os disparos falhavam.
      if (sessions.get(usuarioId) !== sock) {
        console.log(`[Baileys] Fechamento de socket antigo do usuário ${usuarioId} ignorado (já existe um socket mais novo).`);
        return;
      }

      // NÃO avisa "desconectado" aqui em cima: o Baileys fecha e reabre a sessão o tempo
      // todo (código 515 pós-QR, churn de prekey, quedinhas de rede) e reconecta em 2s.
      // Avisar false a cada ciclo fazia a extensão PISCAR a tela de bloqueio de tela cheia.
      // Só avisamos "desconectado" no caso de logout REAL (aparelho removido) — ver abaixo.

      connectedUsers.delete(usuarioId);

      // CRÍTICO: sempre remove o socket morto do mapa antes de qualquer decisão.
      // Sem isso, o `if (sessions.has(usuarioId)) return` no topo de connectToWhatsApp
      // faz a reconexão virar um no-op e a sessão morre para sempre.
      sessions.delete(usuarioId);

      if (isLoggedOut) {
        // ÚNICO caso que para de vez: o usuário REMOVEU o aparelho em "Aparelhos conectados"
        // no celular. O WhatsApp invalida a sessão (código 401), então apagamos as credenciais
        // mortas do disco para que um QR Code novo e limpo seja gerado na próxima conexão.
        console.log(`[Baileys] Aparelho REMOVIDO pelo celular (usuário ${usuarioId}). Limpando credenciais e aguardando novo QR Code.`);
        // Logout de verdade: AGORA sim avisa a extensão para mostrar a tela de pareamento.
        getIo().to(usuarioId).emit('WHATSAPP_STATUS', { conectado: false });
        latestQR.delete(usuarioId);
        try {
          const fs = require('fs');
          if (fs.existsSync(authDir)) {
            fs.rmSync(authDir, { recursive: true, force: true });
          }
        } catch (e) {
          console.error(`[Baileys] Erro ao limpar credenciais do usuário ${usuarioId}:`, e);
        }
        await prisma.usuario.update({
          where: { id: usuarioId },
          data: { whatsappConectado: false }
        }).catch(() => {});
      } else {
        // Inclui o código 515 (restartRequired) que o Baileys dispara logo após escanear o QR,
        // além de quedas de internet / erros internos. Em todos esses casos é preciso recriar o socket.
        await prisma.usuario.update({
          where: { id: usuarioId },
          data: { whatsappConectado: false }
        }).catch(() => {});
        const espera = esperaReconexao(usuarioId);
        console.log(`[Baileys] Reconectando usuário ${usuarioId} em ${Math.round(espera / 1000)}s (tentativa ${tentativasReconexao.get(usuarioId)}).`);
        // Se tem código de pareamento pendente, esse retry é a MESMA tentativa de
        // pareamento continuando (restart código 515 é normal no meio do processo) —
        // precisa permitirQrNovo:true pra furar a própria pausa que o pareamento criou,
        // senão o pareamento nunca completa (achado 25/08, caso da Borracharia).
        const eraPareamentoEmAndamento = pairingCodes.has(usuarioId);
        const timerAnterior = reconexoesPendentes.get(usuarioId);
        if (timerAnterior) clearTimeout(timerAnterior);
        reconexoesPendentes.set(usuarioId, setTimeout(() => {
          reconexoesPendentes.delete(usuarioId);
          connectToWhatsApp(usuarioId, undefined, undefined, eraPareamentoEmAndamento).catch(err => console.error("Erro no retry:", err));
        }, espera));
      }
    } else if (connection === 'open') {
      if (sessions.get(usuarioId) !== sock) {
        // Um socket que nao e mais o atual conseguiu abrir (corrida rara): encerra ele em
        // silencio pra nao derrubar o atual com 440.
        console.log(`[Baileys] Socket antigo do usuário ${usuarioId} abriu depois de substituído — encerrando ele.`);
        try { sock.end(undefined as any); } catch {}
        return;
      }
      const timerPendente = reconexoesPendentes.get(usuarioId);
      if (timerPendente) { clearTimeout(timerPendente); reconexoesPendentes.delete(usuarioId); }
      console.log(`[Baileys] Conexão aberta com sucesso! Servidor pronto para disparos do usuário ${usuarioId}.`);
      marcarConexaoEstavel(usuarioId); // so zera a espera se aguentar 60s conectado
      salvarBackupCredenciais(usuarioId); // guarda uma copia boa das credenciais
      // Conectou: não há mais QR nem código de pareamento pendentes. Sai da pausa
      // (se estava pausado para o pareamento) para as reconexões automáticas voltarem.
      connectedUsers.add(usuarioId);
      latestQR.delete(usuarioId);
      pairingCodes.delete(usuarioId);
      pausados.delete(usuarioId);
      getIo().to(usuarioId).emit('WHATSAPP_STATUS', { conectado: true });

      // Mantém o dispositivo web como "offline" para NÃO roubar as notificações do celular.
      // Assim as mensagens recebidas continuam aparecendo normalmente no telefone da pessoa.
      sock.sendPresenceUpdate('unavailable').catch(() => {});
      
      await prisma.usuario.update({
        where: { id: usuarioId },
        data: { whatsappConectado: true }
      }).catch(() => {});

      // Resolve os números reais dos chats @lid existentes (o mapeamento LID->PN já carregou).
      setTimeout(() => { backfillNumerosReais(usuarioId, sock).catch(() => {}); }, 8000);
    }
  });

  sock.ev.on('creds.update', saveCreds);

  // Captura os nomes dos contatos: mapa em memória (Caixa de Entrada) + tabela Contato
  // (busca do agendamento). O persistir roda em background pra não travar o evento.
  sock.ev.on('contacts.upsert', (contatos: any[]) => {
    for (const c of contatos || []) registrarNomeContato(c.id, c.name || c.notify || c.verifiedName);
    persistirContatosBaileys(usuarioId, contatos).catch(() => {});
  });
  sock.ev.on('contacts.update', (contatos: any[]) => {
    for (const c of contatos || []) registrarNomeContato(c.id, c.name || c.notify || c.verifiedName);
    persistirContatosBaileys(usuarioId, contatos).catch(() => {});
  });
  // Agenda inteira que chega no connect (sync de app-state): é aqui que vêm os nomes
  // reais de todos os contatos salvos — a fonte confiável, sem depender do navegador.
  sock.ev.on('messaging-history.set', (payload: any) => {
    const contatos = payload?.contacts;
    if (Array.isArray(contatos) && contatos.length) {
      for (const c of contatos) registrarNomeContato(c.id, c.name || c.notify || c.verifiedName);
      persistirContatosBaileys(usuarioId, contatos).catch(() => {});
    }
  });

  // Mensagens recebidas: detecta APAGADAS, armazena e faz auto-resposta
  sock.ev.on('messages.upsert', async (m) => {
    try {
      // APENAS processar se for uma mensagem chegando (notify)
      if (m.type !== 'notify') return;

      const msg = m.messages[0];
      if (!msg || !msg.message || !msg.key) return;

      const remoteJid = msg.key.remoteJid;
      // Achado 26/08: '@newsletter' (canais do WhatsApp) passava batido — so @g.us (grupo
      // classico) e status@broadcast eram bloqueados. O robo respondia dentro de um canal,
      // que nao e conversa privada com cliente nenhum.
      if (!remoteJid || remoteJid.includes('@g.us') || remoteJid.includes('status@broadcast') || remoteJid.includes('@newsletter')) return; // ignorar grupos, canais e status

      const numero = remoteJid.split('@')[0];
      if (!numero) return;

      // Uma mensagem enviada pelo celular ou painel significa que uma pessoa assumiu.
      // Nao pausa quando o proprio bot esta enviando as bolhas dele.
      // Marcado quando a mensagem de saida e do Assistente de IA da Meta (nao do nosso robo,
      // nem de atendente). Salvo como enviadoPorId = meta_ai: some do historico que o robo le
      // e aparece rotulado no painel.
      let ecoMetaAi = false;
      if (msg.key.fromMe && !waIdsBotIA.has(msg.key.id || '') && !chatsBotEnviando.has(`${usuarioId}:${remoteJid}`)) {
        const cfgBot = await prisma.usuario.findUnique({ where: { id: usuarioId }, select: { botIaAtivo: true } }).catch(() => null);
        // Marcado como 'eco_externo': e uma mensagem de saida que NAO foi o nosso robo.
        // Pode ser um atendente digitando no celular/extensao (ai pausar e certo) OU o eco
        // de um sistema externo escrevendo no mesmo numero (ai pausar silencia o robo a toa).
        // Contas com botIaPausaManualMin = 0 ignoram essa pausa — ver pausarConversaBotIA.
        const textoEco = extrairTextoMensagem(desembrulharMensagem(msg.message)) || '';
        if (cfgBot?.botIaAtivo) {
          if (ehEcoDoAgenteMeta(usuarioId, remoteJid, textoEco)) {
            console.log(`[Bot IA] Eco do assistente de IA da Meta em ${remoteJid} — NAO e humano assumindo, robo segue respondendo.`);
            ecoMetaAi = true;
            // Um eco anterior da Meta sem fingerprint pode ter pausado este chat por 10 min —
            // desfaz SO essa pausa automatica (pausa manual do painel/transferencia fica intacta).
            await prisma.botConversa.updateMany({ where: { usuarioId, chatJid: remoteJid, motivoPausa: 'eco_externo' }, data: { pausadoAte: null } }).catch(() => {});
          } else {
            await pausarConversaBotIA(usuarioId, remoteJid, undefined, 'eco_externo').catch(() => {});
          }
        }
      }

      // Enriquece a agenda com o NOME (pushName) de quem manda mensagem — assim a busca
      // do agendamento acha o número pelo nome mesmo sem re-sincronizar a agenda inteira,
      // e funciona nas sessões que já estão conectadas. Guarda evita bater no banco à toa.
      if (!msg.key.fromMe && msg.pushName && contatosNomes.get(remoteJid) !== msg.pushName) {
        registrarNomeContato(remoteJid, msg.pushName);
        persistirContatosBaileys(usuarioId, [{ id: remoteJid, notify: msg.pushName }]).catch(() => {});
      }

      // REVOKE (cliente apagou uma mensagem): apenas IGNORAMOS.
      // O recurso de "mensagens apagadas" foi REMOVIDO a pedido — não processamos,
      // não emitimos evento e não marcamos nada. Só evitamos salvar o REVOKE como mensagem.
      const protocolMsg = msg.message.protocolMessage;
      if (protocolMsg && protocolMsg.type === proto.Message.ProtocolMessage.Type.REVOKE) {
        return;
      }

      // ─── CAIXA DE ENTRADA: salva a mensagem (recebida E enviada) e avisa o painel ───
      // Desembrulha envelopes (temporária/visualização única/etc.) ANTES de classificar.
      const _conteudo = desembrulharMensagem(msg.message);

      // IGNORA mensagens de SISTEMA (não são conversa): aviso de "mensagens temporárias
      // ativadas" (protocolMessage), chaves de criptografia, sincronização de app.
      // Sem isso, elas eram salvas como tipo "outro" e poluíam a Caixa de Entrada.
      const TIPOS_SISTEMA = ['protocolMessage', 'senderKeyDistributionMessage', 'messageContextInfo', 'reactionMessage', 'pollUpdateMessage'];
      const chavesReais = Object.keys(_conteudo || {}).filter((k) => !TIPOS_SISTEMA.includes(k));
      if (chavesReais.length === 0) {
        return; // só continha ruído de sistema — não salva nem exibe
      }
      const _tipoMsg = tipoMensagem(_conteudo);
      const _textoMsg = extrairTextoMensagem(_conteudo) || '';
      const _anuncio = getAnuncio(_conteudo); // mensagem vinda de anúncio (Click-to-WhatsApp)
      let persistenciaInbox: Promise<void> = Promise.resolve();
      // Pula se já salvamos esta mensagem pelo envio da Caixa de Entrada (evita duplicar)
      if ((_textoMsg || _tipoMsg !== 'texto' || _anuncio) && !(msg.key.id && waIdsRecentes.has(msg.key.id))) {
        persistenciaInbox = (async () => {
          let midiaUrl: string | null = null;
          let textoSalvar = _textoMsg;
          let tipoSalvar = _tipoMsg;
          if (_anuncio) {
            // Veio de anúncio: salva a FOTO do anúncio e rotula a mensagem
            midiaUrl = await salvarFotoAnuncio(_anuncio);
            if (midiaUrl) tipoSalvar = 'imagem';
            const titulo = _anuncio.title || _anuncio.body || 'Anúncio';
            textoSalvar = `📢 [Anúncio] ${titulo}` + (_textoMsg ? `\n\n${_textoMsg}` : '');
          } else if (['imagem', 'video', 'audio', 'documento', 'figurinha'].includes(_tipoMsg)) {
            // Baixa usando o conteúdo já DESEMBRULHADO (senão viewOnce/temporária falha)
            midiaUrl = await baixarMidia(sock, { ...msg, message: _conteudo }, _tipoMsg, msg.key.id || '');
          } else if (_tipoMsg === 'outro' && !textoSalvar) {
            // Último recurso: salva o NOME do tipo cru pra pelo menos identificar o que veio
            textoSalvar = Object.keys(_conteudo || {}).filter((k) => k !== 'messageContextInfo')[0] || '';
          }
          // Resolve o número REAL do contato (mesmo quando o chat é @lid)
          const numeroReal = await resolverNumeroReal(sock, msg, remoteJid);
          try {
            const salva = await prisma.mensagem.create({
              data: {
                usuarioId,
                chatJid: remoteJid,
                // pushName só vale para mensagens RECEBIDAS (é o nome do contato). Nas ENVIADAS,
                // o pushName é o NOSSO próprio nome — então usamos só o contato salvo (ou vazio).
                chatNome: msg.key.fromMe
                  ? (contatosNomes.get(remoteJid) || '')
                  : (msg.pushName || contatosNomes.get(remoteJid) || ''),
                fromMe: !!msg.key.fromMe,
                texto: textoSalvar,
                tipo: tipoSalvar,
                midiaUrl,
                waId: msg.key.id || null,
                numeroReal: numeroReal || null,
                enviadoPorId: ecoMetaAi ? 'meta_ai' : null
              }
            });
            getIo().to(usuarioId).emit('NOVA_MENSAGEM', salva);
          } catch (e: any) {
            console.error('[Inbox] Erro ao salvar mensagem:', e?.message);
          }
        })().catch((e: any) => {
          console.error('[Inbox] Erro ao preparar mensagem:', e?.message || e);
        });
      }

      // Daqui pra frente só interessam mensagens RECEBIDAS (não as enviadas por nós)
      if (msg.key.fromMe) return;

      // ─── 2. ARMAZENA a mensagem recebida (para o caso de ser apagada depois) ───
      const textoRecebido = extrairTextoMensagem(_conteudo);
      if (textoRecebido && msg.key.id) {
        armazenarMensagemRecente(msg.key.id, {
          usuarioId,
          numero,
          nome: msg.pushName || '',
          texto: textoRecebido,
          timestamp: Date.now()
        });
      }

      // ─── 3. AUTO-RESPOSTA (recepção) — regra de SILÊNCIO (não é mais "1x para sempre") ───
      const numeroRecep = (await resolverNumeroReal(sock, msg, remoteJid)) || numero;
      const usuario = await prisma.usuario.findUnique({ where: { id: usuarioId } });

      // O bot conversa em todos os turnos. A trava de uma saudacao por dia abaixo
      // pertence somente a recepcao fixa antiga.
      if (usuario?.botIaAtivo && msg.key.id) {
        await persistenciaInbox;
        await agendarRespostaBotIA({
          usuarioId,
          chatJid: remoteJid,
          waId: msg.key.id,
          enviarParte: (texto, tempo) => enviarParteBotIA(usuarioId, remoteJid, numeroRecep, texto, tempo),
          enviarVideo: (video, tempo) => enviarMidiaBotIA(usuarioId, remoteJid, numeroRecep, video as MidiaBotIA, tempo),
          enviarLocalizacao: (lat, lng, nome, endereco, foto) => enviarLocalizacaoBotIA(usuarioId, remoteJid, numeroRecep, lat, lng, nome, endereco, foto),
          etiquetar: (etiqueta) => etiquetarChatBotIA(usuarioId, remoteJid, etiqueta),
          // Achado 18/09: usado so pra decidir o TAMANHO da espera do debounce
          // (caso real do Gustavo Souza — imagem do anuncio sem medida na legenda
          // pede mais tempo antes do bot responder).
          ultimoTipo: _tipoMsg,
          ultimoTextoTemMedida: /\d{3}\s*[\/\-]\s*\d{2}/.test(_textoMsg),
        });
        return;
      }
      // Considera TODAS as formas que o contato pode ter sido salvo (número real OU @lid cru)
      const chavesDedup = Array.from(new Set([numeroRecep, numero].filter(Boolean)));
      const hojeBR = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
      // Trava pelo TELEFONE da sessão (não pelo usuarioId): quando 2 atendentes têm
      // sessão própria no MESMO chip (Ana/Marina), a mesma mensagem chega nas duas e
      // cada uma respondia — o cliente recebia a saudação em DOBRO. Com a chave pelo
      // número, a primeira sessão que responder trava a outra (mesmo processo).
      const meuNumero = numeroDaSessao(sock) || usuarioId;
      const memKeys = chavesDedup.map(k => `${meuNumero}_${k}_${hojeBR}`);

      // Trava rápida em memória: já saiu auto-resposta pra esse contato nas últimas 24h?
      const agoraMs = Date.now();
      if (memKeys.some(mk => ultimaAutoMem.has(mk))) return;
      // RESERVA IMEDIATA (anti-corrida): o cliente costuma mandar várias mensagens juntas
      // (texto + áudio + áudio) e cada uma é um evento separado. As checagens abaixo usam
      // 'await' (banco), então dois eventos passavam pela trava acima AO MESMO TEMPO e os
      // DOIS enviavam a saudação. Marcamos AQUI, de forma síncrona (sem await no meio): o
      // segundo evento já encontra a trava e sai. Se não enviarmos (erro de banco), a
      // reserva é desfeita mais abaixo para permitir nova tentativa.
      memKeys.forEach(mk => ultimaAutoMem.set(mk, agoraMs));

      if (!usuario || !usuario.autoRespostaAtiva || !usuario.autoRespostaMensagem) {
        memKeys.forEach(mk => ultimaAutoMem.delete(mk)); // sem auto-resposta configurada: libera a reserva
        return;
      }

      try {
        // Conversa recente? Qualquer mensagem (enviada OU recebida) dentro da janela de
        // silêncio bloqueia a saudação. IMPORTANTE: ignoramos os últimos 45s — a mensagem
        // que ACABOU de chegar (e mídias, que são salvas com atraso por causa do download)
        // não podem contar como "conversa anterior", senão a 1ª mensagem de áudio/figurinha
        // bloqueava a própria saudação. O "enviar só 1x" é garantido pelo autoReplyHistory abaixo.
        // Regra: 1x POR DIA (calendario, fuso BR). A checagem do "ja respondeu hoje" esta abaixo.

        // Trava persistente (sobrevive a reinício): última auto-resposta < 24h?
        // Considera TAMBÉM os outros usuários com sessão no MESMO telefone (Ana/Marina):
        // se a sessão da outra já saudou este contato hoje, esta NÃO sauda de novo.
        const idsMesmoNumero = usuariosComSessaoNoMesmoNumero(usuarioId, meuNumero);
        const ultimaAuto = await prisma.autoReplyHistory.findFirst({
          where: { usuarioId: { in: idsMesmoNumero }, numero: { in: chavesDedup } },
          orderBy: { criadoEm: 'desc' }
        });
        if (ultimaAuto) {
          const ultimaBR = new Date(ultimaAuto.criadoEm.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
          if (ultimaBR === hojeBR) { memKeys.forEach(mk => ultimaAutoMem.set(mk, ultimaAuto.criadoEm.getTime())); return; }
        }

        // Registra ANTES de enviar (contra corridas/reinícios)
        await prisma.autoReplyHistory.upsert({
          where: { usuarioId_numero: { usuarioId, numero: numeroRecep } },
          update: { criadoEm: new Date() },
          create: { usuarioId, numero: numeroRecep }
        });
      } catch (e: any) {
        // Banco indisponível → NÃO envia (antes, o erro deixava enviar repetido).
        console.error('[Baileys] Auto-resposta pulada por erro no banco:', e?.message);
        memKeys.forEach(mk => ultimaAutoMem.delete(mk)); // desfaz a reserva: permite nova tentativa depois
        return;
      }
      memKeys.forEach(mk => ultimaAutoMem.set(mk, agoraMs));
      console.log(`[Baileys] Enviando auto-resposta (silêncio > ${SILENCIO_HORAS}h) para ${numeroRecep} (Usuário: ${usuarioId})`);

      try {
        const enviadaAuto = await sock.sendMessage(remoteJid, { text: usuario.autoRespostaMensagem });
        // Mostra a recepção também na Caixa de Entrada do painel (o sendMessage não dispara captura)
        try {
          const waIdAuto = enviadaAuto?.key?.id || null;
          lembrarWaId(waIdAuto);
          const salvaAuto = await prisma.mensagem.create({
            data: {
              usuarioId, chatJid: remoteJid, chatNome: '', fromMe: true,
              texto: usuario.autoRespostaMensagem, tipo: 'texto', waId: waIdAuto,
              numeroReal: numeroRecep || null
            }
          });
          getIo().to(usuarioId).emit('NOVA_MENSAGEM', salvaAuto);
        } catch (e) { console.error('[Inbox] Erro ao salvar auto-resposta na inbox:', (e as any)?.message); }
      } catch (e) {
        console.error("Erro ao enviar auto-reply:", e);
        // Se falhar o envio, libera para tentar de novo depois (memória + banco)
        memKeys.forEach(mk => ultimaAutoMem.delete(mk));
        await prisma.autoReplyHistory.delete({ where: { usuarioId_numero: { usuarioId, numero: numeroRecep } } }).catch(() => {});
      }

    } catch (err) {
      console.error(`[Baileys] Erro no processamento de auto-resposta (Usuário: ${usuarioId}):`, err);
    }
  });
}

// Função usada pelo worker para enviar mensagens diretamente simulando ser humano.
// `midia` (opcional): anexa foto/vídeo/áudio/documento. Sem midia = texto puro (padrão).
export async function enviarMensagem(
  usuarioId: string,
  numero: string,
  mensagem: string,
  midia?: { tipo: string; caminho: string; nome?: string | null }
): Promise<boolean> {
  const sock = sessions.get(usuarioId);
  
  if (!sock) {
    console.error(`[Baileys] Falha: WhatsApp não está conectado para o usuário ${usuarioId}!`);
    return false;
  }

  try {
    // Se já vier um JID completo (ex.: @lid, @s.whatsapp.net, @c.us), usa direto — assim
    // o agendamento entrega para QUALQUER contato (igual o chat da Caixa de Entrada).
    let jid = numero.includes('@') ? numero.replace('@c.us', '@s.whatsapp.net') : `${numero}@s.whatsapp.net`;

    // VALIDAÇÃO ANTI-FALSO-POSITIVO: sendMessage NÃO dá erro para número sem WhatsApp
    // (ou com a sessão instável) — ele "envia pro vazio" e a mensagem some, mas antes
    // isso era marcado como ENVIADO. Aqui confirmamos que o número existe no WhatsApp e
    // pegamos o JID canônico. Se não existir, ou a checagem falhar, retornamos FALHA —
    // nunca marcamos "enviado" sem confirmar que dava pra entregar.
    if (!numero.includes('@')) {
      try {
        const resultados = await sock.onWhatsApp(numero);
        const info = resultados?.[0];
        if (!info?.exists) {
          console.error(`[Baileys] ❌ Número ${numero} não tem WhatsApp — marcando como FALHA (não foi entregue).`);
          return false;
        }
        jid = info.jid;
      } catch (e) {
        console.error(`[Baileys] ❌ Não consegui verificar o WhatsApp de ${numero} (sessão instável?) — marcando como FALHA:`, e);
        return false;
      }
    }

    // 1. Simula que a pessoa entrou no chat e está online
    await sock.sendPresenceUpdate('available', jid);
    await delay(1000);
    
    // 2. Simula que a pessoa está "Digitando..."
    console.log(`[Baileys] Simulando "Digitando..." para ${numero} (Usuário: ${usuarioId})`);
    await sock.sendPresenceUpdate('composing', jid);
    
    // Atraso artificial de 3 a 5 segundos enquanto "digita"
    const tempoDigitacao = Math.floor(Math.random() * 2000) + 3000;
    await delay(tempoDigitacao);
    
    // Para de aparecer "digitando"
    await sock.sendPresenceUpdate('paused', jid);

    // 3. Envia a mensagem — e confirma que o Baileys aceitou (retornou uma key).
    // Com mídia: manda o arquivo (foto/vídeo com legenda; áudio como voz/PTT e documento
    // com o texto em mensagem separada, pois o WhatsApp não aceita legenda nesses).
    let enviado: any;
    const temMidia = !!(midia && midia.tipo && midia.tipo !== 'texto' && midia.caminho);
    if (temMidia) {
      const fsM = require('fs');
      const pathM = require('path');
      const abs = pathM.join(__dirname, '../../public', String(midia!.caminho));
      let buffer: Buffer;
      try {
        buffer = fsM.readFileSync(abs);
      } catch (e) {
        console.error(`[Baileys] ❌ Mídia do agendamento não encontrada (${abs}) — FALHA:`, e);
        return false;
      }
      const legenda = mensagem && mensagem.trim() ? mensagem : '';
      const ext = String(midia!.caminho.split('.').pop() || '').toLowerCase();
      // Monta o conteúdo com `as any`: o tipo AnyMessageContent do Baileys com
      // exactOptionalPropertyTypes rejeita `caption: undefined` — por isso omitimos o
      // caption quando não há legenda (adicionamos só se tiver texto).
      if (midia!.tipo === 'imagem') {
        const c: any = { image: buffer };
        if (legenda) c.caption = legenda;
        enviado = await sock.sendMessage(jid, c);
      } else if (midia!.tipo === 'video') {
        const c: any = { video: buffer };
        if (legenda) c.caption = legenda;
        enviado = await sock.sendMessage(jid, c);
      } else if (midia!.tipo === 'audio') {
        const mime = ext === 'mp3' ? 'audio/mpeg' : (ext === 'm4a' || ext === 'mp4') ? 'audio/mp4' : 'audio/ogg; codecs=opus';
        enviado = await sock.sendMessage(jid, { audio: buffer, mimetype: mime, ptt: true } as any);
        if (legenda) await sock.sendMessage(jid, { text: legenda }).catch(() => {});
      } else if (midia!.tipo === 'documento') {
        const mime = ext === 'pdf' ? 'application/pdf' : 'application/octet-stream';
        enviado = await sock.sendMessage(jid, { document: buffer, fileName: (midia!.nome || `arquivo.${ext}`), mimetype: mime } as any);
        if (legenda) await sock.sendMessage(jid, { text: legenda }).catch(() => {});
      } else {
        enviado = await sock.sendMessage(jid, { text: mensagem });
      }
    } else {
      enviado = await sock.sendMessage(jid, { text: mensagem });
    }
    if (!enviado?.key?.id) {
      console.error(`[Baileys] ❌ sendMessage não retornou confirmação para ${numero} — marcando como FALHA.`);
      return false;
    }
    console.log(`[Baileys] 🚀 Mensagem enviada com sucesso para ${numero} pelo usuário ${usuarioId}`);

    // 4. CRÍTICO: volta a presença para "offline" (unavailable).
    // Se o web ficar marcado como "online", o WhatsApp passa a entregar as mensagens
    // RECEBIDAS apenas no web, e elas "somem" do celular. Liberar a presença aqui
    // devolve as notificações ao telefone da pessoa.
    await comLimiteDeTempo(sock.sendPresenceUpdate('unavailable'), 10_000, 'presence').catch(() => {});
    return true;
  } catch (error) {
    console.error(`[Baileys] ❌ Erro ao enviar mensagem para ${numero} pelo usuário ${usuarioId}:`, error);
    return false;
  }
}

// Envia uma mensagem pela Caixa de Entrada (resposta interativa a um JID específico).
// Mais rápida que enviarMensagem (sem o delay longo de "digitando"), porque é o
// atendente conversando em tempo real, não um disparo em massa.
// Dispara o ROBO pra responder uma conversa AGORA, sob demanda (acao do painel).
// Reaproveita exatamente o mesmo caminho das respostas automaticas — inclusive a
// marcacao 'bot', a quebra em varias mensagens e as regras de preco. Criado em 01/09,
// quando conversas ficaram sem resposta por causa de uma pausa indevida e nao havia
// jeito de mandar o robo retomar sem o cliente escrever de novo.
export async function dispararRespostaBotAgora(usuarioId: string, chatJid: string): Promise<boolean> {
  const efetivoId = await resolverConexaoEfetiva(usuarioId);
  // Espera ate ~60s por uma conexao (tempestade de conflitos abre janelas curtas) em vez
  // de falhar na hora — o botao "Responder agora" do painel vinha falhando 14x seguidas.
  const sock = await aguardarSocketBotIA(efetivoId, 12, 5000);
  if (!sock) {
    console.error(`[Bot IA] responderAgora: WhatsApp nao conectado (${efetivoId}).`);
    return false;
  }

  // Precisa da ultima mensagem RECEBIDA — e ela que o robo vai responder.
  const ultimaEntrada = await prisma.mensagem.findFirst({
    where: { usuarioId, chatJid, fromMe: false },
    orderBy: { timestamp: 'desc' },
    select: { waId: true, numeroReal: true },
  });
  if (!ultimaEntrada?.waId) {
    console.error(`[Bot IA] responderAgora: nenhuma mensagem do cliente em ${chatJid}.`);
    return false;
  }

  const numeroReal = ultimaEntrada.numeroReal || chatJid.split('@')[0] || '';
  await agendarRespostaBotIA({
    usuarioId,
    chatJid,
    waId: ultimaEntrada.waId,
    enviarParte: (texto, tempo) => enviarParteBotIA(efetivoId, chatJid, numeroReal, texto, tempo),
    enviarVideo: (video, tempo) => enviarMidiaBotIA(efetivoId, chatJid, numeroReal, video as MidiaBotIA, tempo),
    enviarLocalizacao: (lat, lng, nome, endereco, foto) => enviarLocalizacaoBotIA(efetivoId, chatJid, numeroReal, lat, lng, nome, endereco, foto),
    etiquetar: (etiqueta) => etiquetarChatBotIA(efetivoId, chatJid, etiqueta),
  });
  console.log(`[Bot IA] responderAgora: robo acionado para ${chatJid}.`);
  return true;
}

// Apaga uma mensagem PARA TODOS no WhatsApp — o mesmo "apagar para todos" do app.
// Some do aparelho do cliente tambem. So funciona em mensagem que a LOJA enviou e
// dentro da janela que o WhatsApp permite; fora disso o proprio WhatsApp ignora.
// Edita uma mensagem JA ENVIADA, igual ao "editar" do WhatsApp. O texto novo troca
// o antigo no aparelho do cliente e o app mostra a marca de editada. Regras que sao
// do WhatsApp, nao nossas: so mensagem de TEXTO, so as que a loja enviou, e so
// dentro de ~15 minutos. Fora disso o proprio WhatsApp recusa.
export async function editarMensagemWhatsApp(usuarioId: string, chatJid: string, waId: string, textoNovo: string): Promise<boolean> {
  const efetivoId = await resolverConexaoEfetiva(usuarioId);
  const sock = sessions.get(efetivoId);
  if (!sock) {
    console.error(`[Editar] WhatsApp nao conectado (${efetivoId}).`);
    return false;
  }
  try {
    const enviada = await (sock as any).sendMessage(chatJid, {
      text: textoNovo,
      edit: { remoteJid: chatJid, fromMe: true, id: waId, participant: undefined },
    });
    lembrarWaId(enviada?.key?.id);
    console.log(`[Editar] Mensagem ${waId} editada em ${chatJid}.`);
    return true;
  } catch (e: any) {
    console.error('[Editar] Falha ao editar no WhatsApp:', e?.message || e);
    return false;
  }
}

export async function apagarMensagemParaTodos(usuarioId: string, chatJid: string, waId: string, fromMe: boolean): Promise<boolean> {
  const efetivoId = await resolverConexaoEfetiva(usuarioId);
  const sock = sessions.get(efetivoId);
  if (!sock) {
    console.error(`[Apagar] WhatsApp nao conectado (${efetivoId}).`);
    return false;
  }
  try {
    await (sock as any).sendMessage(chatJid, {
      delete: { remoteJid: chatJid, fromMe, id: waId, participant: undefined },
    });
    console.log(`[Apagar] Mensagem ${waId} apagada para todos em ${chatJid}.`);
    return true;
  } catch (e: any) {
    console.error('[Apagar] Falha ao apagar no WhatsApp:', e?.message || e);
    return false;
  }
}

// Achado 04/09 em conversa real: um atendente colou uma tabela de preco inteira numa
// unica mensagem gigante, com espacamento estranho (texto copiado de planilha/PDF) —
// chegou pro cliente como um muro de texto. O robo ja quebra as proprias respostas em
// varias mensagens; agora o painel faz o mesmo pro que o ATENDENTE digita/cola.
// So mexe em texto realmente longo — mensagem curta normal passa direto, sem split.
const LIMITE_SEM_QUEBRAR = 320;
const MAX_PARTES = 5; // trava contra colar um documento inteiro e virar spam

function quebrarMensagemLonga(texto: string): string[] {
  const limpo = String(texto || '').replace(/[ \t]+\n/g, '\n').trim();
  if (limpo.length <= LIMITE_SEM_QUEBRAR && !/\n{2,}/.test(limpo)) return [limpo];

  // 1) quebra primeiro nos paragrafos (linha em branco)
  let partes = limpo.split(/\n{2,}/).map((p) => p.replace(/\s+/g, ' ').trim()).filter(Boolean);

  // 2) qualquer parte que ainda ficou grande, quebra por frase (". ", "! ", "? ")
  const resultado: string[] = [];
  for (const parte of partes) {
    if (parte.length <= LIMITE_SEM_QUEBRAR) { resultado.push(parte); continue; }
    const frases = parte.split(/(?<=[.!?])\s+(?=[A-ZÀ-Ú0-9])/);
    let atual = '';
    for (const frase of frases) {
      const tentativa = atual ? atual + ' ' + frase : frase;
      if (tentativa.length > LIMITE_SEM_QUEBRAR && atual) {
        resultado.push(atual.trim());
        atual = frase;
      } else {
        atual = tentativa;
      }
    }
    if (atual.trim()) resultado.push(atual.trim());
  }

  // 3) trava de seguranca: nunca manda mais que MAX_PARTES mensagens separadas —
  //    junta o resto na ultima pra nao virar uma enxurrada.
  if (resultado.length > MAX_PARTES) {
    const inicio = resultado.slice(0, MAX_PARTES - 1);
    const resto = resultado.slice(MAX_PARTES - 1).join(' ');
    return [...inicio, resto];
  }
  return resultado.length ? resultado : [limpo];
}

export async function enviarMensagemInbox(usuarioId: string, jid: string, texto: string, enviadoPorId?: string): Promise<boolean> {
  const sock = sessions.get(usuarioId);
  if (!sock) {
    console.error(`[Inbox] WhatsApp não conectado para o usuário ${usuarioId}.`);
    return false;
  }
  await pausarConversaBotIA(usuarioId, jid).catch(() => {});
  // Assinatura do PAINEL CRM (separada da extensão). Regras:
  //  - assinaturaPainel definida e não-vazia  -> usa ela: *assinatura:* texto
  //  - assinaturaPainel definida e vazia ("")  -> sem assinatura
  //  - assinaturaPainel não definida (null)    -> padrão: *nome do atendente:* texto
  // Por padrão assina com o DONO da conexão (usuarioId = efetivoId, dono da sessão do
  // WhatsApp). EXCEÇÃO pedida pelo dono do CRM: se quem de fato mandou (enviadoPorId) é
  // um GERENTE numa caixa compartilhada, assina com o nome DELE — não com o nome do dono
  // cujo número está sendo usado. Admin/master e demais papéis continuam assinando como
  // o dono da conexão (comportamento antigo, mantido de propósito).
  let prefixoAssinatura = ''; // vai so na PRIMEIRA parte, se a mensagem for quebrada
  try {
    const dono = await prisma.usuario.findUnique({ where: { id: usuarioId } });

    // Quem de fato escreveu. Quando e uma PESSOA diferente do dono da conexao, ela
    // assina com o proprio nome — o cliente precisa saber com quem esta falando.
    let remetente = null as typeof dono;
    if (enviadoPorId && enviadoPorId !== usuarioId) {
      remetente = await prisma.usuario.findUnique({ where: { id: enviadoPorId } });
    }
    const respondeuOutraPessoa = !!remetente && remetente.role !== 'master' && remetente.role !== 'admin';

    // Achado 02/09: assinaturaPainel = "" (vazia, nao nula) no DONO DA CONEXAO quer
    // dizer "este numero nao assina sozinho". Serve pro numero do robo, onde
    // "*Borracharia*" na frente de cada mensagem so poluia. MAS quando uma pessoa
    // assume a conversa, ela assina com o nome dela mesmo assim — senao o cliente
    // nao percebe que passou a falar com um humano.
    const numeroNaoAssina = dono?.assinaturaPainel !== null && dono?.assinaturaPainel !== undefined && String(dono.assinaturaPainel).trim() === '';

    if (!numeroNaoAssina || respondeuOutraPessoa) {
      const u = respondeuOutraPessoa ? remetente : dono;
      if (u) {
        if (u.assinaturaPainel !== null && u.assinaturaPainel !== undefined) {
          const a = String(u.assinaturaPainel).trim();
          prefixoAssinatura = a ? `*${a}*\n` : '';
        } else if (u.nome) {
          prefixoAssinatura = `*${String(u.nome).trim()}*\n`;
        }
      }
    }
  } catch (e) {}

  try {
    // Achado 04/09: mensagem muito longa (ex.: atendente colando uma tabela de preco
    // inteira) chegava pro cliente como um muro de texto so. Quebra em varias mensagens
    // menores, do jeito que uma pessoa mandaria pelo WhatsApp de verdade.
    const partes = quebrarMensagemLonga(texto);
    let ultimaEnviada: any = null;
    for (let i = 0; i < partes.length; i++) {
      const textoParte = (i === 0 ? prefixoAssinatura : '') + partes[i];
      await sock.sendPresenceUpdate('composing', jid).catch(() => {});
      await delay(i === 0 ? 700 : 500 + Math.min(textoParte.length * 12, 1800));
      const enviada = await sock.sendMessage(jid, { text: textoParte });
      ultimaEnviada = enviada;

      try {
        const waId = enviada?.key?.id || null;
        lembrarWaId(waId);
        const salva = await prisma.mensagem.create({
          data: { usuarioId, chatJid: jid, chatNome: '', fromMe: true, texto: textoParte, tipo: 'texto', waId, enviadoPorId: enviadoPorId || null }
        });
        getIo().to(usuarioId).emit('NOVA_MENSAGEM', salva);
      } catch (e) {
        console.error('[Inbox] Erro ao salvar mensagem enviada:', e);
      }
    }

    // volta a "offline" para não roubar as notificações do celular
    await comLimiteDeTempo(sock.sendPresenceUpdate('unavailable'), 10_000, 'presence').catch(() => {});
    return true;
  } catch (e) {
    console.error('[Inbox] Erro ao enviar mensagem:', e);
    return false;
  }
}

// Envia uma MÍDIA (foto, vídeo, áudio ou documento) pela Caixa de Entrada.
// O navegador grava audio em WEBM/Opus (Chrome no Windows), mas o WhatsApp so toca
// audio de voz (ptt) em OGG/Opus. O codigo antigo mandava o webm cru rotulado como
// "audio/ogg" — o WhatsApp aceitava a mensagem mas o audio nao tocava (achado 01/09).
// Aqui convertemos de verdade com ffmpeg antes de enviar. Se a conversao falhar,
// devolvemos null e o chamador avisa em vez de mandar um audio quebrado.
async function converterParaOpus(buffer: Buffer): Promise<Buffer | null> {
  const { spawn } = require('child_process');
  return new Promise((resolve) => {
    try {
      const ff = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', 'pipe:0', '-vn', '-c:a', 'libopus', '-b:a', '32k', '-ar', '48000', '-ac', '1', '-f', 'ogg', 'pipe:1']);
      const partes: Buffer[] = [];
      let erro = '';
      ff.stdout.on('data', (d: Buffer) => partes.push(d));
      ff.stderr.on('data', (d: Buffer) => { erro += d.toString(); });
      ff.on('error', (e: any) => { console.error('[Midia] ffmpeg indisponivel:', e?.message); resolve(null); });
      ff.on('close', (code: number) => {
        if (code !== 0 || !partes.length) {
          console.error('[Midia] Falha ao converter audio (ffmpeg saiu com', code, '):', erro.slice(0, 300));
          resolve(null);
          return;
        }
        resolve(Buffer.concat(partes));
      });
      ff.stdin.on('error', () => {});
      ff.stdin.end(buffer);
    } catch (e: any) { console.error('[Midia] Erro ao chamar ffmpeg:', e?.message); resolve(null); }
  });
}

export async function enviarMidiaInbox(usuarioId: string, jid: string, base64: string, mimetype: string, tipo: string, legenda?: string, enviadoPorId?: string): Promise<boolean> {
  const sock = sessions.get(usuarioId);
  if (!sock) {
    console.error(`[Inbox] WhatsApp não conectado para o usuário ${usuarioId}.`);
    return false;
  }
  await pausarConversaBotIA(usuarioId, jid).catch(() => {});
  try {
    const buffer = Buffer.from(base64, 'base64');
    let conteudo: any;
    // Guarda o audio JA CONVERTIDO fora do if, pra reusar quando salvar no disco
    // logo abaixo — achado 04/09: o disco salvava o buffer CRU (webm do navegador)
    // com extensao .ogg, deixando nosso proprio historico com o container errado,
    // mesmo o audio de fato ENVIADO ao cliente estando certo.
    let audioConvertido: Buffer | null = null;
    if (tipo === 'imagem') conteudo = { image: buffer, caption: legenda || undefined };
    else if (tipo === 'video') conteudo = { video: buffer, caption: legenda || undefined };
    else if (tipo === 'audio') {
      // Converte pra OGG/Opus de verdade — sem isso o audio chega mudo no WhatsApp.
      audioConvertido = await converterParaOpus(buffer);
      if (!audioConvertido) {
        console.error('[Midia] Audio nao pode ser convertido — envio cancelado.');
        return false;
      }
      conteudo = { audio: audioConvertido, mimetype: 'audio/ogg; codecs=opus', ptt: true };
    }
    else conteudo = { document: buffer, mimetype: mimetype || 'application/octet-stream', fileName: 'arquivo' };

    await sock.sendPresenceUpdate('composing', jid).catch(() => {});
    const enviada = await sock.sendMessage(jid, conteudo);
    await comLimiteDeTempo(sock.sendPresenceUpdate('unavailable'), 10_000, 'presence').catch(() => {});

    // Salva a mídia localmente para exibir no painel
    const ext = EXT_POR_TIPO[tipo] || 'bin';
    const nome = `out_${(enviada?.key?.id || 'm').replace(/[^a-zA-Z0-9]/g, '')}_${Math.floor(Math.random() * 1000000)}.${ext}`;
    let midiaUrl: string | null = null;
    // Pra audio, salva o buffer JA CONVERTIDO que foi de fato transmitido — nao o webm
    // cru do navegador (a variavel "buffer" original).
    const bufferParaSalvar = tipo === 'audio' && audioConvertido ? audioConvertido : buffer;
    try { fs.writeFileSync(path.join(MIDIAS_DIR, nome), bufferParaSalvar); midiaUrl = `/midias/${nome}`; } catch (e) {}

    const waId = enviada?.key?.id || null;
    lembrarWaId(waId);
    const salva = await prisma.mensagem.create({
      data: { usuarioId, chatJid: jid, chatNome: '', fromMe: true, texto: legenda || '', tipo, midiaUrl, waId, enviadoPorId: enviadoPorId || null }
    });
    getIo().to(usuarioId).emit('NOVA_MENSAGEM', salva);
    return true;
  } catch (e) {
    console.error('[Inbox] Erro ao enviar mídia:', e);
    return false;
  }
}

// Função para deslogar e limpar sessão do usuário
export async function logoutWhatsApp(usuarioId: string) {
  const sock = sessions.get(usuarioId);
  if (sock) {
    try { await sock.logout(); } catch (e) {}
    sessions.delete(usuarioId);
  }
  connectedUsers.delete(usuarioId);
  pairingCodes.delete(usuarioId);

  const fs = require('fs');
  const dir = path.join(__dirname, `../../../prisma/auth_info_baileys_${usuarioId}`);
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }

  await prisma.usuario.update({ where: { id: usuarioId }, data: { whatsappConectado: false } }).catch(()=>{});
  getIo().to(usuarioId).emit('WHATSAPP_STATUS', { conectado: false });
}

// PAUSA a conexão de um atendente: derruba o socket, para de gerar QR e de
// reconectar até ser retomado. Não apaga credenciais (retomar reconecta sozinho).
export async function pausarWhatsApp(usuarioId: string) {
  pausados.add(usuarioId);
  const sock = sessions.get(usuarioId);
  if (sock) { try { sock.end(undefined as any); } catch (e) {} }
  sessions.delete(usuarioId);
  latestQR.delete(usuarioId);
  pairingCodes.delete(usuarioId);
  // Persiste no banco: sem isso, um restart do servidor esquecia a pausa (o Set
  // é só memória) e o vigia voltava a gerar QR sozinho minutos depois.
  await prisma.usuario.update({ where: { id: usuarioId }, data: { whatsappPausado: true } }).catch(() => {});
  getIo().to(usuarioId).emit('WHATSAPP_STATUS', { conectado: false, pausado: true });
  console.log(`[Baileys] Conexão do usuário ${usuarioId} PAUSADA.`);
}

// RETOMA a conexão de um atendente pausado e tenta conectar de novo.
export async function retomarWhatsApp(usuarioId: string) {
  pausados.delete(usuarioId);
  await prisma.usuario.update({ where: { id: usuarioId }, data: { whatsappPausado: false } }).catch(() => {});
  console.log(`[Baileys] Conexão do usuário ${usuarioId} RETOMADA.`);
  // permitirQrNovo:true — sem isso, quem nunca pareou (state.creds.registered
  // ausente) cai direto no "aguardando solicitação manual de QR/código" e NADA é
  // gerado: nem QR, nem código. Retomar É o pedido manual; tem que valer.
  await connectToWhatsApp(usuarioId, undefined, undefined, true).catch(() => {});
}

// Compatibilidade com pontos antigos do backend que ainda importam este nome.
export async function liberarParaPareamento(usuarioId: string) {
  await retomarWhatsApp(usuarioId);
}

// Carrega do banco quem estava pausado ANTES do restart, repovoando o Set em
// memória. Chamado uma vez no boot do servidor (server.ts).
export async function carregarPausadosDoBanco() {
  try {
    const pausadosNoBanco = await prisma.usuario.findMany({ where: { whatsappPausado: true }, select: { id: true } });
    for (const u of pausadosNoBanco) pausados.add(u.id);
    if (pausadosNoBanco.length > 0) {
      console.log(`[Baileys] ${pausadosNoBanco.length} usuário(s) carregado(s) como PAUSADO(S) do banco (sobrevive a restart).`);
    }
  } catch (e) { console.error('[Baileys] Erro ao carregar pausados do banco:', e); }
}

// Pareamento manual (QR/código) pedido no MEIO de uma conexão em andamento: sem esperar, a chamada manual era
// ignorada pela trava conectandoAgora e o atendente ficava sem QR (revisão 24/09).
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function esperarTravaLivre(usuarioId: string, limiteMs = 15000): Promise<boolean> {
  const fim = Date.now() + limiteMs;
  while (conectandoAgora.has(usuarioId) && Date.now() < fim) await dormir(200);
  return !conectandoAgora.has(usuarioId);
}
// Espera a conexão em andamento terminar. A reconexão automática vê a pausa e desiste; a da extensão/boot (fura a
// pausa) pode terminar criando um socket com credencial pareada — aí espera o 'open' (até 8s), senão a checagem
// "já está conectado" logo depois nunca valeria e o fluxo manual apagaria a credencial de quem estava voltando.
// Só devolve true com a trava LIVRE naquele instante; quem chama reserva a trava na sequência, sem await no meio.
async function esperarConexaoEmAndamento(usuarioId: string): Promise<boolean> {
  // O prazo do 'open' só começa quando o socket pareado aparece (a espera pela trava pode levar até ~8s antes).
  let fimOpen = 0;
  for (;;) {
    if (!(await esperarTravaLivre(usuarioId))) return false;
    const s: any = sessions.get(usuarioId);
    const aindaAbrindo = !!s && !connectedUsers.has(usuarioId) && sessaoJaPareada(s.authState?.creds);
    if (aindaAbrindo && !fimOpen) fimOpen = Date.now() + 8000;
    if (!aindaAbrindo || Date.now() >= fimOpen) return !conectandoAgora.has(usuarioId);
    await dormir(200);
  }
}
// Reserva a trava pro fluxo manual (síncrono, logo depois de esperarConexaoEmAndamento). Com ela, extensão, Vigia,
// retry e boot viram no-op até o próprio connectToWhatsApp do pareamento — ninguém conecta com a credencial
// que está sendo apagada nem ocupa o lugar do socket do pareamento (revisão 24/09).
function reservarTravaDoPareamento(usuarioId: string): boolean {
  if (conectandoAgora.has(usuarioId)) return false;
  conectandoAgora.add(usuarioId);
  return true;
}
// Desiste do pareamento devolvendo a pausa que ESTE fluxo pôs — mas não a de um "Pausar" do admin feito durante a
// espera (a pausa do admin fica gravada no banco).
async function desistirDoPareamento(usuarioId: string, estavaPausado: boolean, motivo: string): Promise<never> {
  if (!estavaPausado) {
    const u = await prisma.usuario.findUnique({ where: { id: usuarioId }, select: { whatsappPausado: true } }).catch(() => null);
    if (!u?.whatsappPausado) pausados.delete(usuarioId);
  }
  throw new Error(motivo);
}

// Gera um CÓDIGO DE PAREAMENTO (8 dígitos) para o atendente digitar no WhatsApp
// em vez de escanear o QR. Começa a sessão do zero (apaga credenciais mortas),
// pede o código à WhatsApp e o retorna. `numero` = DDI+DDD+telefone só dígitos.
export async function gerarCodigoPareamento(usuarioId: string, numero: string): Promise<string> {
  let num = String(numero || '').replace(/\D/g, '');
  // Aceita FIXO (DDD+8=10) e CELULAR (DDD+9=11): completa com o DDI 55 do Brasil.
  if (num.startsWith('0')) num = num.replace(/^0+/, '');
  if (num.length === 10 || num.length === 11) num = '55' + num;
  if (num.length < 12 || num.length > 15) {
    throw new Error('Número inválido. Use DDD + número (fixo: 10 dígitos, celular: 11).');
  }
  if (connectedUsers.has(usuarioId)) {
    throw new Error('Este atendente já está com o WhatsApp conectado.');
  }

  // 1) PAUSA primeiro: bloqueia TODA reconexão automática (vigia / evento 'close' /
  //    boot) enquanto preparamos o pareamento. Era essa competição que contaminava
  //    a sessão e fazia o pareamento nunca completar.
  const estavaPausado = pausados.has(usuarioId);
  pausados.add(usuarioId);
  if (!(await esperarConexaoEmAndamento(usuarioId))) {
    return desistirDoPareamento(usuarioId, estavaPausado, 'O WhatsApp deste atendente ainda está conectando. Tente de novo em alguns segundos.');
  }
  if (connectedUsers.has(usuarioId)) {
    return desistirDoPareamento(usuarioId, estavaPausado, 'Este atendente já está com o WhatsApp conectado.');
  }
  if (!reservarTravaDoPareamento(usuarioId)) {
    return desistirDoPareamento(usuarioId, estavaPausado, 'O WhatsApp deste atendente ainda está conectando. Tente de novo em alguns segundos.');
  }

  try {
    // 2) Derruba qualquer socket/QR em andamento e limpa credenciais mortas
    //    (o código só é aceito em conta ainda não registrada).
    const antigo = sessions.get(usuarioId);
    if (antigo) { try { antigo.end(undefined as any); } catch (e) {} }
    sessions.delete(usuarioId);
    latestQR.delete(usuarioId);
    pairingCodes.delete(usuarioId);
    try {
      const fs = require('fs');
      const dir = path.join(__dirname, `../../../prisma/auth_info_baileys_${usuarioId}`);
      if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
    } catch (e) {}

    // 3) Espera o socket antigo encerrar DE VERDADE antes de criar o socket limpo do pareamento. A trava
    //    reservada faz qualquer reconexão (extensão, Vigia, retry) virar no-op nesse meio tempo.
    await new Promise((r) => setTimeout(r, 2500));

    // 4) Cria a sessão limpa pedindo o código. numeroPareamento fura a pausa (ação
    //    intencional); a pausa segue bloqueando só as reconexões automáticas.
    await connectToWhatsApp(usuarioId, undefined, num, false, true);
  } catch (e) {
    conectandoAgora.delete(usuarioId);
    throw e;
  }

  // Espera o código ser gerado (requestPairingCode roda ~2,5s após o socket subir).
  for (let i = 0; i < 25; i++) {
    const code = pairingCodes.get(usuarioId);
    if (code) return code;
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error('Não foi possível gerar o código agora. Tente novamente em alguns segundos.');
}

// Gera um QR Code de pareamento SOB DEMANDA para o CRM. Limpa qualquer sessão/credencial
// morta antes de iniciar e espera o primeiro QR válido subir.
export async function gerarQrCodePareamento(usuarioId: string): Promise<string> {
  if (connectedUsers.has(usuarioId)) {
    throw new Error('Este atendente já está com o WhatsApp conectado.');
  }

  const estavaPausado = pausados.has(usuarioId);
  pausados.add(usuarioId);
  if (!(await esperarConexaoEmAndamento(usuarioId))) {
    return desistirDoPareamento(usuarioId, estavaPausado, 'O WhatsApp deste atendente ainda está conectando. Tente de novo em alguns segundos.');
  }
  if (connectedUsers.has(usuarioId)) {
    return desistirDoPareamento(usuarioId, estavaPausado, 'Este atendente já está com o WhatsApp conectado.');
  }
  if (!reservarTravaDoPareamento(usuarioId)) {
    return desistirDoPareamento(usuarioId, estavaPausado, 'O WhatsApp deste atendente ainda está conectando. Tente de novo em alguns segundos.');
  }

  try {
    const antigo = sessions.get(usuarioId);
    if (antigo) { try { antigo.end(undefined as any); } catch (e) {} }
    sessions.delete(usuarioId);
    latestQR.delete(usuarioId);
    pairingCodes.delete(usuarioId);

    try {
      const dir = path.join(__dirname, `../../../prisma/auth_info_baileys_${usuarioId}`);
      if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
    } catch (e) {}

    // A trava reservada faz qualquer reconexão (extensão, Vigia, retry) virar no-op nestes 2,5s.
    await new Promise((r) => setTimeout(r, 2500));
    await connectToWhatsApp(usuarioId, undefined, undefined, true, true);
  } catch (e) {
    conectandoAgora.delete(usuarioId);
    throw e;
  }

  for (let i = 0; i < 40; i++) {
    const qr = latestQR.get(usuarioId);
    if (qr && qr.expiresAt > Date.now()) return qr.qrCode;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('Não foi possível gerar o QR agora. Tente novamente em alguns segundos.');
}

// ── FOTO DE PERFIL DO CONTATO ESPELHADA NO CRM ──────────────────────
const AVATARS_DIR = path.join(MIDIAS_DIR, 'avatars');
try { fs.mkdirSync(AVATARS_DIR, { recursive: true }); } catch (e) {}

const cacheFotosPerfil = new Map<string, { url: string | null; expira: number }>();

export async function baixarFotoPerfilLocal(usuarioIdOriginal: string, jid: string): Promise<string | null> {
  if (!jid) return null;
  const cleanJid = jid.replace(/[^a-zA-Z0-9]/g, '_');
  const arq = path.join(AVATARS_DIR, `${cleanJid}.jpg`);
  const relUrl = `/midias/avatars/${cleanJid}.jpg`;

  try {
    if (fs.existsSync(arq)) {
      const stat = fs.statSync(arq);
      // Se tiver menos de 7 dias, usa o local direto
      if (Date.now() - stat.mtimeMs < 7 * 24 * 60 * 60 * 1000) {
        return relUrl;
      }
    }
  } catch {}

  const efetivoId = await resolverConexaoEfetiva(usuarioIdOriginal);
  const chave = `${efetivoId}:${jid}`;
  const emCache = cacheFotosPerfil.get(chave);
  if (emCache && emCache.expira > Date.now()) {
    return emCache.url;
  }

  const sock = sessions.get(efetivoId);
  if (!sock) return fs.existsSync(arq) ? relUrl : null;

  try {
    // Timeout de 2.5s para não travar o loop de eventos
    const buscarComTimeout = async (tipo: 'image' | 'preview') => {
      return Promise.race([
        sock.profilePictureUrl(jid, tipo),
        new Promise<undefined>((_, reject) => setTimeout(() => reject(new Error('timeout')), 2500))
      ]);
    };

    let url: string | undefined;
    try {
      url = await buscarComTimeout('image');
    } catch {
      try {
        url = await buscarComTimeout('preview');
      } catch {}
    }

    if (url && typeof url === 'string' && url.startsWith('http')) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      try {
        const resp = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (resp.ok) {
          const buffer = Buffer.from(await resp.arrayBuffer());
          fs.writeFileSync(arq, buffer);
          cacheFotosPerfil.set(chave, { url: relUrl, expira: Date.now() + 7 * 24 * 60 * 60 * 1000 });
          return relUrl;
        }
      } catch {
        clearTimeout(timeoutId);
      }
    }
  } catch {}

  cacheFotosPerfil.set(chave, { url: fs.existsSync(arq) ? relUrl : null, expira: Date.now() + 2 * 60 * 60 * 1000 });
  return fs.existsSync(arq) ? relUrl : null;
}

export async function obterFotoPerfil(usuarioId: string, jid: string): Promise<string | null> {
  return baixarFotoPerfilLocal(usuarioId, jid);
}
