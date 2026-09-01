"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.connectToWhatsApp = connectToWhatsApp;
exports.enviarMensagem = enviarMensagem;
const baileys_1 = require("@whiskeysockets/baileys");
const qrcode_terminal_1 = __importDefault(require("qrcode-terminal"));
const qrcode_1 = __importDefault(require("qrcode"));
const path_1 = __importDefault(require("path"));
const server_1 = require("../server");
let sock = null;
let isConnected = false;
async function connectToWhatsApp() {
    const authDir = path_1.default.join(__dirname, '../../../prisma/auth_info_baileys');
    const { state, saveCreds } = await (0, baileys_1.useMultiFileAuthState)(authDir);
    sock = (0, baileys_1.makeWASocket)({
        auth: state,
        printQRInTerminal: false,
        browser: baileys_1.Browsers.windows('Desktop'),
        syncFullHistory: false
    });
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) {
            console.log('\n======================================================');
            console.log('📱 LEIA O QR CODE ABAIXO PARA CONECTAR O SERVIDOR AO WHATSAPP');
            console.log('======================================================\n');
            qrcode_terminal_1.default.generate(qr, { small: true });
            // Gera o QR Code em base64 e envia para a extensão renderizar
            try {
                const qrBase64 = await qrcode_1.default.toDataURL(qr);
                server_1.io.emit('WHATSAPP_QR_CODE', qrBase64);
            }
            catch (err) {
                console.error('[Baileys] Erro ao gerar Base64 do QR:', err);
            }
        }
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== baileys_1.DisconnectReason.loggedOut;
            console.log('[Baileys] Conexão fechada. Motivo:', lastDisconnect?.error, 'Reconectando:', shouldReconnect);
            isConnected = false;
            server_1.io.emit('WHATSAPP_STATUS', { conectado: false });
            if (shouldReconnect) {
                setTimeout(() => connectToWhatsApp(), 5000);
            }
            else {
                console.log('[Baileys] Aparelho deslogado. Delete a pasta auth_info_baileys e gere novo QR Code.');
            }
        }
        else if (connection === 'open') {
            console.log('[Baileys] Conexão aberta com sucesso! Servidor pronto para disparos.');
            isConnected = true;
            server_1.io.emit('WHATSAPP_STATUS', { conectado: true });
        }
    });
    sock.ev.on('creds.update', saveCreds);
}
// Função usada pelo worker para enviar mensagens diretamente simulando ser humano
async function enviarMensagem(numero, mensagem) {
    if (!sock || !isConnected) {
        console.error('[Baileys] Falha: WhatsApp não está conectado!');
        return false;
    }
    try {
        const jid = numero.includes('@c.us') ? numero : `${numero}@s.whatsapp.net`;
        // 1. Simula que a pessoa entrou no chat e está online
        await sock.sendPresenceUpdate('available', jid);
        await (0, baileys_1.delay)(1000);
        // 2. Simula que a pessoa está "Digitando..."
        console.log(`[Baileys] Simulando "Digitando..." para ${numero}`);
        await sock.sendPresenceUpdate('composing', jid);
        // Atraso artificial de 3 a 5 segundos enquanto "digita"
        const tempoDigitacao = Math.floor(Math.random() * 2000) + 3000;
        await (0, baileys_1.delay)(tempoDigitacao);
        // Para de aparecer "digitando"
        await sock.sendPresenceUpdate('paused', jid);
        // 3. Envia a mensagem
        await sock.sendMessage(jid, { text: mensagem });
        console.log(`[Baileys] ✅ Mensagem enviada com sucesso para ${numero}`);
        return true;
    }
    catch (error) {
        console.error(`[Baileys] ❌ Erro ao enviar mensagem para ${numero}:`, error);
        return false;
    }
}
//# sourceMappingURL=whatsappService.js.map