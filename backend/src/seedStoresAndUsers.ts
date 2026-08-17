import fs from 'fs';
import path from 'path';
import { prisma } from './server';

export async function seedStoresAndUsers() {
  try {
    console.log('[Seed Stores & Users] Verificando lojas e atendentes...');

    // 1. Garantir Empresa principal
    let empresa = await prisma.empresa.findFirst();
    if (!empresa) {
      empresa = await prisma.empresa.create({
        data: {
          name: 'GP Premium - Redes de Lojas',
          segment: 'Automotivo / Pneus',
          notes: 'Empresa Principal'
        }
      });
    }

    // 2. Garantir as 5 Lojas Oficiais
    const lojasDesejadas = [
      { name: 'Direcional Pneus', city: 'São Paulo', state: 'SP' },
      { name: 'City Pneus', city: 'São Paulo', state: 'SP' },
      { name: 'Feirão dos Pneus', city: 'São Paulo', state: 'SP' },
      { name: 'Super Via Pneus', city: 'São Paulo', state: 'SP' },
      { name: 'GP Premium', city: 'São Paulo', state: 'SP' }
    ];

    const lojasCriadas: Record<string, string> = {};
    for (const l of lojasDesejadas) {
      let loja = await prisma.loja.findFirst({ where: { store_name: l.name } });
      if (!loja) {
        loja = await prisma.loja.create({
          data: {
            company_id: empresa.id,
            store_name: l.name,
            city: l.city,
            state: l.state
          }
        });
      }
      lojasCriadas[l.name] = loja.id;
    }

    const defaultLojaId = Object.values(lojasCriadas)[0];

    // 3. Buscar todas as pastas de sessão do Baileys no diretório prisma
    const prismaDir = path.join(__dirname, '../../prisma');
    let baileysUserIds: string[] = [];

    if (fs.existsSync(prismaDir)) {
      const files = fs.readdirSync(prismaDir);
      baileysUserIds = files
        .filter(f => f.startsWith('auth_info_baileys_'))
        .map(f => f.replace('auth_info_baileys_', ''));
    }

    console.log(`[Seed Stores & Users] Encontrados ${baileysUserIds.length} UUIDs de sessão do WhatsApp no servidor.`);

    // 4. Garantir que cada UUID de sessão tenha um Usuario registrado no banco
    let index = 1;
    const storeKeys = Object.keys(lojasCriadas);

    for (const userId of baileysUserIds) {
      if (!userId || userId.length < 10) continue;

      const userExists = await prisma.usuario.findUnique({ where: { id: userId } });
      if (!userExists) {
        const storeName = storeKeys[(index - 1) % storeKeys.length];
        const storeId = lojasCriadas[storeName] || defaultLojaId;

        await prisma.usuario.create({
          data: {
            id: userId,
            nome: `Atendente ${storeName} ${index}`,
            email: `atendente${index}@${storeName.toLowerCase().replace(/\s+/g, '')}.com`,
            senha: '$2b$10$e8c1...dummy', // hash padrão
            role: 'vendedor',
            ativo: true,
            lojaId: storeId,
            modulosPermitidos: '["at-dashboard","at-atendentes","at-inbox"]'
          }
        });
        console.log(`[Seed Stores & Users] Criado usuário para a sessão Baileys: ${userId} (${storeName})`);
      }
      index++;
    }

    console.log('[Seed Stores & Users] Sincronização de lojas e atendentes concluída com sucesso!');
  } catch (err) {
    console.error('[Seed Stores & Users] Erro durante a sincronização:', err);
  }
}
