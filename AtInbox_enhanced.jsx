import { useState, useEffect, useLayoutEffect, useRef, Fragment, memo } from 'react';
import { Send, RefreshCw, Search, MessageSquare, AlertTriangle, Calendar, X, Plus, ArrowLeft, BarChart3, CheckCheck, Clock, Image as ImageIcon } from 'lucide-react';
import { api, soNumero } from '../atendimento/api';
import { API_BASE } from '../apiBase';
import { Modal } from '../components/Modal';

// Parser seguro de datas que NUNCA retorna "Invalid Date"
const parseDate = (t) => {
  if (!t) return null;
  const d = new Date(t);
  return isNaN(d.getTime()) ? null : d;
};

// "2026-07-25" -> "25/07 (sex)"
const rotuloDiaMetrica = (s) => {
  const p = String(s || '').split('-');
  if (p.length !== 3) return String(s || '');
  const d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  if (isNaN(d.getTime())) return String(s || '');
  const dia = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'][d.getDay()];
  return `${p[2]}/${p[1]} (${dia})`;
};

const hora = (t) => {
  const d = parseDate(t);
  return d ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
};

const midiaSrc = (u) => (u && u.startsWith('/') ? API_BASE + u : u);

// Cores de avatar dinâmicas baseadas no nome
const AVATAR_COLORS = [
  'linear-gradient(135deg, #3b82f6, #1d4ed8)',
  'linear-gradient(135deg, #10b981, #047857)',
  'linear-gradient(135deg, #f59e0b, #b45309)',
  'linear-gradient(135deg, #8b5cf6, #6d28d9)',
  'linear-gradient(135deg, #ec4899, #be185d)',
  'linear-gradient(135deg, #06b6d4, #0e7490)',
];

const getAvatarBg = (name) => {
  if (!name) return AVATAR_COLORS[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
};

const getInitials = (name) => {
  if (!name) return 'C';
  const clean = name.replace(/[^a-zA-Z0-9À-ÿ\s]/g, '').trim();
  const parts = clean.split(/\s+/);
  if (parts.length === 0 || !parts[0]) return 'C';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
};

// Cache local em memória de fotos de perfil
const photoCache = new Map();

// Componente inteligente de avatar: busca a foto real do WhatsApp via Baileys com fallback para iniciais coloridas
const ContactAvatar = memo(function ContactAvatar({ nome, jid, usuarioId, fotoUrl, size = 42, onClick }) {
  const cacheKey = `${usuarioId}:${jid}`;
  const [imgUrl, setImgUrl] = useState(() => fotoUrl || photoCache.get(cacheKey) || null);
  const [erroImg, setErroImg] = useState(false);

  useEffect(() => {
    if (fotoUrl) {
      photoCache.set(cacheKey, fotoUrl);
      setImgUrl(fotoUrl);
      return;
    }
    if (!jid || !usuarioId) return;
    if (photoCache.has(cacheKey)) {
      const u = photoCache.get(cacheKey);
      if (u !== imgUrl) setImgUrl(u);
      return;
    }
    let cancel = false;
    api(`/api/inbox/foto-perfil?usuarioId=${encodeURIComponent(usuarioId)}&jid=${encodeURIComponent(jid)}`)
      .then((res) => {
        if (!cancel && res && res.fotoUrl) {
          photoCache.set(cacheKey, res.fotoUrl);
          setImgUrl(res.fotoUrl);
        } else if (!cancel) {
          photoCache.set(cacheKey, null);
        }
      })
      .catch(() => {});
    return () => { cancel = true; };
  }, [jid, usuarioId, cacheKey, fotoUrl, imgUrl]);

  const initials = getInitials(nome);
  const avatarBg = getAvatarBg(nome);

  const handleClick = (e) => {
    if (onClick) {
      e.stopPropagation();
      onClick({
        nome,
        jid,
        imgUrl: !erroImg ? imgUrl : null,
        initials,
        avatarBg
      });
    }
  };

  if (imgUrl && !erroImg) {
    return (
      <img
        src={imgUrl}
        alt={nome || 'Contato'}
        onClick={handleClick}
        onError={() => setErroImg(true)}
        title={onClick ? 'Clique para ampliar foto de perfil' : (nome || 'Contato')}
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          objectFit: 'cover',
          flexShrink: 0,
          boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
          border: '1px solid rgba(255,255,255,0.1)',
          cursor: onClick ? 'pointer' : 'default',
          transition: 'transform 0.15s ease',
        }}
        onMouseEnter={(e) => onClick && (e.currentTarget.style.transform = 'scale(1.08)')}
        onMouseLeave={(e) => onClick && (e.currentTarget.style.transform = 'scale(1)')}
      />
    );
  }

  return (
    <div
      onClick={handleClick}
      title={onClick ? 'Clique para ver o contato' : (nome || 'Contato')}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: avatarBg,
        color: '#ffffff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 700,
        fontSize: size > 40 ? '0.88rem' : '0.8rem',
        flexShrink: 0,
        boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'transform 0.15s ease',
      }}
      onMouseEnter={(e) => onClick && (e.currentTarget.style.transform = 'scale(1.08)')}
      onMouseLeave={(e) => onClick && (e.currentTarget.style.transform = 'scale(1)')}
    >
      {initials}
    </div>
  );
});

// Datas: separador de dia na conversa (Hoje/Ontem/dd/mm/aaaa) e data curta na prévia.
const mesmoDia = (a, b) => a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

