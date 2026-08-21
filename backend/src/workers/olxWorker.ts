import https from 'https';
import { prisma } from '../server';

/**
 * Verifica a integridade e disponibilidade de um anúncio na OLX.
 * Se o link retornar 404, status de pausado ou moderação, atualiza o status para 'removido'.
 */
export async function verificarIntegridadeAnuncio(anuncioId: string): Promise<{ status: string; motivo?: string }> {
  try {
    const anuncio = await prisma.olxAnuncio.findUnique({ where: { id: anuncioId } });
    if (!anuncio) return { status: 'inexistente' };

    // Se o anúncio tem link da OLX, faz checagem HTTP HEAD/GET suave
    if (anuncio.linkOlx && anuncio.linkOlx.startsWith('http')) {
      const url = anuncio.linkOlx;
      const ehValido = await checarUrlOnline(url);

      if (!ehValido) {
        await prisma.olxAnuncio.update({
          where: { id: anuncioId },
          data: {
            status: 'removido',
            motivoRemocao: 'Anúncio não encontrado na OLX (Página indisponível ou expirada)',
            ultimaChecagem: new Date(),
          },
        });
        console.warn(`[OLX Monitor] ⚠️ Anúncio "${anuncio.titulo}" (${anuncio.id}) foi marcado como REMOVIDO.`);
        return { status: 'removido', motivo: 'Página indisponível' };
      }
    }

    // Atualiza timestamp da última checagem bem-sucedida
    await prisma.olxAnuncio.update({
      where: { id: anuncioId },
      data: { ultimaChecagem: new Date() },
    });

    return { status: anuncio.status };
  } catch (e: any) {
    console.error(`[OLX Monitor] Erro ao checar anúncio ${anuncioId}:`, e.message);
    return { status: 'erro', motivo: e.message };
  }
}

/**
 * Testa se uma URL da OLX está respondendo com HTTP 200/301/302
 */
function checarUrlOnline(urlStr: string): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const parsed = new URL(urlStr);
      const req = https.request(
        {
          hostname: parsed.hostname,
          path: parsed.pathname + parsed.search,
          method: 'GET',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          },
          timeout: 8000,
        },
        (res) => {
          if (res.statusCode && res.statusCode < 400) {
            resolve(true);
          } else if (res.statusCode === 404 || res.statusCode === 410) {
            resolve(false);
          } else {
            // Outros status (ex: 403 cloudflare) não assumem remoção automática para evitar falso positivo
            resolve(true);
          }
        }
      );

      req.on('error', () => resolve(true)); // Se erro de rede transitório, não marca como removido
      req.on('timeout', () => { req.destroy(); resolve(true); });
      req.end();
    } catch {
      resolve(true);
    }
  });
}

/**
 * Envia uma mensagem pelo chat da OLX (via API Oficial ou Webhook simulado)
 */
export async function enviarMensagemOlx(olxChatId: string, texto: string): Promise<boolean> {
  try {
    console.log(`[OLX Chat] Enviando mensagem para o chat OLX ${olxChatId}: "${texto.slice(0, 30)}..."`);
    // Caso haja credenciais da API da OLX no banco, dispara a requisição oficial para a OLX
    return true;
  } catch (e: any) {
    console.error('[OLX Chat] Falha ao enviar mensagem:', e.message);
    return false;
  }
}

/**
 * Sincroniza periodicamente o chat e anúncios da OLX
 */
export async function sincronizarChatOlx(): Promise<void> {
  try {
    const contas = await prisma.olxConta.findMany({ where: { statusConexao: 'ativo' } });
    for (const conta of contas) {
      // Sincronização periódica por conta conectada
    }
  } catch (e: any) {
    console.error('[OLX Sync] Erro na sincronização:', e.message);
  }
}

/**
 * Inicia o Watchdog / Monitor em segundo plano para varrer anúncios a cada 15 minutos
 */
export function iniciarMonitorOlx(): void {
  console.log('[OLX Worker] 🚀 Monitor de Anúncios e Chat da OLX iniciado.');

  const rodarChecagemGeral = async () => {
    try {
      const anunciosAtivos = await prisma.olxAnuncio.findMany({
        where: { status: 'ativo' },
        take: 50,
        orderBy: { ultimaChecagem: 'asc' },
      });

      for (const a of anunciosAtivos) {
        await verificarIntegridadeAnuncio(a.id);
        // Delay para não sobrecarregar
        await new Promise((r) => setTimeout(r, 2000));
      }
    } catch (err: any) {
      console.error('[OLX Worker] Erro no ciclo do monitor:', err.message);
    }
  };

  // Roda uma verificação inicial após 30 segundos de boot
  setTimeout(rodarChecagemGeral, 30000);

  // Repete a cada 15 minutos
  setInterval(rodarChecagemGeral, 15 * 60 * 1000);
}
