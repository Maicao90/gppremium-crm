const fs = require('fs');
const f = 'src/workers/whatsappService.ts';
let s = fs.readFileSync(f, 'utf8'); const crlf = s.includes('\r\n'); s = s.replace(/\r\n/g, '\n');
const rep = (a, b, n = 1) => { const c = s.split(a).length - 1; if (c !== n) { console.error('ocorrencias', c, JSON.stringify(a.slice(0, 80))); process.exit(1); } s = s.split(a).join(b); };

// foto da fachada por loja
rep("async function enviarLocalizacaoBotIA(usuarioId: string, chatJid: string, numeroReal: string, lat: number, lng: number, nome: string, endereco: string): Promise<boolean> {",
  "async function enviarLocalizacaoBotIA(usuarioId: string, chatJid: string, numeroReal: string, lat: number, lng: number, nome: string, endereco: string, fotoFachada?: string): Promise<boolean> {\n  // Foto da fachada DA LOJA do atendente (bot-lojas.json); sem ela, a foto geral antiga (se existir).\n  const caminhoFoto = fotoFachada || CAMINHO_FOTO_FACHADA;");
rep("      if (fs.existsSync(CAMINHO_FOTO_FACHADA)) {", "      if (fs.existsSync(caminhoFoto)) {");
rep("          const bufferFoto = fs.readFileSync(CAMINHO_FOTO_FACHADA);", "          const bufferFoto = fs.readFileSync(caminhoFoto);");

// disparo manual: loja do atendente
rep(`    const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, '../../data/bot-pneus-config.json'), 'utf8'));
    const lat = Number(cfg.LOCALIZACAO_LAT);
    const lng = Number(cfg.LOCALIZACAO_LNG);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      console.error('[Localizacao] LOCALIZACAO_LAT/LNG nao configurados.');
      return false;
    }
    const nome = String(cfg.NOME_LOJA || 'Loja');
    const endereco = String(cfg.LOCALIZACAO || '');
    const numeroReal = chatJid.split('@')[0] || '';
    return enviarLocalizacaoBotIA(usuarioId, chatJid, numeroReal, lat, lng, nome, endereco);`,
`    // Loja do atendente (bot-lojas.json), senao o config geral do robo.
    const cfg = await configBotDaLoja(usuarioId);
    const lat = Number(cfg.LOCALIZACAO_LAT);
    const lng = Number(cfg.LOCALIZACAO_LNG);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      console.error('[Localizacao] LOCALIZACAO_LAT/LNG nao configurados.');
      return false;
    }
    const numeroReal = chatJid.split('@')[0] || '';
    return enviarLocalizacaoBotIA(usuarioId, chatJid, numeroReal, lat, lng, cfg.NOME_LOJA, cfg.LOCALIZACAO, caminhoFotoFachada(cfg));`);

// etiqueta (label do WhatsApp Business) no chat
rep("async function enviarLocalizacaoBotIA(",
`// Etiqueta do WhatsApp Business no chat (21/10): o robo marca a conversa pra atendente assumir (ex.: cliente
// pediu pneu que nao esta na tabela). Cria a etiqueta da loja se ainda nao existir e aplica no chat. So funciona
// em conta WhatsApp Business; falha aqui nunca derruba o atendimento.
export async function etiquetarChatBotIA(usuarioId: string, chatJid: string, etiqueta: { id: string; nome: string; cor?: number }): Promise<boolean> {
  try {
    const sock: any = await aguardarSocketBotIA(usuarioId);
    if (!sock || typeof sock.addChatLabel !== 'function') return false;
    await comLimiteDeTempo(sock.addLabel(chatJid, { id: String(etiqueta.id), name: etiqueta.nome, color: Number.isFinite(etiqueta.cor) ? etiqueta.cor : 0, deleted: false }), 20_000, 'addLabel').catch((e: any) => console.error('[Bot IA] criar etiqueta:', e?.message || e));
    await comLimiteDeTempo(sock.addChatLabel(chatJid, String(etiqueta.id)), 20_000, 'addChatLabel');
    console.log(\`[Bot IA] \${chatJid}: etiqueta "\${etiqueta.nome}" aplicada.\`);
    return true;
  } catch (e: any) {
    console.error('[Bot IA] Falha ao etiquetar chat:', e?.message || e);
    return false;
  }
}

async function enviarLocalizacaoBotIA(`);

// callbacks do robo: foto da loja + etiqueta
rep("          enviarLocalizacao: (lat, lng, nome, endereco) => enviarLocalizacaoBotIA(usuarioId, remoteJid, numeroRecep, lat, lng, nome, endereco),",
  "          enviarLocalizacao: (lat, lng, nome, endereco, foto) => enviarLocalizacaoBotIA(usuarioId, remoteJid, numeroRecep, lat, lng, nome, endereco, foto),\n          etiquetar: (etiqueta) => etiquetarChatBotIA(usuarioId, remoteJid, etiqueta),");
rep("    enviarLocalizacao: (lat, lng, nome, endereco) => enviarLocalizacaoBotIA(efetivoId, chatJid, numeroReal, lat, lng, nome, endereco),",
  "    enviarLocalizacao: (lat, lng, nome, endereco, foto) => enviarLocalizacaoBotIA(efetivoId, chatJid, numeroReal, lat, lng, nome, endereco, foto),\n    etiquetar: (etiqueta) => etiquetarChatBotIA(efetivoId, chatJid, etiqueta),");

rep("import { agendarRespostaBotIA, pausarConversaBotIA } from './botAtendimentoService';", "import { agendarRespostaBotIA, pausarConversaBotIA } from './botAtendimentoService';\nimport { configBotDaLoja, caminhoFotoFachada } from '../services/botLojas';");
if (crlf) s = s.replace(/\n/g, '\r\n'); fs.writeFileSync(f, s);
console.log('ok');
