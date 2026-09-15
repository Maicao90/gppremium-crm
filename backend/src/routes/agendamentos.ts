import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { prisma, io } from '../server';
import { ehEscopado, idsAtendentesDaLoja } from '../auth/escopoLoja';
import { resolverNumeroContato } from '../utils/resolverNumeroContato';
import { permiteAtendente } from './inbox';

const router = Router();

// Salva a mídia (base64, pode vir como data-URL) no disco e devolve o midiaUrl público
// (ex.: /midias/agendamentos/<uuid>.jpg). O arquivo é servido pelo express.static(public).
const EXT_POR_TIPO: Record<string, string> = { imagem: 'jpg', video: 'mp4', audio: 'ogg', documento: 'bin' };
function salvarMidiaBase64(midiaBase64: string, tipo: string, midiaNome?: string): string {
  let dados = String(midiaBase64 || '');
  let ext = '';
  const m = /^data:([^;]+);base64,([\s\S]*)$/.exec(dados);
  if (m && m[1] && m[2]) {
    ext = (m[1].split('/')[1] || '').split(';')[0] || '';
    dados = m[2];
  }
  // Extensão: prioridade pro nome do arquivo original (documento), depois o mime, depois o tipo.
  if (midiaNome && midiaNome.includes('.')) ext = String(midiaNome.split('.').pop()).toLowerCase();
  if (!ext) ext = EXT_POR_TIPO[tipo] || 'bin';
  ext = ext.replace(/[^a-z0-9]/gi, '').slice(0, 8) || 'bin';

  const buffer = Buffer.from(dados, 'base64');
  if (buffer.length === 0) throw new Error('arquivo vazio');
  const dir = path.join(__dirname, '../../public/midias/agendamentos');
  fs.mkdirSync(dir, { recursive: true });
  const nomeArquivo = crypto.randomUUID() + '.' + ext;
  fs.writeFileSync(path.join(dir, nomeArquivo), buffer);
  return '/midias/agendamentos/' + nomeArquivo;
}

// Listar agendamentos (permite isolar agendamentos de operadores pelo query param criadoPorId)
router.get('/', async (req, res) => {
  try {
    const { criadoPorId } = req.query;
    const where: any = {};

    if (criadoPorId && criadoPorId !== 'undefined' && criadoPorId !== 'null') {
      // 15/09: criadoPorId vindo do cliente era confiado CEGAMENTE — sem checar se quem
      // está logado (req.user) tem permissão pra ver os agendamentos desse id. Qualquer
      // operador autenticado conseguia ver os agendamentos de QUALQUER outro usuário só
      // passando ?criadoPorId=<uuid> na URL — inclusive de um negócio diferente sharing o
      // mesmo CRM (Daniel/Super Via x Daniel Amaral/seguro). Mesma trava do permiteAtendente
      // (inbox.ts): dono do próprio id, whatsappDonoId compartilhado, master, ou atendente
      // da própria loja (gerente) passam; senão 403 — nunca devolve dado de outro dono.
      if (!(await permiteAtendente(req, res, String(criadoPorId)))) return;
      where.criadoPorId = String(criadoPorId);
    } else {
      // 09/09: o parceiro TAMBEM aparece na listagem geral (pro DONO). Antes ele era
      // escondido aqui, e os agendamentos PENDENTES dele — mensagens que VAO ser enviadas
      // pra cliente de verdade — ficavam invisiveis. Caso Daniel Amaral (154 agendamentos,
      // 55 pendentes) sumindo da tela enquanto o Daniel da Super Via aparecia.
      //
      // MAS operador NAO e escopado (ehEscopado ignora role operador), entao sem esta trava
      // ele recebia a lista de TODO MUNDO. Ao liberar o parceiro, o Daniel passou a ver os
      // agendamentos do Daniel Amaral na area dele — dois negocios diferentes (pneu x seguro).
      // Agora: operador so ve os proprios; gerente ve os da loja (abaixo); master ve tudo.
      const meuId = (req.user as any)?.sub;
      if (meuId) {
        const eu = await prisma.usuario.findUnique({ where: { id: String(meuId) }, select: { role: true } });
        if (eu && eu.role === 'operador') where.criadoPorId = String(meuId);
      }
    }

    // Gerente logado só vê agendamentos dos atendentes da própria loja
    // (sobrepõe qualquer criadoPorId pedido pelo cliente).
    if (await ehEscopado(req)) {
      where.criadoPorId = { in: (await idsAtendentesDaLoja(req)) || [] };
    }

    const agendamentos = await prisma.agendamento.findMany({
      where,
      include: { criadoPor: { select: { id: true, nome: true, email: true, role: true } } },
      orderBy: { enviarEm: 'asc' }
    });
    res.json(agendamentos);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao buscar agendamentos' });
  }
});

