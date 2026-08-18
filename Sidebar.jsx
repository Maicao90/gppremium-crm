import { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { podeVer, ehMaster } from '../config/modulos';
import { LayoutDashboard, Settings, Sparkles, Wallet, Gauge, Users, Inbox, Link2, Wand2, ShieldCheck, Bot, Send, Shield, Megaphone, MessageSquare } from 'lucide-react';

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
      { id: 'at-atendentes', label: 'Usuários', icon: Users },
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
    titulo: 'Central',
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
    <aside className={`sidebar ${open ? 'open' : ''}`}>
      <div className="sidebar-brand">
        {logoOk ? (
          <img
            className="sidebar-logo-premium"
            src={`${import.meta.env.BASE_URL}logo-premium.png`}
            alt="GP Premium — Seu próximo pneu"
            onError={() => setLogoOk(false)}
          />
        ) : (
          <span className="gp-mark" aria-label="GP Premium"><span className="gp-g">G</span><span className="gp-p">P</span><span className="gp-premium">Premium</span></span>
        )}
      </div>

      <nav className="sidebar-nav">
        {gruposVisiveis.map((g) => (
          <div key={g.titulo} className="nav-group">
            <span className="nav-section">{g.titulo}</span>
            <ul>
              {g.itens.map((item) => (
                <li key={item.id}>
                  <button
                    onClick={() => { setCurrentView(item.id); onNavigate?.(); }}
                    className={`nav-item ${currentView === item.id ? 'nav-item-active' : ''} ${item.destaque ? 'nav-item-glow' : ''}`}
                  >
                    <item.icon size={18} />
                    {item.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className="sidebar-footer">
        {podeVer(usuario, 'settings') && (
          <button className="nav-item" onClick={() => { setCurrentView('settings'); onNavigate?.(); }}>
            <Settings size={18} /> Configurações
          </button>
        )}
      </div>
    </aside>
  );
};
