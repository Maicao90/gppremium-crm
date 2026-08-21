import { prisma } from '../server';
import { connectedUsers, enviarMensagem, resolverConexaoEfetiva } from './whatsappService';

// Intervalo de checagem do worker (a cada 45 segundos)
const INTERVALO_CHECK_MS = 45 * 1000;

// Pausa assíncrona
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Converte "08:00" em minutos desde a meia-noite
function minutosDoDia(horaStr: string): number {
  const [h, m] = (horaStr || '08:00').split(':').map((v) => Number(v) || 0);
  return (h || 0) * 60 + (m || 0);
}

// Retorna o momento atual no fuso horário do Brasil (America/Sao_Paulo)
function agoraBrasilia(): { data: Date; minutosAgora: number; diaSemana: number } {
  const agora = new Date();
  const spString = agora.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' });
  const dSP = new Date(spString);
  const minutosAgora = dSP.getHours() * 60 + dSP.getMinutes();
  return { data: agora, minutosAgora, diaSemana: dSP.getDay() };
}

// Pequena variação para humanizar o envio e evitar bloqueio
function humanizarTexto(texto: string): string {
  return texto + ' '.repeat(Math.floor(Math.random() * 2));
}

let workerIniciado = false;

export function initDisparoWorker() {
  if (workerIniciado) return;
  workerIniciado = true;
  console.log('🤖 [DisparoWorker] Robô de Disparo Automático 100% Ativo (Janela 08:00 - 17:00 | 30/dia distribuídos)');

  async function loopDisparo() {
    try {
      await processarCicloDisparos();
    } catch (e) {
      console.error('❌ [DisparoWorker] Erro no ciclo de disparos:', e);
    } finally {
      setTimeout(loopDisparo, INTERVALO_CHECK_MS);
    }
  }

  // Inicia após 10 segundos da subida do servidor
  setTimeout(loopDisparo, 10000);
}