const rotuloDia = (t) => {
  const d = parseDate(t);
  if (!d) return '';
  const hoje = new Date();
  const ontem = new Date();
  ontem.setDate(hoje.getDate() - 1);
  if (mesmoDia(d, hoje)) return 'Hoje';
  if (mesmoDia(d, ontem)) return 'Ontem';
  return d.toLocaleDateString('pt-BR');
};

const dataPrevia = (t) => {
  const d = parseDate(t);
  if (!d) return '';
  const hoje = new Date();
  const ontem = new Date();
  ontem.setDate(hoje.getDate() - 1);
  if (mesmoDia(d, hoje)) return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (mesmoDia(d, ontem)) return 'Ontem';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
};

// Renderiza o conteúdo da mensagem: foto, vídeo, áudio (tocável), documento ou texto.
function Conteudo({ m, onAbrirMidia }) {
  if (m.midiaUrl) {
    const src = midiaSrc(m.midiaUrl);
    const cap = m.texto ? <div style={{ marginTop: 6, whiteSpace: 'pre-wrap', fontSize: '0.88rem' }}>{m.texto}</div> : null;
    if (m.tipo === 'imagem' || m.tipo === 'figurinha') {
      return (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <img
            src={src}
            alt=""
            style={{ width: '100%', maxWidth: 280, maxHeight: 300, borderRadius: 8, display: 'block', cursor: 'pointer', objectFit: 'cover', transition: 'transform 0.15s ease' }}
            onClick={(e) => {
              e.stopPropagation();
              if (onAbrirMidia) onAbrirMidia({ url: src, tipo: m.tipo, texto: m.texto });
            }}
            title="Clique para abrir foto em tela cheia"
            onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.92')}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
          />
          {cap}
        </div>
      );
    }
    if (m.tipo === 'video') {
      return (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <video
            src={src}
            controls
            style={{ width: '100%', maxWidth: 280, borderRadius: 8, display: 'block', cursor: 'pointer' }}
          />
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (onAbrirMidia) onAbrirMidia({ url: src, tipo: 'video', texto: m.texto });
            }}
            style={{
              marginTop: 4,
              background: 'rgba(255,255,255,0.08)',
              border: 'none',
              borderRadius: 6,
              padding: '3px 8px',
              fontSize: '0.74rem',
              color: '#93c5fd',
              cursor: 'pointer',
              alignSelf: 'flex-start',
            }}
          >
            🔍 Expandir Vídeo
          </button>
          {cap}
        </div>
      );
    }
    if (m.tipo === 'audio') {
      return (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <audio src={src} controls style={{ width: '100%', maxWidth: 240, display: 'block' }} />
          {cap}
        </div>
      );
    }
    return (
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (onAbrirMidia) onAbrirMidia({ url: src, tipo: m.tipo || 'documento', texto: m.texto });
          }}
          style={{
            background: 'rgba(255,255,255,0.12)',
            border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: 8,
            padding: '6px 12px',
            color: 'inherit',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: '0.85rem',
            fontWeight: 600,
          }}
        >
          📎 Abrir {m.tipo || 'Arquivo'}
        </button>
        {cap}
      </div>
    );
  }
  if (m.tipo === 'contato') return <span style={{ whiteSpace: 'pre-wrap' }}>👤 {m.texto || 'Contato compartilhado'}</span>;
  if (m.tipo === 'localizacao') {
    const coords = (m.texto || '').split(' — ')[0].trim();
    const nome = (m.texto || '').split(' — ')[1];
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (onAbrirMidia) onAbrirMidia({ url: `https://maps.google.com/?q=${encodeURIComponent(coords)}`, tipo: 'mapa', texto: m.texto });
        }}
        style={{
          background: 'none',
          border: 'none',
          color: '#93c5fd',
          textDecoration: 'underline',
          cursor: 'pointer',
          padding: 0,
          font: 'inherit',
          textAlign: 'left',
        }}
      >
        📍 Localização{nome ? `: ${nome}` : ''}
      </button>
    );
  }
  if (m.tipo === 'enquete') return <span style={{ fontStyle: 'italic' }}>📊 Enquete: {m.texto || '(sem título)'}</span>;
  if (m.tipo && m.tipo !== 'texto') return <span style={{ fontStyle: 'italic', opacity: 0.85 }}>📎 {m.tipo}{m.texto ? ': ' + m.texto : ''}</span>;
  return <span style={{ whiteSpace: 'pre-wrap' }}>{m.texto || ''}</span>;
}

