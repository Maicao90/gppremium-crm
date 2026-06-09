import { makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers, delay, WASocket, proto } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import qrcodeTerminal from 'qrcode-terminal';
import qrcode from 'qrcode';
import path from 'path';
import { io, prisma } from '../server';

// Mapa para guardar as sessões ativas por usuário
export const sessions = new Map<string, WASocket>();

// Guarda o QR Code mais recente (base64) de cada usuário enquanto ele ainda não escaneou.
// Serve para REENVIAR o QR a uma extensão que conecta DEPOIS do QR ter sido gerado
// (ex.: QR gerado no boot da VPS, antes do navegador da pessoa estar aberto).
export const latestQR = new Map<string, string>();

// Conjunto de usuários com a conexão realmente ABERTA (autenticada e pronta).
export const connectedUsers = new Set<string>();

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

      // ─── 3. AUTO-RESPOSTA ───
      // Chave única em memória para o usuário e número do cliente
      const memoryKey = `${usuarioId}_${numero}`;

      // Verifica se já enviou a resposta nesta sessão da VPS
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

      // Envia a mensagem automática
      console.log(`[Baileys] Enviando auto-resposta para ${numero} (Usuário: ${usuarioId})`);
      
      // Registra na memória ultrarrápida antes de enviar
      autoRepliedNumbers.add(memoryKey);

      await sock.sendMessage(remoteJid, { text: usuario.autoRespostaMensagem }).catch(e => {
        console.error("Erro ao enviar auto-reply:", e);
        // Se falhar o envio, remove da memória para tentar de novo depois
        autoRepliedNumbers.delete(memoryKey);
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
    const jid = numero.includes('@c.us') ? numero : `${numero}@s.whatsapp.net`;
    
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
