import { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { SlidersHorizontal, ChevronDown, Menu, LogOut } from 'lucide-react';
import { FiltroSelect } from './FiltroSelect';

// Telas que realmente usam os filtros de anúncios (empresa/loja/período)
const VIEWS_COM_FILTRO = ['dashboard', 'campaigns'];
const TITULOS = {
  dashboard: 'Dashboard Geral',
  companies: 'Empresas',
  contas: 'Saldos & Lojas',
  'olx-anuncios': 'Anúncios OLX',
  'olx-chat': 'Chat Integrado OLX',
  linkbio: 'Link na Bio',
  otimizador: 'Otimizador de Anúncios',
  assistant: 'Assistente IA',
  usuarios: 'Usuários & Acessos',
  'at-dashboard': 'Atendimento — Métricas',
  'at-atendentes': 'Usuários & Acessos',
  'at-inbox': 'Caixa de Entrada (WhatsApp)',
  'at-botpneus': 'Bot Pneus (Atendimento IA)',
  'at-disparo': 'Disparo — Direcional Pneus',
  garantia50k: 'Garantia 50.000 KM',
  settings: 'Configurações',
};

const roleLabel = (r) => (r === 'master' || r === 'admin') ? 'Administrador' : r === 'gerente' ? 'Gerente' : 'Atendente';
const iniciais = (nome) => {
  const p = String(nome || '').trim().split(/\s+/);
  return (((p[0] || '')[0] || '') + ((p[1] || '')[0] || '')).toUpperCase() || 'U';
};

export const TopBar = ({ onMenu }) => {
  const {
    data,
    currentView,
    selectedCompanyId, setSelectedCompanyId,
    selectedStoreId, setSelectedStoreId,
    selectedPlatform, setSelectedPlatform,
    selectedPeriod, setSelectedPeriod,
  } = useAppContext();
  const { usuario, logout } = useAuth();

  const [aberto, setAberto] = useState(() => window.innerWidth > 860);

  const temFiltros = VIEWS_COM_FILTRO.includes(currentView);

  const empresasOpt = [
    { value: 'all', label: 'Todas as Empresas' },
    ...(data.companies || []).map((c) => ({ value: c.id, label: c.company_name })),
  ];

  const lojasOpt = [
    { value: 'all', label: 'Todas as Lojas' },
    ...(data.stores || [])
      .filter((s) => selectedCompanyId === 'all' || s.company_id === selectedCompanyId)
      .map((s) => ({ value: s.id, label: s.store_name })),
  ];

  const plataformasOpt = [
    { value: 'all', label: 'Todas as Plataformas' },
    { value: 'google', label: 'Google Ads' },
    { value: 'meta', label: 'Meta Ads' },
  ];

  const periodosOpt = [
    { value: 'today', label: 'Hoje' },
    { value: 'yesterday', label: 'Ontem' },
    { value: 'last_7_days', label: 'Últimos 7 dias' },
    { value: 'last_30_days', label: 'Últimos 30 dias' },
    { value: 'this_month', label: 'Este mês' },
    { value: 'last_month', label: 'Mês passado' },
  ];

  return (
    <header className="topbar">
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="menu-toggle"
          onClick={onMenu}
          aria-label="Abrir menu de navegação"
        >
          <Menu size={22} />
        </button>

        <h2 className="topbar-title">{TITULOS[currentView] || 'Painel de Controle'}</h2>
      </div>

      <div className="flex items-center gap-3">
        {temFiltros && (
          <>
            <button
              type="button"
              className={`filtros-toggle ${aberto ? 'is-open' : ''}`}
              onClick={() => setAberto(!aberto)}
              title="Filtros de período e lojas"
            >
              <SlidersHorizontal size={15} />
              <span>Filtros</span>
              <ChevronDown size={14} className="chev" />
            </button>

            {aberto && (
              <div className="topbar-filtros animate-fade-in">
                <FiltroSelect
                  value={selectedCompanyId}
                  options={empresasOpt}
                  onChange={setSelectedCompanyId}
                />
                <FiltroSelect
                  value={selectedStoreId}
                  options={lojasOpt}
                  onChange={setSelectedStoreId}
                />
                <FiltroSelect
                  value={selectedPlatform}
                  options={plataformasOpt}
                  onChange={setSelectedPlatform}
                />
                <FiltroSelect
                  value={selectedPeriod}
                  options={periodosOpt}
                  onChange={setSelectedPeriod}
                />
              </div>
            )}
          </>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingLeft: 8, borderLeft: '1px solid var(--panel-border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #22C55E, #16A34A)',
                color: '#0B1911',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: '0.82rem',
              }}
            >
              {iniciais(usuario?.nome)}
            </div>

            <div className="topbar-user-name" style={{ display: 'flex', flexDirection: 'column' }}>
              <strong style={{ fontSize: '0.84rem', color: 'var(--text-primary)', lineHeight: 1.2 }}>
                {usuario?.nome || 'Usuário'}
              </strong>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                {roleLabel(usuario?.role)}
              </span>
            </div>
          </div>

          <button
            type="button"
            className="icon-btn"
            style={{ width: 34, height: 34 }}
            onClick={logout}
            title="Sair da conta"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </header>
  );
};
