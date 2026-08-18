import { useState, useEffect } from 'react';
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
  Store,
  DollarSign,
  Eye,
  MessageSquare,
  Sparkles,
  Zap,
  Image as ImageIcon,
} from 'lucide-react';
import { api } from '../atendimento/api';
import { Modal } from '../components/Modal';

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
    fotos: '',
    cep: '72000-000',
    telefone: '',
    lojaId: '',
    linkOlx: '',
  });
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
      setResumo(resResumo || { total: 0, ativos: 0, removidos: 0, expirados: 0 });
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
      descricao: 'Pneus novos e seminovos com garantia de 50.000 KM. Montagem, balanceamento e alinhamento no local. Venha conferir!',
      preco: '',
      categoria: 'pneus_rodas',
      tipoItem: 'novo',
      fotos: '',
      cep: '71000-000',
      telefone: '',
      lojaId: lojas[0]?.id || '',
      linkOlx: '',
    });
    setModalAberto(true);
  };

  const abrirEditar = (a) => {
    setEditandoId(a.id);
    let fotosFormatadas = '';
    try {
      const parsed = JSON.parse(a.fotos || '[]');
      fotosFormatadas = parsed.join('\n');
    } catch {
      fotosFormatadas = a.fotos || '';
    }

    setForm({
      titulo: a.titulo || '',
      descricao: a.descricao || '',
      preco: a.preco || '',
      categoria: a.categoria || 'pneus_rodas',
      tipoItem: a.tipoItem || 'novo',
      fotos: fotosFormatadas,
      cep: a.cep || '',
      telefone: a.telefone || '',
      lojaId: a.lojaId || '',
      linkOlx: a.linkOlx || '',
    });
    setModalAberto(true);
  };

  const salvarAnuncio = async (e) => {
    e.preventDefault();
    if (!form.titulo || !form.preco) {
      alert('Por favor preencha Título e Preço.');
      return;
    }
    setSalvando(true);

    const fotosArr = form.fotos
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);

    const payload = {
      ...form,
      preco: Number(form.preco),
      fotos: fotosArr,
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

  const anunciosRemovidos = anuncios.filter((a) => a.status === 'removido' || a.status === 'expirado');

  return (
    <div className="fade-in" style={{ padding: '0 0.5rem 2rem' }}>
      {/* Header Principal */}
      <div className="page-header" style={{ marginBottom: '1.2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: '1.55rem', margin: 0, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10 }}>
            <Megaphone size={26} style={{ color: '#f97316' }} /> Gerenciador de Anúncios OLX
          </h1>
          <p className="muted-hint" style={{ margin: 0, fontSize: '0.85rem' }}>
            Publique, monitore em tempo real e controle quais anúncios estão ativos na OLX
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            className="icon-btn"
            style={{ width: 38, height: 38 }}
            onClick={carregarDados}
            title="Atualizar lista e status"
          >
            <RefreshCw size={16} className={carregando ? 'spin' : ''} />
          </button>

          <button
            className="btn btn-primary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '0.55rem 1.1rem', background: 'linear-gradient(135deg, #f97316, #ea580c)', borderColor: '#ea580c' }}
            onClick={abrirNovo}
          >
            <Plus size={18} /> Novo Anúncio OLX
          </button>
        </div>
      </div>

      {erro && (
        <div className="owner-banner mb-3" style={{ background: 'rgba(232,37,44,0.08)', border: '1px solid rgba(232,37,44,0.25)', padding: '0.75rem 1rem' }}>
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
        <div className="card glass-panel" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14, borderRadius: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: 10, background: 'rgba(249,115,22,0.15)', color: '#f97316', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Megaphone size={22} />
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>Total de Anúncios</span>
            <strong style={{ fontSize: '1.35rem', color: 'var(--text-primary)' }}>{resumo.total}</strong>
          </div>
        </div>

        <div className="card glass-panel" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14, borderRadius: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: 10, background: 'rgba(16,185,129,0.15)', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CheckCircle2 size={22} />
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>Ativos na OLX</span>
            <strong style={{ fontSize: '1.35rem', color: '#10b981' }}>{resumo.ativos}</strong>
          </div>
        </div>

        <div className="card glass-panel" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14, borderRadius: 12, border: resumo.removidos > 0 ? '1px solid rgba(239,68,68,0.4)' : undefined }}>
          <div style={{ width: 44, height: 44, borderRadius: 10, background: 'rgba(239,68,68,0.15)', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <AlertTriangle size={22} />
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>Removidos / Sumiram</span>
            <strong style={{ fontSize: '1.35rem', color: resumo.removidos > 0 ? '#ef4444' : 'var(--text-primary)' }}>{resumo.removidos}</strong>
          </div>
        </div>

        <div className="card glass-panel" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14, borderRadius: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: 10, background: 'rgba(59,130,246,0.15)', color: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <MessageSquare size={22} />
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>Chats Iniciados</span>
            <strong style={{ fontSize: '1.35rem', color: '#3b82f6' }}>{resumo.conversas}</strong>
          </div>
        </div>
      </div>

      {/* Banner de Alerta Visual para Anúncios que Sumiram */}
      {anunciosRemovidos.length > 0 && (
        <div
          className="card glass-panel"
          style={{
            marginBottom: '1.4rem',
            padding: '16px 20px',
            borderRadius: 14,
            background: 'linear-gradient(135deg, rgba(239,68,68,0.15), rgba(15,23,42,0.9))',
            border: '1px solid rgba(239,68,68,0.35)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <AlertTriangle size={20} style={{ color: '#ef4444' }} />
              <strong style={{ fontSize: '1rem', color: '#f87171' }}>
                Atenção: {anunciosRemovidos.length} anúncio(s) sumiram ou foram desativados na OLX!
              </strong>
            </div>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>O monitor watchdog detectou a ausência desses links</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {anunciosRemovidos.map((a) => (
              <div
                key={a.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: 'rgba(0,0,0,0.3)',
                  padding: '8px 14px',
                  borderRadius: 8,
                  fontSize: '0.85rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ color: '#ef4444' }}>●</span>
                  <strong style={{ color: 'var(--text-primary)' }}>{a.titulo}</strong>
                  <span style={{ color: 'var(--text-muted)' }}>({a.lojaNome}) — R$ {a.preco.toFixed(2)}</span>
                  {a.motivoRemocao && <span style={{ fontSize: '0.75rem', color: '#fca5a5' }}>Motivo: {a.motivoRemocao}</span>}
                </div>

                <button
                  className="btn btn-primary"
                  style={{ padding: '4px 12px', fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: 6, background: '#10b981', borderColor: '#059669' }}
                  onClick={() => republicar(a.id)}
                >
                  <Zap size={14} /> Republicar Agora
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Barra de Filtros e Busca */}
      <div
        className="card glass-panel"
        style={{
          padding: '12px 18px',
          borderRadius: 12,
          marginBottom: '1.2rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {lojas.length > 0 && (
            <select
              className="input-field"
              style={{ width: 'auto', minWidth: 170, fontSize: '0.85rem', fontWeight: 600 }}
              value={lojaFiltro}
              onChange={(e) => setLojaFiltro(e.target.value)}
            >
              <option value="__todas__">🏪 Todas as Lojas</option>
              {lojas.map((l) => (
                <option key={l.id} value={l.id}>🏪 {l.store_name}</option>
              ))}
            </select>
          )}

          <div style={{ display: 'flex', background: 'var(--panel-bg-2)', borderRadius: 8, padding: 3, border: '1px solid var(--panel-border)' }}>
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
                  padding: '4px 12px',
                  borderRadius: 6,
                  border: 'none',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: statusFiltro === st.id ? 'var(--accent-color)' : 'transparent',
                  color: statusFiltro === st.id ? '#fff' : 'var(--text-muted)',
                  transition: 'all 0.15s ease',
                }}
              >
                {st.label}
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={handleBusca} style={{ position: 'relative', width: 260 }}>
          <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            className="input-field"
            style={{ paddingLeft: 34, borderRadius: 8, fontSize: '0.85rem' }}
            placeholder="Buscar por título ou código…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </form>
      </div>

      {/* Lista de Anúncios */}
      <div className="card glass-panel" style={{ padding: 0, borderRadius: 14, overflow: 'hidden' }}>
        {carregando ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
            <Clock size={32} className="spin" style={{ margin: '0 auto 10px', opacity: 0.4 }} />
            <p style={{ margin: 0 }}>Carregando anúncios da OLX…</p>
          </div>
        ) : anuncios.length === 0 ? (
          <div style={{ padding: 50, textAlign: 'center', color: 'var(--text-muted)' }}>
            <Megaphone size={40} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
            <h3 style={{ fontSize: '1.1rem', color: 'var(--text-primary)', margin: '0 0 6px 0' }}>Nenhum anúncio encontrado</h3>
            <p style={{ fontSize: '0.85rem', margin: '0 0 16px 0' }}>Crie seu primeiro anúncio para publicar e gerenciar diretamente pela plataforma.</p>
            <button className="btn btn-primary" onClick={abrirNovo} style={{ background: '#f97316', borderColor: '#ea580c' }}>
              <Plus size={16} /> Publicar Anúncio Agora
            </button>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: 70 }}>Foto</th>
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
                  const fotoPrincipal = a.fotosList?.[0] || null;
                  const dataCheck = a.ultimaChecagem ? new Date(a.ultimaChecagem) : null;

                  return (
                    <tr key={a.id}>
                      <td>
                        {fotoPrincipal ? (
                          <img
                            src={fotoPrincipal}
                            alt=""
                            style={{ width: 50, height: 50, borderRadius: 8, objectFit: 'cover', border: '1px solid rgba(255,255,255,0.1)' }}
                          />
                        ) : (
                          <div style={{ width: 50, height: 50, borderRadius: 8, background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                            <ImageIcon size={20} />
                          </div>
                        )}
                      </td>

                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <strong style={{ fontSize: '0.92rem', color: 'var(--text-primary)' }}>{a.titulo}</strong>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>ID: {a.olxAdId || a.id.slice(0, 8)} · Categoria: {a.categoria}</span>
                          {a.motivoRemocao && (
                            <span style={{ fontSize: '0.72rem', color: '#ef4444', fontWeight: 600, marginTop: 2 }}>
                              ⚠️ {a.motivoRemocao}
                            </span>
                          )}
                        </div>
                      </td>

                      <td>
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                          🏪 {a.lojaNome}
                        </span>
                      </td>

                      <td style={{ textAlign: 'right' }}>
                        <strong style={{ fontSize: '0.95rem', color: '#10b981' }}>
                          R$ {a.preco.toFixed(2)}
                        </strong>
                      </td>

                      <td style={{ textAlign: 'center' }}>
                        {a.status === 'ativo' ? (
                          <span className="badge" style={{ background: 'rgba(16,185,129,0.15)', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)', padding: '3px 10px', borderRadius: 20, fontSize: '0.75rem', fontWeight: 700 }}>
                            ● ATIVO NA OLX
                          </span>
                        ) : a.status === 'removido' ? (
                          <span className="badge" style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)', padding: '3px 10px', borderRadius: 20, fontSize: '0.75rem', fontWeight: 700 }}>
                            ● REMOVIDO / CAIU
                          </span>
                        ) : (
                          <span className="badge" style={{ background: 'rgba(255,255,255,0.08)', color: 'var(--text-muted)', border: '1px solid rgba(255,255,255,0.15)', padding: '3px 10px', borderRadius: 20, fontSize: '0.75rem', fontWeight: 700 }}>
                            ● {a.status.toUpperCase()}
                          </span>
                        )}
                      </td>

                      <td style={{ textAlign: 'center', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        {dataCheck ? dataCheck.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—'}
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
                              style={{ padding: '4px 10px', fontSize: '0.75rem', background: '#10b981', borderColor: '#059669' }}
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

      {/* Modal de Criação / Edição de Anúncio OLX */}
      <Modal
        open={modalAberto}
        title={editandoId ? 'Editar Anúncio OLX' : 'Publicar Novo Anúncio na OLX'}
        subtitle="Preencha as informações para sincronizar diretamente com a plataforma"
        onClose={() => setModalAberto(false)}
        width={680}
      >
        <form onSubmit={salvarAnuncio} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
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
            <label className="entity-stat-label">Fotos do Anúncio (Cole uma URL por linha)</label>
            <textarea
              className="input-field"
              rows={3}
              style={{ marginTop: 4, resize: 'vertical' }}
              placeholder="https://meusite.com/foto1.jpg&#10;https://meusite.com/foto2.jpg"
              value={form.fotos}
              onChange={(e) => setForm({ ...form, fotos: e.target.value })}
            />
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
              disabled={salvando}
              style={{ background: '#f97316', borderColor: '#ea580c' }}
            >
              {salvando ? 'Salvando…' : editandoId ? 'Atualizar Anúncio' : 'Publicar Anúncio'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
