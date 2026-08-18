// Fonte única dos módulos do painel (bate com backend/src/auth/modulos.ts).
// Usado pelo menu (Sidebar), pelo gate de rotas (App) e pela tela de Usuários.
export const GRUPOS_MODULOS = [
  {
    titulo: 'Anúncios',
    itens: [
      { id: 'dashboard', label: 'Dashboard' },
      { id: 'contas', label: 'Saldos & Lojas' },
      { id: 'olx-anuncios', label: 'OLX Anúncios' },
      { id: 'linkbio', label: 'Link na Bio' },
      { id: 'otimizador', label: 'Otimizador' },
    ],
  },
  {
    titulo: 'Atendimento (WhatsApp & OLX)',
    itens: [
      { id: 'at-dashboard', label: 'Métricas' },
      { id: 'at-atendentes', label: 'Usuários' },
      { id: 'at-inbox', label: 'Caixa de Entrada' },
      { id: 'olx-chat', label: 'OLX Chat' },
      { id: 'at-botpneus', label: 'Bot Pneus' },
      { id: 'at-disparo', label: 'Disparo (Direcional)' },
    ],
  },
  {
    titulo: 'Aplicativos',
    itens: [
      { id: 'garantia50k', label: 'Garantia 50k' },
    ],
  },
  {
    titulo: 'Central',
    itens: [
      { id: 'assistant', label: 'Assistente IA', destaque: true },
    ],
  },
];

export const MODULOS_GERENTE = ['at-dashboard', 'at-atendentes', 'at-inbox', 'olx-anuncios', 'olx-chat'];
export const MODULOS_VENDEDOR = ['at-inbox', 'olx-chat'];
export const ROLES_MASTER = ['master', 'admin'];
export const ehMaster = (usuario) => !!usuario && ROLES_MASTER.includes(usuario.role);

const listaModulos = (usuario) => {
  if (!usuario) return [];
  let mods = usuario.modulosPermitidos;
  if (typeof mods === 'string') { try { mods = JSON.parse(mods); } catch { mods = []; } }
  return Array.isArray(mods) ? mods : [];
};

// Um usuário pode ver um módulo? Master vê tudo.
export const podeVer = (usuario, id) => {
  if (!usuario) return false;
  if (ehMaster(usuario)) return true;
  return listaModulos(usuario).includes(id);
};

// Primeiro módulo permitido (para onde cair quando a tela atual não é permitida).
export const primeiroModulo = (usuario) => {
  for (const g of GRUPOS_MODULOS) for (const it of g.itens) if (podeVer(usuario, it.id)) return it.id;
  return ehMaster(usuario) ? 'dashboard' : 'at-dashboard';
};

// Todos os ids de módulo (para checkboxes na tela de Usuários).
export const TODOS_MODULOS = GRUPOS_MODULOS.flatMap((g) => g.itens.map((i) => i.id));
