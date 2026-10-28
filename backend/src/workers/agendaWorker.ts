import fs from 'fs';
import path from 'path';
import { prisma, io } from '../server';
import { pareceNumero, resolverNumeroContato } from '../utils/resolverNumeroContato';

// Apaga o arquivo de mídia do agendamento do disco (best-effort, não bloqueia o loop).
// Chamado quando o agendamento chega a um estado final (enviado / falhou de vez).
function apagarMidiaAgendamento(midiaUrl?: string | null) {
  if (!midiaUrl) return;
  try {
    const abs = path.join(__dirname, '../../public', String(midiaUrl));
    fs.unlink(abs, () => {});
  } catch (e) { /* ignora */ }
}

// Lembrete automatico (robo-* / "Ainda está precisando?" / 🙋) pra contato que falou de curriculo/vaga nos ultimos 30 dias.
const LEMBRETE_AUTOMATICO = /Ainda est[aá] precisando\?|🙋/;
export async function ehLembreteDeCandidato(a: { criadoPorId: string; numero: string; mensagem: string; observacoes?: string | null }): Promise<boolean> {
  try {
    if (!String(a.observacoes || '').startsWith('robo-') && !LEMBRETE_AUTOMATICO.test(String(a.mensagem || ''))) return false;
    const final8 = String(a.numero || '').replace(/\D/g, '').slice(-8);
    if (final8.length < 8) return false;
    const msgs = await prisma.mensagem.findMany({
      where: { usuarioId: a.criadoPorId, timestamp: { gte: new Date(Date.now() - 30 * 86400_000) }, OR: [{ numeroReal: { contains: final8 } }, { chatJid: { contains: final8 } }] },
      select: { texto: true }, orderBy: { timestamp: 'desc' }, take: 200,
    });
    const { ehCandidatoAVaga } = require('./botAtendimentoService');
    return ehCandidatoAVaga(msgs.map((m: any) => String(m.texto || '')));
  } catch (e: any) {
    console.error('[Worker] checagem de curriculo falhou (agendamento segue):', e?.message || e);
    return false;
  }
}

// Função utilitária para verificar se a hora atual do sistema está no expediente configurado
async function estaNoExpediente(agora: Date): Promise<boolean> {
  try {
    let config = await prisma.configuracao.findUnique({ where: { id: 'global' } });
    if (!config) {
      config = await prisma.configuracao.create({
        data: {
          id: 'global',
          expedienteAtivo: false,
          expedienteInicio: '08:00',
          expedienteFim: '18:00',
          expedienteDias: '1,2,3,4,5'
        }
      });
    }

    if (!config.expedienteAtivo) {
      return true;
    }

    const diaSemana = agora.getDay();
    const diasConfigurados = config.expedienteDias.split(',').map(d => parseInt(d.trim()));

    if (!diasConfigurados.includes(diaSemana)) {
      return false;
    }

    const horaAtual = agora.getHours();
    const minutoAtual = agora.getMinutes();
    const tempoAtualEmMinutos = horaAtual * 60 + minutoAtual;

    const partesInicio = config.expedienteInicio.split(':').map(Number);
    const hInicio = partesInicio[0] !== undefined ? partesInicio[0] : 8;
    const mInicio = partesInicio[1] !== undefined ? partesInicio[1] : 0;
    const tempoInicioEmMinutos = hInicio * 60 + mInicio;

    const partesFim = config.expedienteFim.split(':').map(Number);
    const hFim = partesFim[0] !== undefined ? partesFim[0] : 18;
    const mFim = partesFim[1] !== undefined ? partesFim[1] : 0;
    let tempoFimEmMinutos = hFim * 60 + mFim;

    if (tempoFimEmMinutos === 0 || tempoFimEmMinutos < tempoInicioEmMinutos) {
      tempoFimEmMinutos = 24 * 60;
    }

    return tempoAtualEmMinutos >= tempoInicioEmMinutos && tempoAtualEmMinutos <= tempoFimEmMinutos;
  } catch (error) {
    console.error("[Worker] Erro ao verificar horário de expediente:", error);
    return true;
  }
}

// Intervalo de retry para agendamentos que falharam: 3 minutos
const INTERVALO_RETRY_MS = 3 * 60 * 1000;
// Máximo de tentativas de retry
const MAX_TENTATIVAS = 3;

