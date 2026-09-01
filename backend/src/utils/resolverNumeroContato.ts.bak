import { prisma } from '../server';
import { resolverConexaoEfetiva } from '../workers/whatsappService';

// A extensão às vezes manda o NOME do contato no campo "numero" do agendamento
// (quando a busca no WhatsApp Web não consegue extrair o número da tela). Antes
// isso virava um agendamento que falhava na hora do envio ("Robson Fox" não é
// telefone). Este resolvedor transforma nome → número usando o que o servidor
// JÁ tem: a agenda sincronizada (Contato) e o histórico de conversas (Mensagem).

// True se a entrada parece um telefone (só dígitos/pontuação de telefone).
export function pareceNumero(entrada: string): boolean {
  const bruto = String(entrada || '').trim();
  if (!bruto) return false;
  const semPontuacao = bruto.replace(/[\s\-().+]/g, '');
  return /^\d{8,}$/.test(semPontuacao);
}

// Normaliza um telefone BR: só dígitos + DDI 55 quando faltar.
function normalizar(numero: string): string {
  let limpo = String(numero || '').replace(/\D/g, '');
  if ((limpo.length === 10 || limpo.length === 11) && !limpo.startsWith('55')) limpo = '55' + limpo;
  return limpo;
}

// Resolve a entrada (nome OU número) para um telefone. Retorna null se não achar.
export async function resolverNumeroContato(criadoPorId: string, entrada: string): Promise<string | null> {
  const bruto = String(entrada || '').trim();
  if (!bruto) return null;
  if (pareceNumero(bruto)) return normalizar(bruto);

  // É um nome: procura nos contatos do atendente E do dono da conexão (se compartilhada).
  let efetivoId = criadoPorId;
  try { efetivoId = await resolverConexaoEfetiva(criadoPorId); } catch { /* segue com o próprio */ }
  const ids = [...new Set([criadoPorId, efetivoId])];

  // 1. Contato com nome EXATO (ignorando maiúsculas)
  try {
    const exato = await prisma.contato.findFirst({
      where: { usuarioId: { in: ids }, nome: { equals: bruto, mode: 'insensitive' }, NOT: { numero: '' } },
    });
    if (exato?.numero) return normalizar(exato.numero);
  } catch { /* segue */ }

  // 2. Histórico: conversa cujo nome (pushName) bate e que tem o número real resolvido
  try {
    const msg = await prisma.mensagem.findFirst({
      where: { usuarioId: efetivoId, chatNome: { equals: bruto, mode: 'insensitive' }, numeroReal: { not: null } },
      orderBy: { timestamp: 'desc' },
      select: { numeroReal: true },
    });
    if (msg?.numeroReal) return normalizar(msg.numeroReal);
  } catch { /* segue */ }

  // 3. Contato CONTENDO o nome — só se for resultado ÚNICO (pra não chutar errado)
  try {
    const parciais = await prisma.contato.findMany({
      where: { usuarioId: { in: ids }, nome: { contains: bruto, mode: 'insensitive' }, NOT: { numero: '' } },
      take: 2,
    });
    if (parciais.length === 1 && parciais[0]?.numero) return normalizar(parciais[0].numero);
  } catch { /* segue */ }

  return null;
}
