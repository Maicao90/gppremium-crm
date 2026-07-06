import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { prisma } from '../server';

const router = Router();

const erro = (res: any, e: any) => res.status(500).json({ error: e?.message || 'Erro' });

// Upload de imagem (logo/fundo) do Link na Bio: mesmo padrão de /api/inbox/enviar-midia
// (frontend manda base64 no corpo JSON, sem multer) — salva em public/midias/linkbio,
// servida estaticamente como caminho relativo (funciona em qualquer host/subdominio
// que aponte pra este mesmo backend).
const MIDIAS_LINKBIO_DIR = path.join(__dirname, '../../public/midias/linkbio');
const EXT_POR_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};
const TAMANHO_MAX_BYTES = 8 * 1024 * 1024; // 8MB

// Valores default usados quando a loja ainda não tem PaginaLink no banco
// (mesmos defaults do schema.prisma) — só pra popular o formulário vazio no painel.
const DEFAULTS = {
  id: null,
  loja_id: '',
  subdominio: null,
  titulo: '',
  bio: '',
  fotoUrl: null,
  imagemFundoUrl: null,
  corFundo: '#0d1122',
  corBotao: '#e8252c',
  corTexto: '#ffffff',
  formato: 'arredondado',
  links: '[]',
  ativo: true,
};

// Formato básico de subdomínio: minúsculo, sem espaço, com pelo menos um ponto.
const subdominioValido = (s: string) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(s) && !/\s/.test(s) && s === s.toLowerCase();

// Domínios do próprio sistema — nunca podem ser "roubados" pelo middleware de link na bio.
const HOSTS_RESERVADOS = ['crm.nailacademyprofissional.com', 'localhost'];

router.get('/', async (req, res) => {
  try {
    const lojaId = String(req.query.lojaId || '');
    if (!lojaId) return res.status(400).json({ error: 'lojaId obrigatório' });
    const pagina = await prisma.paginaLink.findUnique({ where: { loja_id: lojaId } });
    res.json(pagina || { ...DEFAULTS, loja_id: lojaId });
  } catch (e) { erro(res, e); }
});

router.post('/', async (req, res) => {
  try {
    const {
      lojaId, subdominio, titulo, bio, fotoUrl, imagemFundoUrl,
      corFundo, corBotao, corTexto, formato, links, ativo,
    } = req.body;

    if (!lojaId) return res.status(400).json({ error: 'lojaId obrigatório' });

    const loja = await prisma.loja.findUnique({ where: { id: lojaId } });
    if (!loja) return res.status(400).json({ error: 'Loja não encontrada.' });

    let subdominioNormalizado: string | null = null;
    if (subdominio && String(subdominio).trim()) {
      subdominioNormalizado = String(subdominio).trim().toLowerCase();
      if (!subdominioValido(subdominioNormalizado)) {
        return res.status(400).json({ error: 'Subdomínio inválido. Use algo como link.suaempresa.com.br (minúsculo, sem espaços).' });
      }
      if (HOSTS_RESERVADOS.includes(subdominioNormalizado)) {
        return res.status(400).json({ error: 'Esse endereço é reservado pelo sistema e não pode ser usado como subdomínio.' });
      }
      const emUsoPorOutra = await prisma.paginaLink.findUnique({ where: { subdominio: subdominioNormalizado } });
      if (emUsoPorOutra && emUsoPorOutra.loja_id !== lojaId) {
        return res.status(400).json({ error: 'Esse subdomínio já está em uso por outra loja.' });
      }
    }

    const data = {
      loja_id: lojaId,
      subdominio: subdominioNormalizado,
      titulo: titulo || '',
      bio: bio || '',
      fotoUrl: fotoUrl || null,
      imagemFundoUrl: imagemFundoUrl || null,
      corFundo: corFundo || '#0d1122',
      corBotao: corBotao || '#e8252c',
      corTexto: corTexto || '#ffffff',
      formato: formato || 'arredondado',
      links: JSON.stringify(Array.isArray(links) ? links : []),
      ativo: ativo !== undefined ? Boolean(ativo) : true,
    };

    let salvo;
    try {
      salvo = await prisma.paginaLink.upsert({
        where: { loja_id: lojaId },
        create: data,
        update: data,
      });
    } catch (e: any) {
      // Duas requisições concorrentes escolhendo o mesmo subdomínio: a constraint
      // @unique do banco pega a segunda, mas sem isso ela cairia no erro() genérico
      // (HTTP 500 com mensagem crua do Prisma) em vez do 400 amigável de cima.
      if (e?.code === 'P2002' && e?.meta?.target?.includes?.('subdominio')) {
        return res.status(400).json({ error: 'Esse subdomínio já está em uso por outra loja.' });
      }
      throw e;
    }

    res.status(201).json(salvo);
  } catch (e) { erro(res, e); }
});

router.post('/upload-imagem', async (req, res) => {
  try {
    const { base64, mimetype } = req.body;
    if (!base64) return res.status(400).json({ error: 'Envie a imagem (base64).' });

    const ext = EXT_POR_MIME[String(mimetype || '').toLowerCase()];
    if (!ext) return res.status(400).json({ error: 'Formato de imagem não suportado. Use JPG, PNG, WEBP ou GIF.' });

    const buffer = Buffer.from(String(base64), 'base64');
    if (buffer.length > TAMANHO_MAX_BYTES) {
      return res.status(400).json({ error: 'Imagem muito grande (máximo 8MB).' });
    }

    fs.mkdirSync(MIDIAS_LINKBIO_DIR, { recursive: true });
    const nome = `linkbio_${Date.now()}_${Math.floor(Math.random() * 1000000)}.${ext}`;
    fs.writeFileSync(path.join(MIDIAS_LINKBIO_DIR, nome), buffer);

    res.json({ url: `/midias/linkbio/${nome}` });
  } catch (e) { erro(res, e); }
});

router.delete('/:id', async (req, res) => {
  try { await prisma.paginaLink.delete({ where: { id: req.params.id } }); res.json({ success: true }); } catch (e) { erro(res, e); }
});

export default router;
