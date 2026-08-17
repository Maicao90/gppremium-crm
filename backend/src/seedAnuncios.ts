import { prisma } from './server';

export async function seedAnuncios() {
  try {
    const contasCount = await prisma.contaAnuncio.count();
    if (contasCount === 0) {
      console.log('[Seed Anúncios] Criando contas de anúncios padrão com métricas reais...');
      
      const contas = [
        {
          nome: 'Direcional Pneus — Meta Ads',
          plataforma: 'meta',
          saldo: 83.03,
          gastoDia: 16.07,
          gastoMes: 482.10,
          depositoMes: 500.00,
          limiteAlerta: 50.0,
          ultimoDepValor: 500.0,
          ultimoDepData: '2026-08-01'
        },
        {
          nome: 'Direcional Pneus — Google Ads',
          plataforma: 'google',
          saldo: 817.42,
          gastoDia: 29.72,
          gastoMes: 891.60,
          depositoMes: 1000.00,
          limiteAlerta: 100.0,
          ultimoDepValor: 1000.0,
          ultimoDepData: '2026-08-01'
        },
        {
          nome: 'City Pneus — Meta Ads',
          plataforma: 'meta',
          saldo: 169.04,
          gastoDia: 32.45,
          gastoMes: 973.50,
          depositoMes: 1000.00,
          limiteAlerta: 50.0,
          ultimoDepValor: 1000.0,
          ultimoDepData: '2026-08-01'
        },
        {
          nome: 'City Pneus — Google Ads',
          plataforma: 'google',
          saldo: 751.27,
          gastoDia: 59.27,
          gastoMes: 1778.10,
          depositoMes: 2000.00,
          limiteAlerta: 100.0,
          ultimoDepValor: 2000.0,
          ultimoDepData: '2026-08-01'
        },
        {
          nome: 'Feirão dos Pneus — Meta Ads',
          plataforma: 'meta',
          saldo: 239.78,
          gastoDia: 42.92,
          gastoMes: 1287.60,
          depositoMes: 1500.00,
          limiteAlerta: 50.0,
          ultimoDepValor: 1500.0,
          ultimoDepData: '2026-08-01'
        },
        {
          nome: 'Feirão dos Pneus — Google Ads',
          plataforma: 'google',
          saldo: 676.13,
          gastoDia: 72.97,
          gastoMes: 2189.10,
          depositoMes: 2500.00,
          limiteAlerta: 100.0,
          ultimoDepValor: 2500.0,
          ultimoDepData: '2026-08-01'
        }
      ];

      for (const conta of contas) {
        await prisma.contaAnuncio.create({ data: conta });
      }
      console.log('[Seed Anúncios] Contas com métricas mensais criadas com sucesso!');
    }
  } catch (err) {
    console.error('[Seed Anúncios] Erro no seed de anúncios:', err);
  }
}
