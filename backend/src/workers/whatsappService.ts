import { makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers, delay, WASocket } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import qrcodeTerminal from 'qrcode-terminal';
import qrcode from 'qrcode';
import path from 'path';
import { io, prisma } from '../server';

// Mapa para guardar as sessões ativas por usuário
export const sessions = new Map<string, WASocket>();

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
    syncFullHistory: false
  });

  // Salva a instância no mapa
  sessions.set(usuarioId, sock);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;
    
    if (qr) {
      console.log(`\n[Baileys] QR Code gerado para o usuário ${usuarioId}`);
      
      try {
        const qrBase64 = await qrcode.toDataURL(qr);
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
      const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log(`[Baileys] Conexão fechada (Usuário ${usuarioId}). Motivo:`, lastDisconnect?.error, 'Reconectando:', shouldReconnect);
      
      io.to(usuarioId).emit('WHATSAPP_STATUS', { conectado: false });
      await prisma.usuario.update({
        where: { id: usuarioId },
        data: { whatsappConectado: false }
      }).catch(() => {});
      
      if (shouldReconnect) {
        setTimeout(() => connectToWhatsApp(usuarioId), 5000);
      } else {
        console.log(`[Baileys] Aparelho deslogado para o usuário ${usuarioId}. Remova a pasta auth_info_baileys_${usuarioId} se necessário.`);
        sessions.delete(usuarioId);
      }
    } else if (connection === 'open') {
      console.log(`[Baileys] Conexão aberta com sucesso! Servidor pronto para disparos do usuário ${usuarioId}.`);
      io.to(usuarioId).emit('WHATSAPP_STATUS', { conectado: true });
      
      await prisma.usuario.update({
        where: { id: usuarioId },
        data: { whatsappConectado: true }
      }).catch(() => {});
    }
  });

  sock.ev.on('creds.update', saveCreds);

  // Escutar mensagens recebidas para responder automaticamente
  sock.ev.on('messages.upsert', async (m) => {
    try {
      const msg = m.messages[0];
      if (!msg || !msg.message || !msg.key || msg.key.fromMe) return;
      
      const remoteJid = msg.key.remoteJid;
      if (!remoteJid) return;
      if (remoteJid.includes('@g.us')) return; // ignorar grupos

      const parts = remoteJid.split('@');
      const numero = parts[0];
      if (!numero) return;

      // Busca dados do usuário para verificar a configuração de auto-resposta
      const usuario = await prisma.usuario.findUnique({
        where: { id: usuarioId }
      });

      if (!usuario || !usuario.autoRespostaAtiva || !usuario.autoRespostaMensagem) {
        return;
      }

      // Verifica se este número já recebeu a mensagem deste usuário
      const history = await prisma.autoReplyHistory.findUnique({
        where: {
          usuarioId_numero: {
            usuarioId: usuario.id,
            numero: numero
          }
        }
      });

      if (!history) {
        // Envia a mensagem automática
        console.log(`[Baileys] Enviando auto-resposta para ${numero} (Usuário: ${usuarioId})`);
        await sock.sendMessage(remoteJid, { text: usuario.autoRespostaMensagem });
        
        // Registra que já enviou para não enviar novamente
        await prisma.autoReplyHistory.create({
          data: {
            usuarioId: usuario.id,
            numero: numero
          }
        });
      }

    } catch (err) {
      console.error(`[Baileys] Erro no processamento de mensagens para auto-resposta (Usuário: ${usuarioId}):`, err);
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
