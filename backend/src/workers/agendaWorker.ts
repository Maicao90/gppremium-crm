import { prisma, io } from '../server';

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

export function initWorker() {
  console.log("Worker de agendamentos iniciado (Polling 10s, Retry Persistente no SQLite & Expediente Seguro)");

  setInterval(async () => {
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
          console.log(`[Worker] Agendamento ${ag.id} atingiu limite de ${MAX_TENTATIVAS} tentativas. Mantido como 'falhou'.`);
        }
      }

      // ─── 3. VERIFICAÇÃO DE EXPEDIENTE ────────────────────────────────────
      const noExpediente = await estaNoExpediente(agora);
      if (!noExpediente) {
        return;
      }

      // ─── 4. BUSCA E DISPARO DE MENSAGENS PENDENTES ───────────────────────
      const pendentes = await prisma.agendamento.findMany({
        where: {
          status: 'pendente',
          enviarEm: { lte: agora }
        }
      });

      if (pendentes.length > 0) {
        const { enviarMensagem } = require('./whatsappService');
        
        for (const agendamento of pendentes) {
          await prisma.agendamento.update({
            where: { id: agendamento.id },
            data: { status: 'enviando' }
          });
          
          console.log(`[Worker] Disparando agendamento ${agendamento.id} para ${agendamento.numero} via Baileys (Simulando humano)...`);
          
          // Envia a mensagem (a função já adiciona o delay de "digitando")
          const sucesso = await enviarMensagem(agendamento.criadoPorId, agendamento.numero, agendamento.mensagem);
          
          if (sucesso) {
            await prisma.agendamento.update({
              where: { id: agendamento.id },
              data: { status: 'enviado' }
            });
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
    } catch (error) {
      console.error("[Worker] Erro crítico no loop do Worker:", error);
    }
  }, 10000); // Polling a cada 10 segundos
}