export const AtInbox = () => {
  const [atendentes, setAtendentes] = useState([]);
  const [usuarioId, setUsuarioId] = useState('');
  const [lojaSel, setLojaSel] = useState('');
  const [filtroAtendente, setFiltroAtendente] = useState('');
  const [opcoesAtendentes, setOpcoesAtendentes] = useState([]);
  const [conversas, setConversas] = useState([]);
  const [ativa, setAtiva] = useState(null);
  const [mensagens, setMensagens] = useState([]);
  const [carregandoMsgs, setCarregandoMsgs] = useState(false);
  const [midiaPopup, setMidiaPopup] = useState(null);
  const [perfilPopup, setPerfilPopup] = useState(null);
  const [busca, setBusca] = useState('');
  const [texto, setTexto] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [agenda, setAgenda] = useState([]);
  const [showAgenda, setShowAgenda] = useState(false);
  const [formAg, setFormAg] = useState({ mensagem: '', enviarEm: '', cancelar: true });
  const [showMetricas, setShowMetricas] = useState(false);
  const [metricas, setMetricas] = useState([]);
  const [carregandoMetricas, setCarregandoMetricas] = useState(false);
  const [salvandoAg, setSalvandoAg] = useState(false);
  const fimRef = useRef(null);
  const listaRef = useRef(null);
  const chatAnteriorRef = useRef(null);

  useEffect(() => {
    api('/api/usuarios').then((us) => {
      setAtendentes(us);
      let escolhido = null;
      try {
        const salvo = localStorage.getItem('gp_inbox_usuario');
        if (salvo) { escolhido = us.find((u) => u.id === salvo); localStorage.removeItem('gp_inbox_usuario'); }
      } catch { /* noop */ }
      const soAtendentes = us.filter((u) => {
        if (u.role === 'gerente' || u.role === 'admin' || u.role === 'master') return false;
        let mods = [];
        try { mods = JSON.parse(u.modulosPermitidos || '[]'); } catch { mods = []; }
        return !(Array.isArray(mods) && mods.length > 0 && !mods.some((m) => String(m).startsWith('at-')));
      });
      const inicial = escolhido || soAtendentes.find((u) => u.whatsappConectado) || soAtendentes[0];
      if (inicial) { setUsuarioId(inicial.id); setLojaSel(inicial.lojaId || '__sem_loja__'); }
    }).catch((e) => setErro(e.message));
  }, []);

  const lojaDe = (u) => (u?.lojaId || '__sem_loja__');

  const ehCaixaDeAtendimento = (u) => {
    if (!u) return false;
    // Administradores globais e sistema não entram como caixas de atendimento
    if (u.role === 'admin' || u.role === 'master') return false;
    let mods = [];
    try { mods = JSON.parse(u.modulosPermitidos || '[]'); } catch { mods = []; }
    if (Array.isArray(mods) && mods.length > 0 && !mods.some((m) => String(m).startsWith('at-') || m === 'at-inbox')) return false;
    return true;
  };
  const atendentesInbox = atendentes.filter(ehCaixaDeAtendimento);

  const lojas = (() => {
    const m = new Map();
    atendentesInbox.forEach((u) => {
      const id = lojaDe(u);
      if (!m.has(id)) m.set(id, { id, nome: u.lojaNome || (u.lojaId ? 'Loja sem nome' : 'Sem loja definida'), donos: new Set() });
      if (u.whatsappConectado) m.get(id).donos.add(u.whatsappDonoId || u.id);
    });
    return [...m.values()]
      .map((l) => ({ id: l.id, nome: l.nome, numeros: l.donos.size }))
      .sort((a, b) => a.nome.localeCompare(b.nome));
  })();
  const atendentesDaLoja = lojaSel ? atendentesInbox.filter((u) => lojaDe(u) === lojaSel) : atendentesInbox;

  const trocarLoja = (novaLojaId) => {
    setLojaSel(novaLojaId);
    const daLoja = atendentesInbox.filter((u) => lojaDe(u) === novaLojaId);
    const alvo = daLoja.find((u) => u.whatsappConectado) || daLoja[0];
    if (alvo) setUsuarioId(alvo.id);
  };

  const donoEfetivo = (u) => (u && (u.whatsappDonoId || u.id)) || '';
  const selecionado = atendentes.find((u) => u.id === usuarioId);
  const equipe = selecionado ? atendentes.filter((u) => donoEfetivo(u) === donoEfetivo(selecionado)) : [];
  const compartilhada = equipe.length > 1;
  const outroDetectado = opcoesAtendentes.some((o) => o.id !== usuarioId);
  const mostrarFiltro = compartilhada || outroDetectado || filtroAtendente !== '';
  const opcoesFiltro = (() => {
    const m = new Map();
    if (compartilhada) equipe.forEach((u) => m.set(u.id, u.nome));
    opcoesAtendentes.forEach((o) => m.set(o.id, o.nome));
    return [...m.entries()].map(([id, nome]) => ({ id, nome }));
  })();

  const carregarConversas = async (uid, filtro) => {
    if (!uid) return;
    const extra = filtro ? `&atendenteId=${encodeURIComponent(filtro)}` : '';
    try {
      const lista = await api(`/api/inbox/conversas?usuarioId=${uid}${extra}`);
      setConversas(Array.isArray(lista) ? lista : []);
      setErro('');
      if (!filtro && Array.isArray(lista)) {
        const vistos = new Map();
        lista.forEach((c) => { if (c.atendenteId) vistos.set(c.atendenteId, c.atendenteNome || 'Atendente'); });
        setOpcoesAtendentes([...vistos.entries()].map(([id, nome]) => ({ id, nome })));
      }
    } catch (e) { setErro(e.message); }
  };
  const carregarAgenda = async (uid) => {
    if (!uid) return;
    try { setAgenda(await api(`/api/agendamentos?criadoPorId=${uid}`)); } catch { /* noop */ }
  };

  useEffect(() => {
    carregarAgenda(usuarioId); setAtiva(null); setMensagens([]); setOpcoesAtendentes([]);
    setFiltroAtendente('');
  }, [usuarioId]);
  useEffect(() => { carregarConversas(usuarioId, filtroAtendente); }, [usuarioId, filtroAtendente]);

  const numAtiva = ativa ? soNumero(ativa.numeroReal || ativa.chatJid) : '';
  const agendaContato = agenda.filter((a) => soNumero(a.numero) === numAtiva);

  const criarAgendamento = async (e) => {
    e.preventDefault();
    if (!ativa || !formAg.mensagem.trim() || !formAg.enviarEm) return;
    setSalvandoAg(true);
    try {
      await api('/api/agendamentos', { method: 'POST', body: JSON.stringify({
        cliente: ativa.chatNome || numAtiva,
        numero: numAtiva,
        mensagem: formAg.mensagem.trim(),
        enviarEm: new Date(formAg.enviarEm).toISOString(),
        criadoPorId: usuarioId,
        cancelarSeResponder: formAg.cancelar,
      }) });
      setFormAg({ mensagem: '', enviarEm: '', cancelar: true });
      await carregarAgenda(usuarioId);
    } catch (err) { alert(err.message || 'Falha ao agendar.'); }
    setSalvandoAg(false);
  };

  const abrir = async (c) => {
    setAtiva(c);
    setCarregandoMsgs(true);
    try {
      const msgs = await api(`/api/inbox/mensagens?usuarioId=${usuarioId}&jid=${encodeURIComponent(c.chatJid)}`);
      setMensagens(Array.isArray(msgs) ? msgs : []);
    } catch (e) { 
      setErro(e.message); 
    } finally {
      setCarregandoMsgs(false);
    }
  };

  useEffect(() => {
    if (!ativa) return;
    const id = setInterval(async () => {
      try {
        const novas = await api(`/api/inbox/mensagens?usuarioId=${usuarioId}&jid=${encodeURIComponent(ativa.chatJid)}`);
        if (Array.isArray(novas)) {
          setMensagens((atual) => {
            const igual = atual.length === novas.length && atual[atual.length - 1]?.id === novas[novas.length - 1]?.id;
            return igual ? atual : novas;
          });
        }
        carregarConversas(usuarioId, filtroAtendente);
      } catch { /* noop */ }
    }, 5000);
    return () => clearInterval(id);
  }, [ativa, usuarioId, filtroAtendente]);

  useEffect(() => {
    if (!usuarioId) return;
    const id = setInterval(() => { carregarConversas(usuarioId, filtroAtendente); }, 10000);
    return () => clearInterval(id);
  }, [usuarioId, filtroAtendente]);

  useLayoutEffect(() => {
    const trocouDeConversa = chatAnteriorRef.current !== ativa?.chatJid;
    chatAnteriorRef.current = ativa?.chatJid;
    const el = listaRef.current;
    const pertoDoFim = !el || (el.scrollHeight - el.scrollTop - el.clientHeight < 120);
    if (trocouDeConversa || pertoDoFim) {
      fimRef.current?.scrollIntoView({ behavior: trocouDeConversa ? 'auto' : 'smooth' });
    }
  }, [mensagens, ativa]);

  const abrirMetricas = async () => {
    if (!usuarioId) return;
    setShowMetricas(true);
    setCarregandoMetricas(true);
    try { setMetricas(await api(`/api/inbox/metricas-diarias?usuarioId=${usuarioId}&dias=30`)); }
    catch (e) { setMetricas([]); setErro(e.message || 'Erro ao carregar métricas.'); }
    setCarregandoMetricas(false);
  };

  const enviar = async (e) => {
    e.preventDefault();
    const t = texto.trim();
    if (!t || !ativa) return;
    setEnviando(true);
    try {
      await api('/api/inbox/enviar', { method: 'POST', body: JSON.stringify({ usuarioId, jid: ativa.chatJid, texto: t }) });
      setTexto('');
      const msgs = await api(`/api/inbox/mensagens?usuarioId=${usuarioId}&jid=${encodeURIComponent(ativa.chatJid)}`);
      setMensagens(Array.isArray(msgs) ? msgs : []);
    } catch (err) { alert(err.message || 'Falha ao enviar. O WhatsApp está conectado?'); }
    setEnviando(false);
  };

  const filtradas = conversas.filter((c) =>
    `${c.chatNome} ${c.numeroReal}`.toLowerCase().includes(busca.toLowerCase().trim()));

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 100px)', overflow: 'hidden' }}>
      {/* Top Header com controles integrados */}
      <div className="page-header" style={{ marginBottom: '0.6rem', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ fontSize: '1.35rem', margin: 0, fontWeight: 700 }}>Caixa de Entrada</h1>
          <p className="muted-hint" style={{ margin: 0, fontSize: '0.8rem' }}>Atendimento WhatsApp em tempo real</p>
        </div>

        <div className="flex items-center gap-2" style={{ flexWrap: 'wrap' }}>
          {lojas.length > 1 && (
            <select
              className="input-field"
              style={{ width: 'auto', minWidth: 160, padding: '0.35rem 0.7rem', fontSize: '0.82rem', fontWeight: 600 }}
              value={lojaSel}
              onChange={(e) => trocarLoja(e.target.value)}
              title="Escolha a loja"
            >
              {lojas.map((l) => (
                <option key={l.id} value={l.id}>🏪 {l.nome}{l.numeros > 1 ? ` (${l.numeros})` : ''}</option>
              ))}
            </select>
          )}

          <select
            className="input-field"
            style={{ width: 'auto', minWidth: 170, padding: '0.35rem 0.7rem', fontSize: '0.82rem', fontWeight: 600 }}
            value={usuarioId}
            onChange={(e) => setUsuarioId(e.target.value)}
            disabled={atendentesDaLoja.length <= 1}
            title={atendentesDaLoja.length > 1 ? 'Escolha qual número desta loja' : 'Esta loja tem um número só'}
          >
            {atendentesDaLoja.map((u) => (
              <option key={u.id} value={u.id}>
                {u.whatsappConectado ? '🟢' : '⚪'} {u.nome}
              </option>
            ))}
          </select>

          <button
            className="btn btn-outline"
            style={{ padding: '0.35rem 0.75rem', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.82rem' }}
            onClick={abrirMetricas}
            disabled={!usuarioId}
            title="Ver métricas dos últimos 30 dias"
          >
            <BarChart3 size={14} /> Métricas
          </button>

          <button
            className="icon-btn"
            style={{ width: 34, height: 34 }}
            onClick={() => carregarConversas(usuarioId, filtroAtendente)}
            title="Atualizar conversas"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {erro && (
        <div className="owner-banner mb-2" style={{ flexShrink: 0, background: 'rgba(232,37,44,0.08)', border: '1px solid rgba(232,37,44,0.25)', padding: '0.5rem 0.9rem' }}>
          <AlertTriangle size={15} style={{ color: 'var(--danger-color)' }} />
          <span style={{ fontSize: '0.85rem' }}>{erro}</span>
        </div>
      )}

      {/* Caixa de Entrada Principal (Layout Dividido e Travado) */}
      <div
        className={`card glass-panel inbox-shell ${ativa ? 'chat-open' : ''}`}
        style={{
          padding: 0,
          display: 'grid',
          gridTemplateColumns: '360px 1fr',
          flex: 1,
          minHeight: 0,
          height: '100%',
          borderRadius: 14,
          overflow: 'hidden',
          border: '1px solid var(--panel-border)',
        }}
      >
        {/* Painel Esquerdo: Lista de Conversas com Header Sólido */}
        <div className="inbox-list" style={{ borderRight: '1px solid var(--panel-border)', display: 'flex', flexDirection: 'column', background: 'var(--panel-bg)', overflow: 'hidden', height: '100%' }}>
          {/* Barra de Busca e Filtro */}
          <div style={{ flexShrink: 0, padding: '10px 12px', borderBottom: '1px solid var(--panel-border)', background: 'var(--panel-bg-2)', zIndex: 5 }}>
            <div style={{ position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                className="input-field"
                style={{ paddingLeft: 34, borderRadius: 10, fontSize: '0.82rem', background: 'var(--panel-bg)' }}
                placeholder="Buscar cliente ou telefone…"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </div>
            {mostrarFiltro && (
              <select
                className="input-field"
                style={{ marginTop: 6, borderRadius: 8, fontSize: '0.78rem', padding: '0.3rem 0.6rem', background: 'var(--panel-bg)' }}
                value={filtroAtendente}
                onChange={(e) => setFiltroAtendente(e.target.value)}
                title="Filtre pelas conversas de cada atendente deste número"
              >
                <option value="">Todas as conversas do número</option>
                {opcoesFiltro.map((u) => <option key={u.id} value={u.id}>Só {u.nome}</option>)}
                <option value="sem">Sem atendente atribuído</option>
              </select>
            )}
          </div>

          {/* Lista de Conversas com Scroll Limpo */}
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
            {filtradas.length === 0 && (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>
                <MessageSquare size={28} style={{ margin: '0 auto 8px', opacity: 0.4 }} />
                <p style={{ fontSize: '0.85rem', margin: 0 }}>Nenhuma conversa encontrada.</p>
              </div>
            )}
            {filtradas.map((c) => {
              const selecionada = ativa?.chatJid === c.chatJid;
              const semAtendente = mostrarFiltro && !c.atendenteNome;
              const dataMsg = c.timestamp || c.ultimaMsgData || c.atualizadoEm;

              return (
                <button
                  key={c.chatJid}
                  onClick={() => abrir(c)}
                  className={`link-cell inbox-item ${selecionada ? 'inbox-item-active' : ''} ${semAtendente ? 'inbox-item-unassigned' : ''}`}
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    textAlign: 'left',
                    cursor: 'pointer',
                    background: selecionada ? 'rgba(59,130,246,0.14)' : 'transparent',
                  }}
                >
                  {/* Avatar com Foto Real do WhatsApp */}
                  <ContactAvatar
                    nome={c.chatNome || c.numeroReal}
                    jid={c.chatJid}
                    usuarioId={usuarioId}
                    fotoUrl={c.fotoUrl}
                    size={42}
                    onClick={(avData) => setPerfilPopup({ ...avData, numero: c.numeroReal || c.chatJid })}
                  />

                  {/* Informações da conversa */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                      <strong style={{ fontSize: '0.9rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.chatNome || c.numeroReal || 'Cliente'}
                      </strong>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', flexShrink: 0, marginLeft: 6 }}>
                        {dataPrevia(dataMsg)}
                      </span>
                    </div>

                    <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: 0.85 }}>
                      {c.texto || c.ultimaMsg || c.numeroReal || 'Conversa iniciada'}
                    </div>

                    {mostrarFiltro && (
                      <div style={{ marginTop: 4 }}>
                        {c.atendenteNome ? (
                          <span className="inbox-badge-atendente is-atribuido" style={{ fontSize: '0.62rem', padding: '1px 7px' }}>
                            👤 {c.atendenteNome}
                          </span>
                        ) : (
                          <span className="inbox-badge-atendente is-pendente" style={{ fontSize: '0.62rem', padding: '1px 7px' }}>
                            <span className="inbox-dot" /> Sem atendente
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Painel Direito: Janela de Conversa Ativa (GP Navy Dark Premium) */}
        <div className="inbox-thread" style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#0b101e', backgroundImage: 'radial-gradient(rgba(255,255,255,0.04) 1px, transparent 1px)', backgroundSize: '18px 18px', overflow: 'hidden' }}>
          {!ativa ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center', color: '#94a3b8', background: '#0d1424' }}>
              <div style={{ width: 68, height: 68, borderRadius: '50%', background: 'rgba(232,37,44,0.12)', border: '1px solid rgba(232,37,44,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                <MessageSquare size={32} style={{ color: '#E8252C' }} />
              </div>
              <h3 style={{ fontSize: '1.2rem', color: '#f8fafc', margin: '0 0 6px 0', fontWeight: 700 }}>Nenhuma conversa selecionada</h3>
              <p style={{ fontSize: '0.88rem', maxWidth: 340, margin: 0, color: '#94a3b8' }}>Escolha um cliente na lista à esquerda para ler o histórico completo e responder em tempo real.</p>
            </div>
          ) : (
            <>
              {/* Header do Chat */}
              <div
                style={{
                  flexShrink: 0,
                  padding: '12px 18px',
                  borderBottom: '1px solid rgba(255,255,255,0.08)',
                  background: '#10192e',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                  <button className="inbox-back icon-btn" onClick={() => setAtiva(null)} title="Voltar para a lista">
                    <ArrowLeft size={18} />
                  </button>

                  <ContactAvatar
                    nome={ativa.chatNome || ativa.numeroReal}
                    jid={ativa.chatJid}
                    usuarioId={usuarioId}
                    fotoUrl={ativa.fotoUrl}
                    size={42}
                    onClick={(avData) => setPerfilPopup({ ...avData, numero: numAtiva || ativa.chatJid })}
                  />

                  <div style={{ minWidth: 0 }}>
                    <strong style={{ fontSize: '1rem', color: '#f8fafc', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {ativa.chatNome || numAtiva}
                    </strong>
                    <span style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 500 }}>
                      📱 {numAtiva} {ativa.atendenteNome ? `· Atendido por ${ativa.atendenteNome}` : ''}
                    </span>
                  </div>
                </div>

                <button
                  className="btn btn-secondary"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px', fontSize: '0.82rem', background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', color: '#f8fafc' }}
                  onClick={() => setShowAgenda(true)}
                >
                  <Calendar size={14} /> Agendamentos{agendaContato.length ? ` (${agendaContato.length})` : ''}
                </button>
              </div>

              {/* Área de Mensagens (Thread com scroll) */}
              <div
                ref={listaRef}
                style={{
                  flex: 1,
                  minHeight: 0,
                  overflowY: 'auto',
                  padding: '16px 20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                }}
              >
                {carregandoMsgs && (
                  <div style={{ alignSelf: 'center', margin: 'auto', padding: '10px 18px', background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 20, color: '#cbd5e1', fontSize: '0.86rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Clock size={15} /> Carregando mensagens…
                  </div>
                )}

                {!carregandoMsgs && mensagens.length === 0 && (
                  <div style={{ alignSelf: 'center', margin: 'auto', padding: 24, textAlign: 'center', background: '#131d33', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, maxWidth: 320 }}>
                    <MessageSquare size={28} style={{ color: '#E8252C', margin: '0 auto 8px' }} />
                    <p style={{ margin: 0, fontSize: '0.88rem', color: '#94a3b8' }}>Nenhuma mensagem registrada nesta conversa.</p>
                  </div>
                )}

                {mensagens.map((m, i) => {
                  const anterior = mensagens[i - 1];
                  const dataAtual = parseDate(m.timestamp);
                  const dataAnt = anterior ? parseDate(anterior.timestamp) : null;
                  const mudouDia = !dataAnt || !dataAtual || !mesmoDia(dataAnt, dataAtual);

                  return (
                    <Fragment key={m.id}>
                      {mudouDia && (
                        <div
                          style={{
                            alignSelf: 'center',
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            color: '#94a3b8',
                            background: '#131d33',
                            border: '1px solid rgba(255,255,255,0.08)',
                            borderRadius: 20,
                            padding: '4px 14px',
                            margin: '8px 0',
                          }}
                        >
                          {rotuloDia(m.timestamp)}
                        </div>
                      )}

                      <div
                        style={{
                          maxWidth: '75%',
                          alignSelf: m.fromMe ? 'flex-end' : 'flex-start',
                          background: m.fromMe ? 'linear-gradient(135deg, #1d4ed8, #1e3a8a)' : '#1e293b',
                          color: '#ffffff',
                          border: m.fromMe ? '1px solid rgba(59,130,246,0.3)' : '1px solid rgba(255,255,255,0.08)',
                          padding: '10px 14px',
                          borderRadius: m.fromMe ? '14px 14px 2px 14px' : '14px 14px 14px 2px',
                          fontSize: '0.92rem',
                          lineHeight: 1.5,
                          boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
                          wordBreak: 'break-word',
                        }}
                      >
                        <Conteudo m={m} onAbrirMidia={(midia) => setMidiaPopup(midia)} />
                        <div
                          title={dataAtual ? dataAtual.toLocaleString('pt-BR') : ''}
                          style={{
                            fontSize: '0.68rem',
                            color: m.fromMe ? '#bfdbfe' : '#94a3b8',
                            textAlign: 'right',
                            marginTop: 4,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'flex-end',
                            gap: 4,
                            fontWeight: 500,
                          }}
                        >
                          {hora(m.timestamp)}
                          {m.fromMe && <CheckCheck size={14} style={{ color: '#60a5fa' }} />}
                        </div>
                      </div>
                    </Fragment>
                  );
                })}
                <div ref={fimRef} />
              </div>

              {/* Formulário de Envio de Mensagem */}
              <form
                onSubmit={enviar}
                style={{
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '12px 18px',
                  borderTop: '1px solid rgba(255,255,255,0.08)',
                  background: '#10192e',
                }}
              >
                <input
                  className="input-field"
                  style={{
                    flex: 1,
                    borderRadius: 24,
                    padding: '0.7rem 1.2rem',
                    fontSize: '0.92rem',
                    background: '#1e293b',
                    color: '#ffffff',
                    border: '1px solid rgba(255,255,255,0.12)',
                  }}
                  placeholder="Digite uma mensagem para responder…"
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                />
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{
                    borderRadius: '50%',
                    width: 44,
                    height: 44,
                    padding: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    background: '#E8252C',
                  }}
                  disabled={enviando || !texto.trim()}
                >
                  <Send size={18} />
                </button>
              </form>
            </>
          )}
        </div>
      </div>

      {/* Modal de Mídia Popup (Fotos, Vídeos, Documentos da Conversa) */}
      {midiaPopup && (
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
          onClick={() => setMidiaPopup(null)}
        >
          <div
            style={{
              position: 'relative',
              maxWidth: '92vw',
              maxHeight: '92vh',
              background: 'rgba(15, 23, 42, 0.95)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: 16,
              padding: 16,
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.8)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setMidiaPopup(null)}
              title="Fechar (ESC)"
              style={{
                position: 'absolute',
                top: -12,
                right: -12,
                width: 36,
                height: 36,
                borderRadius: '50%',
                background: '#ef4444',
                color: '#fff',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                zIndex: 10,
              }}
            >
              <X size={20} />
            </button>

            {midiaPopup.tipo === 'imagem' || midiaPopup.tipo === 'figurinha' ? (
              <img
                src={midiaPopup.url}
                alt="Visualização"
                style={{
                  maxWidth: '85vw',
                  maxHeight: '75vh',
                  objectFit: 'contain',
                  borderRadius: 10,
                }}
              />
            ) : midiaPopup.tipo === 'video' ? (
              <video
                src={midiaPopup.url}
                controls
                autoPlay
                style={{
                  maxWidth: '85vw',
                  maxHeight: '75vh',
                  borderRadius: 10,
                }}
              />
            ) : midiaPopup.tipo === 'audio' ? (
              <div style={{ padding: 30, minWidth: 320, textAlign: 'center' }}>
                <h4 style={{ color: '#fff', margin: '0 0 16px 0' }}>🎵 Mensagem de Áudio</h4>
                <audio src={midiaPopup.url} controls autoPlay style={{ width: '100%' }} />
              </div>
            ) : midiaPopup.tipo === 'mapa' ? (
              <div style={{ padding: 24, textAlign: 'center', minWidth: 320 }}>
                <h4 style={{ color: '#fff', margin: '0 0 16px 0' }}>📍 Localização no Mapa</h4>
                <a
                  href={midiaPopup.url}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-primary"
                  style={{ padding: '8px 20px', fontSize: '0.9rem' }}
                >
                  Abrir no Google Maps
                </a>
              </div>
            ) : (
              <iframe
                src={midiaPopup.url}
                title="Documento"
                style={{
                  width: '80vw',
                  height: '75vh',
                  border: 'none',
                  borderRadius: 8,
                }}
              />
            )}

            {midiaPopup.texto && (
              <div style={{ marginTop: 12, color: '#e2e8f0', fontSize: '0.9rem', textAlign: 'center', maxWidth: '80vw' }}>
                {midiaPopup.texto}
              </div>
            )}

            {midiaPopup.tipo !== 'mapa' && (
              <div style={{ marginTop: 14, display: 'flex', gap: 10 }}>
                <a
                  href={midiaPopup.url}
                  download
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-primary"
                  style={{ padding: '7px 18px', fontSize: '0.85rem' }}
                >
                  ⬇ Baixar Arquivo
                </a>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal de Foto de Perfil do Contato */}
      {perfilPopup && (
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
          onClick={() => setPerfilPopup(null)}
        >
          <div
            style={{
              position: 'relative',
              width: '100%',
              maxWidth: 380,
              background: 'rgba(15, 23, 42, 0.98)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: 20,
              padding: 26,
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.8)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textAlign: 'center',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setPerfilPopup(null)}
              title="Fechar (ESC)"
              style={{
                position: 'absolute',
                top: 14,
                right: 14,
                width: 32,
                height: 32,
                borderRadius: '50%',
                background: 'rgba(255,255,255,0.1)',
                color: '#fff',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <X size={18} />
            </button>

            {perfilPopup.imgUrl ? (
              <img
                src={perfilPopup.imgUrl}
                alt={perfilPopup.nome}
                style={{
                  width: 180,
                  height: 180,
                  borderRadius: '50%',
                  objectFit: 'cover',
                  marginBottom: 18,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                  border: '3px solid rgba(255,255,255,0.2)',
                }}
              />
            ) : (
              <div
                style={{
                  width: 180,
                  height: 180,
                  borderRadius: '50%',
                  background: perfilPopup.avatarBg,
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '3.5rem',
                  fontWeight: 700,
                  marginBottom: 18,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                }}
              >
                {perfilPopup.initials}
              </div>
            )}

            <h3 style={{ fontSize: '1.25rem', color: '#fff', margin: '0 0 6px 0', fontWeight: 700 }}>
              {perfilPopup.nome || 'Contato WhatsApp'}
            </h3>
            <p style={{ fontSize: '0.92rem', color: '#94a3b8', margin: '0 0 18px 0' }}>
              📱 {perfilPopup.numero || perfilPopup.jid}
            </p>

            {perfilPopup.imgUrl && (
              <a
                href={perfilPopup.imgUrl}
                download="foto_perfil.jpg"
                target="_blank"
                rel="noreferrer"
                className="btn btn-outline"
                style={{ padding: '6px 20px', fontSize: '0.85rem' }}
              >
                ⬇ Baixar Foto
              </a>
            )}
          </div>
        </div>
      )}

      {/* Modal de agendamentos do contato */}
      {showAgenda && ativa && (
        <div onClick={() => setShowAgenda(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} className="card" style={{ width: '100%', maxWidth: 460, maxHeight: '85vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <h3 style={{ margin: 0, color: 'var(--text-primary)' }}>Agendamentos do Cliente</h3>
              <button className="icon-btn" onClick={() => setShowAgenda(false)}><X size={18} /></button>
            </div>
            <p className="entity-stat-label" style={{ marginTop: 0 }}>{ativa.chatNome || numAtiva} · {numAtiva}</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: '12px 0' }}>
              {agendaContato.length === 0 && <p className="muted-hint" style={{ margin: 0 }}>Nenhum agendamento ativo.</p>}
              {agendaContato.map((a) => {
                const dataAg = parseDate(a.enviarEm);
                return (
                  <div key={a.id} style={{ border: '1px solid var(--panel-border)', borderRadius: 8, padding: 10, background: 'var(--panel-bg-2)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                      <strong style={{ fontSize: '0.82rem', color: 'var(--accent-color)' }}>
                        {dataAg ? dataAg.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}
                      </strong>
                      <span className="entity-stat-label" style={{ textTransform: 'capitalize' }}>{a.status}</span>
                    </div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', marginTop: 4, whiteSpace: 'pre-wrap' }}>{a.mensagem}</div>
                  </div>
                );
              })}
            </div>

            <form onSubmit={criarAgendamento} style={{ borderTop: '1px solid var(--panel-border)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <strong style={{ fontSize: '0.85rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}><Plus size={15} /> Novo agendamento</strong>
              <textarea className="input-field" rows={3} placeholder="Mensagem a enviar…" value={formAg.mensagem} onChange={(e) => setFormAg({ ...formAg, mensagem: e.target.value })} style={{ resize: 'vertical' }} />
              <label className="entity-stat-label">Enviar em
                <input className="input-field" type="datetime-local" value={formAg.enviarEm} onChange={(e) => setFormAg({ ...formAg, enviarEm: e.target.value })} style={{ marginTop: 4 }} />
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                <input type="checkbox" checked={formAg.cancelar} onChange={(e) => setFormAg({ ...formAg, cancelar: e.target.checked })} />
                Cancelar se o cliente responder antes
              </label>
              <button type="submit" className="btn btn-primary" disabled={salvandoAg || !formAg.mensagem.trim() || !formAg.enviarEm}>{salvandoAg ? 'Agendando…' : 'Agendar'}</button>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Métricas */}
      <Modal open={showMetricas} title="Clientes por dia" subtitle={selecionado ? selecionado.nome : ''} onClose={() => setShowMetricas(false)} width={640}>
        <p className="muted-hint" style={{ marginBottom: 12 }}>
          <strong>Chegaram</strong>: clientes diferentes que enviaram mensagem. <strong>Respondidos</strong>: contatos que tiveram resposta da equipe no mesmo dia (últimos 30 dias).
        </p>
        {carregandoMetricas ? (
          <div className="empty-state">Carregando…</div>
        ) : metricas.length === 0 ? (
          <div className="empty-state"><BarChart3 size={32} style={{ opacity: 0.5 }} /><p>Sem dados no período.</p></div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Dia</th><th style={{ textAlign: 'right' }}>Chegaram</th><th style={{ textAlign: 'right' }}>Respondidos</th><th style={{ textAlign: 'right' }}>%</th></tr></thead>
              <tbody>
                {metricas.map((m) => {
                  const chegaram = m.contatos ?? 0;
                  const respondidos = m.respondidos ?? 0;
                  const percentual = chegaram ? Math.round((respondidos / chegaram) * 100) : 0;
                  return (
                    <tr key={m.dia}>
                      <td>{rotuloDiaMetrica(m.dia)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--text-primary)' }}>{chegaram}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--text-primary)' }}>{respondidos}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: percentual >= 80 ? 'var(--success-color)' : 'var(--warning-color)' }}>{percentual}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Modal>
    </div>
  );
};