// Gráfico de envios por dia (últimos N dias). Opcional: filtra por criadoPorId.
router.get('/grafico', async (req, res) => {
  try {
    const dias = Math.min(Math.max(parseInt(String(req.query.dias)) || 7, 1), 60);
    const inicio = new Date();
    inicio.setHours(0, 0, 0, 0);
    inicio.setDate(inicio.getDate() - (dias - 1));

    const where: any = { status: 'enviado', atualizadoEm: { gte: inicio } };
    const { criadoPorId } = req.query;
    if (criadoPorId && criadoPorId !== 'undefined' && criadoPorId !== 'null') {
      // 15/09: mesma trava do GET / acima — criadoPorId do cliente não pode ser confiado
      // sem checar se req.user tem permissão de ver os dados desse id (ver permiteAtendente).
      if (!(await permiteAtendente(req, res, String(criadoPorId)))) return;
      where.criadoPorId = String(criadoPorId);
    }
    // Gerente só vê o gráfico dos atendentes da própria loja.
    if (await ehEscopado(req)) {
      where.criadoPorId = { in: (await idsAtendentesDaLoja(req)) || [] };
    }

    const enviados = await prisma.agendamento.findMany({ where, select: { atualizadoEm: true } });

    // Inicializa todos os dias com 0
    const mapa: Record<string, number> = {};
    for (let i = 0; i < dias; i++) {
      const d = new Date(inicio);
      d.setDate(inicio.getDate() + i);
      mapa[d.toISOString().slice(0, 10)] = 0;
    }
    enviados.forEach(e => {
      const key = new Date(e.atualizadoEm).toISOString().slice(0, 10);
      if (mapa[key] !== undefined) mapa[key]++;
    });

    res.json(Object.entries(mapa).map(([dia, total]) => ({ dia, total })));
  } catch (error) {
    console.error('Erro ao gerar gráfico:', error);
    res.status(500).json({ error: 'Erro ao gerar gráfico' });
  }
});

// Lookup: resolve um NOME de contato para o número de WhatsApp, usando a agenda
// sincronizada + histórico de conversa. A extensão chama isto no formulário de
// agendamento pra preencher o campo de número na hora (quando o navegador não achou
// o número). Nunca falha com erro: se não encontrar, devolve { numero: null }.
router.get('/numero-contato', async (req, res) => {
  try {
    const nome = String(req.query.nome ?? '').trim();
    const usuarioId = String(req.query.usuarioId ?? req.query.criadoPorId ?? '').trim();
    if (!nome || !usuarioId) return res.json({ numero: null });
    const numero = await resolverNumeroContato(usuarioId, nome);
    return res.json({ numero: numero ?? null });
  } catch (error) {
    console.error('Erro no lookup de numero-contato:', error);
    return res.json({ numero: null });
  }
});

// Criar agendamento
router.post('/', async (req, res) => {
  try {
    const { cliente, numero, mensagem, enviarEm, criadoPorId, cancelarSeResponder, midiaBase64, tipo, midiaNome } = req.body;

    let usuario = await prisma.usuario.findUnique({ where: { id: criadoPorId } });
    if (!usuario) {
      usuario = await prisma.usuario.create({
        data: { id: criadoPorId, nome: 'Atendente ' + criadoPorId.substring(0,4) }
      });
    }

    // A extensão manda o NOME no campo numero quando não conseguiu extrair o telefone
    // da tela do WhatsApp. Resolve aqui (agenda sincronizada + histórico); se não der,
    // recusa JÁ com mensagem clara — antes aceitava e falhava em silêncio no disparo.
    const entrada = String(numero ?? '').trim() || String(cliente ?? '').trim();
    const numeroResolvido = await resolverNumeroContato(usuario.id, entrada);
    if (!numeroResolvido) {
      return res.status(400).json({ error: `Não consegui identificar com segurança o número de "${entrada || 'contato'}" (nome não encontrado, ou existe mais de um contato com esse nome). Digite o número do WhatsApp com DDD (ex.: 61999998888).` });
    }

    // Anexo de mídia (opcional): salva o arquivo no disco e guarda o caminho.
    let tipoFinal = 'texto';
    let midiaUrl: string | null = null;
    let midiaNomeFinal: string | null = null;
    if (midiaBase64 && tipo && ['imagem', 'video', 'audio', 'documento'].includes(String(tipo))) {
      try {
        midiaUrl = salvarMidiaBase64(String(midiaBase64), String(tipo), midiaNome);
        tipoFinal = String(tipo);
        midiaNomeFinal = midiaNome ? String(midiaNome).slice(0, 200) : null;
      } catch (e) {
        console.error('[Agendamento] Falha ao salvar mídia:', e);
        return res.status(400).json({ error: 'Não consegui salvar o arquivo anexado. Tente outro arquivo.' });
      }
    }

    // ── TRAVA ANTI-DUPLICATA (incidente 29/07/2026) ──
    // Clique duplo no botão, retry de rede da extensão ou reenvio do formulário criavam
    // VÁRIOS agendamentos idênticos — 30 cópias da mesma mensagem chegaram a ser criadas
    // em 3 segundos e o worker disparou tudo, virando spam no WhatsApp do cliente (risco
    // real de banimento do número). Se já existe um agendamento PENDENTE igual (mesmo
    // número + mesma mensagem + mesmo horário de envio), devolve o que já existe em vez
    // de criar outro. Idempotente: o operador pode clicar 10x que agenda uma vez só.
    const msgNormalizada = String(mensagem || '').trim().replace(/\s+/g, ' ');
    const quandoEnviar = new Date(enviarEm);
    const jaExiste = await prisma.agendamento.findFirst({
      where: {
        numero: numeroResolvido,
        status: 'pendente',
        enviarEm: quandoEnviar,
        criadoPorId: usuario.id,
      },
      orderBy: { criadoEm: 'desc' },
    });
    if (jaExiste && String(jaExiste.mensagem || '').trim().replace(/\s+/g, ' ') === msgNormalizada) {
      console.log(`[Agendamento] Duplicata evitada (numero ${numeroResolvido}) — devolvendo o agendamento ${jaExiste.id} que já existia.`);
      return res.status(200).json(jaExiste);
    }

    const agendamento = await prisma.agendamento.create({
      data: {
        cliente,
        numero: numeroResolvido,
        mensagem: mensagem || '',
        enviarEm: quandoEnviar,
        criadoPorId: usuario.id,
        cancelarSeResponder: cancelarSeResponder !== undefined ? cancelarSeResponder : true,
        tipo: tipoFinal,
        midiaUrl,
        midiaNome: midiaNomeFinal
      }
    });

    // Envia o evento de socket isolado para a sala do usuário
    io.to(usuario.id).emit('AGENDAMENTO_CRIADO', agendamento);
    res.status(201).json(agendamento);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao criar agendamento' });
  }
});

