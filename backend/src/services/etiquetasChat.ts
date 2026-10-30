import fs from 'fs';
import path from 'path';

// Etiquetas do WhatsApp Business (30/10, dono: quem a Josy marcou como vendido nao recebe remarketing). O Baileys avisa quando uma
// etiqueta e criada ou colocada/tirada de uma conversa; aqui fica guardado em arquivo. Etiqueta aplicada ANTES desta versao
// so aparece se a atendente mexer nela de novo.
const ARQUIVO = path.resolve(__dirname, '../../data/etiquetas-chat.json');
const NOME_VENDIDO = /finalizad|vend|comprou|compra|fechou|fechad/i;

// 30/10: o WhatsApp manda o codigo da etiqueta mesmo quando o nome nao chega. Na Josy a laranja de vendido e a 51 (conferido em 4 conversas de quem comprou).
const IDS_VENDIDO: Record<string, string[]> = { "34268c16-7bed-400a-bf1e-a3d9e37d8774": ["51"] };

type Conta = { etiquetas: Record<string, { nome: string; cor?: number }>; chats: Record<string, string[]> };
let dados: Record<string, Conta> | null = null;

function carregar(): Record<string, Conta> {
  if (dados) return dados;
  try { dados = JSON.parse(fs.readFileSync(ARQUIVO, 'utf8')); } catch { dados = {}; }
  return dados as Record<string, Conta>;
}
function conta(usuarioId: string): Conta {
  const d = carregar();
  if (!d[usuarioId]) d[usuarioId] = { etiquetas: {}, chats: {} };
  return d[usuarioId] as Conta;
}
function salvar() {
  try { fs.writeFileSync(ARQUIVO, JSON.stringify(dados)); } catch (e: any) { console.error('[Etiquetas] nao salvou:', e?.message || e); }
}

export function registrarEtiqueta(usuarioId: string, e: any) {
  if (!e?.id) return;
  const c = conta(usuarioId);
  if (e.deleted) delete c.etiquetas[String(e.id)];
  else c.etiquetas[String(e.id)] = { nome: String(e.name || ''), cor: e.color };
  console.log(`[Etiquetas] ${usuarioId}: etiqueta ${e.id} "${e.name}" cor ${e.color}${e.deleted ? ' (apagada)' : ''}`);
  salvar();
}

export function registrarAssociacao(usuarioId: string, ev: any) {
  const a = ev?.association;
  if (!a?.chatId || !a?.labelId || (a.type && a.type !== 'label_jid')) return;
  const c = conta(usuarioId);
  const atuais = new Set(c.chats[a.chatId] || []);
  if (ev.type === 'remove') atuais.delete(String(a.labelId));
  else atuais.add(String(a.labelId));
  if (atuais.size) c.chats[a.chatId] = [...atuais];
  else delete c.chats[a.chatId];
  console.log(`[Etiquetas] ${usuarioId}: ${a.chatId} ${ev.type} etiqueta ${a.labelId}`);
  salvar();
}

// A conversa (pelo jid ou pelo numero real) tem etiqueta de vendido?
export function chatVendido(usuarioId: string, chatJid: string, numero?: string | null): boolean {
  const c = carregar()[usuarioId];
  if (!c) return false;
  const final8 = String(numero || '').replace(/\D/g, '').slice(-8);
  for (const [chat, ids] of Object.entries(c.chats)) {
    const mesmo = chat === chatJid || (final8.length === 8 && chat.split('@')[0]?.split(':')[0]?.endsWith(final8));
    if (mesmo && ids.some((id) => IDS_VENDIDO[usuarioId]?.includes(id) || NOME_VENDIDO.test(c.etiquetas[id]?.nome || ''))) return true;
  }
  return false;
}
