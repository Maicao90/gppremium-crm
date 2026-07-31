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

  // ⚠️ REGRA DE OURO (incidente 29/07/2026): NUNCA chutar quando o nome é AMBÍGUO.
  // A agenda tem 794 nomes repetidos — "carlos" sozinho aponta pra 28 números diferentes.
  // O código antigo usava findFirst() sem desempate, então pegava um "Carlos" QUALQUER e
  // mandava a mensagem do cliente certo pro cliente errado (vazamento de dados + confusão
  // real com cliente). Agora, se o nome resolve pra mais de um número DIFERENTE, devolvemos
  // null: é melhor o agendamento recusar e pedir o número do que acertar por sorte.

  // 1. Contato com nome EXATO (ignorando maiúsculas) — só se for inequívoco.
  try {
    const exatos = await prisma.contato.findMany({
      where: { usuarioId: { in: ids }, nome: { equals: bruto, mode: 'insensitive' }, NOT: { numero: '' } },
      select: { numero: true },
      take: 50,
    });
    const distintos = [...new Set(exatos.map((c) => normalizar(c.numero)).filter(Boolean))];
    if (distintos.length === 1) return distintos[0]!;
    if (distintos.length > 1) {
      console.warn(`[resolverNumeroContato] "${bruto}" é AMBÍGUO na agenda (${distintos.length} números diferentes) — recusando para não mandar pro contato errado.`);
      return null;
    }
  } catch { /* segue */ }

  // 2. Histórico: conversa cujo nome (pushName) bate — também só se for inequívoco.
  try {
    const msgs = await prisma.mensagem.findMany({
      where: { usuarioId: efetivoId, chatNome: { equals: bruto, mode: 'insensitive' }, numeroReal: { not: null } },
      select: { numeroReal: true },
      distinct: ['numeroReal'],
      take: 50,
    });
    const distintos = [...new Set(msgs.map((m) => normalizar(m.numeroReal || '')).filter(Boolean))];
    if (distintos.length === 1) return distintos[0]!;
    if (distintos.length > 1) {
      console.warn(`[resolverNumeroContato] "${bruto}" é AMBÍGUO no histórico (${distintos.length} números diferentes) — recusando.`);
      return null;
    }
  } catch { /* segue */ }

  // 3. Contato CONTENDO o nome — só se for resultado ÚNICO (pra não chutar errado)
  try {
    const parciais = await prisma.contato.findMany({
      where: { usuarioId: { in: ids }, nome: { contains: bruto, mode: 'insensitive' }, NOT: { numero: '' } },
      take: 2,
    });
    if (parciais.length === 1 && parciais[0]?.numero) return normalizar(parciais[0].numero);
  } catch { /* segue */ }

  // 4. Fallback tolerante a ACENTOS: o `mode: 'insensitive'` do Postgres ignora
  //    maiúsculas, mas NÃO acentos ("Joao" não casa com "João"). Aqui buscamos os
  //    contatos do usuário e comparamos pelos nomes normalizados (sem acento).
  try {
    // Normaliza pra casar nomes: minúsculo, sem acento E sem emoji/símbolos ("Ana
    // Paula 🌻" vira "ana paula"). Sem isso, um emoji no nome quebrava a busca.
    const norm = (s: string) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
    const alvo = norm(bruto);
    if (alvo) {
      const contatos = await prisma.contato.findMany({
        where: { usuarioId: { in: ids }, NOT: { numero: '' } },
        select: { nome: true, numero: true },
        take: 4000,
      });
      // Mesmo cuidado da etapa 1: se o nome normalizado casar com VÁRIOS números
      // diferentes, é ambíguo → recusa (não chuta).
      const exatosNorm = [...new Set(contatos.filter((c) => norm(c.nome) === alvo).map((c) => normalizar(c.numero)).filter(Boolean))];
      if (exatosNorm.length === 1) return exatosNorm[0]!;
      if (exatosNorm.length > 1) {
        console.warn(`[resolverNumeroContato] "${bruto}" é AMBÍGUO (${exatosNorm.length} números, comparação sem acento) — recusando.`);
        return null;
      }
      const parciaisNorm = [...new Set(contatos.filter((c) => norm(c.nome).includes(alvo)).map((c) => normalizar(c.numero)).filter(Boolean))];
      if (parciaisNorm.length === 1) return parciaisNorm[0]!;
      if (parciaisNorm.length > 1) {
        console.warn(`[resolverNumeroContato] "${bruto}" casa parcialmente com ${parciaisNorm.length} contatos — recusando.`);
        return null;
      }

      // Também no HISTÓRICO de conversa (chatNome -> numeroReal): aqui estão os números
      // que já foram RESOLVIDOS do @lid do WhatsApp. É o que acha o cliente com quem a
      // atendente conversou, mesmo quando o contato veio como @lid (sem número na agenda).
      const msgs = await prisma.mensagem.findMany({
        where: { usuarioId: efetivoId, numeroReal: { not: null } },
        select: { chatNome: true, numeroReal: true },
        distinct: ['chatNome'],
        orderBy: { timestamp: 'desc' },
        take: 4000,
      });
      // Idem no histórico: `distinct: ['chatNome']` NÃO garante número único (dois
      // "Carlos" com pushName igual viram duas linhas), então dedupe pelo NÚMERO.
      const nrExatos = [...new Set(msgs.filter((m) => m.chatNome && norm(m.chatNome) === alvo).map((m) => normalizar(m.numeroReal || '')).filter(Boolean))];
      if (nrExatos.length === 1) return nrExatos[0]!;
      if (nrExatos.length > 1) {
        console.warn(`[resolverNumeroContato] "${bruto}" é AMBÍGUO no histórico sem acento (${nrExatos.length} números) — recusando.`);
        return null;
      }
      const nrParciais = [...new Set(msgs.filter((m) => m.chatNome && norm(m.chatNome).includes(alvo)).map((m) => normalizar(m.numeroReal || '')).filter(Boolean))];
      if (nrParciais.length === 1) return nrParciais[0]!;
      if (nrParciais.length > 1) {
        console.warn(`[resolverNumeroContato] "${bruto}" casa parcialmente com ${nrParciais.length} conversas — recusando.`);
        return null;
      }
    }
  } catch { /* segue */ }

  return null;
}
