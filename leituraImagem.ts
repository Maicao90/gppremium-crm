import fs from 'fs';
import path from 'path';
import { chaveDoFluxo, ehChaveAnthropic, gerarTextoAnthropic } from './llmAnthropic';

// Leitura de FOTO da conversa pelo robo (21/10, pedido do dono: "o robo tem que enxergar o que a atendente faz").
// A foto (orcamento da atendente, lateral do pneu do cliente...) vira um texto curto que entra no historico.
// Claude le imagem; o texto fica guardado em data/leituras-imagem/ (cada foto e lida uma vez so).
const PASTA = path.resolve(__dirname, '../../data/leituras-imagem');
const MODELO = process.env.ANTHROPIC_MODEL_VISAO || 'claude-sonnet-5-5';

const INSTRUCAO: Record<'atendente' | 'cliente', string> = {
  atendente: 'Esta imagem foi enviada pela ATENDENTE de uma loja de pneus para o cliente no WhatsApp. '
    + 'Transcreva de forma objetiva o que importa para continuar o atendimento. Se for orcamento/tabela/lista de opcoes, '
    + 'liste CADA opcao numa linha com marca, modelo, medida e preco exatamente como esta escrito (diga se o preco e unitario ou total quando aparecer). '
    + 'Se for outra coisa (foto do pneu, da loja, localizacao, promocao), descreva em uma frase. Responda so o texto, em portugues, sem comentarios.',
  cliente: 'Esta imagem foi enviada pelo CLIENTE para uma loja de pneus no WhatsApp. Descreva em uma ou duas frases o que importa para o atendimento: '
    + 'se aparecer a medida do pneu (ex.: 175/65 R14) escreva a medida exata; se for print de anuncio, orcamento de outra loja, nota, carro ou roda, diga o que e '
    + 'e os valores/marcas que aparecem. Responda so o texto, em portugues, sem comentarios.',
};

function arquivoDoTexto(arquivoImagem: string): string {
  return path.join(PASTA, path.basename(arquivoImagem) + '.txt');
}

export function leituraSalva(arquivoImagem: string): string | null {
  try {
    const f = arquivoDoTexto(arquivoImagem);
    return fs.existsSync(f) ? fs.readFileSync(f, 'utf8').trim() || null : null;
  } catch {
    return null;
  }
}

export async function lerImagem(arquivoImagem: string, quem: 'atendente' | 'cliente'): Promise<string | null> {
  const salva = leituraSalva(arquivoImagem);
  if (salva) return salva;
  const chave = chaveDoFluxo();
  if (!chave || !ehChaveAnthropic(chave)) return null;
  try {
    const stat = fs.statSync(arquivoImagem);
    if (stat.size <= 0 || stat.size > 4.5 * 1024 * 1024) return null;
    const ext = path.extname(arquivoImagem).toLowerCase();
    const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : ext === '.gif' ? 'image/gif' : 'image/jpeg';
    const inicio = Date.now();
    const texto = (await gerarTextoAnthropic({
      apiKey: chave,
      model: MODELO,
      system: 'Voce le imagens de conversas de uma loja de pneus e devolve so o texto pedido.',
      mensagens: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: mime, data: fs.readFileSync(arquivoImagem).toString('base64') } },
        { type: 'text', text: INSTRUCAO[quem] },
      ] }],
      maxTokens: 500,
      timeoutMs: 45_000,
    })).replace(/\s+\n/g, '\n').trim().slice(0, 1200);
    if (!texto) return null;
    fs.mkdirSync(PASTA, { recursive: true });
    fs.writeFileSync(arquivoDoTexto(arquivoImagem), texto);
    console.log(`[LeituraImagem] ${path.basename(arquivoImagem)} (${quem}) em ${((Date.now() - inicio) / 1000).toFixed(1)}s: "${texto.slice(0, 120).replace(/\n/g, ' | ')}"`);
    return texto;
  } catch (e: any) {
    console.error(`[LeituraImagem] falhou ${path.basename(arquivoImagem)}:`, e?.message || e);
    return null;
  }
}
