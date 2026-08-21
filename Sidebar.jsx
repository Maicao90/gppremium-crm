import { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { podeVer } from '../config/modulos';
import { LayoutDashboard, Settings, Sparkles, Wallet, Gauge, Users, Inbox, Link2, Wand2, Shield, Megaphone, MessageSquare, Bot, Send } from 'lucide-react';

const grupos = [
  {
    titulo: 'Anúncios',
    itens: [
      { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { id: 'contas', label: 'Saldos & Lojas', icon: Wallet },
      { id: 'olx-anuncios', label: 'OLX Anúncios', icon: Megaphone },
      { id: 'linkbio', label: 'Link na Bio', icon: Link2 },
      { id: 'otimizador', label: 'Otimizador', icon: Wand2 },
    ],
  },
  {
    titulo: 'Atendimento',
    itens: [
      { id: 'at-dashboard', label: 'Métricas', icon: Gauge },
      { id: 'at-atendentes', label: 'Usuários & Acessos', icon: Users },
      { id: 'at-inbox', label: 'Caixa de Entrada', icon: Inbox },
      { id: 'olx-chat', label: 'OLX Chat', icon: MessageSquare },
      { id: 'at-botpneus', label: 'Bot Pneus', icon: Bot },
      { id: 'at-disparo', label: 'Disparo (Direcional)', icon: Send },
    ],
  },
  {
    titulo: 'Aplicativos',
    itens: [
      { id: 'garantia50k', label: 'Garantia 50k', icon: Shield },
    ],
  },
  {
    titulo: 'Central de IA',
    itens: [
      { id: 'assistant', label: 'Assistente IA', icon: Sparkles, destaque: true },
    ],
  },
];

export const Sidebar = ({ open, onNavigate }) => {
  const { currentView, setCurrentView } = useAppContext();
  const { usuario } = useAuth();
  const [logoOk, setLogoOk] = useState(true);

  const gruposVisiveis = grupos
    .map((g) => ({ ...g, itens: g.itens.filter((it) => podeVer(usuario, it.id)) }))
    .filter((g) => g.itens.length > 0);

  return (
    <aside className={`sidebar ${open ? 'open' : ''}`} style={{ background: 'linear-gradient(180deg, #070B13 0%, #05080E 100%)', borderRight: '1px solid rgba(255, 255, 255, 0.08)' }}>
      <div className="sidebar-brand" style={{ height: '72px', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', padding: '0 1.2rem' }}>
        {logoOk ? (
          <img
            className="sidebar-logo-premium"
            src={`${import.meta.env.BASE_URL}logo-premium.png`}
            alt="GP Premium — Seu próximo pneu"
            onError={() => setLogoOk(false)}
            style={{ maxHeight: 38 }}
          />
        ) : (
          <span className="gp-mark" aria-label="GP Premium">
            <span className="gp-g" style={{ color: '#E8252C', fontWeight: 800 }}>G</span>
            <span className="gp-p" style={{ color: '#FFFFFF', fontWeight: 800 }}>P</span>
            <span className="gp-premium" style={{ fontSize: '0.95rem', fontWeight: 700, letterSpacing: '0.05em', color: '#CBD5E1', marginLeft: 4 }}>PREMIUM</span>
          </span>
        )}
      </div>

      <nav className="sidebar-nav" style={{ padding: '1.2rem 0.9rem', gap: '1.2rem' }}>
        {gruposVisiveis.map((g) => (
          <div key={g.titulo} className="nav-group" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span className="nav-section" style={{ fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#64748B', padding: '0 0.8rem 4px', fontWeight: 700 }}>
              {g.titulo}
            </span>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 3, margin: 0, padding: 0 }}>
              {g.itens.map((item) => {
                const ativo = currentView === item.id;
                return (
                  <li key={item.id}>
                    <button
                      onClick={() => { setCurrentView(item.id); onNavigate?.(); }}
                      className={`nav-item ${ativo ? 'nav-item-active' : ''} ${item.destaque ? 'nav-item-glow' : ''}`}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '0.62rem 0.85rem',
                        borderRadius: 10,
                        fontSize: '0.86rem',
                        fontWeight: ativo ? 700 : 600,
                        color: ativo ? '#FFFFFF' : item.destaque ? '#F87171' : '#94A3B8',
                        background: ativo 
                          ? 'linear-gradient(135deg, rgba(232, 37, 44, 0.18) 0%, rgba(200, 30, 36, 0.08) 100%)' 
                          : item.destaque 
                          ? 'linear-gradient(135deg, rgba(232, 37, 44, 0.1), rgba(245, 158, 11, 0.06))' 
                          : 'transparent',
                        border: ativo ? '1px solid rgba(232, 37, 44, 0.35)' : item.destaque ? '1px solid rgba(232, 37, 44, 0.25)' : '1px solid transparent',
                        boxShadow: ativo ? '0 4px 16px rgba(232, 37, 44, 0.15)' : 'none',
                        transition: 'all 0.16s ease',
                      }}
                    >
                      <item.icon size={17} style={{ color: ativo ? '#E8252C' : item.destaque ? '#F87171' : 'inherit' }} />
                      <span style={{ flex: 1 }}>{item.label}</span>
                      {ativo && <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#E8252C', boxShadow: '0 0 8px #E8252C' }} />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="sidebar-footer" style={{ padding: '0.85rem', borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
        {podeVer(usuario, 'settings') && (
          <button
            className={`nav-item ${currentView === 'settings' ? 'nav-item-active' : ''}`}
            onClick={() => { setCurrentView('settings'); onNavigate?.(); }}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '0.62rem 0.85rem',
              borderRadius: 10,
              fontSize: '0.86rem',
              fontWeight: currentView === 'settings' ? 700 : 600,
              color: currentView === 'settings' ? '#FFFFFF' : '#94A3B8',
              background: currentView === 'settings' ? 'rgba(232, 37, 44, 0.15)' : 'transparent',
              border: currentView === 'settings' ? '1px solid rgba(232, 37, 44, 0.35)' : '1px solid transparent',
            }}
          >
            <Settings size={17} style={{ color: currentView === 'settings' ? '#E8252C' : 'inherit' }} />
            <span>Configurações</span>
          </button>
        )}
      </div>
    </aside>
  );
};

