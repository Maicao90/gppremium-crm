import { makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers, delay, WASocket, proto, downloadMediaMessage } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import qrcodeTerminal from 'qrcode-terminal';
import qrcode from 'qrcode';
import path from 'path';
import fs from 'fs';
import { io, prisma } from '../server';

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

// Número (telefone) da própria sessão — ex.: "556137742115" de "556137742115:26@s.whatsapp.net".
function numeroDaSessao(sock: WASocket | undefined): string {
  return String(sock?.user?.id || '').split(':')[0].split('@')[0];
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

// Guarda o QR Code mais recente (base64) de cada usuário enquanto ele ainda não escaneou.
// Serve para REENVIAR o QR a uma extensão que conecta DEPOIS do QR ter sido gerado
// (ex.: QR gerado no boot da VPS, antes do navegador da pessoa estar aberto).
export const latestQR = new Map<string, string>();

// Conjunto de usuários com a conexão realmente ABERTA (autenticada e pronta).
export const connectedUsers = new Set<string>();

// Nomes de contatos (jid -> nome), preenchido pelos eventos de contatos do WhatsApp.
// Usado para mostrar o NOME do contato na Caixa de Entrada em vez do número/ID interno.
export const contatosNomes = new Map<string, string>();
function registrarNomeContato(jid?: string | null, nome?: string | null) {
  if (jid && nome && String(nome).trim()) contatosNomes.set(jid, String(nome).trim());
}

// IDs de mensagens já salvas pelo envio da Caixa de Entrada (evita duplicar se o
// evento messages.upsert também disparar para a mesma mensagem que nós enviamos).
const waIdsRecentes = new Set<string>();
function lembrarWaId(id?: string | null) {
  if (!id) return;
  waIdsRecentes.add(id);
  if (waIdsRecentes.size > 3000) {
    const maisAntigo = waIdsRecentes.values().next().value;
    if (maisAntigo) waIdsRecentes.delete(maisAntigo);
  }
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
let vigiaIniciado = false;
function iniciarVigiaConexao() {
  if (vigiaIniciado) return;
  vigiaIniciado = true;
  setInterval(() => {
    try {
      const dir = path.join(__dirname, '../../../prisma');
      if (!fs.existsSync(dir)) return;
      const sessoes: string[] = fs.readdirSync(dir).filter((d: string) => d.startsWith('auth_info_baileys_'));
      for (const s of sessoes) {
        const uid = s.replace('auth_info_baileys_', '');
        // Tem credencial salva, mas não está conectado NEM conectando → ressuscita.
        // (Pula quem está pausado, para não ficar gerando QR de conta travada.)
        if (uid && !sessions.has(uid) && !connectedUsers.has(uid) && !pausados.has(uid)) {
          console.log(`[Baileys][Vigia] Sessão de ${uid} caída — reconectando automaticamente...`);
          connectToWhatsApp(uid).catch(() => {});
        }
      }
    } catch (e) {}
  }, 60000);
}
iniciarVigiaConexao();

// ─── LEMBRETE DE AGENDAMENTOS (no WhatsApp do PRÓPRIO atendente) ───
// A cada ~2-3h no expediente, manda um lembrete pro número do próprio atendente
// (conversa "Mensagens para mim") pra ele agendar os retornos. 100% no servidor —
// não mexe na extensão. Ajustável por env: LEMBRETE_INTERVALO_H.
const LEMBRETE_INTERVALO_MS = Number(process.env.LEMBRETE_INTERVALO_H || 2.5) * 60 * 60 * 1000;
const TEXTO_LEMBRETE = '🔔 *Lembrete:* agende os retornos dos seus clientes!\nCada agendamento marcado é uma venda a mais 📈';
const ultimoLembrete = new Map<string, number>();

function estaNoExpedienteLembrete(): boolean {
  const agoraBR = new Date(Date.now() - 3 * 60 * 60 * 1000); // fuso BR (UTC-3)
  const hora = agoraBR.getUTCHours();
  const dia = agoraBR.getUTCDay(); // 0=dom ... 6=sáb
  return dia >= 1 && dia <= 6 && hora >= 8 && hora < 18; // seg a sáb, 8h às 18h
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
        ultimoLembrete.set(uid, agora);
        (sock as any).sendMessage(num + '@s.whatsapp.net', { text: TEXTO_LEMBRETE })
          .then((sent: any) => { lembrarWaId(sent?.key?.id); console.log(`[Lembrete] enviado para o atendente ${uid}`); })
          .catch((e: any) => console.error('[Lembrete] erro ao enviar:', e?.message));
      }
    } catch (e) {}
  }, 5 * 60 * 1000); // checa a cada 5 min
}
iniciarLembretes();

