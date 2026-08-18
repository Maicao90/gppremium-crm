import { useState, useEffect } from 'react';
import { AppProvider, useAppContext } from './context/AppContext';
import { useAuth } from './context/AuthContext';
import { podeVer, primeiroModulo, ehMaster } from './config/modulos';
import Login from './pages/Login';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { Dashboard } from './pages/Dashboard';
import { VirtualManager } from './components/VirtualManager';
import { Contas } from './pages/Contas';
import { LinkNaBio } from './pages/LinkNaBio';
import { OtimizadorAds } from './pages/OtimizadorAds';
import { OlxAnuncios } from './pages/OlxAnuncios';
import { OlxChat } from './pages/OlxChat';
import { AtMetricas } from './pages/AtMetricas';
import { AtAtendentes } from './pages/AtAtendentes';
import { AtInbox } from './pages/AtInbox';
import { BotPneus } from './pages/BotPneus';
import { Disparo } from './pages/Disparo';
import { Garantia50k } from './pages/Garantia50k';
import { Assistant } from './pages/Assistant';
import { Settings } from './pages/Settings';
import Usuarios from './pages/Usuarios';
import { ParceirosExtensao } from './pages/ParceirosExtensao';

function Shell() {
  const { currentView, setCurrentView } = useAppContext();
  const { usuario } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  // Painel escondido dos parceiros da extensão: não fica em nenhum menu, só abre
  // digitando a URL com #parceiros. Sem link, sem módulo — só o master acessa.
  useEffect(() => {
    if (window.location.hash === '#parceiros' && ehMaster(usuario)) setCurrentView('parceiros-ext');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tela efetiva: se a atual não é permitida pro usuário, cai no primeiro módulo dele.
  const permitido = currentView === 'usuarios' ? ehMaster(usuario)
    : currentView === 'parceiros-ext' ? ehMaster(usuario)
    : podeVer(usuario, currentView);
  const view = permitido ? currentView : primeiroModulo(usuario);

  return (
    <div className="app-container">
      <Sidebar open={menuOpen} onNavigate={() => setMenuOpen(false)} />
      <div className={`sidebar-backdrop ${menuOpen ? 'open' : ''}`} onClick={() => setMenuOpen(false)} />

      <main className="main-content">
        <TopBar onMenu={() => setMenuOpen(true)} />

        <div className="page-content">
          {view === 'dashboard' && <Dashboard />}
          {view === 'contas' && <Contas />}
          {view === 'olx-anuncios' && <OlxAnuncios />}
          {view === 'linkbio' && <LinkNaBio />}
          {view === 'otimizador' && <OtimizadorAds />}
          {view === 'assistant' && <Assistant />}
          {view === 'settings' && <Settings />}
          {view === 'usuarios' && ehMaster(usuario) && <Usuarios />}
          {view === 'parceiros-ext' && ehMaster(usuario) && <ParceirosExtensao />}
          {view === 'at-dashboard' && <AtMetricas />}
          {view === 'at-atendentes' && <AtAtendentes />}
          {view === 'at-inbox' && <AtInbox />}
          {view === 'olx-chat' && <OlxChat />}
          {view === 'at-botpneus' && <BotPneus />}
          {view === 'at-disparo' && <Disparo />}
          {view === 'garantia50k' && <Garantia50k />}
        </div>
      </main>
    </div>
  );
}

function App() {
  const { usuario } = useAuth();
  if (!usuario) return <Login />;
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}

export default App;
