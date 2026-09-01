import { Request, Response, NextFunction } from 'express';
import { prisma } from '../server';

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

// Transforma "Feirão dos Pneus" em "feirao-dos-pneus" — usado no link público por
// caminho (/p/<slug>), que funciona sem depender de DNS próprio da loja.
function slugify(s: string): string {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
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

  // Imagem de fundo (opcional): cobre a tela toda, centralizada, sem repetir —
  // assim qualquer tamanho de imagem que a loja subir fica bem enquadrado,
  // sem depender de a pessoa cortar a imagem num tamanho exato antes.
  const fundoStyle = pagina.imagemFundoUrl
    ? `background-image: url('${escapeHtml(pagina.imagemFundoUrl)}'); background-size: cover; background-position: center; background-repeat: no-repeat; background-color: ${escapeHtml(pagina.corFundo)};`
    : `background: ${escapeHtml(pagina.corFundo)};`;

  const fotoHtml = pagina.fotoUrl
    ? `<img class="avatar" src="${escapeHtml(pagina.fotoUrl)}" alt="${escapeHtml(titulo)}" />`
    : `<div class="avatar avatar-fallback">${escapeHtml(iniciais(titulo))}</div>`;

  const botoesHtml = links.map((l: any) => {
    return `<a class="link-btn" href="${escapeHtml(l.url || '#')}" target="_blank" rel="noopener noreferrer">
      <span class="link-label">${escapeHtml(l.label || '')}</span>
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
    ${fundoStyle}
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
  .wrap-com-fundo {
    margin: 1.5rem 0;
    padding: 2rem 1.25rem 1.5rem;
    border-radius: 20px;
    background: rgba(0,0,0,0.38);
    backdrop-filter: blur(6px);
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
</style>
</head>
<body>
  <div class="wrap${pagina.imagemFundoUrl ? ' wrap-com-fundo' : ''}">
    ${fotoHtml}
    <h1>${escapeHtml(titulo)}</h1>
    ${bio ? `<p class="bio">${escapeHtml(bio)}</p>` : ''}
    <div class="links">
      ${botoesHtml}
    </div>
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

    // Link público por CAMINHO (não depende de DNS próprio): /p/<slug>, onde slug é
    // o id da loja OU o nome da loja "slugificado" (ex.: /p/gp-premium). Assim a loja
    // já tem um link que funciona no mesmo domínio do painel (com HTTPS), na hora.
    const mPath = req.path.match(/^\/p\/([^/]+)\/?$/);
    if (mPath) {
      const slug = decodeURIComponent(mPath[1] ?? '').toLowerCase();
      if (!slug) return next();
      const paginas = await prisma.paginaLink.findMany({ where: { ativo: true } });
      let pagina = paginas.find((p) => p.loja_id === slug) ?? null;
      let loja: any = null;
      if (!pagina) {
        const lojas = await prisma.loja.findMany();
        const byId: Record<string, any> = {};
        lojas.forEach((l) => { byId[l.id] = l; });
        pagina = paginas.find((p) => {
          const l = byId[p.loja_id];
          const sub = String(p.subdominio || '').toLowerCase();
          const subFirst = sub.split('.')[0] ?? '';
          return (l ? slugify(l.store_name) === slug : false) || sub === slug || subFirst === slug;
        }) ?? null;
        if (pagina) loja = byId[pagina.loja_id] ?? null;
      }
      if (!pagina) return next();
      if (!loja) loja = await prisma.loja.findUnique({ where: { id: pagina.loja_id } });
      const html = renderPaginaLinkHTML(pagina, loja);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
      return;
    }

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