// Dispara o lembrete AGORA para todos os atendentes conectados (uso manual / teste).
export async function dispararLembretesAgora(): Promise<number> {
  let enviados = 0;
  for (const [uid, sock] of sessions.entries()) {
    if (!connectedUsers.has(uid)) continue;
    const proprio = (sock as any).user?.id;
    if (!proprio) continue;
    const num = String(proprio).replace(/[:@].*$/, '');
    if (!num) continue;
    ultimoLembrete.set(uid, Date.now());
    try {
      const sent = await (sock as any).sendMessage(num + '@s.whatsapp.net', { text: TEXTO_LEMBRETE });
      lembrarWaId(sent?.key?.id);
      enviados++;
      console.log(`[Lembrete] disparado manualmente para o atendente ${uid}`);
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

export async function connectToWhatsApp(usuarioId: string, socketId?: string, numeroPareamento?: string) {
  if (!usuarioId) return;

  // COMPARTILHAMENTO: quem compartilha o WhatsApp de outro atendente NÃO pode ter
  // sessão Baileys própria — se ela existisse, o WhatsApp trataria como um 2º
  // aparelho vinculado da MESMA conta do dono, duplicando toda mensagem recebida
  // (a causa raiz do bug de duplicidade). Então aqui é um no-op puro.
  try {
    const usuario = await prisma.usuario.findUnique({ where: { id: usuarioId }, select: { whatsappDonoId: true } });
    if (usuario?.whatsappDonoId) {
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
  if (pausados.has(usuarioId) && !numeroPareamento) {
    console.log(`[Baileys] Conexão do usuário ${usuarioId} está PAUSADA. Ignorando.`);
    return;
  }

  // Evita criar múltiplas instâncias para o mesmo usuário se já estiver rodando
  if (sessions.has(usuarioId)) {
    console.log(`[Baileys] Sessão já existe para o usuário ${usuarioId}. Ignorando recriação.`);
    return;
  }

  const authDir = path.join(__dirname, `../../../prisma/auth_info_baileys_${usuarioId}`);
  const { state, saveCreds } = await useMultiFileAuthState(authDir);

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    browser: Browsers.windows('Desktop'),
    syncFullHistory: false,
    // Mantém a conexão viva 24/7 na VPS: envia pings periódicos ao WhatsApp.
    // Sem isso a conexão pode "congelar em silêncio" sem disparar o evento de queda.
    keepAliveIntervalMs: 30000,
    connectTimeoutMs: 60000,
    retryRequestDelayMs: 2000,
    // Não marca o aparelho como "online" ao conectar — evita roubar as notificações do celular.
    markOnlineOnConnect: false
  });

  // Salva a instância no mapa
  sessions.set(usuarioId, sock);

  // ─── PAREAMENTO POR CÓDIGO (alternativa ao QR) ───
  // Se veio um número e a conta ainda NÃO está registrada, pede à WhatsApp um
  // código de 8 dígitos. Não interfere no fluxo de QR (só roda quando pedido).
  if (numeroPareamento && !sock.authState.creds.registered) {
    setTimeout(async () => {
      try {
        const code = await sock.requestPairingCode(numeroPareamento);
        pairingCodes.set(usuarioId, code);
        io.to(usuarioId).emit('WHATSAPP_PAIRING_CODE', code);
        console.log(`[Baileys] Código de pareamento gerado para o usuário ${usuarioId}.`);
      } catch (e: any) {
        console.error(`[Baileys] Erro ao gerar código de pareamento (${usuarioId}):`, e?.message);
      }
    }, 2500);
  }

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;
    
    if (qr) {
      console.log(`\n[Baileys] QR Code gerado para o usuário ${usuarioId}`);
      
      try {
        const qrBase64 = await qrcode.toDataURL(qr);
        // Guarda o QR no cache para reenviar a quem conectar depois
        latestQR.set(usuarioId, qrBase64);
        connectedUsers.delete(usuarioId);
        // Emite o QR Code apenas para a sala do usuário específico
        io.to(usuarioId).emit('WHATSAPP_QR_CODE', qrBase64);

        // Atualiza status no banco
        await prisma.usuario.update({
          where: { id: usuarioId },
          data: { whatsappConectado: false }
        });
      } catch (err) {
        console.error(`[Baileys] Erro ao gerar Base64 do QR para usuário ${usuarioId}:`, err);
      }
    }

    if (connection === 'close') {
      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
      const isLoggedOut = statusCode === DisconnectReason.loggedOut;

      console.log(`[Baileys] Conexão fechada (Usuário ${usuarioId}). Código: ${statusCode}. Motivo:`, lastDisconnect?.error, 'Deslogado:', isLoggedOut);

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
        io.to(usuarioId).emit('WHATSAPP_STATUS', { conectado: false });
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
        console.log(`[Baileys] Reconectando usuário ${usuarioId} em 2 segundos...`);
        setTimeout(() => connectToWhatsApp(usuarioId).catch(err => console.error("Erro no retry:", err)), 2000);
      }
    } else if (connection === 'open') {
      console.log(`[Baileys] Conexão aberta com sucesso! Servidor pronto para disparos do usuário ${usuarioId}.`);
      // Conectou: não há mais QR nem código de pareamento pendentes. Sai da pausa
      // (se estava pausado para o pareamento) para as reconexões automáticas voltarem.
      connectedUsers.add(usuarioId);
      latestQR.delete(usuarioId);
      pairingCodes.delete(usuarioId);
      pausados.delete(usuarioId);
      io.to(usuarioId).emit('WHATSAPP_STATUS', { conectado: true });

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

  // Captura os nomes dos contatos para mostrar na Caixa de Entrada (em vez do número/@lid)
  sock.ev.on('contacts.upsert', (contatos: any[]) => {
    for (const c of contatos || []) registrarNomeContato(c.id, c.name || c.notify || c.verifiedName);
  });
  sock.ev.on('contacts.update', (contatos: any[]) => {
    for (const c of contatos || []) registrarNomeContato(c.id, c.name || c.notify || c.verifiedName);
  });

  // Mensagens recebidas: detecta APAGADAS, armazena e faz auto-resposta
  sock.ev.on('messages.upsert', async (m) => {
    try {
      // APENAS processar se for uma mensagem chegando (notify)
      if (m.type !== 'notify') return;

      const msg = m.messages[0];
      if (!msg || !msg.message || !msg.key) return;

      const remoteJid = msg.key.remoteJid;
      if (!remoteJid || remoteJid.includes('@g.us') || remoteJid.includes('status@broadcast')) return; // ignorar grupos e status

      const numero = remoteJid.split('@')[0];
      if (!numero) return;

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
      // Pula se já salvamos esta mensagem pelo envio da Caixa de Entrada (evita duplicar)
      if ((_textoMsg || _tipoMsg !== 'texto' || _anuncio) && !(msg.key.id && waIdsRecentes.has(msg.key.id))) {
        (async () => {
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
                numeroReal: numeroReal || null
              }
            });
            io.to(usuarioId).emit('NOVA_MENSAGEM', salva);
          } catch (e: any) {
            console.error('[Inbox] Erro ao salvar mensagem:', e?.message);
          }
        })();
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

      const usuario = await prisma.usuario.findUnique({ where: { id: usuarioId } });
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
          io.to(usuarioId).emit('NOVA_MENSAGEM', salvaAuto);
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

// Função usada pelo worker para enviar mensagens diretamente simulando ser humano
export async function enviarMensagem(usuarioId: string, numero: string, mensagem: string): Promise<boolean> {
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
        const [info] = await sock.onWhatsApp(numero);
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
    const enviado = await sock.sendMessage(jid, { text: mensagem });
    if (!enviado?.key?.id) {
      console.error(`[Baileys] ❌ sendMessage não retornou confirmação para ${numero} — marcando como FALHA.`);
      return false;
    }
    console.log(`[Baileys] 🚀 Mensagem enviada com sucesso para ${numero} pelo usuário ${usuarioId}`);

    // 4. CRÍTICO: volta a presença para "offline" (unavailable).
    // Se o web ficar marcado como "online", o WhatsApp passa a entregar as mensagens
    // RECEBIDAS apenas no web, e elas "somem" do celular. Liberar a presença aqui
    // devolve as notificações ao telefone da pessoa.
    await sock.sendPresenceUpdate('unavailable').catch(() => {});
    return true;
  } catch (error) {
    console.error(`[Baileys] ❌ Erro ao enviar mensagem para ${numero} pelo usuário ${usuarioId}:`, error);
    return false;
  }
}

// Envia uma mensagem pela Caixa de Entrada (resposta interativa a um JID específico).
// Mais rápida que enviarMensagem (sem o delay longo de "digitando"), porque é o
// atendente conversando em tempo real, não um disparo em massa.
export async function enviarMensagemInbox(usuarioId: string, jid: string, texto: string, enviadoPorId?: string): Promise<boolean> {
  const sock = sessions.get(usuarioId);
  if (!sock) {
    console.error(`[Inbox] WhatsApp não conectado para o usuário ${usuarioId}.`);
    return false;
  }
  // Assinatura do PAINEL CRM (separada da extensão). Regras:
  //  - assinaturaPainel definida e não-vazia  -> usa ela: *assinatura:* texto
  //  - assinaturaPainel definida e vazia ("")  -> sem assinatura
  //  - assinaturaPainel não definida (null)    -> padrão: *nome do atendente:* texto
  let textoFinal = texto;
  try {
    const u = await prisma.usuario.findUnique({ where: { id: usuarioId } });
    if (u) {
      if (u.assinaturaPainel !== null && u.assinaturaPainel !== undefined) {
        const a = String(u.assinaturaPainel).trim();
        textoFinal = a ? `*${a}*\n${texto}` : texto;
      } else if (u.nome) {
        textoFinal = `*${u.nome}*\n${texto}`;
      }
    }
  } catch (e) {}

  try {
    await sock.sendPresenceUpdate('composing', jid).catch(() => {});
    await delay(700);
    const enviada = await sock.sendMessage(jid, { text: textoFinal });
    // volta a "offline" para não roubar as notificações do celular
    await sock.sendPresenceUpdate('unavailable').catch(() => {});

    // Guarda a mensagem ENVIADA e avisa o painel na hora. (O sock.sendMessage nem sempre
    // dispara messages.upsert para as nossas próprias mensagens, então salvamos aqui.)
    try {
      const waId = enviada?.key?.id || null;
      lembrarWaId(waId);
      const salva = await prisma.mensagem.create({
        data: { usuarioId, chatJid: jid, chatNome: '', fromMe: true, texto: textoFinal, tipo: 'texto', waId, enviadoPorId: enviadoPorId || null }
      });
      io.to(usuarioId).emit('NOVA_MENSAGEM', salva);
    } catch (e) {
      console.error('[Inbox] Erro ao salvar mensagem enviada:', e);
    }
    return true;
  } catch (e) {
    console.error('[Inbox] Erro ao enviar mensagem:', e);
    return false;
  }
}

// Envia uma MÍDIA (foto, vídeo, áudio ou documento) pela Caixa de Entrada.
export async function enviarMidiaInbox(usuarioId: string, jid: string, base64: string, mimetype: string, tipo: string, legenda?: string, enviadoPorId?: string): Promise<boolean> {
  const sock = sessions.get(usuarioId);
  if (!sock) {
    console.error(`[Inbox] WhatsApp não conectado para o usuário ${usuarioId}.`);
    return false;
  }
  try {
    const buffer = Buffer.from(base64, 'base64');
    let conteudo: any;
    if (tipo === 'imagem') conteudo = { image: buffer, caption: legenda || undefined };
    else if (tipo === 'video') conteudo = { video: buffer, caption: legenda || undefined };
    else if (tipo === 'audio') conteudo = { audio: buffer, mimetype: 'audio/ogg; codecs=opus', ptt: true };
    else conteudo = { document: buffer, mimetype: mimetype || 'application/octet-stream', fileName: 'arquivo' };

    await sock.sendPresenceUpdate('composing', jid).catch(() => {});
    const enviada = await sock.sendMessage(jid, conteudo);
    await sock.sendPresenceUpdate('unavailable').catch(() => {});

    // Salva a mídia localmente para exibir no painel
    const ext = EXT_POR_TIPO[tipo] || 'bin';
    const nome = `out_${(enviada?.key?.id || 'm').replace(/[^a-zA-Z0-9]/g, '')}_${Math.floor(Math.random() * 1000000)}.${ext}`;
    let midiaUrl: string | null = null;
    try { fs.writeFileSync(path.join(MIDIAS_DIR, nome), buffer); midiaUrl = `/midias/${nome}`; } catch (e) {}

    const waId = enviada?.key?.id || null;
    lembrarWaId(waId);
    const salva = await prisma.mensagem.create({
      data: { usuarioId, chatJid: jid, chatNome: '', fromMe: true, texto: legenda || '', tipo, midiaUrl, waId, enviadoPorId: enviadoPorId || null }
    });
    io.to(usuarioId).emit('NOVA_MENSAGEM', salva);
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
  io.to(usuarioId).emit('WHATSAPP_STATUS', { conectado: false });
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
  io.to(usuarioId).emit('WHATSAPP_STATUS', { conectado: false, pausado: true });
  console.log(`[Baileys] Conexão do usuário ${usuarioId} PAUSADA.`);
}

// RETOMA a conexão de um atendente pausado e tenta conectar de novo.
export async function retomarWhatsApp(usuarioId: string) {
  pausados.delete(usuarioId);
  await prisma.usuario.update({ where: { id: usuarioId }, data: { whatsappPausado: false } }).catch(() => {});
  console.log(`[Baileys] Conexão do usuário ${usuarioId} RETOMADA.`);
  await connectToWhatsApp(usuarioId).catch(() => {});
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
  pausados.add(usuarioId);

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

  // 3) Espera o socket antigo encerrar DE VERDADE (e qualquer reconexão de 2s virar
  //    no-op por causa da pausa) antes de criar o socket limpo do pareamento.
  await new Promise((r) => setTimeout(r, 2500));

  // 4) Cria a sessão limpa pedindo o código. numeroPareamento fura a pausa (ação
  //    intencional); a pausa segue bloqueando só as reconexões automáticas.
  await connectToWhatsApp(usuarioId, undefined, num);

  // Espera o código ser gerado (requestPairingCode roda ~2,5s após o socket subir).
  for (let i = 0; i < 25; i++) {
    const code = pairingCodes.get(usuarioId);
    if (code) return code;
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error('Não foi possível gerar o código agora. Tente novamente em alguns segundos.');
}
