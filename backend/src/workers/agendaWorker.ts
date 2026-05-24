import { prisma, io } from '../server';

// Função utilitária para verificar se a hora atual do sistema está no expediente configurado
async function estaNoExpediente(agora: Date): Promise<boolean> {
  try {
    let config = await prisma.configuracao.findUnique({ where: { id: 'global' } });
    if (!config) {
      // Se não existir nenhuma configuração no banco, cria o registro default
      config = await prisma.configuracao.create({
        data: {
          id: 'global',
          expedienteAtivo: false,
          expedienteInicio: '08:00',
          expedienteFim: '18:00',
          expedienteDias: '1,2,3,4,5' // Segunda a Sexta
        }
      });
    }

    // Se o expediente não estiver ativado, o envio é livre a qualquer momento
    if (!config.expedienteAtivo) {
      return true;
    }

    // Obter dia da semana atual (0 = Domingo, 1 = Segunda, ..., 6 = Sábado)
    const diaSemana = agora.getDay();
    const diasConfigurados = config.expedienteDias.split(',').map(d => parseInt(d.trim()));

    // Se o dia atual não está nos dias configurados, está fora do expediente
    if (!diasConfigurados.includes(diaSemana)) {
      return false;
    }

    // Obter hora e minutos atuais do sistema local do usuário
    const horaAtual = agora.getHours();
    const minutoAtual = agora.getMinutes();
    const tempoAtualEmMinutos = horaAtual * 60 + minutoAtual;

    // Converter horário de início ("HH:MM") para minutos
    const partesInicio = config.expedienteInicio.split(':').map(Number);
    const hInicio = partesInicio[0] !== undefined ? partesInicio[0] : 8;
    const mInicio = partesInicio[1] !== undefined ? partesInicio[1] : 0;
    const tempoInicioEmMinutos = hInicio * 60 + mInicio;

    // Converter horário de término ("HH:MM") para minutos
    const partesFim = config.expedienteFim.split(':').map(Number);
    const hFim = partesFim[0] !== undefined ? partesFim[0] : 18;
    const mFim = partesFim[1] !== undefined ? partesFim[1] : 0;
    const tempoFimEmMinutos = hFim * 60 + mFim;

    // Retorna verdadeiro se o horário atual está contido no intervalo de expediente
    return tempoAtualEmMinutos >= tempoInicioEmMinutos && tempoAtualEmMinutos <= tempoFimEmMinutos;
  } catch (error) {
    console.error("[Worker] Erro ao verificar horário de expediente:", error);
    return true; // Em caso de falha crítica no banco, libera o envio para não travar a aplicação
  }
}

export function initWorker() {
  console.log("Worker de agendamentos iniciado (Local Polling & Expediente Seguro)");

  // Polling seguro a cada 5 segundos
  setInterval(async () => {
    try {
      const agora = new Date();

      // 1. FALLBACK / RECUPERAÇÃO AUTOMÁTICA:
      // Se algum agendamento ficou travado no status 'enviando' por mais de 5 minutos,
      // significa que a extensão ou navegador desconectou ou travou no meio.
      // Resetamos esse status de volta para 'pendente' para nova tentativa automática.
      const cincoMinutosAtras = new Date(agora.getTime() - 5 * 60 * 1000);
      const travadosRecuperados = await prisma.agendamento.updateMany({
        where: {
          status: 'enviando',
          atualizadoEm: {
            lte: cincoMinutosAtras
          }
        },
        data: {
          status: 'pendente'
        }
      });

      if (travadosRecuperados.count > 0) {
        console.log(`[Worker] Recuperação Automática: ${travadosRecuperados.count} agendamento(s) travado(s) em 'enviando' redefinido(s) para 'pendente'.`);
      }

      // 2. VERIFICAÇÃO DE EXPEDIENTE:
      const noExpediente = await estaNoExpediente(agora);
      if (!noExpediente) {
        // Ignora o processamento de envios no ciclo atual se estiver fora do expediente comercial
        // Os agendamentos continuam como 'pendente' e acumularão para serem enviados na abertura.
        return;
      }

      // 3. BUSCA E DISPARO DE MENSAGENS PENDENTES:
      // Só tenta buscar e disparar se houver pelo menos uma extensão (WhatsApp Web) conectada e ativa no Socket.
      const conexoesAtivas = io.sockets.sockets.size;
      if (conexoesAtivas > 0) {
        const pendentes = await prisma.agendamento.findMany({
          where: {
            status: 'pendente',
            enviarEm: {
              lte: agora
            }
          }
        });
 
        // Importação dinâmica para evitar referências circulares
        const { usuariosConectados } = require('../server');

        for (const agendamento of pendentes) {
          // Localiza as conexões socket que pertencem especificamente ao criador do agendamento
          let socketsAtendentes: any[] = [];
          for (const [sockId, usrId] of usuariosConectados.entries()) {
            if (usrId === agendamento.criadoPorId) {
              const sock = io.sockets.sockets.get(sockId);
              if (sock) {
                socketsAtendentes.push(sock);
              }
            }
          }

          // Fallback para agendamentos de sistema legados sem criador definido: dispara em qualquer socket
          if (!agendamento.criadoPorId) {
            const qualquerSock = Array.from(io.sockets.sockets.values())[0];
            if (qualquerSock) {
              socketsAtendentes.push(qualquerSock);
            }
          }

          if (socketsAtendentes.length > 0) {
            // Marcamos IMEDIATAMENTE como 'enviando' no banco de dados SQLite.
            // Isso remove a mensagem da lista de pendentes no próximo ciclo de polling (daqui a 5 segundos),
            // eliminando completamente qualquer risco de envios duplicados para o cliente se a digitação/clique atrasar.
            await prisma.agendamento.update({
              where: { id: agendamento.id },
              data: { status: 'enviando' }
            });
 
            // Envia o comando via Socket.io especificamente para a extensão do atendente responsável
            socketsAtendentes.forEach(sock => {
              sock.emit('DISPARAR_MENSAGEM', agendamento);
            });
            console.log(`[Worker] Agendamento (ID: ${agendamento.id}) enviado especificamente para a extensão do atendente dono (${agendamento.criadoPorId || 'Legado/Sistema'}) e marcado como 'enviando'.`);
          } else {
            console.log(`[Worker] Agendamento (ID: ${agendamento.id}) do atendente ${agendamento.criadoPorId} ignorado temporariamente: Atendente dono offline.`);
          }
        }
      }
    } catch (error) {
      console.error("[Worker] Erro crítico no loop do Worker de Agendamentos:", error);
    }
  }, 5000);
}