async function processarCicloDisparos() {
  const { data: agora, minutosAgora, diaSemana } = agoraBrasilia();

  // Não dispara aos domingos (diaSemana === 0)
  if (diaSemana === 0) {
    return;
  }

  // Busca todas as campanhas de disparo ativas
  const campanhas = await prisma.disparoCampanha.findMany({
    where: { autoDisparo: true }
  });

  if (!campanhas.length) return;

  const inicioDoDia = new Date();
  inicioDoDia.setHours(0, 0, 0, 0);

  for (const campanha of campanhas) {
    try {
      const minInicio = minutosDoDia(campanha.horaInicio || '08:00');
      const minFim = minutosDoDia(campanha.horaFim || '17:00');

      // Verifica se estamos dentro da janela de expediente (ex: 08:00 às 17:00)
      if (minutosAgora < minInicio || minutosAgora >= minFim) {
        continue;
      }

      // Conta quantos disparos já foram feitos hoje para esta loja
      const enviadosHoje = await prisma.disparoContato.count({
        where: {
          storeId: campanha.storeId,
          enviadoEm: { gte: inicioDoDia },
        },
      });

      const limiteMax = Math.max(1, campanha.limiteDia || 30);
      if (enviadosHoje >= limiteMax) {
        // Limite diário de 30 já atingido hoje
        continue;
      }

      // Calcula o espaçamento ideal entre os disparos durante o expediente
      // Exemplo: 9 horas de janela (540 min) / 30 envios = 1 envio a cada ~18 minutos
      const janelaTotalMin = Math.max(60, minFim - minInicio);
      const intervaloPadraoMin = Math.max(5, Math.floor(janelaTotalMin / limiteMax));

      // Se já disparou recentemente, confere se deu o tempo do intervalo
      if (campanha.ultimoDisparoEm) {
        const msPassados = agora.getTime() - new Date(campanha.ultimoDisparoEm).getTime();
        const minPassados = msPassados / (60 * 1000);

        // Adiciona um jitter aleatório de ±2 minutos para não disparar em horários robóticos
        const jitter = (Math.random() * 4 - 2); // -2 a +2 min
        const intervaloEfetivo = Math.max(4, intervaloPadraoMin + jitter);

        if (minPassados < intervaloEfetivo) {
          continue;
        }
      }

      // Procura o WhatsApp conectado da loja
      const atendentesLoja = await prisma.usuario.findMany({
        where: { lojaId: campanha.storeId, ativo: true },
        select: { id: true, nome: true, whatsappDonoId: true, whatsappConectado: true },
      });

      const conectados: string[] = [];
      for (const u of atendentesLoja) {
        const efetivo = await resolverConexaoEfetiva(u.id);
        if (connectedUsers.has(efetivo) && !conectados.includes(efetivo)) {
          conectados.push(efetivo);
        }
      }

      if (!conectados.length) {
        // Nenhum WhatsApp conectado no momento para esta loja
        continue;
      }

      // Usa a primeira conexão conectada disponível da loja
      const sessaoEfetivaId = conectados[0]!;

      // Pega o PRÓXIMO contato pendente (não contatado)
      const proximoContato = await prisma.disparoContato.findFirst({
        where: {
          storeId: campanha.storeId,
          contatado: false,
          tel: { not: '' },
        },
        orderBy: [
          { valor: 'desc' }, // prioriza maiores valores / LTV
          { criadoEm: 'asc' },
        ],
      });

      if (!proximoContato) {
        // Sem contatos pendentes
        continue;
      }

      const telLimpo = String(proximoContato.tel || '').replace(/\D/g, '');
      if (!telLimpo || telLimpo.length < 10) {
        // Marca como contatado/inválido para não travar a fila
        await prisma.disparoContato.update({
          where: { id: proximoContato.id },
          data: { contatado: true, contatadoEm: new Date(), verificar: true },
        });
        continue;
      }

      // Monta o texto da mensagem
      let texto = proximoContato.mensagemBase?.trim() || campanha.mensagemPadrao?.trim();
      if (!texto) {
        const nomeCliente = proximoContato.nome ? proximoContato.nome.split(' ')[0] : 'Cliente';
        texto = `Olá, ${nomeCliente}! Tudo bem? 🚗💨\n\nPassando para compartilhar as ofertas e condições especiais exclusivas que preparamos para você aqui na nossa loja! Caso precise de pneus novos, alinhamento ou revisão, conte conosco!`;
      }

      texto = humanizarTexto(texto);

      const midia = campanha.fotoUrl
        ? { tipo: 'imagem', caminho: campanha.fotoUrl, nome: campanha.fotoNome || 'promocao.jpg' }
        : undefined;

      console.log(`🚀 [DisparoWorker] Enviando disparo automático (${enviadosHoje + 1}/${limiteMax}) para ${proximoContato.nome} (${telLimpo})`);

      const sucesso = await enviarMensagem(sessaoEfetivaId, telLimpo, texto, midia);

      if (sucesso) {
        const agoraEnvio = new Date();
        await prisma.disparoContato.update({
          where: { id: proximoContato.id },
          data: {
            contatado: true,
            contatadoEm: agoraEnvio,
            enviadoEm: agoraEnvio,
            enviadoPorId: sessaoEfetivaId,
          },
        });

        await prisma.disparoCampanha.update({
          where: { storeId: campanha.storeId },
          data: { ultimoDisparoEm: agoraEnvio },
        });

        console.log(`✅ [DisparoWorker] Disparo enviado com sucesso para ${proximoContato.nome}!`);
      } else {
        console.warn(`⚠️ [DisparoWorker] Falha ao enviar para ${telLimpo}. O WhatsApp pode estar oscilando.`);
      }

      // Aguarda 5 segundos entre iterações de lojas diferentes
      await sleep(5000);
    } catch (errLoja) {
      console.error(`❌ [DisparoWorker] Erro ao processar loja ${campanha.storeId}:`, errLoja);
    }
  }
}