// ════════════════════════════════════════════════════════════════════════
// CONFIGURAÇÕES ANTI-BAN (ajuste estes valores conforme necessário)
// ════════════════════════════════════════════════════════════════════════
// 1) Intervalo ALEATÓRIO entre o envio de uma mensagem e a próxima (em ms).
//    Evita disparo em rajada, que é o principal fator de banimento.
const GAP_MIN_MS = 20 * 1000;  // mínimo 20 segundos
const GAP_MAX_MS = 90 * 1000;  // máximo 90 segundos
// 2) Limite máximo de mensagens enviadas por usuário POR DIA (0 = ilimitado).
//    O que passar do limite continua 'pendente' e dispara no dia seguinte.
const LIMITE_DIARIO_POR_USUARIO = 200;
// ════════════════════════════════════════════════════════════════════════

// Pausa assíncrona simples
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Retorna um inteiro aleatório entre min e max (inclusive)
function gapAleatorio(): number {
  return Math.floor(Math.random() * (GAP_MAX_MS - GAP_MIN_MS + 1)) + GAP_MIN_MS;
}

// Variação leve e INVISÍVEL do texto, só para as mensagens não ficarem byte-a-byte
// idênticas. NÃO usamos mais o caractere de largura zero (U+200B): ele aparecia como
// "?" em alguns aparelhos, sujando a mensagem. Agora só varia espaços no final (invisível).
function humanizarTexto(texto: string): string {
  return texto + " ".repeat(Math.floor(Math.random() * 3));
}

