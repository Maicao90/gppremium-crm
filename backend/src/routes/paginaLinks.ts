import { Router } from 'express';
import { prisma } from '../server';

const router = Router();

const erro = (res: any, e: any) => res.status(500).json({ error: e?.message || 'Erro' });

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

router.delete('/:id', async (req, res) => {
  try { await prisma.paginaLink.delete({ where: { id: req.params.id } }); res.json({ success: true }); } catch (e) { erro(res, e); }
});

export default router;
