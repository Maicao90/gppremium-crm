// Ids de modulo do painel (batem com os do frontend em crm-de-anuncios/src/config/modulos.js).
export const MODULOS = [
  'dashboard', 'contas', 'olx-anuncios', 'linkbio', 'otimizador',
  'at-dashboard', 'at-atendentes', 'at-inbox', 'olx-chat', 'at-botpneus', 'at-disparo', 'garantia50k', 'assistant', 'settings',
] as const;
export type ModuloId = typeof MODULOS[number];

// Atalho: modulos do "gerente" (so WhatsApp).
export const MODULOS_GERENTE: ModuloId[] = ['at-dashboard', 'at-atendentes', 'at-inbox', 'at-botpneus'];

// Roles que enxergam tudo (ignoram modulosPermitidos e escopo de loja).
export const ROLES_MASTER = ['master', 'admin'];
export const ehMaster = (role: string): boolean => ROLES_MASTER.includes(role);
