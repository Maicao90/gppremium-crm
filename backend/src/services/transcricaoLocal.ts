import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';

// Transcricao de audio do cliente NO PROPRIO SERVIDOR (21/10, pedido do dono: nada de OpenAI/ChatGPT).
// whisper.cpp v1.9.5 compilado em /opt/whisper.cpp, modelo "small" quantizado (portugues bom, ~10-20 s por
// audio curto neste servidor de 1 processador). Roda com prioridade baixa (nice) e UM audio por vez, pra
// nao disputar processador com o WhatsApp. O texto fica guardado em data/transcricoes/ (nao transcreve 2x).
const CLI = process.env.WHISPER_CLI || '/opt/whisper.cpp/build/bin/whisper-cli';
const MODELO = process.env.WHISPER_MODELO || '/opt/whisper-models/ggml-small-q5_1.bin';
const PASTA = path.resolve(__dirname, '../../data/transcricoes');
// 30/10: modelo maior, so em audio de cliente com numero (ouviu 195/60/15 e 175/45/17 onde o small errou), ~70 s por audio.
const MODELO_FINO = process.env.WHISPER_MODELO_FINO || '/opt/whisper-models/ggml-medium-q5_0.bin';
const LIMITE_FINO_MS = 170_000;
const MEMORIA_MINIMA_FINO_MB = 1100;
// Sem medidas de exemplo: o vocabulario abaixo puxava o que o cliente falou pra perto dos exemplos (195/60 saia 195/65).
const PROMPT_FINO = 'Conversa de cliente em loja de pneus. Medida de pneu é largura, perfil e aro, escrita com barras.';
const LIMITE_MS = 120_000;
// Vocabulario da loja pro whisper (22/10): medida falada sai "225/65/16" e nao "2, 2, 5, 6, 5, 16".
const VOCABULARIO = 'Atendimento de loja de pneus no WhatsApp. Medidas como 175/70 aro 14, 185/65/15, 195/55/15, 205/55/16, 265/60/18. Pneu GP Premium, remold, alinhamento, balanceamento, à vista, Pix, cartão, parcelar em 10 vezes, Luziânia.';

let fila: Promise<unknown> = Promise.resolve();

function rodar(cmd: string, args: string[], timeout: number): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout, maxBuffer: 4 * 1024 * 1024 }, (erro, stdout) => (erro ? reject(erro) : resolve(String(stdout))));
  });
}

function arquivoDoTexto(arquivoAudio: string): string {
  return path.join(PASTA, path.basename(arquivoAudio) + '.txt');
}

export function transcricaoLocalDisponivel(): boolean {
  return fs.existsSync(CLI) && fs.existsSync(MODELO);
}

export function transcricaoSalva(arquivoAudio: string): string | null {
  try {
    const f = arquivoDoTexto(arquivoAudio);
    return fs.existsSync(f) ? fs.readFileSync(f, 'utf8').trim() || null : null;
  } catch {
    return null;
  }
}

