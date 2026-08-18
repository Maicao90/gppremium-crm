import { useState, useEffect, useRef } from 'react';
import {
  Send,
  Zap,
  Clock,
  CheckCircle2,
  AlertCircle,
  Play,
  Pause,
  Upload,
  Image as ImageIcon,
  Users,
  Settings,
  RefreshCw,
  Search,
  Filter,
  Plus,
  Trash2,
  FileSpreadsheet,
  Check,
  Eye,
  Store as StoreIcon,
  MessageSquare
} from 'lucide-react';
import { api, soNumero } from '../atendimento/api';
import { API_BASE } from '../apiBase';
import { useAppContext } from '../context/AppContext';

export const Disparo = () => {
  const { selectedStoreId, data: appContextData } = useAppContext();
  
  // Estado da Loja Selecionada
  const [lojaId, setLojaId] = useState('');
  const [campanha, setCampanha] = useState({
    autoDisparo: true,
    limiteDia: 30,
    horaInicio: '08:00',
    horaFim: '17:00',
    mensagemPadrao: '',
    fotoUrl: null,
    fotoNome: null,
    ultimoDisparoEm: null,
    enviadosHoje: 0,
    totalPendentes: 0,
    totalContatos: 0
  });

  // Estado dos Contatos e Fila
  const [contatos, setContatos] = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [salvandoConfig, setSalvandoConfig] = useState(false);
  const [filtroStatus, setFiltroStatus] = useState('todos'); // todos, pendentes, contatados
  const [busca, setBusca] = useState('');
  const [modalImportar, setModalImportar] = useState(false);
  const [textoImportacao, setTextoImportacao] = useState('');
  const [importando, setImportando] = useState(false);
  const [enviandoManualId, setEnviandoManualId] = useState(null);
  const [mensagemEditada, setMensagemEditada] = useState({});
  const [notificacao, setNotificacao] = useState(null);
  const fileInputRef = useRef(null);

  // Inicializa com a loja da Direcional ou do AppContext
  useEffect(() => {
    if (selectedStoreId && selectedStoreId !== 'all') {
      setLojaId(selectedStoreId);
    } else {
      const direcional = (appContextData?.stores || []).find(s => s.store_name?.toLowerCase().includes('direcional'));
      if (direcional) {
        setLojaId(direcional.id);
      } else if (appContextData?.stores?.length > 0) {
        setLojaId(appContextData.stores[0].id);
      }
    }
  }, [selectedStoreId, appContextData]);

  // Carrega dados da campanha e lista de contatos ao mudar a loja
  useEffect(() => {
    if (lojaId) {
      carregarCampanha();
      carregarContatos();
    }
  }, [lojaId]);

  // Polling a cada 15s para atualizar o progresso dos disparos automáticos
  useEffect(() => {
    if (!lojaId) return;
    const interval = setInterval(() => {
      carregarCampanha(true);
    }, 15000);
    return () => clearInterval(interval);
  }, [lojaId]);

  const notificar = (texto, tipo = 'sucesso') => {
    setNotificacao({ texto, tipo });
    setTimeout(() => setNotificacao(null), 4000);
  };

  const carregarCampanha = async (silencioso = false) => {
    if (!lojaId) return;
    try {
      const res = await api(`/api/disparo/campanha?storeId=${lojaId}`);
      if (res) {
        setCampanha(prev => ({
          ...prev,
          ...res,
          limiteDia: res.limiteDia || 30,
          horaInicio: res.horaInicio || '08:00',
          horaFim: res.horaFim || '17:00',
          autoDisparo: res.autoDisparo !== undefined ? res.autoDisparo : true
        }));
      }
    } catch (e) {
      if (!silencioso) console.error('Erro ao carregar campanha de disparo:', e);
    }
  };

  const carregarContatos = async () => {
    if (!lojaId) return;
    setCarregando(true);
    try {
      const res = await api(`/api/disparo/contatos?storeId=${lojaId}`);
      setContatos(Array.isArray(res) ? res : []);
    } catch (e) {
      notificar('Erro ao carregar lista de contatos', 'erro');
    } finally {
      setCarregando(false);
    }
  };

  const salvarConfiguracoes = async (novosValores = {}) => {
    if (!lojaId) return;
    setSalvandoConfig(true);
    const payload = {
      storeId: lojaId,
      autoDisparo: novosValores.autoDisparo !== undefined ? novosValores.autoDisparo : campanha.autoDisparo,
      limiteDia: novosValores.limiteDia !== undefined ? novosValores.limiteDia : campanha.limiteDia,
      horaInicio: novosValores.horaInicio !== undefined ? novosValores.horaInicio : campanha.horaInicio,
      horaFim: novosValores.horaFim !== undefined ? novosValores.horaFim : campanha.horaFim,
      mensagemPadrao: novosValores.mensagemPadrao !== undefined ? novosValores.mensagemPadrao : campanha.mensagemPadrao,
    };
    try {
      await api('/api/disparo/campanha/configuracao', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      setCampanha(prev => ({ ...prev, ...payload }));
      notificar('Configurações do robô atualizadas com sucesso!');
    } catch (e) {
      notificar(e.message || 'Erro ao salvar configurações', 'erro');
    } finally {
      setSalvandoConfig(false);
    }
  };

  const handleUploadFoto = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('Selecione um arquivo de imagem válido (JPG ou PNG).');
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const res = await api('/api/disparo/campanha/foto', {
          method: 'POST',
          body: JSON.stringify({
            storeId: lojaId,
            fotoBase64: reader.result,
            fotoNome: file.name
          })
        });
        setCampanha(prev => ({ ...prev, fotoUrl: res.fotoUrl, fotoNome: res.fotoNome }));
        notificar('Banner da campanha anexado com sucesso!');
      } catch (err) {
        notificar(err.message || 'Erro ao enviar foto', 'erro');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleRemoverFoto = async () => {
    if (!confirm('Deseja remover a arte/banner da campanha?')) return;
    try {
      const res = await api('/api/disparo/campanha/foto', {
        method: 'POST',
        body: JSON.stringify({ storeId: lojaId, fotoBase64: null })
      });
      setCampanha(prev => ({ ...prev, fotoUrl: null, fotoNome: null }));
      notificar('Banner removido');
    } catch (err) {
      notificar('Erro ao remover banner', 'erro');
    }
  };

  const dispararManual = async (contato) => {
    const textoMsg = mensagemEditada[contato.id] || contato.mensagemBase || campanha.mensagemPadrao || `Olá ${contato.nome}! Passando para compartilhar nossas promoções especiais de pneus hoje! 🚗💨`;
    setEnviandoManualId(contato.id);
    try {
      const res = await api(`/api/disparo/contatos/${contato.id}/enviar-whatsapp`, {
        method: 'POST',
        body: JSON.stringify({ texto: textoMsg })
      });
      if (res.ok) {
        notificar(`Disparo enviado com sucesso para ${contato.nome}!`);
        setContatos(prev => prev.map(c => c.id === contato.id ? { ...c, contatado: true, enviadoEm: new Date() } : c));
        carregarCampanha(true);
      }
    } catch (e) {
      notificar(e.message || 'Falha ao enviar disparo', 'erro');
    } finally {
      setEnviandoManualId(null);
    }
  };

  const handleImportarContatos = async () => {
    if (!textoImportacao.trim()) {
      alert('Cole ao menos um contato para importar.');
      return;
    }
    setImportando(true);
    try {
      const linhas = textoImportacao.split('\n').map(l => l.trim()).filter(Boolean);
      const lista = [];

      for (const linha of linhas) {
        // Suporta formatos: Nome, Telefone, Valor OU Telefone, Nome OU apenas Telefone
        const partes = linha.split(/[,;\t|]+/).map(p => p.trim());
        let nome = '';
        let tel = '';
        let valor = 0;

        if (partes.length >= 2) {
          const num0 = partes[0].replace(/\D/g, '');
          const num1 = partes[1].replace(/\D/g, '');
          if (num0.length >= 8 && num1.length < 8) {
            tel = num0;
            nome = partes[1];
          } else {
            nome = partes[0];
            tel = num1;
          }
          if (partes[2]) valor = parseFloat(partes[2].replace(/[^\d.,]/g, '').replace(',', '.')) || 0;
        } else if (partes.length === 1) {
          tel = partes[0].replace(/\D/g, '');
          nome = `Cliente ${tel.slice(-4)}`;
        }

        if (tel) {
          lista.push({ nome: nome || tel, tel, valor });
        }
      }

      if (lista.length === 0) {
        alert('Não foram encontrados números válidos no texto inserido.');
        setImportando(false);
        return;
      }

      const res = await api('/api/disparo/importar', {
        method: 'POST',
        body: JSON.stringify({ storeId: lojaId, contatos: lista })
      });

      notificar(`Importação concluída! ${res.total} novos contatos adicionados à fila.`);
      setTextoImportacao('');
      setModalImportar(false);
      carregarContatos();
      carregarCampanha(true);
    } catch (err) {
      notificar(err.message || 'Erro ao importar contatos', 'erro');
    } finally {
      setImportando(false);
    }
  };

  const handleResetarCampanha = async () => {
    if (!confirm('Tem certeza que deseja REINICIAR todos os contatos contatados desta loja para a fila de disparo?')) return;
    try {
      const res = await api('/api/disparo/campanha/resetar-contatados', {
        method: 'POST',
        body: JSON.stringify({ storeId: lojaId })
      });
      notificar(`Campanha reiniciada! ${res.resetados} contatos retornaram para o status pendente.`);
      carregarContatos();
      carregarCampanha(true);
    } catch (e) {
      notificar('Erro ao reiniciar contatos', 'erro');
    }
  };

  // Filtra os contatos
  const contatosFiltrados = contatos.filter(c => {
    if (filtroStatus === 'pendentes' && c.contatado) return false;
    if (filtroStatus === 'contatados' && !c.contatado) return false;
    if (busca.trim()) {
      const term = busca.toLowerCase();
      return (c.nome || '').toLowerCase().includes(term) || (c.tel || '').includes(term);
    }
    return true;
  });

  const progressoPercent = Math.min(100, Math.round(((campanha.enviadosHoje || 0) / (campanha.limiteDia || 30)) * 100));

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', paddingBottom: '2rem' }}>
      
      {/* Toast Notification */}
      {notificacao && (
        <div
          style={{
            position: 'fixed',
            top: 24,
            right: 24,
            zIndex: 9999,
            padding: '12px 20px',
            borderRadius: 12,
            background: notificacao.tipo === 'erro' ? '#ef4444' : '#10b981',
            color: '#fff',
            fontWeight: 700,
            fontSize: '0.88rem',
            boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            animation: 'fadeIn 0.2s ease'
          }}
        >
          {notificacao.tipo === 'erro' ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
          {notificacao.texto}
        </div>
      )}

      {/* Top Header com Seletor e Ações */}
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: 14, background: 'linear-gradient(135deg, rgba(232,37,44,0.22), rgba(232,37,44,0.06))', border: '1px solid rgba(232,37,44,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Send size={22} style={{ color: '#E8252C' }} />
          </div>
          <div>
            <h1 style={{ fontSize: '1.45rem', margin: 0, fontWeight: 800, letterSpacing: '-0.02em' }}>Disparo Direcional Inteligente</h1>
            <p className="muted-hint" style={{ margin: 0, fontSize: '0.82rem', color: '#94A3B8' }}>Envios 100% automáticos e distribuídos durante o dia</p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {/* Seletor de Loja */}
          <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
            <StoreIcon size={14} style={{ position: 'absolute', left: 12, color: '#E8252C', pointerEvents: 'none' }} />
            <select
              className="input-field"
              style={{
                paddingLeft: 34,
                paddingRight: 24,
                paddingTop: '0.5rem',
                paddingBottom: '0.5rem',
                fontSize: '0.86rem',
                fontWeight: 700,
                background: 'rgba(19, 31, 56, 0.9)',
                borderColor: 'rgba(232, 37, 44, 0.35)',
                borderRadius: 10,
              }}
              value={lojaId}
              onChange={(e) => setLojaId(e.target.value)}
            >
              {(appContextData?.stores || []).map((s) => (
                <option key={s.id} value={s.id}>🏢 {s.store_name}</option>
              ))}
            </select>
          </div>

          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setModalImportar(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, borderRadius: 10, fontSize: '0.84rem' }}
          >
            <FileSpreadsheet size={15} style={{ color: '#38bdf8' }} /> Importar Lista
          </button>

          <button
            type="button"
            className="btn btn-secondary"
            onClick={carregarContatos}
            disabled={carregando}
            style={{ display: 'flex', alignItems: 'center', gap: 6, borderRadius: 10, fontSize: '0.84rem' }}
            title="Recarregar Lista"
          >
            <RefreshCw size={14} className={carregando ? 'spin' : ''} />
          </button>
        </div>
      </div>

      {/* Grid Principal: Robô Automático + Métricas do Dia */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem' }}>
        
        {/* Card 1: Motor do Robô Automático */}
        <div className="card" style={{ background: 'linear-gradient(145deg, #10192e, #0c1322)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: campanha.autoDisparo ? 'rgba(16,185,129,0.18)' : 'rgba(239,68,68,0.18)', border: `1px solid ${campanha.autoDisparo ? 'rgba(16,185,129,0.35)' : 'rgba(239,68,68,0.35)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Zap size={18} style={{ color: campanha.autoDisparo ? '#10b981' : '#ef4444' }} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800 }}>Robô de Disparo 100% Automático</h3>
                <span style={{ fontSize: '0.74rem', color: campanha.autoDisparo ? '#34d399' : '#f87171', fontWeight: 700 }}>
                  {campanha.autoDisparo ? '🟢 ATIVO (Distribuição Inteligente)' : '⚪ PAUSADO'}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => salvarConfiguracoes({ autoDisparo: !campanha.autoDisparo })}
              className={`btn ${campanha.autoDisparo ? 'btn-secondary' : 'btn-primary'}`}
              style={{
                borderRadius: 20,
                padding: '6px 14px',
                fontSize: '0.8rem',
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                gap: 6
              }}
            >
              {campanha.autoDisparo ? <Pause size={14} /> : <Play size={14} />}
              {campanha.autoDisparo ? 'Pausar Robô' : 'Ativar Robô'}
            </button>
          </div>

          <p style={{ fontSize: '0.82rem', color: '#94A3B8', lineHeight: 1.4, margin: '0 0 1rem 0' }}>
            O robô envia automaticamente <b>{campanha.limiteDia} mensagens por dia</b> de forma espaçada e natural (1 mensagem a cada ~18 minutos) entre <b>{campanha.horaInicio} e {campanha.horaFim}</b>, sem exigir cliques manuais.
          </p>

          {/* Barra de Progresso Diário */}
          <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: '12px', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', fontWeight: 700, marginBottom: 6 }}>
              <span>Meta de Envios Hoje:</span>
              <span style={{ color: '#38bdf8' }}>{campanha.enviadosHoje || 0} / {campanha.limiteDia || 30} ({progressoPercent}%)</span>
            </div>
            <div style={{ width: '100%', height: 8, background: 'rgba(255,255,255,0.1)', borderRadius: 6, overflow: 'hidden' }}>
              <div
                style={{
                  width: `${progressoPercent}%`,
                  height: '100%',
                  background: 'linear-gradient(90deg, #E8252C, #f97316)',
                  borderRadius: 6,
                  transition: 'width 0.5s ease'
                }}
              />
            </div>
          </div>
        </div>

        {/* Card 2: Janela de Horários e Parâmetros */}
        <div className="card" style={{ background: 'linear-gradient(145deg, #10192e, #0c1322)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '1rem' }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(56,189,248,0.15)', border: '1px solid rgba(56,189,248,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Clock size={18} style={{ color: '#38bdf8' }} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800 }}>Horários & Limites Diários</h3>
              <span style={{ fontSize: '0.74rem', color: '#94A3B8' }}>Configuração de segurança anti-bloqueio</span>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: '1rem' }}>
            <div>
              <label style={{ fontSize: '0.74rem', fontWeight: 700, color: '#94A3B8', display: 'block', marginBottom: 4 }}>Início</label>
              <input
                type="time"
                className="input-field"
                style={{ fontSize: '0.84rem', fontWeight: 700, padding: '6px 8px' }}
                value={campanha.horaInicio || '08:00'}
                onChange={(e) => setCampanha(prev => ({ ...prev, horaInicio: e.target.value }))}
                onBlur={() => salvarConfiguracoes({ horaInicio: campanha.horaInicio })}
              />
            </div>

            <div>
              <label style={{ fontSize: '0.74rem', fontWeight: 700, color: '#94A3B8', display: 'block', marginBottom: 4 }}>Fim</label>
              <input
                type="time"
                className="input-field"
                style={{ fontSize: '0.84rem', fontWeight: 700, padding: '6px 8px' }}
                value={campanha.horaFim || '17:00'}
                onChange={(e) => setCampanha(prev => ({ ...prev, horaFim: e.target.value }))}
                onBlur={() => salvarConfiguracoes({ horaFim: campanha.horaFim })}
              />
            </div>

            <div>
              <label style={{ fontSize: '0.74rem', fontWeight: 700, color: '#94A3B8', display: 'block', marginBottom: 4 }}>Limite/Dia</label>
              <input
                type="number"
                min="1"
                max="300"
                className="input-field"
                style={{ fontSize: '0.84rem', fontWeight: 700, padding: '6px 8px' }}
                value={campanha.limiteDia || 30}
                onChange={(e) => setCampanha(prev => ({ ...prev, limiteDia: Number(e.target.value) || 30 }))}
                onBlur={() => salvarConfiguracoes({ limiteDia: campanha.limiteDia })}
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleResetarCampanha}
              style={{ flex: 1, fontSize: '0.78rem', fontWeight: 700, padding: '8px 12px', borderRadius: 8 }}
            >
              🔄 Reiniciar Fila de Disparo
            </button>
          </div>
        </div>

        {/* Card 3: Banner & Arte da Campanha */}
        <div className="card" style={{ background: 'linear-gradient(145deg, #10192e, #0c1322)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(232,37,44,0.18)', border: '1px solid rgba(232,37,44,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <ImageIcon size={18} style={{ color: '#E8252C' }} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800 }}>Arte / Imagem da Campanha</h3>
                <span style={{ fontSize: '0.74rem', color: '#94A3B8' }}>Enviada junto do texto como legenda</span>
              </div>
            </div>
          </div>

          <input
            type="file"
            ref={fileInputRef}
            onChange={handleUploadFoto}
            accept="image/*"
            style={{ display: 'none' }}
          />

          {campanha.fotoUrl ? (
            <div style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.15)' }}>
              <img
                src={API_BASE + campanha.fotoUrl}
                alt="Banner da Campanha"
                style={{ width: '100%', maxHeight: 110, objectFit: 'cover', display: 'block' }}
              />
              <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: 0.9 }}>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="btn btn-secondary"
                  style={{ fontSize: '0.75rem', padding: '4px 10px', borderRadius: 6 }}
                >
                  Trocar Foto
                </button>
                <button
                  type="button"
                  onClick={handleRemoverFoto}
                  className="btn btn-danger"
                  style={{ fontSize: '0.75rem', padding: '4px 10px', borderRadius: 6, background: '#ef4444', color: '#fff' }}
                >
                  Remover
                </button>
              </div>
            </div>
          ) : (
            <div
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: '2px dashed rgba(255,255,255,0.15)',
                borderRadius: 12,
                padding: '16px',
                textAlign: 'center',
                cursor: 'pointer',
                background: 'rgba(255,255,255,0.02)',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#E8252C')}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)')}
            >
              <Upload size={22} style={{ color: '#94A3B8', margin: '0 auto 6px auto' }} />
              <p style={{ margin: 0, fontSize: '0.82rem', fontWeight: 700, color: '#F1F5F9' }}>Clique para anexar o Banner</p>
              <span style={{ fontSize: '0.72rem', color: '#64748B' }}>PNG ou JPG até 10MB</span>
            </div>
          )}
        </div>
      </div>

      {/* Editor da Mensagem Padrão */}
      <div className="card" style={{ background: '#10192e', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <MessageSquare size={18} style={{ color: '#E8252C' }} />
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800 }}>Mensagem Padrão do Disparo Automático</h3>
          </div>
          <span style={{ fontSize: '0.74rem', color: '#94A3B8' }}>Use tags inteligentes como <b>{'{nome}'}</b></span>
        </div>
        <textarea
          className="input-field"
          rows={3}
          style={{ width: '100%', fontSize: '0.86rem', resize: 'vertical' }}
          placeholder="Ex: Olá {nome}! Tudo bem? Passando para compartilhar as ofertas imperdíveis da GP Pneus hoje! 🚗💨"
          value={campanha.mensagemPadrao || ''}
          onChange={(e) => setCampanha(prev => ({ ...prev, mensagemPadrao: e.target.value }))}
          onBlur={() => salvarConfiguracoes({ mensagemPadrao: campanha.mensagemPadrao })}
        />
      </div>

      {/* Filtros e Busca da Tabela de Contatos */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            type="button"
            className={`btn ${filtroStatus === 'todos' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setFiltroStatus('todos')}
            style={{ fontSize: '0.8rem', padding: '6px 14px', borderRadius: 8, fontWeight: 700 }}
          >
            Todos ({contatos.length})
          </button>
          <button
            type="button"
            className={`btn ${filtroStatus === 'pendentes' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setFiltroStatus('pendentes')}
            style={{ fontSize: '0.8rem', padding: '6px 14px', borderRadius: 8, fontWeight: 700 }}
          >
            Pendentes ({contatos.filter(c => !c.contatado).length})
          </button>
          <button
            type="button"
            className={`btn ${filtroStatus === 'contatados' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setFiltroStatus('contatados')}
            style={{ fontSize: '0.8rem', padding: '6px 14px', borderRadius: 8, fontWeight: 700 }}
          >
            Já Contatados ({contatos.filter(c => c.contatado).length})
          </button>
        </div>

        <div style={{ position: 'relative', width: 280 }}>
          <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
          <input
            type="text"
            className="input-field"
            placeholder="Buscar por nome ou telefone..."
            style={{ paddingLeft: 34, fontSize: '0.84rem', width: '100%', borderRadius: 8 }}
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
      </div>

      {/* Tabela de Contatos da Campanha */}
      <div className="card" style={{ background: '#10192e', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.84rem' }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.08)', color: '#94A3B8', fontWeight: 700, fontSize: '0.76rem', textTransform: 'uppercase' }}>
                <th style={{ padding: '12px 16px' }}>Status</th>
                <th style={{ padding: '12px 16px' }}>Cliente</th>
                <th style={{ padding: '12px 16px' }}>WhatsApp</th>
                <th style={{ padding: '12px 16px' }}>Histórico / LTV</th>
                <th style={{ padding: '12px 16px' }}>Mensagem</th>
                <th style={{ padding: '12px 16px', textAlign: 'right' }}>Ação</th>
              </tr>
            </thead>
            <tbody>
              {contatosFiltrados.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: '32px', textAlign: 'center', color: '#64748B' }}>
                    {carregando ? 'Carregando lista de leads...' : 'Nenhum contato encontrado com os filtros selecionados.'}
                  </td>
                </tr>
              ) : (
                contatosFiltrados.slice(0, 100).map((c) => (
                  <tr
                    key={c.id}
                    style={{
                      borderBottom: '1px solid rgba(255,255,255,0.04)',
                      background: c.contatado ? 'rgba(16,185,129,0.02)' : 'transparent',
                      transition: 'background 0.15s ease'
                    }}
                  >
                    <td style={{ padding: '12px 16px' }}>
                      {c.contatado ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 8px', borderRadius: 6, background: 'rgba(16,185,129,0.15)', color: '#10b981', fontSize: '0.72rem', fontWeight: 800 }}>
                          <CheckCircle2 size={12} /> Enviado
                        </span>
                      ) : (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 8px', borderRadius: 6, background: 'rgba(56,189,248,0.12)', color: '#38bdf8', fontSize: '0.72rem', fontWeight: 800 }}>
                          <Clock size={12} /> Na Fila
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '12px 16px', fontWeight: 700, color: '#F1F5F9' }}>
                      {c.nome || 'Cliente'}
                    </td>
                    <td style={{ padding: '12px 16px', color: '#94A3B8' }}>
                      {c.telDisp || c.tel}
                    </td>
                    <td style={{ padding: '12px 16px', color: '#34d399', fontWeight: 700 }}>
                      {c.valor ? `R$ ${Number(c.valor).toFixed(2)}` : 'R$ 0,00'}
                    </td>
                    <td style={{ padding: '12px 16px', maxWidth: 300 }}>
                      <input
                        type="text"
                        className="input-field"
                        style={{ fontSize: '0.78rem', padding: '4px 8px', width: '100%' }}
                        defaultValue={c.mensagemBase || campanha.mensagemPadrao || ''}
                        onChange={(e) => setMensagemEditada(prev => ({ ...prev, [c.id]: e.target.value }))}
                        placeholder="Mensagem deste contato..."
                      />
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={enviandoManualId === c.id}
                        onClick={() => dispararManual(c)}
                        style={{
                          fontSize: '0.76rem',
                          padding: '6px 12px',
                          borderRadius: 8,
                          fontWeight: 800,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6
                        }}
                      >
                        <Send size={12} />
                        {enviandoManualId === c.id ? 'Enviando...' : c.contatado ? 'Reenviar' : 'Enviar Agora'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de Importação em Massa */}
      {modalImportar && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: 20
          }}
        >
          <div
            className="card"
            style={{
              width: '100%',
              maxWidth: 560,
              background: '#10192e',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 20,
              padding: '1.5rem',
              boxShadow: '0 20px 50px rgba(0,0,0,0.6)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <FileSpreadsheet size={22} style={{ color: '#38bdf8' }} />
                <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800 }}>Importar Contatos / Leads</h2>
              </div>
              <button
                type="button"
                onClick={() => setModalImportar(false)}
                style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', fontSize: '1.2rem' }}
              >
                ✕
              </button>
            </div>

            <p style={{ fontSize: '0.82rem', color: '#94A3B8', margin: '0 0 1rem 0', lineHeight: 1.4 }}>
              Cole a lista de clientes abaixo (um por linha). Formatos suportados:<br />
              • <code>Nome, Telefone, Valor</code> (Ex: <i>João Silva, 61999998888, 1200</i>)<br />
              • <code>Telefone, Nome</code> (Ex: <i>61999998888, João Silva</i>)<br />
              • Apenas os telefones (Ex: <i>61999998888</i>)
            </p>

            <textarea
              className="input-field"
              rows={8}
              placeholder={`João Silva, 61999998888, 1500\nMaria Santos, 61988887777, 850\n61977776666`}
              style={{ width: '100%', fontSize: '0.84rem', fontFamily: 'monospace', resize: 'vertical', marginBottom: '1rem' }}
              value={textoImportacao}
              onChange={(e) => setTextoImportacao(e.target.value)}
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setModalImportar(false)}
                style={{ borderRadius: 10, fontWeight: 700 }}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={importando || !textoImportacao.trim()}
                onClick={handleImportarContatos}
                style={{ borderRadius: 10, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6 }}
              >
                {importando ? <RefreshCw size={14} className="spin" /> : <Upload size={14} />}
                {importando ? 'Importando...' : 'Adicionar à Fila'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
