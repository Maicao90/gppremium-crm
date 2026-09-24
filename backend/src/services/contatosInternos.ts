import { prisma } from '../server';

// ── Contatos que NÃO são cliente (equipe, lojas do grupo e fornecedores) ──
// Uma regra só, usada nas métricas diárias (não contam como cliente), no tempo de atendimento da
// Caixa de Entrada (não ganham selo "esperando" — revisão 23/09: a Danúbia, contato interno, aparecia
// "esperando 16 min" em vermelho, e a Auto Peças "esperando 21h50") e no robô (não responde — 23/09:
// o robô respondeu um aviso interno da Danúbia como se fosse cliente).
export const apenasDigitos = (valor: unknown) => String(valor || '').replace(/\D/g, '');
// Todas as formas do mesmo telefone: com/sem 55 e com/sem o 9º dígito. O WhatsApp de muitos celulares
// antigos ainda é "55 61 8 dígitos" (12) enquanto o cadastro da loja tem o 9 (revisão 23/09: a loja
// cadastrada como (61) 99xxx-xxxx nunca batia com o 556199xxxxxx... sem o 9, e vice-versa).
export const variantesTelefone = (valor: unknown): string[] => {
  let numero = apenasDigitos(valor);
  if (!numero) return [];
  if ((numero.length === 12 || numero.length === 13) && numero.startsWith('55')) numero = numero.slice(2);
  if (numero.length !== 10 && numero.length !== 11) return [numero];
  const locais = new Set<string>([numero]);
  if (numero.length === 11 && numero[2] === '9') locais.add(numero.slice(0, 2) + numero.slice(3));
  // Sem o 9 e começando em 6-9 = celular no formato antigo (fixo começa em 2-5 e não ganha o 9).
  if (numero.length === 10 && /[6-9]/.test(numero[2] || '')) locais.add(numero.slice(0, 2) + '9' + numero.slice(2));
  return [...locais].flatMap((n) => [n, `55${n}`]);
};
export const JIDS_INTERNOS = ['162474519199930@lid', '125095301365845@lid'];
// Nome de fornecedor (comparado em minúsculas).
export const PADRAO_FORNECEDOR = '(pe[cç]as|fornecedor|distribuidora|auto mec[aâ]nica|mec[aâ]nica automotiva)';
export const REGEX_FORNECEDOR = new RegExp(PADRAO_FORNECEDOR);

export async function numerosInternos(): Promise<Set<string>> {
  const lojas = await prisma.loja.findMany({ select: { whatsapp: true, telefone_fixo: true } });
  // require na hora: o robô (botAtendimentoService) também usa este arquivo e o whatsappService importa o robô.
  const { numerosDasSessoesAtivas } = require('../workers/whatsappService');
  return new Set<string>([
    // Contatos internos conhecidos que nao sao necessariamente uma sessao do CRM.
    ...['556196233237', '556199241570'].flatMap(variantesTelefone),
    ...(numerosDasSessoesAtivas() as string[]).flatMap(variantesTelefone),
    ...lojas.flatMap((loja) => [
      ...variantesTelefone(loja.whatsapp),
      ...variantesTelefone(loja.telefone_fixo),
    ]),
  ]);
}

// Textos da mensagem automática de boas-vindas (auto-resposta) configurada nos atendentes. Ela sai sozinha
// assim que o cliente escreve, então NÃO é resposta de verdade: fica fora do "respondido" e do tempo da
// 1ª resposta (23/09, pedido do dono). Reconhecida pelo começo do texto (o WhatsApp às vezes muda espaços).
export async function inicioDasAutoRespostas(): Promise<string[]> {
  // Todos (não só quem está com ela ligada agora): quem desligou ontem ainda tem as de ontem no histórico.
  const us = await prisma.usuario.findMany({ select: { autoRespostaMensagem: true } });
  // Array.from conta por caractere (como o left() do Postgres): com .slice o emoji 👋 conta 2 e o começo não batia.
  return [...new Set(us
    .map((u) => Array.from(String(u.autoRespostaMensagem || '').trim().replace(/\s+/g, ' ')).slice(0, TAMANHO_INICIO_AUTO).join(''))
    .filter((t) => t.length >= 15))];
}
export const TAMANHO_INICIO_AUTO = 30;