// Quase todas as palavras do texto estao no vocabulario do prompt (e ha pelo menos 3): o whisper "leu" o prompt.
function semAcento(s: string): string { return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
const PALAVRAS_VOCAB = new Set(semAcento(VOCABULARIO).split(/[^a-z0-9/]+/).filter(Boolean));
export function ehEcoDoVocabulario(texto: string): boolean {
  const palavras = semAcento(String(texto || '')).split(/[^a-z0-9/]+/).filter(Boolean);
  if (palavras.length < 3) return false;
  const doVocab = palavras.filter((p) => PALAVRAS_VOCAB.has(p)).length;
  return doVocab / palavras.length >= 0.85;
}

function memoriaLivreMB(): number {
  try { return Number(/MemAvailable:\s+(\d+)/.exec(fs.readFileSync('/proc/meminfo', 'utf8'))?.[1] || 0) / 1024; } catch { return 0; }
}
const temNumeroDeMedida = (t: string) => /\d{2}|\baro\b|\bmedida\b|cento e|duzentos/i.test(t);
const larguraPerfilValidos = (l: string, p: string) => { const a = Number(l), b = Number(p); return a >= 135 && a <= 335 && a % 10 === 5 && b >= 25 && b <= 85 && b % 5 === 0; };
const aroValido = (a: string) => Number(a) >= 12 && Number(a) <= 24;

// Os modelos escrevem a medida falada de varios jeitos ("1-9-5-60-15", "2256516", "955515", "um 75, 45", "R$1,8570,00").
// Aqui vira 195/60/15 ou 175/45; numero que nao forma medida valida fica como esta.
export function normalizarNumerosDeMedida(texto: string): string {
  let t = String(texto || '').replace(/R\$\s*/g, '').replace(/\b(\d+),00\b/g, '$1').replace(/\b1,(\d{4})\b/g, '1$1').replace(/\bum[,\s]+(\d{2})\b/gi, '1$1');
  t = t.replace(/\b(\d)[-.\s](\d)[-.\s](\d)[-.\s,]+(\d{2})[-.\s,]+(\d{2})\b/g, (m, a, b, c, p, r) => (larguraPerfilValidos(a + b + c, p) && aroValido(r) ? `${a}${b}${c}/${p}/${r}` : m));
  t = t.replace(/(?<![\d/.,])(\d{3})(\d{2})(\d{2})(?![\d/])/g, (m, l, p, r) => (larguraPerfilValidos(l, p) && aroValido(r) ? `${l}/${p}/${r}` : m));
  t = t.replace(/(?<![\d/.,])(9\d)(\d{2})(\d{2})(?![\d/])/g, (m, l, p, r) => (larguraPerfilValidos('1' + l, p) && aroValido(r) ? `1${l}/${p}/${r}` : m));
  t = t.replace(/(?<![\d/.,])(\d{3})(\d{2})(?![\d/])/g, (m, l, p) => (larguraPerfilValidos(l, p) ? `${l}/${p}` : m));
  t = t.replace(/(?<![\d/.,])(\d{3})(?:,\s+|\s+)(\d{2})(?![\d/,.]*\d)/g, (m, l, p) => (larguraPerfilValidos(l, p) ? `${l}/${p}` : m));
  t = t.replace(/\b(\d{3}\/\d{2})[,\s]+(?:n[eé]\??[,\s]+)?(\d{2})\b(?!\/)/gi, (m, lp, r) => (aroValido(r) ? `${lp}/${r}` : m));
  return t;
}

// Limpa o que o whisper escreve quando nao ha fala ("[Música]", "(risos)") e espacos sobrando.
function limpar(texto: string): string {
  return texto.replace(/\[[^\]]*\]|\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
}

async function transcrever(arquivoAudio: string, fino: boolean): Promise<string | null> {
  const wav = path.join(os.tmpdir(), `whisper-${process.pid}-${Date.now()}.wav`);
  try {
    await rodar('ffmpeg', ['-nostdin', '-loglevel', 'error', '-y', '-i', arquivoAudio, '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', wav], 60_000);
    // WAV 16 kHz mono 16 bits = 32.000 bytes por segundo. Audio curto usa uma janela menor do modelo
    // (audio-ctx): metade do tempo, mesmo texto (testado com audios reais de clientes).
    const segundos = Math.max(0, (fs.statSync(wav).size - 44) / 32000);
    const ctx = segundos > 0 && segundos <= 28 ? Math.min(1500, Math.ceil((segundos / 30) * 1500) + 128) : 0;
    const saida = await rodar('nice', ['-n', '15', CLI, '-m', MODELO, '-l', 'pt', '-t', '1', '-nt', '-np', '-ac', String(ctx), '--prompt', VOCABULARIO, '-f', wav], LIMITE_MS);
    let texto = limpar(saida);
    // 27/10 (caso 556182063976): audio de 2 s "A gente fica localizado?" saiu "Pneu GP Premium, remold, alinhamento,
    // balanceamento," — o whisper devolveu o PROPRIO vocabulario do --prompt e o robo mandou o audio do remold +
    // alinhamento + balanceamento. Texto que e so pedaco do vocabulario = alucinacao: roda de novo SEM o prompt.
    if (ehEcoDoVocabulario(texto)) {
      console.log(`[Transcricao] ${path.basename(arquivoAudio)}: saiu o vocabulario do prompt ("${texto.slice(0, 80)}") — repetindo sem prompt.`);
      const semPrompt = limpar(await rodar('nice', ['-n', '15', CLI, '-m', MODELO, '-l', 'pt', '-t', '1', '-nt', '-np', '-ac', String(ctx), '-f', wav], LIMITE_MS));
      texto = semPrompt; // sem prompt nao ha o que ecoar: se ainda fala de remold/alinhamento, o cliente falou mesmo
    }
    if (fino && temNumeroDeMedida(texto) && fs.existsSync(MODELO_FINO) && memoriaLivreMB() >= MEMORIA_MINIMA_FINO_MB) {
      const melhor = limpar(await rodar('nice', ['-n', '15', CLI, '-m', MODELO_FINO, '-l', 'pt', '-t', '1', '-nt', '-np', '--prompt', PROMPT_FINO, '-f', wav], LIMITE_FINO_MS).catch(() => ''));
      if (melhor.length >= 2) {
        console.log(`[Transcricao] ${path.basename(arquivoAudio)}: modelo fino "${melhor.slice(0, 120)}" (antes "${texto.slice(0, 80)}")`);
        texto = melhor;
      }
    }
    texto = normalizarNumerosDeMedida(texto);
    return texto.length >= 2 ? texto : null;
  } finally {
    fs.promises.unlink(wav).catch(() => {});
  }
}

// Um por vez (fila). Devolve null se nao deu pra transcrever (o robo entao pede pro cliente escrever).
export function transcreverAudioLocal(arquivoAudio: string, fino = false): Promise<string | null> {
  const salva = transcricaoSalva(arquivoAudio);
  if (salva) return Promise.resolve(salva);
  const tarefa = fila.then(async () => {
    const jaFeita = transcricaoSalva(arquivoAudio);
    if (jaFeita) return jaFeita;
    const inicio = Date.now();
    try {
      const texto = await transcrever(arquivoAudio, fino);
      if (texto) {
        fs.mkdirSync(PASTA, { recursive: true });
        fs.writeFileSync(arquivoDoTexto(arquivoAudio), texto);
      }
      console.log(`[Transcricao] ${path.basename(arquivoAudio)} em ${((Date.now() - inicio) / 1000).toFixed(1)}s: ${texto ? `"${texto.slice(0, 120)}"` : '(sem fala)'}`);
      return texto;
    } catch (e: any) {
      console.error(`[Transcricao] falhou ${path.basename(arquivoAudio)}:`, e?.message || e);
      return null;
    }
  });
  fila = tarefa.catch(() => null);
  return tarefa;
}
