import { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { SlidersHorizontal, ChevronDown, Menu, LogOut, Store as StoreIcon } from 'lucide-react';
import { FiltroSelect } from './FiltroSelect';

// Telas que utilizam os seletores de loja/empresa/período
const VIEWS_COM_FILTRO = ['dashboard', 'campaigns', 'at-inbox', 'at-dashboard', 'at-atendentes', 'contas', 'olx-anuncios', 'olx-chat'];

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

  const lojaAtualNome = selectedStoreId === 'all' 
    ? 'Todas as Lojas' 
    : (data.stores || []).find((s) => s.id === selectedStoreId)?.store_name || 'Loja Selecionada';

  return (
    <header className="topbar" style={{ background: 'rgba(10, 15, 28, 0.85)', backdropFilter: 'blur(16px)', borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="menu-toggle icon-btn"
          onClick={onMenu}
          aria-label="Abrir menu de navegação"
          style={{ width: 38, height: 38, borderRadius: 10 }}
        >
          <Menu size={20} />
        </button>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <h2 className="topbar-title" style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0, letterSpacing: '-0.02em', background: 'linear-gradient(135deg, #FFFFFF 60%, #94A3B8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            {TITULOS[currentView] || 'Painel de Controle'}
          </h2>
          {selectedStoreId !== 'all' && (
            <span style={{ fontSize: '0.72rem', color: '#E8252C', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 1 }}>
              <span className="live-dot" style={{ width: 6, height: 6, backgroundColor: '#E8252C' }} /> {lojaAtualNome}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        {temFiltros && (
          <>
            <button
              type="button"
              className={`filtros-toggle btn ${aberto ? 'is-open' : ''}`}
              onClick={() => setAberto(!aberto)}
              title="Filtros de período e lojas"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '0.45rem 0.85rem',
                borderRadius: 10,
                fontSize: '0.84rem',
                background: aberto ? 'rgba(232, 37, 44, 0.14)' : 'rgba(255, 255, 255, 0.05)',
                border: aberto ? '1px solid rgba(232, 37, 44, 0.35)' : '1px solid rgba(255, 255, 255, 0.08)',
                color: aberto ? '#FFFFFF' : 'var(--text-secondary)',
              }}
            >
              <SlidersHorizontal size={14} />
              <span>Filtros</span>
              <ChevronDown size={13} className="chev" style={{ transform: aberto ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease' }} />
            </button>

            {aberto && (
              <div className="topbar-filtros animate-fade-in" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
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
                {['dashboard', 'campaigns', 'otimizador'].includes(currentView) && (
                  <>
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
                  </>
                )}
              </div>
            )}
          </>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingLeft: 12, borderLeft: '1px solid rgba(255, 255, 255, 0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #E8252C, #B91C22)',
                color: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 800,
                fontSize: '0.85rem',
                boxShadow: '0 0 14px rgba(232, 37, 44, 0.35)',
                border: '2px solid rgba(255, 255, 255, 0.15)',
              }}
            >
              {iniciais(usuario?.nome)}
            </div>

            <div className="topbar-user-name" style={{ display: 'flex', flexDirection: 'column' }}>
              <strong style={{ fontSize: '0.86rem', color: '#FFFFFF', lineHeight: 1.2, fontWeight: 700 }}>
                {usuario?.nome || 'Usuário'}
              </strong>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                {roleLabel(usuario?.role)}
              </span>
            </div>
          </div>

          <button
            type="button"
            className="icon-btn"
            style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.25)', color: '#EF4444' }}
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

