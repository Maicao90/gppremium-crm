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

// Mapa para guardar as sessões ativas por usuário
export const sessions = new Map<string, WASocket>();

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

// Extrai o texto de uma mensagem do WhatsApp (cobre os tipos mais comuns)
function extrairTextoMensagem(message: any): string | null {
  if (!message) return null;
  return message.conversation
    || message.extendedTextMessage?.text
    || message.imageMessage?.caption
    || message.videoMessage?.caption
    || message.documentMessage?.caption
    || null;
}

// Identifica o tipo da mensagem (para a Caixa de Entrada)
function tipoMensagem(message: any): string {
  if (!message) return 'outro';
  if (message.conversation || message.extendedTextMessage) return 'texto';
  if (message.imageMessage) return 'imagem';
  if (message.videoMessage) return 'video';
  if (message.audioMessage) return 'audio';
  if (message.documentMessage) return 'documento';
  if (message.stickerMessage) return 'figurinha';
  return 'outro';
}

// Memória ultrarrápida para garantir que uma auto-resposta saia apenas UMA VEZ por sessão
const autoRepliedNumbers = new Set<string>();

export async function connectToWhatsApp(usuarioId: string, socketId?: string) {
  if (!usuarioId) return;

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

      io.to(usuarioId).emit('WHATSAPP_STATUS', { conectado: false });

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
        console.log(`[Baileys] Reconectando usuário ${usuarioId} em 5 segundos...`);
        setTimeout(() => connectToWhatsApp(usuarioId).catch(err => console.error("Erro no retry:", err)), 5000);
      }
    } else if (connection === 'open') {
      console.log(`[Baileys] Conexão aberta com sucesso! Servidor pronto para disparos do usuário ${usuarioId}.`);
      // Conectou: não há mais QR pendente e o usuário entra na lista de conectados.
      connectedUsers.add(usuarioId);
      latestQR.delete(usuarioId);
      io.to(usuarioId).emit('WHATSAPP_STATUS', { conectado: true });

      // Mantém o dispositivo web como "offline" para NÃO roubar as notificações do celular.
      // Assim as mensagens recebidas continuam aparecendo normalmente no telefone da pessoa.
      sock.sendPresenceUpdate('unavailable').catch(() => {});
      
      await prisma.usuario.update({
        where: { id: usuarioId },
        data: { whatsappConectado: true }
      }).catch(() => {});
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

      // ─── 1. MENSAGEM APAGADA (REVOKE) ───
      // Quando o cliente apaga uma mensagem, o WhatsApp envia um protocolMessage REVOKE
      // apontando para o id da original. Recuperamos o texto guardado e avisamos a extensão.
      const protocolMsg = msg.message.protocolMessage;
      if (protocolMsg && protocolMsg.type === proto.Message.ProtocolMessage.Type.REVOKE) {
        const idApagado = protocolMsg.key?.id || undefined;
        const original = idApagado ? mensagensRecentes.get(idApagado) : undefined;
        if (original) {
          console.log(`[Baileys] 🗑️ ${original.nome || original.numero} apagou: "${original.texto}"`);
          io.to(usuarioId).emit('MENSAGEM_APAGADA', {
            numero: original.numero,
            nome: original.nome,
            texto: original.texto,
            recebidaEm: original.timestamp,
            apagadaEm: Date.now()
          });
        } else {
          console.log(`[Baileys] 🗑️ ${numero} apagou uma mensagem (conteúdo não estava em cache).`);
          io.to(usuarioId).emit('MENSAGEM_APAGADA', {
            numero,
            nome: msg.pushName || '',
            texto: null,
            recebidaEm: null,
            apagadaEm: Date.now()
          });
        }
        return;
      }

      // ─── CAIXA DE ENTRADA: salva a mensagem (recebida E enviada) e avisa o painel ───
      const _tipoMsg = tipoMensagem(msg.message);
      const _textoMsg = extrairTextoMensagem(msg.message) || '';
      // Pula se já salvamos esta mensagem pelo envio da Caixa de Entrada (evita duplicar)
      if ((_textoMsg || _tipoMsg !== 'texto') && !(msg.key.id && waIdsRecentes.has(msg.key.id))) {
        (async () => {
          let midiaUrl: string | null = null;
          if (_tipoMsg !== 'texto') {
            midiaUrl = await baixarMidia(sock, msg, _tipoMsg, msg.key.id || '');
          }
          try {
            const salva = await prisma.mensagem.create({
              data: {
                usuarioId,
                chatJid: remoteJid,
                chatNome: msg.pushName || contatosNomes.get(remoteJid) || '',
                fromMe: !!msg.key.fromMe,
                texto: _textoMsg,
                tipo: _tipoMsg,
                midiaUrl,
                waId: msg.key.id || null
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
      const textoRecebido = extrairTextoMensagem(msg.message);
      if (textoRecebido && msg.key.id) {
        armazenarMensagemRecente(msg.key.id, {
          usuarioId,
          numero,
          nome: msg.pushName || '',
          texto: textoRecebido,
          timestamp: Date.now()
        });
      }

      // ─── 3. AUTO-RESPOSTA (recepção) — enviada SÓ UMA VEZ por contato ───
      const memoryKey = `${usuarioId}_${numero}`;

      // Check rápido em memória (evita trabalho repetido na mesma sessão)
      if (autoRepliedNumbers.has(memoryKey)) {
        return;
      }

      // Busca dados do usuário para verificar a configuração de auto-resposta
      const usuario = await prisma.usuario.findUnique({
        where: { id: usuarioId }
      });

      if (!usuario || !usuario.autoRespostaAtiva || !usuario.autoRespostaMensagem) {
        return;
      }

      // DEDUP PERSISTENTE: registra no banco ANTES de enviar. A chave única
      // (usuarioId + numero) garante que, mesmo após reiniciar a VPS ou com várias
      // mensagens chegando juntas, a recepção saia UMA única vez por contato.
      try {
        await prisma.autoReplyHistory.create({ data: { usuarioId, numero } });
      } catch (e: any) {
        if (e?.code === 'P2002') {
          // Já respondemos este contato antes — não envia de novo.
          autoRepliedNumbers.add(memoryKey);
          return;
        }
        // Erro diferente (ex.: tabela indisponível): não bloqueia o atendimento,
        // cai no controle em memória abaixo.
        console.error('[Baileys] Aviso no dedup de auto-resposta (seguindo em memória):', e?.message);
      }

      // Marca em memória e envia a recepção
      autoRepliedNumbers.add(memoryKey);
      console.log(`[Baileys] Enviando auto-resposta (1x) para ${numero} (Usuário: ${usuarioId})`);

      await sock.sendMessage(remoteJid, { text: usuario.autoRespostaMensagem }).catch(async (e) => {
        console.error("Erro ao enviar auto-reply:", e);
        // Se falhar o envio, libera para tentar de novo depois (memória + banco)
        autoRepliedNumbers.delete(memoryKey);
        await prisma.autoReplyHistory.delete({
          where: { usuarioId_numero: { usuarioId, numero } }
        }).catch(() => {});
      });

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
    const jid = numero.includes('@') ? numero.replace('@c.us', '@s.whatsapp.net') : `${numero}@s.whatsapp.net`;
    
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

    // 3. Envia a mensagem
    await sock.sendMessage(jid, { text: mensagem });
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
export async function enviarMensagemInbox(usuarioId: string, jid: string, texto: string): Promise<boolean> {
  const sock = sessions.get(usuarioId);
  if (!sock) {
    console.error(`[Inbox] WhatsApp não conectado para o usuário ${usuarioId}.`);
    return false;
  }
  // Assinatura: prefixa o nome do atendente em negrito (igual ao WhatsApp: *nome:* texto)
  let textoFinal = texto;
  try {
    const u = await prisma.usuario.findUnique({ where: { id: usuarioId } });
    if (u && u.nome) textoFinal = `*${u.nome}:* ${texto}`;
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
        data: { usuarioId, chatJid: jid, chatNome: '', fromMe: true, texto: textoFinal, tipo: 'texto', waId }
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
export async function enviarMidiaInbox(usuarioId: string, jid: string, base64: string, mimetype: string, tipo: string, legenda?: string): Promise<boolean> {
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
      data: { usuarioId, chatJid: jid, chatNome: '', fromMe: true, texto: legenda || '', tipo, midiaUrl, waId }
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

  const fs = require('fs');
  const dir = path.join(__dirname, `../../../prisma/auth_info_baileys_${usuarioId}`);
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }

  await prisma.usuario.update({ where: { id: usuarioId }, data: { whatsappConectado: false } }).catch(()=>{});
  io.to(usuarioId).emit('WHATSAPP_STATUS', { conectado: false });
}
