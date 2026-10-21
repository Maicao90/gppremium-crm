// Dados do robô POR LOJA (21/10). Antes o robô tinha uma loja só (Borracharia Popular, no
// data/bot-pneus-config.json): ligado no número da GP, mandaria o endereço e o pino da Borracharia.
// Agora cada loja tem o próprio bloco em data/bot-lojas.json, indexado pelo id da Loja do atendente:
//   NOME_LOJA, TELEFONE, HORARIO, LOCALIZACAO (texto do pino), LOCALIZACAO_TEXTO (frase "a gente fica ..."),
//   LOCALIZACAO_LAT/LNG, FOTO_FACHADA (arquivo em data/), ROBO_INICIO ("10:30" = antes disso só as
//   atendentes respondem), ETIQUETA_FORA_DA_LISTA ({ id, nome, cor }) e PAUSA_FORA_DA_LISTA_MIN.
// O que a loja não tiver, vem do config geral. Lido a cada uso: mudar o arquivo não exige reiniciar nada.
import fs from 'fs';
import path from 'path';
import { prisma } from '../server';

const CAMINHO_CONFIG_GERAL = path.join(__dirname, '../../data/bot-pneus-config.json');
const CAMINHO_LOJAS = path.join(__dirname, '../../data/bot-lojas.json');
export const PASTA_DADOS_BOT = path.join(__dirname, '../../data');

export interface EtiquetaBot { id: string; nome: string; cor?: number }

export interface ConfigBotLoja {
  lojaId: string | null;
  porLoja: boolean; // true = achou o bloco da loja em bot-lojas.json
  NOME_LOJA: string;
  TELEFONE: string;
  HORARIO: string;
  LOCALIZACAO: string;
  LOCALIZACAO_TEXTO?: string | undefined;
  LOCALIZACAO_LAT?: number | undefined;
  LOCALIZACAO_LNG?: number | undefined;
  FOTO_FACHADA?: string | undefined;
  ROBO_INICIO?: string | undefined;
  ETIQUETA_FORA_DA_LISTA?: EtiquetaBot | undefined;
  PAUSA_FORA_DA_LISTA_MIN?: number | undefined;
}

function lerJson(caminho: string): any {
  try { return JSON.parse(fs.readFileSync(caminho, 'utf8')); } catch { return {}; }
}

export async function configBotDaLoja(usuarioId: string): Promise<ConfigBotLoja> {
  const geral = lerJson(CAMINHO_CONFIG_GERAL);
  let lojaId: string | null = null;
  try {
    const u = await prisma.usuario.findUnique({ where: { id: usuarioId }, select: { lojaId: true, whatsappDonoId: true } });
    lojaId = u?.lojaId || null;
    // Quem compartilha o WhatsApp de outra pessoa responde pela loja do DONO da conexão.
    if (!lojaId && u?.whatsappDonoId) {
      const dono = await prisma.usuario.findUnique({ where: { id: u.whatsappDonoId }, select: { lojaId: true } });
      lojaId = dono?.lojaId || null;
    }
  } catch { /* sem loja: usa o config geral */ }
  const lojas = lerJson(CAMINHO_LOJAS);
  const daLoja = (lojaId && lojas && typeof lojas === 'object' && lojas[lojaId]) || null;
  const c = { ...geral, ...(daLoja || {}) };
  const num = (v: any) => (v === undefined || v === null || v === '' || !Number.isFinite(Number(v)) ? undefined : Number(v));
  return {
    lojaId,
    porLoja: !!daLoja,
    NOME_LOJA: String(c.NOME_LOJA || 'Loja'),
    TELEFONE: String(c.TELEFONE || ''),
    HORARIO: String(c.HORARIO || ''),
    LOCALIZACAO: String(c.LOCALIZACAO || ''),
    LOCALIZACAO_TEXTO: c.LOCALIZACAO_TEXTO ? String(c.LOCALIZACAO_TEXTO) : undefined,
    LOCALIZACAO_LAT: num(c.LOCALIZACAO_LAT),
    LOCALIZACAO_LNG: num(c.LOCALIZACAO_LNG),
    FOTO_FACHADA: daLoja?.FOTO_FACHADA ? String(daLoja.FOTO_FACHADA) : undefined,
    ROBO_INICIO: daLoja?.ROBO_INICIO ? String(daLoja.ROBO_INICIO) : undefined,
    ETIQUETA_FORA_DA_LISTA: daLoja?.ETIQUETA_FORA_DA_LISTA?.id ? daLoja.ETIQUETA_FORA_DA_LISTA : undefined,
    PAUSA_FORA_DA_LISTA_MIN: num(daLoja?.PAUSA_FORA_DA_LISTA_MIN),
  };
}

// "10:30" -> o robô ainda não começou? (horário de Brasília). Sem ROBO_INICIO = sempre liberado.
export function antesDoInicioDoRobo(cfg: ConfigBotLoja, agora = new Date()): boolean {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(cfg.ROBO_INICIO || '').trim());
  if (!m) return false;
  const hm = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false }).format(agora);
  const [h, mi] = hm.split(':').map(Number);
  return (h as number) * 60 + (mi as number) < Number(m[1]) * 60 + Number(m[2]);
}

export function caminhoFotoFachada(cfg: ConfigBotLoja): string | undefined {
  if (!cfg.FOTO_FACHADA) return undefined;
  const p = path.join(PASTA_DADOS_BOT, path.basename(cfg.FOTO_FACHADA));
  return fs.existsSync(p) ? p : undefined;
}
