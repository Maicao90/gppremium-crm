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

// ---------- edicao pelo painel (tela Fluxo) ----------
export const CAMPOS_CONFIG_LOJA = [
  { campo: 'NOME_LOJA', rotulo: 'Nome da loja (como o robô fala)', tipo: 'texto' },
  { campo: 'TELEFONE', rotulo: 'Telefone', tipo: 'texto' },
  { campo: 'HORARIO', rotulo: 'Horário (ex.: de segunda a sexta, das 8h às 18h, e aos sábados, das 8h às 12h)', tipo: 'texto' },
  { campo: 'LOCALIZACAO', rotulo: 'Endereço que vai no pino do mapa', tipo: 'texto_longo' },
  { campo: 'LOCALIZACAO_TEXTO', rotulo: 'Frase "a gente fica ..." (ex.: na Avenida Perimetral, em Luziânia-GO)', tipo: 'texto' },
  { campo: 'LOCALIZACAO_LAT', rotulo: 'Latitude do pino', tipo: 'numero' },
  { campo: 'LOCALIZACAO_LNG', rotulo: 'Longitude do pino', tipo: 'numero' },
  { campo: 'ROBO_INICIO', rotulo: 'Robô começa a responder às (HH:MM; vazio = o dia todo)', tipo: 'hora' },
  { campo: 'PAUSA_FORA_DA_LISTA_MIN', rotulo: 'Pneu fora da tabela: robô fica quieto por (minutos)', tipo: 'numero' },
];

export function lerConfigLojasBot(): Record<string, any> {
  const j = lerJson(CAMINHO_LOJAS);
  return j && typeof j === 'object' ? j : {};
}

export function salvarConfigLojaBot(lojaId: string, entrada: Record<string, unknown>): { config?: any; erro?: string } {
  const todas = lerConfigLojasBot();
  const atual = { ...(todas[lojaId] || {}) };
  for (const { campo, tipo } of CAMPOS_CONFIG_LOJA) {
    if (!(campo in entrada)) continue;
    const v = entrada[campo];
    if (v === null || v === undefined || String(v).trim() === '') { delete atual[campo]; continue; }
    if (tipo === 'numero') {
      const n = Number(String(v).replace(',', '.'));
      if (!Number.isFinite(n)) return { erro: `Valor inválido em "${campo}".` };
      atual[campo] = n;
    } else if (tipo === 'hora') {
      if (!/^([01]?\d|2[0-3]):[0-5]\d$/.test(String(v).trim())) return { erro: 'Horário de início no formato HH:MM (ex.: 10:30).' };
      atual[campo] = String(v).trim();
    } else {
      atual[campo] = String(v).slice(0, 600);
    }
  }
  todas[lojaId] = atual;
  const tmp = CAMINHO_LOJAS + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(todas, null, 2));
  fs.renameSync(tmp, CAMINHO_LOJAS);
  return { config: atual };
}
