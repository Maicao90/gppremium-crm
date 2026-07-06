import { Request, Response, NextFunction } from 'express';
import { prisma } from '../server';

// Ícone (emoji) exibido em cada botão da página pública, por tipo simples.
const EMOJI_ICONE: Record<string, string> = {
  whatsapp: '📱',
  instagram: '📷',
  site: '🌐',
  telefone: '📞',
  email: '✉️',
  generico: '🔗',
};

// border-radius do botão conforme o formato escolhido no painel.
const RAIO_FORMATO: Record<string, string> = {
  arredondado: '14px',
  quadrado: '0px',
  pill: '999px',
};

function escapeHtml(s: string): string {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function iniciais(titulo: string): string {
  const partes = String(titulo || '').trim().split(/\s+/).filter(Boolean);
  const primeira = partes[0] || '';
  const segunda = partes[1] || '';
  if (!primeira) return '?';
  if (!segunda) return primeira.slice(0, 2).toUpperCase();
  return ((primeira[0] ?? '') + (segunda[0] ?? '')).toUpperCase();
}

function renderPaginaLinkHTML(pagina: any, loja: any): string {
  let links: any[] = [];
  try { links = JSON.parse(pagina.links || '[]'); } catch { links = []; }
  if (!Array.isArray(links)) links = [];
  links = [...links].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));

  const raio = RAIO_FORMATO[pagina.formato] || RAIO_FORMATO.arredondado;
  const titulo = pagina.titulo || loja?.store_name || '';
  const bio = pagina.bio || '';

  const fotoHtml = pagina.fotoUrl
    ? `<img class="avatar" src="${escapeHtml(pagina.fotoUrl)}" alt="${escapeHtml(titulo)}" />`
    : `<div class="avatar avatar-fallback">${escapeHtml(iniciais(titulo))}</div>`;

  const botoesHtml = links.map((l: any) => {
    const emoji = EMOJI_ICONE[l.icone] || EMOJI_ICONE.generico;
    return `<a class="link-btn" href="${escapeHtml(l.url || '#')}" target="_blank" rel="noopener noreferrer">
      <span class="link-emoji">${emoji}</span><span class="link-label">${escapeHtml(l.label || '')}</span>
    </a>`;
  }).join('\n');

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(titulo)}</title>
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0;
    min-height: 100vh;
    background: ${escapeHtml(pagina.corFundo)};
    color: ${escapeHtml(pagina.corTexto)};
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    display: flex;
    justify-content: center;
  }
  .wrap {
    width: 100%;
    max-width: 480px;
    padding: 2.5rem 1.25rem 1.5rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
  }
  .avatar {
    width: 96px;
    height: 96px;
    border-radius: 50%;
    object-fit: cover;
    margin-bottom: 1rem;
    box-shadow: 0 0 0 3px rgba(255,255,255,0.15);
  }
  .avatar-fallback {
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(255,255,255,0.12);
    font-size: 1.75rem;
    font-weight: 700;
  }
  h1 { font-size: 1.35rem; margin: 0 0 0.4rem; }
  .bio { font-size: 0.92rem; opacity: 0.85; margin: 0 0 1.75rem; white-space: pre-line; }
  .links { width: 100%; display: flex; flex-direction: column; gap: 0.75rem; }
  .link-btn {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    justify-content: center;
    width: 100%;
    padding: 0.85rem 1rem;
    background: ${escapeHtml(pagina.corBotao)};
    color: ${escapeHtml(pagina.corTexto)};
    text-decoration: none;
    font-weight: 600;
    font-size: 0.95rem;
    border-radius: ${raio};
    transition: transform 0.12s ease, opacity 0.12s ease;
  }
  .link-btn:active { transform: scale(0.97); opacity: 0.9; }
  .link-emoji { font-size: 1.05rem; line-height: 1; }
  footer { margin-top: 2.5rem; font-size: 0.7rem; opacity: 0.45; }
</style>
</head>
<body>
  <div class="wrap">
    ${fotoHtml}
    <h1>${escapeHtml(titulo)}</h1>
    ${bio ? `<p class="bio">${escapeHtml(bio)}</p>` : ''}
    <div class="links">
      ${botoesHtml}
    </div>
    <footer>Criado com GP CRM</footer>
  </div>
</body>
</html>`;
}

// Middleware registrado ANTES do express.static: intercepta apenas quando o Host da
// requisição corresponde a um subdominio cadastrado de alguma Loja (PaginaLink ativa).
// Qualquer outro Host segue o fluxo normal via next() — nada muda pro resto do app.
export async function paginaLinkPublica(req: Request, res: Response, next: NextFunction) {
  try {
    if (req.method !== 'GET') return next();

    const hostname = (req.hostname || String(req.headers.host || '').split(':')[0] || '').toLowerCase();
    if (!hostname) return next();

    const pagina = await prisma.paginaLink.findFirst({ where: { subdominio: hostname, ativo: true } });
    if (!pagina) return next();

    const loja = await prisma.loja.findUnique({ where: { id: pagina.loja_id } });
    const html = renderPaginaLinkHTML(pagina, loja);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
    return;
  } catch (e) {
    // Qualquer erro inesperado: não trava o resto do app, apenas segue o fluxo normal.
    console.error('[paginaLinkPublica] Erro ao tentar servir página pública:', e);
    return next();
  }
}
