import { useState, useEffect, useRef } from 'react';
import {
  Megaphone,
  Plus,
  RefreshCw,
  Search,
  ExternalLink,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Trash2,
  Edit2,
  X,
  MessageSquare,
  Zap,
  Image as ImageIcon,
  UploadCloud,
  Layers,
  Sparkles,
} from 'lucide-react';
import { api } from '../atendimento/api';
import { API_BASE } from '../apiBase';
import { Modal } from '../components/Modal';

const midiaSrc = (u) => {
  if (!u) return '';
  if (u.startsWith('http://') || u.startsWith('https://') || u.startsWith('data:')) return u;
  if (u.startsWith('/')) return (API_BASE || '') + u;
  return u;
};

export const OlxAnuncios = () => {
  const [resumo, setResumo] = useState({ total: 0, ativos: 0, removidos: 0, expirados: 0, conversas: 0 });
  const [anuncios, setAnuncios] = useState([]);
  const [lojas, setLojas] = useState([]);
  const [lojaFiltro, setLojaFiltro] = useState('__todas__');
  const [statusFiltro, setStatusFiltro] = useState('todos');
  const [busca, setBusca] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  // Modal de Criação / Edição
  const [modalAberto, setModalAberto] = useState(false);
  const [editandoId, setEditandoId] = useState(null);
  const [form, setForm] = useState({
    titulo: '',
    descricao: '',
    preco: '',
    categoria: 'pneus_rodas',
    tipoItem: 'novo',
    cep: '71000-000',
    telefone: '',
    lojaId: '',
    linkOlx: '',
  });

  // Estado de Fotos (Upload Direto)
  const [fotosArray, setFotosArray] = useState([]);
  const [enviandoFotos, setEnviandoFotos] = useState(false);
  const [mostrarLinkInput, setMostrarLinkInput] = useState(false);
  const [linkManual, setLinkManual] = useState('');
  const [arrastando, setArrastando] = useState(false);
  const fileInputRef = useRef(null);

  // Lightbox
  const [fotoLightbox, setFotoLightbox] = useState(null);
  const [salvando, setSalvando] = useState(false);

  const carregarDados = async () => {
    setCarregando(true);
    setErro('');
    try {
      const [resResumo, resAnuncios, resLojas] = await Promise.all([
        api(`/api/olx/resumo?lojaId=${lojaFiltro !== '__todas__' ? encodeURIComponent(lojaFiltro) : ''}`),
        api(`/api/olx/anuncios?lojaId=${encodeURIComponent(lojaFiltro)}&status=${encodeURIComponent(statusFiltro)}&busca=${encodeURIComponent(busca)}`),
        api('/api/lojas'),
      ]);
      setResumo(resResumo || { total: 0, ativos: 0, removidos: 0, expirados: 0, conversas: 0 });
      setAnuncios(Array.isArray(resAnuncios) ? resAnuncios : []);
      setLojas(Array.isArray(resLojas) ? resLojas : []);
    } catch (e) {
      setErro(e.message || 'Erro ao carregar anúncios da OLX');
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregarDados();
  }, [lojaFiltro, statusFiltro]);

  const handleBusca = (e) => {
    e.preventDefault();
    carregarDados();
  };

  const abrirNovo = () => {
    setEditandoId(null);
    setForm({
      titulo: '',
      descricao: 'Pneus novos e seminovos com garantia de 50.000 KM. Montagem, balanceamento e alinhamento cortesia na loja. Venha conferir!',
      preco: '',
      categoria: 'pneus_rodas',
      tipoItem: 'novo',
      cep: '71000-000',
      telefone: '',
      lojaId: lojas[0]?.id || '',
      linkOlx: '',
    });
    setFotosArray([]);
    setMostrarLinkInput(false);
    setLinkManual('');
    setModalAberto(true);
  };

  const abrirEditar = (a) => {
    setEditandoId(a.id);
    let fotosList = [];
    try {
      if (Array.isArray(a.fotosList)) fotosList = a.fotosList;
      else if (a.fotos) {
        const parsed = JSON.parse(a.fotos);
        fotosList = Array.isArray(parsed) ? parsed : [parsed];
      }
    } catch {
      fotosList = a.fotos ? a.fotos.split('\n').filter(Boolean) : [];
    }

    setFotosArray(fotosList);
    setMostrarLinkInput(false);
    setLinkManual('');

    setForm({
      titulo: a.titulo || '',
      descricao: a.descricao || '',
      preco: a.preco || '',
      categoria: a.categoria || 'pneus_rodas',
      tipoItem: a.tipoItem || 'novo',
      cep: a.cep || '',
      telefone: a.telefone || '',
      lojaId: a.lojaId || '',
      linkOlx: a.linkOlx || '',
    });
    setModalAberto(true);
  };

  // Upload direto de múltiplos arquivos de foto
  const processarArquivos = async (arquivos) => {
    if (!arquivos || arquivos.length === 0) return;
    setEnviandoFotos(true);
    const novasUrls = [];

    for (const file of Array.from(arquivos)) {
      if (!file.type.startsWith('image/')) continue;
      try {
        const base64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        const res = await api('/api/olx/upload-foto', {
          method: 'POST',
          body: JSON.stringify({
            base64,
            mimetype: file.type,
            nomeOriginal: file.name,
          }),
        });

        if (res && res.url) {
          novasUrls.push(res.url);
        }
      } catch (err) {
        console.error('Erro ao subir foto:', err);
        alert(`Erro ao subir a foto "${file.name}": ${err.message || 'Tente novamente.'}`);
      }
    }

    setFotosArray((prev) => [...prev, ...novasUrls]);
    setEnviandoFotos(false);
  };

  const handleFileInputChange = (e) => {
    processarArquivos(e.target.files);
    e.target.value = '';
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setArrastando(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processarArquivos(e.dataTransfer.files);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setArrastando(true);
  };

  const handleDragLeave = () => {
    setArrastando(false);
  };

  const removerFoto = (index) => {
    setFotosArray((prev) => prev.filter((_, i) => i !== index));
  };

  const adicionarLinkManual = () => {
    const l = linkManual.trim();
    if (!l) return;
    setFotosArray((prev) => [...prev, l]);
    setLinkManual('');
    setMostrarLinkInput(false);
  };

  const salvarAnuncio = async (e) => {
    e.preventDefault();
    if (!form.titulo || !form.preco) {
      alert('Por favor preencha Título e Preço.');
      return;
    }
    setSalvando(true);

    const payload = {
      ...form,
      preco: Number(form.preco),
      fotos: fotosArray,
    };

    try {
      if (editandoId) {
        await api(`/api/olx/anuncios/${editandoId}`, { method: 'PUT', body: JSON.stringify(payload) });
      } else {
        await api('/api/olx/anuncios', { method: 'POST', body: JSON.stringify(payload) });
      }
      setModalAberto(false);
      carregarDados();
    } catch (err) {
      alert(err.message || 'Erro ao salvar anúncio.');
    } finally {
      setSalvando(false);
    }
  };

  const republicar = async (id) => {
    if (!confirm('Deseja republicar/reativar este anúncio agora?')) return;
    try {
      await api(`/api/olx/anuncios/${id}/republicar`, { method: 'POST' });
      carregarDados();
    } catch (e) {
      alert(e.message || 'Erro ao republicar anúncio.');
    }
  };

  const verificarStatus = async (id) => {
    try {
      const res = await api(`/api/olx/anuncios/${id}/verificar-status`, { method: 'POST' });
      alert(`Status na OLX: ${res.status.toUpperCase()}${res.motivo ? ` (${res.motivo})` : ''}`);
      carregarDados();
    } catch (e) {
      alert(e.message || 'Erro ao verificar status.');
    }
  };

  const excluir = async (id) => {
    if (!confirm('Tem certeza que deseja excluir este anúncio?')) return;
    try {
      await api(`/api/olx/anuncios/${id}`, { method: 'DELETE' });
      carregarDados();
    } catch (e) {
      alert(e.message || 'Erro ao excluir anúncio.');
    }
  };

  return (
    <div className="animate-fade-in" style={{ padding: '0 0.5rem 2rem' }}>
      {/* Header Principal */}
      <div className="page-header" style={{ marginBottom: '1.2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: 'linear-gradient(135deg, rgba(249,115,22,0.2), rgba(234,88,12,0.08))', border: '1px solid rgba(249,115,22,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Megaphone size={22} style={{ color: '#f97316' }} />
          </div>
          <div>
            <h1 style={{ fontSize: '1.45rem', margin: 0, fontWeight: 800, letterSpacing: '-0.02em', color: '#FFFFFF' }}>
              Gerenciador de Anúncios OLX
            </h1>
            <p className="muted-hint" style={{ margin: 0, fontSize: '0.82rem', color: '#94A3B8' }}>
              Upload direto de fotos do computador/celular e monitoramento em tempo real
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            className="icon-btn"
            style={{ width: 38, height: 38, borderRadius: 10 }}
            onClick={carregarDados}
            title="Atualizar lista e status"
          >
            <RefreshCw size={16} className={carregando ? 'spin' : ''} />
          </button>

          <button
            className="btn btn-primary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '0.55rem 1.15rem', background: 'linear-gradient(135deg, #f97316, #ea580c)', borderColor: '#ea580c', borderRadius: 10, boxShadow: '0 4px 16px rgba(249,115,22,0.35)' }}
            onClick={abrirNovo}
          >
            <Plus size={18} /> Novo Anúncio OLX
          </button>
        </div>
      </div>

      {erro && (
        <div className="owner-banner mb-3" style={{ background: 'rgba(232,37,44,0.08)', border: '1px solid rgba(232,37,44,0.25)', padding: '0.75rem 1rem', borderRadius: 10 }}>
          <AlertTriangle size={18} style={{ color: 'var(--danger-color)' }} />
          <span>{erro}</span>
        </div>
      )}

      {/* Cards de Métricas e KPIs no Topo */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 14,
          marginBottom: '1.4rem',
        }}
      >
        <div className="card glass-panel" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14, borderRadius: 14, background: '#0e1628', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ width: 44, height: 44, borderRadius: 10, background: 'rgba(249,115,22,0.15)', color: '#f97316', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Megaphone size={22} />
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', fontWeight: 600 }}>Total de Anúncios</span>
            <strong style={{ fontSize: '1.4rem', color: '#FFFFFF', fontWeight: 800 }}>{resumo.total}</strong>
          </div>
        </div>

        <div className="card glass-panel" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14, borderRadius: 14, background: '#0e1628', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ width: 44, height: 44, borderRadius: 10, background: 'rgba(16,185,129,0.15)', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CheckCircle2 size={22} />
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', fontWeight: 600 }}>Ativos na OLX</span>
            <strong style={{ fontSize: '1.4rem', color: '#10b981', fontWeight: 800 }}>{resumo.ativos}</strong>
          </div>
        </div>

        <div className="card glass-panel" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14, borderRadius: 14, background: '#0e1628', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ width: 44, height: 44, borderRadius: 10, background: 'rgba(239,68,68,0.15)', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <AlertTriangle size={22} />
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', fontWeight: 600 }}>Removidos / Expirados</span>
            <strong style={{ fontSize: '1.4rem', color: '#ef4444', fontWeight: 800 }}>{resumo.removidos + resumo.expirados}</strong>
          </div>
        </div>

        <div className="card glass-panel" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14, borderRadius: 14, background: '#0e1628', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ width: 44, height: 44, borderRadius: 10, background: 'rgba(56,189,248,0.15)', color: '#38bdf8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <MessageSquare size={22} />
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', fontWeight: 600 }}>Conversas do Chat</span>
            <strong style={{ fontSize: '1.4rem', color: '#38bdf8', fontWeight: 800 }}>{resumo.conversas}</strong>
          </div>
        </div>
      </div>

      {/* Barra de Filtros e Busca */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
          marginBottom: '1rem',
          background: '#0e1628',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: 14,
          padding: '10px 14px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {lojas.length > 0 && (
            <select
              className="input-field"
              style={{ width: 'auto', minWidth: 170, fontSize: '0.84rem', fontWeight: 600, background: '#131f36', borderRadius: 10 }}
              value={lojaFiltro}
              onChange={(e) => setLojaFiltro(e.target.value)}
            >
              <option value="__todas__">🏪 Todas as Lojas</option>
              {lojas.map((l) => (
                <option key={l.id} value={l.id}>🏪 {l.store_name}</option>
              ))}
            </select>
          )}

          <div style={{ display: 'flex', background: '#131f36', borderRadius: 10, padding: 3, border: '1px solid rgba(255,255,255,0.08)' }}>
            {[
              { id: 'todos', label: 'Todos' },
              { id: 'ativo', label: 'Ativos 🟢' },
              { id: 'removido', label: 'Removidos 🔴' },
              { id: 'expirado', label: 'Expirados ⚪' },
            ].map((st) => (
              <button
                key={st.id}
                type="button"
                onClick={() => setStatusFiltro(st.id)}
                style={{
                  padding: '5px 14px',
                  borderRadius: 8,
                  border: 'none',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  background: statusFiltro === st.id ? '#f97316' : 'transparent',
                  color: statusFiltro === st.id ? '#fff' : '#94a3b8',
                  transition: 'all 0.15s ease',
                }}
              >
                {st.label}
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={handleBusca} style={{ position: 'relative', width: 280 }}>
          <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
          <input
            className="input-field"
            style={{ paddingLeft: 36, borderRadius: 10, fontSize: '0.84rem', background: '#131f36' }}
            placeholder="Buscar por título ou código…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </form>
      </div>

      {/* Lista de Anúncios */}
      <div className="card glass-panel" style={{ padding: 0, borderRadius: 16, overflow: 'hidden', background: '#0a0f1d', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
        {carregando ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
            <Clock size={32} className="spin" style={{ margin: '0 auto 10px', opacity: 0.4 }} />
            <p style={{ margin: 0 }}>Carregando anúncios da OLX…</p>
          </div>
        ) : anuncios.length === 0 ? (
          <div style={{ padding: 50, textAlign: 'center', color: '#94a3b8' }}>
            <Megaphone size={40} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
            <h3 style={{ fontSize: '1.1rem', color: '#FFFFFF', margin: '0 0 6px 0', fontWeight: 700 }}>Nenhum anúncio encontrado</h3>
            <p style={{ fontSize: '0.85rem', margin: '0 0 16px 0' }}>Crie seu primeiro anúncio com upload direto de fotos para publicar e gerenciar diretamente pela plataforma.</p>
            <button className="btn btn-primary" onClick={abrirNovo} style={{ background: '#f97316', borderColor: '#ea580c', borderRadius: 10 }}>
              <Plus size={16} /> Publicar Anúncio Agora
            </button>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: 85 }}>Fotos</th>
                  <th>Título & Código</th>
                  <th>Loja</th>
                  <th style={{ textAlign: 'right' }}>Preço</th>
                  <th style={{ textAlign: 'center' }}>Status OLX</th>
                  <th style={{ textAlign: 'center' }}>Última Checagem</th>
                  <th style={{ textAlign: 'right' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {anuncios.map((a) => {
                  const fotos = Array.isArray(a.fotosList) ? a.fotosList : [];
                  const fotoPrincipal = fotos[0] ? midiaSrc(fotos[0]) : null;
                  const dataCheck = a.ultimaChecagem ? new Date(a.ultimaChecagem) : null;

                  return (
                    <tr key={a.id}>
                      <td>
                        {fotoPrincipal ? (
                          <div
                            style={{ position: 'relative', width: 54, height: 54, borderRadius: 10, overflow: 'hidden', cursor: 'pointer', border: '1px solid rgba(255,255,255,0.15)' }}
                            onClick={() => setFotoLightbox({ url: fotoPrincipal, fotos, titulo: a.titulo })}
                            title="Clique para ver fotos em tela cheia"
                          >
                            <img
                              src={fotoPrincipal}
                              alt=""
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            />
                            {fotos.length > 1 && (
                              <span
                                style={{
                                  position: 'absolute',
                                  bottom: 2,
                                  right: 2,
                                  background: 'rgba(0,0,0,0.75)',
                                  color: '#fff',
                                  fontSize: '0.62rem',
                                  padding: '1px 4px',
                                  borderRadius: 4,
                                  fontWeight: 700,
                                }}
                              >
                                +{fotos.length - 1}
                              </span>
                            )}
                          </div>
                        ) : (
                          <div style={{ width: 54, height: 54, borderRadius: 10, background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
                            <ImageIcon size={22} />
                          </div>
                        )}
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <strong style={{ fontSize: '0.92rem', color: '#FFFFFF', fontWeight: 700 }}>{a.titulo}</strong>
                          <span style={{ fontSize: '0.74rem', color: '#94a3b8', marginTop: 2 }}>
                            Cód: <code style={{ color: '#cbd5e1' }}>{a.olxAdId || 'Em aprovação'}</code> · {a.tipoItem === 'novo' ? '✨ Novo' : '🔄 Seminovo'}
                          </span>
                        </div>
                      </td>
                      <td>
                        <span className="badge" style={{ background: 'rgba(255,255,255,0.06)', color: '#FFFFFF', border: '1px solid rgba(255,255,255,0.1)' }}>
                          🏪 {a.lojaNome}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <strong style={{ fontSize: '1rem', color: '#10b981', fontWeight: 800 }}>
                          R$ {Number(a.preco || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </strong>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {a.status === 'ativo' ? (
                          <span className="badge badge-success">● Ativo</span>
                        ) : a.status === 'removido' ? (
                          <span className="badge badge-danger">🔴 Removido</span>
                        ) : (
                          <span className="badge badge-warning">⚪ Expirado</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'center', fontSize: '0.78rem', color: '#94a3b8' }}>
                        {dataCheck ? dataCheck.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
                          {a.linkOlx && (
                            <a
                              href={a.linkOlx}
                              target="_blank"
                              rel="noreferrer"
                              className="icon-btn"
                              title="Ver anúncio direto na OLX"
                              style={{ color: '#f97316' }}
                            >
                              <ExternalLink size={16} />
                            </a>
                          )}

                          {a.status !== 'ativo' && (
                            <button
                              className="btn btn-primary"
                              style={{ padding: '4px 10px', fontSize: '0.75rem', background: '#10b981', borderColor: '#059669', borderRadius: 8 }}
                              onClick={() => republicar(a.id)}
                              title="Reativar e Republicar"
                            >
                              <Zap size={13} /> Republicar
                            </button>
                          )}

                          <button
                            className="icon-btn"
                            onClick={() => verificarStatus(a.id)}
                            title="Checar status agora"
                          >
                            <RefreshCw size={15} />
                          </button>

                          <button
                            className="icon-btn"
                            onClick={() => abrirEditar(a)}
                            title="Editar anúncio"
                          >
                            <Edit2 size={15} />
                          </button>

                          <button
                            className="icon-btn"
                            style={{ color: '#ef4444' }}
                            onClick={() => excluir(a.id)}
                            title="Excluir"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal de Criação / Edição de Anúncio OLX com UPLOAD DIRETO DE FOTOS */}
      <Modal
        open={modalAberto}
        title={editandoId ? 'Editar Anúncio OLX' : 'Publicar Novo Anúncio na OLX'}
        subtitle="Upload direto de fotos do seu dispositivo e sincronização facilitada com a OLX"
        onClose={() => setModalAberto(false)}
        width={720}
      >
        <form onSubmit={salvarAnuncio} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Título do Anúncio */}
          <div>
            <label className="entity-stat-label">Título do Anúncio (Ex: Jogo de Pneus 205/55 R16 Michelin)</label>
            <input
              className="input-field"
              style={{ marginTop: 4 }}
              placeholder="Digite um título atrativo para a OLX…"
              value={form.titulo}
              onChange={(e) => setForm({ ...form, titulo: e.target.value })}
              required
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label className="entity-stat-label">Preço (R$)</label>
              <input
                className="input-field"
                type="number"
                step="0.01"
                style={{ marginTop: 4 }}
                placeholder="Ex: 350.00"
                value={form.preco}
                onChange={(e) => setForm({ ...form, preco: e.target.value })}
                required
              />
            </div>

            <div>
              <label className="entity-stat-label">Loja Responsável</label>
              <select
                className="input-field"
                style={{ marginTop: 4 }}
                value={form.lojaId}
                onChange={(e) => setForm({ ...form, lojaId: e.target.value })}
              >
                <option value="">Selecione a Loja</option>
                {lojas.map((l) => (
                  <option key={l.id} value={l.id}>🏪 {l.store_name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* 🌟 NOVO COMPONENTE: UPLOAD DIRETO DE FOTOS COM DRAG & DROP E PREVIEW 🌟 */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <label className="entity-stat-label" style={{ fontWeight: 700, color: '#f8fafc' }}>
                📸 Fotos do Anúncio ({fotosArray.length} adicionada{fotosArray.length === 1 ? '' : 's'})
              </label>
              <button
                type="button"
                onClick={() => setMostrarLinkInput(!mostrarLinkInput)}
                style={{ background: 'none', border: 'none', color: '#93c5fd', fontSize: '0.76rem', cursor: 'pointer', textDecoration: 'underline' }}
              >
                {mostrarLinkInput ? 'Ocultar inserção por link' : '+ Ou colar URL externa'}
              </button>
            </div>

            {/* Input Oculto de Arquivo */}
            <input
              type="file"
              ref={fileInputRef}
              multiple
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handleFileInputChange}
            />

            {/* Dropzone de Upload Direto */}
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: arrastando ? '2px dashed #f97316' : '2px dashed rgba(255, 255, 255, 0.18)',
                background: arrastando ? 'rgba(249,115,22,0.1)' : 'rgba(20, 31, 54, 0.6)',
                borderRadius: 14,
                padding: '22px 16px',
                textAlign: 'center',
                cursor: 'pointer',
                transition: 'all 0.18s ease',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(249,115,22,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f97316' }}>
                {enviandoFotos ? <Clock size={24} className="spin" /> : <UploadCloud size={24} />}
              </div>
              <div>
                <strong style={{ fontSize: '0.92rem', color: '#FFFFFF', display: 'block' }}>
                  {enviandoFotos ? 'Enviando fotos para o servidor…' : 'Clique ou arraste as fotos do anúncio aqui'}
                </strong>
                <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
                  Selecione quantas fotos quiser (PNG, JPG, WEBP até 15MB). Sem precisar colar links!
                </span>
              </div>
            </div>

            {/* Opção secundária: Adicionar via link direto */}
            {mostrarLinkInput && (
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <input
                  className="input-field"
                  placeholder="https://exemplo.com/foto.jpg"
                  value={linkManual}
                  onChange={(e) => setLinkManual(e.target.value)}
                />
                <button type="button" className="btn btn-secondary" onClick={adicionarLinkManual}>
                  Adicionar Link
                </button>
              </div>
            )}

            {/* Galeria de Thumbnails com Remoção Instantânea */}
            {fotosArray.length > 0 && (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))',
                  gap: 10,
                  marginTop: 12,
                }}
              >
                {fotosArray.map((url, idx) => (
                  <div
                    key={idx}
                    style={{
                      position: 'relative',
                      height: 100,
                      borderRadius: 10,
                      overflow: 'hidden',
                      border: idx === 0 ? '2px solid #f97316' : '1px solid rgba(255, 255, 255, 0.12)',
                      background: '#0d1527',
                    }}
                  >
                    <img
                      src={midiaSrc(url)}
                      alt={`Foto ${idx + 1}`}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                    <span
                      style={{
                        position: 'absolute',
                        bottom: 4,
                        left: 4,
                        background: idx === 0 ? '#f97316' : 'rgba(0,0,0,0.75)',
                        color: '#FFFFFF',
                        fontSize: '0.62rem',
                        fontWeight: 700,
                        padding: '1px 5px',
                        borderRadius: 4,
                      }}
                    >
                      {idx === 0 ? '★ Capa' : `#${idx + 1}`}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        removerFoto(idx);
                      }}
                      style={{
                        position: 'absolute',
                        top: 4,
                        right: 4,
                        width: 24,
                        height: 24,
                        borderRadius: '50%',
                        background: 'rgba(239, 68, 68, 0.9)',
                        color: '#FFFFFF',
                        border: 'none',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 2px 6px rgba(0,0,0,0.5)',
                      }}
                      title="Remover esta foto"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div>
              <label className="entity-stat-label">Categoria</label>
              <select
                className="input-field"
                style={{ marginTop: 4 }}
                value={form.categoria}
                onChange={(e) => setForm({ ...form, categoria: e.target.value })}
              >
                <option value="pneus_rodas">Pneus e Rodas</option>
                <option value="pecas_autos">Peças de Carro</option>
                <option value="servicos">Serviços Automotivos</option>
                <option value="outro">Outros</option>
              </select>
            </div>

            <div>
              <label className="entity-stat-label">Estado do Item</label>
              <select
                className="input-field"
                style={{ marginTop: 4 }}
                value={form.tipoItem}
                onChange={(e) => setForm({ ...form, tipoItem: e.target.value })}
              >
                <option value="novo">Novo (Com Garantia)</option>
                <option value="usado">Seminovo / Usado</option>
              </select>
            </div>

            <div>
              <label className="entity-stat-label">CEP Local</label>
              <input
                className="input-field"
                style={{ marginTop: 4 }}
                placeholder="70000-000"
                value={form.cep}
                onChange={(e) => setForm({ ...form, cep: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label className="entity-stat-label">Descrição Completa</label>
            <textarea
              className="input-field"
              rows={4}
              style={{ marginTop: 4, resize: 'vertical' }}
              placeholder="Detalhes sobre medidas, marcas, formas de pagamento, garantia e localização da loja…"
              value={form.descricao}
              onChange={(e) => setForm({ ...form, descricao: e.target.value })}
            />
          </div>

          <div>
            <label className="entity-stat-label">Link do Anúncio na OLX (Opcional se já estiver publicado)</label>
            <input
              className="input-field"
              style={{ marginTop: 4 }}
              placeholder="https://df.olx.com.br/autos-e-pecas/..."
              value={form.linkOlx}
              onChange={(e) => setForm({ ...form, linkOlx: e.target.value })}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
            <button type="button" className="btn btn-outline" onClick={() => setModalAberto(false)}>
              Cancelar
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={salvando || enviandoFotos}
              style={{ background: 'linear-gradient(135deg, #f97316, #ea580c)', borderColor: '#ea580c', borderRadius: 10 }}
            >
              {salvando ? 'Salvando…' : editandoId ? 'Atualizar Anúncio' : 'Publicar Anúncio'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Lightbox / Foto Expandida */}
      {fotoLightbox && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(0, 0, 0, 0.88)',
            backdropFilter: 'blur(10px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
          onClick={() => setFotoLightbox(null)}
        >
          <div
            style={{
              position: 'relative',
              maxWidth: '90vw',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setFotoLightbox(null)}
              style={{
                position: 'absolute',
                top: -14,
                right: -14,
                width: 36,
                height: 36,
                borderRadius: '50%',
                background: '#E8252C',
                color: '#fff',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
              }}
            >
              <X size={20} />
            </button>
            <img
              src={fotoLightbox.url}
              alt=""
              style={{ maxWidth: '85vw', maxHeight: '78vh', objectFit: 'contain', borderRadius: 12 }}
            />
            {fotoLightbox.titulo && (
              <div style={{ marginTop: 12, color: '#ffffff', fontSize: '0.95rem', fontWeight: 700, textAlign: 'center' }}>
                {fotoLightbox.titulo}
              </div>
            )}
            {fotoLightbox.fotos && fotoLightbox.fotos.length > 1 && (
              <div style={{ display: 'flex', gap: 8, marginTop: 12, overflowX: 'auto', maxWidth: '85vw', padding: '4px 0' }}>
                {fotoLightbox.fotos.map((f, i) => (
                  <img
                    key={i}
                    src={midiaSrc(f)}
                    alt=""
                    onClick={() => setFotoLightbox({ ...fotoLightbox, url: midiaSrc(f) })}
                    style={{
                      width: 56,
                      height: 56,
                      borderRadius: 8,
                      objectFit: 'cover',
                      cursor: 'pointer',
                      border: midiaSrc(f) === fotoLightbox.url ? '2px solid #f97316' : '1px solid rgba(255,255,255,0.2)',
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
