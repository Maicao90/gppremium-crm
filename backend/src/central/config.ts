import fs from 'fs';
import path from 'path';

// Central de Trafego via WhatsApp (10/11): relatorio diario das lojas do grupo GP, comandos e alertas de saldo.
// A configuracao fica em data/central-trafego.json (editavel sem mexer no codigo) e o estado (o que ja foi
// enviado, nivel de cada alerta, ultimo saldo lido) em data/central-estado.json. Historico em data/central-log.jsonl.
// ativo=false (padrao) = a central nao manda nada sozinha.

export interface LojaCentral { id: string; nome: string }

export interface ConfigCentral {
  ativo: boolean;
  usuarioIdRemetente: string; // Usuario (sessao Baileys) dedicado: manda o relatorio e recebe os comandos
  numerosAutorizados: string[]; // so digitos, com DDI (ex.: 5561999999999) — so eles recebem e consultam
  horaRelatorio: string; // 'HH:MM' (Brasilia)
  // 12/11 (dono): relatorio as 19h, com as campanhas ja pausadas = fechamento do PROPRIO dia ('hoje'). Padrao: 'ontem'.
  relatorioDoDia?: 'hoje' | 'ontem';
  lojas: LojaCentral[]; // ordem do relatorio
  alertas: {
    diasAtencao: number; // autonomia abaixo disso = ATENCAO
    diasCritico: number; // autonomia abaixo disso = CRITICO
    repetirHoras: number; // mesmo nivel so e reenviado depois desse tempo
    inicio: string; // janela em que alerta pode ser enviado (Brasilia)
    fim: string;
    diasRecarga: number; // recarga sugerida = consumo medio x esses dias
    // Piso por conta (chave "<lojaId>:<meta|google>"): saldo abaixo disso tambem dispara o nivel.
    saldoMinimo?: Record<string, { atencao?: number; critico?: number }>;
  };
}

export interface EstadoCentral {
  relatorioDiario: Record<string, string>; // numero -> dia (YYYY-MM-DD) do ultimo relatorio enviado
  alertas: Record<string, { nivel: string; enviadoEm: number }>; // contaId -> ultimo alerta enviado
  saldos: Record<string, number>; // contaId -> ultimo saldo lido (deteccao de deposito)
  depositosDetectados: string[]; // ids de Deposito criados pela deteccao (origem "detectado pelo saldo")
}

const DIR_DATA = path.join(__dirname, '../../data');
const ARQ_CONFIG = path.join(DIR_DATA, 'central-trafego.json');
const ARQ_ESTADO = path.join(DIR_DATA, 'central-estado.json');
const ARQ_LOG = path.join(DIR_DATA, 'central-log.jsonl');

const PADRAO: ConfigCentral = {
  ativo: false,
  usuarioIdRemetente: '',
  numerosAutorizados: [],
  horaRelatorio: '08:00',
  lojas: [],
  alertas: { diasAtencao: 2, diasCritico: 1, repetirHoras: 24, inicio: '08:00', fim: '20:00', diasRecarga: 7 },
};

let cache: { cfg: ConfigCentral; lidoEm: number } | null = null;

// Lida no maximo a cada 30 s (o hook do WhatsApp consulta em toda mensagem que chega).
export function configCentral(): ConfigCentral {
  if (cache && Date.now() - cache.lidoEm < 30_000) return cache.cfg;
  let cfg = PADRAO;
  try {
    const bruto = JSON.parse(fs.readFileSync(ARQ_CONFIG, 'utf8'));
    cfg = {
      ...PADRAO,
      ...bruto,
      numerosAutorizados: (bruto.numerosAutorizados || []).map((n: unknown) => String(n).replace(/\D/g, '')).filter(Boolean),
      lojas: Array.isArray(bruto.lojas) ? bruto.lojas : [],
      alertas: { ...PADRAO.alertas, ...(bruto.alertas || {}) },
    };
  } catch (e) {
    // Sem arquivo (ou JSON quebrado): central desligada — nunca manda nada com configuracao incerta.
  }
  cache = { cfg, lidoEm: Date.now() };
  return cfg;
}

export function lerEstado(): EstadoCentral {
  try {
    const e = JSON.parse(fs.readFileSync(ARQ_ESTADO, 'utf8'));
    return { relatorioDiario: e.relatorioDiario || {}, alertas: e.alertas || {}, saldos: e.saldos || {}, depositosDetectados: e.depositosDetectados || [] };
  } catch {
    return { relatorioDiario: {}, alertas: {}, saldos: {}, depositosDetectados: [] };
  }
}

// Grava inteiro e troca de uma vez (rename): uma queda no meio nunca deixa o arquivo pela metade.
export function gravarEstado(estado: EstadoCentral) {
  const tmp = ARQ_ESTADO + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(estado, null, 1));
  fs.renameSync(tmp, ARQ_ESTADO);
}

export function registrarLog(tipo: string, dados: Record<string, unknown>) {
  try {
    fs.appendFileSync(ARQ_LOG, JSON.stringify({ em: new Date().toISOString(), tipo, ...dados }) + '\n');
  } catch (e) {
    console.error('[Central] falha ao gravar o historico:', (e as any)?.message || e);
  }
}
