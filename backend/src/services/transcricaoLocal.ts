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

// Limpa o que o whisper escreve quando nao ha fala ("[Música]", "(risos)") e espacos sobrando.
function limpar(texto: string): string {
  return texto.replace(/\[[^\]]*\]|\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
}

async function transcrever(arquivoAudio: string): Promise<string | null> {
  const wav = path.join(os.tmpdir(), `whisper-${process.pid}-${Date.now()}.wav`);
  try {
    await rodar('ffmpeg', ['-nostdin', '-loglevel', 'error', '-y', '-i', arquivoAudio, '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', wav], 60_000);
    // WAV 16 kHz mono 16 bits = 32.000 bytes por segundo. Audio curto usa uma janela menor do modelo
    // (audio-ctx): metade do tempo, mesmo texto (testado com audios reais de clientes).
    const segundos = Math.max(0, (fs.statSync(wav).size - 44) / 32000);
    const ctx = segundos > 0 && segundos <= 28 ? Math.min(1500, Math.ceil((segundos / 30) * 1500) + 128) : 0;
    const saida = await rodar('nice', ['-n', '15', CLI, '-m', MODELO, '-l', 'pt', '-t', '1', '-nt', '-np', '-ac', String(ctx), '--prompt', VOCABULARIO, '-f', wav], LIMITE_MS);
    const texto = limpar(saida);
    return texto.length >= 2 ? texto : null;
  } finally {
    fs.promises.unlink(wav).catch(() => {});
  }
}

// Um por vez (fila). Devolve null se nao deu pra transcrever (o robo entao pede pro cliente escrever).
export function transcreverAudioLocal(arquivoAudio: string): Promise<string | null> {
  const salva = transcricaoSalva(arquivoAudio);
  if (salva) return Promise.resolve(salva);
  const tarefa = fila.then(async () => {
    const jaFeita = transcricaoSalva(arquivoAudio);
    if (jaFeita) return jaFeita;
    const inicio = Date.now();
    try {
      const texto = await transcrever(arquivoAudio);
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