// Atualizar status
router.put('/:id/status', async (req, res) => {
  try {
    const id = String(req.params.id);
    const { status, observacoes } = req.body;

    if (await ehEscopado(req)) {
      const ids = (await idsAtendentesDaLoja(req)) || [];
      const alvo = await prisma.agendamento.findUnique({ where: { id } });
      if (!alvo || !ids.includes(alvo.criadoPorId)) return res.status(403).json({ error: 'Sem acesso a este agendamento.' });
    }

    const updateData: any = { status };
    if (observacoes !== undefined) {
      updateData.observacoes = typeof observacoes === 'object' ? JSON.stringify(observacoes) : observacoes;
    }

    const agendamento = await prisma.agendamento.update({
      where: { id },
      data: updateData
    });

    io.to(agendamento.criadoPorId).emit('STATUS_ATUALIZADO', agendamento);
    res.json(agendamento);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao atualizar status' });
  }
});

// Excluir agendamento
router.delete('/:id', async (req, res) => {
  try {
    const id = String(req.params.id);
    const agendamento = await prisma.agendamento.findUnique({ where: { id } });
    if (await ehEscopado(req)) {
      const ids = (await idsAtendentesDaLoja(req)) || [];
      if (!agendamento || !ids.includes(agendamento.criadoPorId)) return res.status(403).json({ error: 'Sem acesso a este agendamento.' });
    }
    if (agendamento) {
      await prisma.agendamento.delete({
        where: { id }
      });
      io.to(agendamento.criadoPorId).emit('AGENDAMENTO_EXCLUIDO', { id });
    }
    res.sendStatus(204);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao excluir agendamento' });
  }
});

// Editar agendamento
router.put('/:id', async (req, res) => {
  try {
    const id = String(req.params.id);
    const { cliente, numero, mensagem, enviarEm, cancelarSeResponder } = req.body;

    const agendamentoAtual = await prisma.agendamento.findUnique({ where: { id } });
    if (!agendamentoAtual) {
      return res.status(404).json({ error: 'Agendamento não encontrado' });
    }
    if (await ehEscopado(req)) {
      const ids = (await idsAtendentesDaLoja(req)) || [];
      if (!ids.includes(agendamentoAtual.criadoPorId)) return res.status(403).json({ error: 'Sem acesso a este agendamento.' });
    }

    const novoStatus = agendamentoAtual.status === 'falhou' || agendamentoAtual.status === 'cliente_respondeu' ? 'pendente' : agendamentoAtual.status;

    const agendamento = await prisma.agendamento.update({
      where: { id },
      data: {
        cliente,
        numero,
        mensagem,
        enviarEm: new Date(enviarEm),
        cancelarSeResponder: cancelarSeResponder !== undefined ? cancelarSeResponder : true,
        status: novoStatus
      }
    });

    io.to(agendamento.criadoPorId).emit('AGENDAMENTO_ATUALIZADO', agendamento);
    res.json(agendamento);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao editar agendamento' });
  }
});

export default router;