export function initWorker() {
  console.log("Worker de agendamentos iniciado (Polling 10s, Retry Persistente no SQLite & Expediente Seguro)");
  
  // Loop recursivo robusto para evitar atropelamento de tarefas
  async function loopWorker() {
    try {
      const agora = new Date();

      // ─── 1. RECUPERAÇÃO DE TRAVADOS ─────────────────────────────────────
      // Se algum agendamento ficou travado em 'enviando' por mais de 5 minutos,
      // reseta para 'pendente' para nova tentativa de envio
      const cincoMinutosAtras = new Date(agora.getTime() - 5 * 60 * 1000);
      const travadosRecuperados = await prisma.agendamento.updateMany({
        where: {
          status: 'enviando',
          atualizadoEm: { lte: cincoMinutosAtras }
        },
        data: { status: 'pendente' }
      });

      if (travadosRecuperados.count > 0) {
        console.log(`[Worker] Recuperação: ${travadosRecuperados.count} agendamento(s) travado(s) em 'enviando' → 'pendente'.`);
      }

      // ─── 2. RETRY AUTOMÁTICO DE AGENDAMENTOS QUE FALHARAM (PERSISTIDO NO SQLITE) ───
      // Agendamentos com status 'falhou' há mais de 3 minutos são retentados.
      // O histórico de tentativas e logs de erro é salvo no campo 'observacoes'.
      const tresMinutosAtras = new Date(agora.getTime() - INTERVALO_RETRY_MS);
      const falhadosParaRetry = await prisma.agendamento.findMany({
        where: {
          status: 'falhou',
          atualizadoEm: { lte: tresMinutosAtras }
        }
      });

      for (const ag of falhadosParaRetry) {
        let dadosRetry = { tentativas: 0, erros: [] as string[] };
        if (ag.observacoes) {
          try {
            const parsed = JSON.parse(ag.observacoes);
            if (typeof parsed === 'object' && parsed !== null) {
              dadosRetry = {
                tentativas: typeof parsed.tentativas === 'number' ? parsed.tentativas : 0,
                erros: Array.isArray(parsed.erros) ? parsed.erros : []
              };
            }
          } catch (e) {
            // Caso seja texto de erro antigo de versões anteriores
            dadosRetry = { tentativas: 1, erros: [ag.observacoes] };
          }
        }

        if (dadosRetry.tentativas < MAX_TENTATIVAS) {
          dadosRetry.tentativas += 1;
          await prisma.agendamento.update({
            where: { id: ag.id },
            data: {
              status: 'pendente',
              observacoes: JSON.stringify(dadosRetry)
            }
          });
          console.log(`[Worker] Retry automático: Agendamento ${ag.id} (tentativa ${dadosRetry.tentativas}/${MAX_TENTATIVAS}) → 'pendente'.`);
        } else {
          // BUG CORRIGIDO: antes não tocava em `atualizadoEm`, então esse mesmo
          // agendamento continuava batendo no filtro `atualizadoEm <= 3min atrás`
          // e era relogado A CADA CICLO (10s) para sempre. Só reescrever o campo
          // (mesmo valor de observacoes) já atualiza `atualizadoEm` e para o loop.
          await prisma.agendamento.update({
            where: { id: ag.id },
            data: { observacoes: JSON.stringify(dadosRetry) }
          });
          apagarMidiaAgendamento(ag.midiaUrl); // falhou de vez → limpa o arquivo do disco
          console.log(`[Worker] Agendamento ${ag.id} atingiu limite de ${MAX_TENTATIVAS} tentativas. Mantido como 'falhou' (não será mais relogado).`);
        }
      }

      // ─── 3. EXPEDIENTE REMOVIDO ──────────────────────────────────────────
      // Os disparos acontecem SEMPRE no horário que a pessoa configurou (enviarEm),
      // sem nenhuma janela de "expediente" segurando mensagens.
      const noExpediente = true;
      if (noExpediente) {
        // ─── 4. BUSCA E DISPARO DE MENSAGENS PENDENTES ───────────────────────
        const pendentes = await prisma.agendamento.findMany({
          where: {
            status: 'pendente',
            enviarEm: { lte: agora }
          }
        });

        if (pendentes.length > 0) {
          const { enviarMensagem, sessions, connectToWhatsApp, resolverConexaoEfetiva } = require('./whatsappService');

          // ─── LIMITE DIÁRIO: conta quantas mensagens cada usuário já enviou HOJE ───
          // (cacheado por ciclo; vai sendo incrementado conforme novos envios)
          const inicioDoDia = new Date(agora);
          inicioDoDia.setHours(0, 0, 0, 0);
          const enviadosHojePorUsuario = new Map<string, number>();
          async function jaEnviadosHoje(usuarioId: string): Promise<number> {
            if (enviadosHojePorUsuario.has(usuarioId)) return enviadosHojePorUsuario.get(usuarioId)!;
            const count = await prisma.agendamento.count({
              where: { criadoPorId: usuarioId, status: 'enviado', atualizadoEm: { gte: inicioDoDia } }
            });
            enviadosHojePorUsuario.set(usuarioId, count);
            return count;
          }

          // Controla o intervalo (gap) anti-rajada: só aplica a pausa ENTRE envios,
          // nunca antes do primeiro nem depois do último.
          let primeiroEnvioDoCiclo = true;

          for (const agendamento of pendentes) {
            // Resolve a conexão EFETIVA: se quem criou o agendamento COMPARTILHA o
            // WhatsApp de outro atendente, a sessão Baileys real vive sob o ID do dono —
            // é ela que precisa estar conectada e é ela que efetivamente envia a mensagem.
            const efetivoId = await resolverConexaoEfetiva(agendamento.criadoPorId);

            // REGRA DE PROTEÇÃO 1: Se não estiver conectado, PULA o agendamento (congela ele)
            if (!sessions.has(efetivoId)) {
              console.log(`[Worker] Escudo ativado: Loja do usuário ${efetivoId} está desconectada. Agendamento ${agendamento.id} retido até a próxima conexão.`);
              // Auto-religamento dirigido: tenta restabelecer a sessão usando as credenciais
              // salvas em disco (sem QR), para que a mensagem saia assim que reconectar.
              connectToWhatsApp(efetivoId).catch((err: any) => console.error(`[Worker] Erro ao tentar religar sessão do usuário ${efetivoId}:`, err));
              continue;
            }

            // REGRA DE PROTEÇÃO 2 (ANTI-BAN): respeita o limite diário por usuário.
            // O que passar do limite continua 'pendente' e dispara no dia seguinte.
            if (LIMITE_DIARIO_POR_USUARIO > 0) {
              const enviados = await jaEnviadosHoje(agendamento.criadoPorId);
              if (enviados >= LIMITE_DIARIO_POR_USUARIO) {
                console.log(`[Worker] Limite diário (${LIMITE_DIARIO_POR_USUARIO}) atingido para o usuário ${agendamento.criadoPorId}. Agendamento ${agendamento.id} adiado para o próximo dia.`);
                continue;
              }
            }

            // ANTI-BAN: pausa aleatória ENTRE mensagens (evita disparo em rajada)
            if (!primeiroEnvioDoCiclo) {
              const gap = gapAleatorio();
              console.log(`[Worker] Aguardando ${Math.round(gap / 1000)}s antes do próximo disparo (anti-ban)...`);
              await sleep(gap);
            }
            primeiroEnvioDoCiclo = false;

            // 28/10 (dono: "para quem fala de currículo e processo seletivo não precisa fazer o remarketing"): lembrete
            // AUTOMATICO (do robo ou o "Ainda está precisando?") pra quem veio falar de vaga/curriculo e cancelado na hora
            // de enviar. Mensagem agendada a mao pela atendente (outro texto) continua saindo.
            if (await ehLembreteDeCandidato(agendamento)) {
              await prisma.agendamento.update({
                where: { id: agendamento.id },
                data: { status: 'cancelado', observacoes: `${agendamento.observacoes ? agendamento.observacoes + ' | ' : ''}cancelado: curriculo/vaga` },
              });
              console.log(`[Worker] Agendamento ${agendamento.id} (${agendamento.numero}) cancelado: contato de curriculo/vaga.`);
              continue;
            }

            await prisma.agendamento.update({
              where: { id: agendamento.id },
              data: { status: 'enviando' }
            });

            // LEGADO: agendamentos antigos podem ter o NOME no campo numero (a extensão
            // não conseguia extrair o telefone). Tenta resolver pelo contato/histórico
            // antes de disparar — se resolver, corrige o registro pra sempre.
            let numeroEnvio = agendamento.numero;
            if (!pareceNumero(numeroEnvio)) {
              const resolvido = await resolverNumeroContato(agendamento.criadoPorId, numeroEnvio);
              if (resolvido) {
                numeroEnvio = resolvido;
                await prisma.agendamento.update({ where: { id: agendamento.id }, data: { numero: resolvido } });
                console.log(`[Worker] Número resolvido pelo nome: "${agendamento.numero}" -> ${resolvido} (agendamento ${agendamento.id}).`);
              } else {
                console.log(`[Worker] ⚠️ Agendamento ${agendamento.id} tem NOME no lugar do número ("${agendamento.numero}") e não achei o contato — vai falhar até ser editado.`);
              }
            }

            console.log(`[Worker] Disparando agendamento ${agendamento.id} para ${numeroEnvio} via Baileys (Simulando humano)...`);

            // Anexo de mídia (foto/vídeo/áudio/documento), se houver.
            const midia = agendamento.tipo && agendamento.tipo !== 'texto' && agendamento.midiaUrl
              ? { tipo: agendamento.tipo, caminho: agendamento.midiaUrl, nome: agendamento.midiaNome }
              : undefined;

            // Envia a mensagem (humanizada + a função já adiciona o delay de "digitando")
            // pela sessão EFETIVA (do dono, se compartilhado; do próprio, senão).
            const textoEnvio = humanizarTexto(agendamento.mensagem);
            // Agendamento do ROBO (retomada etc.): avisa que o eco dessa mensagem nao e atendente assumindo (23/10).
            if (String(agendamento.observacoes || '').startsWith('robo-')) require('./whatsappService').lembrarTextoAgendadoDoRobo(textoEnvio);
            const sucesso = await enviarMensagem(efetivoId, numeroEnvio, textoEnvio, midia);

            if (sucesso) {
              await prisma.agendamento.update({
                where: { id: agendamento.id },
                data: { status: 'enviado' }
              });
              apagarMidiaAgendamento(agendamento.midiaUrl); // enviou → não precisa mais do arquivo
              // Incrementa o contador diário em memória para este usuário
              enviadosHojePorUsuario.set(agendamento.criadoPorId, (enviadosHojePorUsuario.get(agendamento.criadoPorId) || 0) + 1);
              console.log(`[Worker] ✅ Agendamento ${agendamento.id} marcado como enviado.`);

              // Notifica o frontend de que o status atualizou (se tiver alguém online para ver a UI atualizar)
              io.to(agendamento.criadoPorId).emit('STATUS_ATUALIZADO', { ...agendamento, status: 'enviado' });
            } else {
              await prisma.agendamento.update({
                where: { id: agendamento.id },
                data: { status: 'falhou' }
              });
              console.log(`[Worker] ❌ Agendamento ${agendamento.id} falhou. Cairá no retry automático.`);

              io.to(agendamento.criadoPorId).emit('STATUS_ATUALIZADO', { ...agendamento, status: 'falhou' });
            }
          }
        }
      }
    } catch (error) {
      console.error("[Worker] Erro crítico no loop do Worker:", error);
    }

    // Chama novamente o loop após 10 segundos, garantindo que não haverá atropelamento
    setTimeout(loopWorker, 10000);
  }

  // Inicia o loop
  loopWorker();
}
