import { useState, useEffect, useLayoutEffect, useRef, Fragment, memo } from 'react';
import { Send, RefreshCw, Search, MessageSquare, AlertTriangle, Calendar, X, Plus, ArrowLeft, BarChart3, CheckCheck, Clock, Image as ImageIcon, Store as StoreIcon, Smartphone, Users } from 'lucide-react';
import { api, soNumero } from '../atendimento/api';
import { API_BASE } from '../apiBase';
import { Modal } from '../components/Modal';
import { useAppContext } from '../context/AppContext';

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
          boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
          border: '2px solid rgba(255,255,255,0.12)',
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
        boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        border: '1px solid rgba(255,255,255,0.15)',
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
  const { selectedStoreId, setSelectedStoreId, data: appContextData } = useAppContext();
  const [atendentes, setAtendentes] = useState([]);
  const [usuarioId, setUsuarioId] = useState('');
  const [lojaSel, setLojaSel] = useState('');
  const [filtroAtendente, setFiltroAtendente] = useState('');
  const [opcoesAtendentes, setOpcoesAtendentes] = useState([]);
  const [conversas, setConversas] = useState([]);
  const [carregandoConversas, setCarregandoConversas] = useState(false);
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

  const lojaDe = (u) => (u?.lojaId || '__sem_loja__');

  // Carregamento inicial de usuários e lojas
  useEffect(() => {
    setCarregandoConversas(true);
    api('/api/usuarios').then((us) => {
      const listaUsers = Array.isArray(us) ? us : [];
      setAtendentes(listaUsers);

      // Descobre a loja inicial baseada no selectedStoreId do AppContext ou localStorage
      let lojaInicial = '';
      if (selectedStoreId && selectedStoreId !== 'all') {
        lojaInicial = selectedStoreId;
      } else {
        try {
          const salvoLoja = localStorage.getItem('gp_inbox_loja');
          if (salvoLoja) lojaInicial = salvoLoja;
        } catch { /* noop */ }
      }

      // Função inteligente para escolher o atendente mais relevante da loja
      const encontrarMelhorAtendente = (lista) => {
        if (!lista || lista.length === 0) return null;
        // 1. Conectado E com mensagens reais
        const c1 = lista.find((u) => u.whatsappConectado && (u.totalMensagens || 0) > 0);
        if (c1) return c1;
        // 2. Com mensagens reais
        const c2 = lista.find((u) => (u.totalMensagens || 0) > 0);
        if (c2) return c2;
        // 3. Conectado
        const c3 = lista.find((u) => u.whatsappConectado);
        if (c3) return c3;
        // 4. Primeiro da lista
        return lista[0];
      };

      // Usuários candidatos a atendimento
      const candidatos = listaUsers.filter((u) => u.role !== 'admin' && u.role !== 'master');
      const comLoja = lojaInicial ? candidatos.filter((u) => lojaDe(u) === lojaInicial) : candidatos;
      
      const inicial = encontrarMelhorAtendente(comLoja) || encontrarMelhorAtendente(candidatos) || candidatos[0];

      if (inicial) {
        const ljId = lojaDe(inicial);
        setLojaSel(ljId);
        setUsuarioId(inicial.id);
        if (selectedStoreId !== ljId && ljId !== '__sem_loja__') {
          setSelectedStoreId(ljId);
        }
      } else {
        setCarregandoConversas(false);
      }
    }).catch((e) => {
      setErro(e.message || 'Erro ao carregar atendentes');
      setCarregandoConversas(false);
    });
  }, []);

  // Lista unificada e robusta de lojas (combina lojas do AppContext + lojas dos atendentes)
  const lojas = (() => {
    const m = new Map();
    (appContextData.stores || []).forEach((s) => {
      m.set(s.id, { id: s.id, nome: s.store_name, numeros: 0, temConectado: false });
    });
    atendentes.forEach((u) => {
      const id = lojaDe(u);
      if (!m.has(id)) {
        m.set(id, { id, nome: u.lojaNome || (u.lojaId ? 'Loja sem nome' : 'Sem loja definida'), numeros: 0, temConectado: false });
      }
      const item = m.get(id);
      if (u.whatsappConectado) {
        item.temConectado = true;
        item.numeros += 1;
      }
    });
    return [...m.values()].sort((a, b) => a.nome.localeCompare(b.nome));
  })();

  const atendentesDaLoja = lojaSel ? atendentes.filter((u) => lojaDe(u) === lojaSel) : atendentes;
  const atendenteAtivo = atendentes.find((u) => u.id === usuarioId);

  // Sincronização quando o TopBar muda a loja global (selectedStoreId)
  useEffect(() => {
    if (selectedStoreId && selectedStoreId !== 'all' && selectedStoreId !== lojaSel) {
      trocarLoja(selectedStoreId, false);
    }
  }, [selectedStoreId]);

  // Função central e à prova de falhas para trocar de loja instantaneamente
  const trocarLoja = (novaLojaId, atualizarContexto = true) => {
    setLojaSel(novaLojaId);
    try { localStorage.setItem('gp_inbox_loja', novaLojaId); } catch { /* noop */ }
    if (atualizarContexto && novaLojaId !== '__sem_loja__') {
      setSelectedStoreId(novaLojaId);
    }

    // Limpeza imediata do chat ativo anterior para evitar mensagens cruzadas
    setAtiva(null);
    setMensagens([]);
    setFiltroAtendente('');
    setOpcoesAtendentes([]);
    setCarregandoConversas(true);

    const daLoja = atendentes.filter((u) => lojaDe(u) === novaLojaId);
    
    // Escolhe o atendente conectado ou com histórico de mensagens
    const alvo = daLoja.find((u) => u.whatsappConectado && (u.totalMensagens || 0) > 0)
      || daLoja.find((u) => (u.totalMensagens || 0) > 0)
      || daLoja.find((u) => u.whatsappConectado)
      || daLoja[0];

    if (alvo) {
      setUsuarioId(alvo.id);
      carregarConversas(alvo.id, '');
      carregarAgenda(alvo.id);
    } else {
      // Loja sem nenhum atendente configurado
      setUsuarioId('');
      setConversas([]);
      setCarregandoConversas(false);
    }
  };

  const trocarAtendente = (novoUid) => {
    setUsuarioId(novoUid);
    setAtiva(null);
    setMensagens([]);
    setFiltroAtendente('');
    setCarregandoConversas(true);
    carregarConversas(novoUid, '');
    carregarAgenda(novoUid);
  };

  const donoEfetivo = (u) => (u && (u.whatsappDonoId || u.id)) || '';
  const equipe = atendenteAtivo ? atendentes.filter((u) => donoEfetivo(u) === donoEfetivo(atendenteAtivo)) : [];
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
    if (!uid) {
      setConversas([]);
      setCarregandoConversas(false);
      return;
    }
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
    } catch (e) {
      setErro(e.message || 'Erro ao buscar conversas');
      setConversas([]);
    } finally {
      setCarregandoConversas(false);
    }
  };

  const carregarAgenda = async (uid) => {
    if (!uid) return;
    try { setAgenda(await api(`/api/agendamentos?criadoPorId=${uid}`)); } catch { /* noop */ }
  };

  // Efeito para recarregar quando o filtro por atendente muda
  useEffect(() => {
    if (usuarioId) {
      carregarConversas(usuarioId, filtroAtendente);
    }
  }, [filtroAtendente]);

  const numAtiva = ativa ? soNumero(ativa.numeroReal || ativa.chatJid) : '';
  const agendaContato = agenda.filter((a) => soNumero(a.numero) === numAtiva);

  const criarAgendamento = async (e) => {
    e.preventDefault();
    if (!ativa || !formAg.mensagem.trim() || !formAg.enviarEm || !usuarioId) return;
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
      setShowAgenda(false);
    } catch (err) { alert(err.message || 'Falha ao agendar.'); }
    setSalvandoAg(false);
  };

  const abrir = async (c) => {
    if (!c || !c.chatJid) return;
    setAtiva(c);
    setCarregandoMsgs(true);
    setErro('');
    try {
      const uidAlvo = c.atendenteId || c.usuarioId || usuarioId;
      const msgs = await api(`/api/inbox/mensagens?usuarioId=${encodeURIComponent(uidAlvo || '')}&jid=${encodeURIComponent(c.chatJid)}`);
      setMensagens(Array.isArray(msgs) ? msgs : []);
    } catch (e) { 
      console.error('Erro ao abrir conversa:', e);
      setErro(e.message || 'Erro ao carregar mensagens'); 
      setMensagens([]);
    } finally {
      setCarregandoMsgs(false);
    }
  };

  // Polling automático da conversa aberta
  useEffect(() => {
    if (!ativa || !ativa.chatJid) return;
    const id = setInterval(async () => {
      try {
        const uidAlvo = ativa.atendenteId || ativa.usuarioId || usuarioId;
        const novas = await api(`/api/inbox/mensagens?usuarioId=${encodeURIComponent(uidAlvo || '')}&jid=${encodeURIComponent(ativa.chatJid)}`);
        if (Array.isArray(novas)) {
          setMensagens((atual) => {
            const igual = atual.length === novas.length && atual[atual.length - 1]?.id === novas[novas.length - 1]?.id;
            return igual ? atual : novas;
          });
        }
      } catch { /* noop */ }
    }, 4000);
    return () => clearInterval(id);
  }, [ativa?.chatJid, usuarioId]);

  // Polling automático da lista de conversas
  useEffect(() => {
    if (!usuarioId) return;
    const id = setInterval(() => { carregarConversas(usuarioId, filtroAtendente); }, 8000);
    return () => clearInterval(id);
  }, [usuarioId, filtroAtendente]);

  // Auto-scroll para o fim da conversa
  useLayoutEffect(() => {
    const trocouDeConversa = chatAnteriorRef.current !== ativa?.chatJid;
    chatAnteriorRef.current = ativa?.chatJid;
    const el = listaRef.current;
    const pertoDoFim = !el || (el.scrollHeight - el.scrollTop - el.clientHeight < 140);
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
    if (!t || !ativa || !usuarioId) return;
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
    `${c.chatNome || ''} ${c.numeroReal || ''} ${c.chatJid || ''}`.toLowerCase().includes(busca.toLowerCase().trim()));

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 95px)', overflow: 'hidden' }}>
      {/* Top Header com controles integrados e visual ultra-moderno */}
      <div className="page-header" style={{ marginBottom: '0.75rem', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: 'linear-gradient(135deg, rgba(232,37,44,0.18), rgba(232,37,44,0.06))', border: '1px solid rgba(232,37,44,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <MessageSquare size={20} style={{ color: '#E8252C' }} />
          </div>
          <div>
            <h1 style={{ fontSize: '1.35rem', margin: 0, fontWeight: 800, letterSpacing: '-0.02em' }}>Caixa de Entrada</h1>
            <p className="muted-hint" style={{ margin: 0, fontSize: '0.78rem', color: '#94A3B8' }}>WhatsApp em tempo real por loja e atendente</p>
          </div>
        </div>

        <div className="flex items-center gap-2" style={{ flexWrap: 'wrap' }}>
          {/* Seletor de Loja */}
          <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
            <StoreIcon size={14} style={{ position: 'absolute', left: 10, color: '#E8252C', pointerEvents: 'none' }} />
            <select
              className="input-field"
              style={{
                width: 'auto',
                minWidth: 180,
                paddingLeft: 30,
                paddingRight: 24,
                paddingTop: '0.45rem',
                paddingBottom: '0.45rem',
                fontSize: '0.84rem',
                fontWeight: 700,
                background: 'rgba(19, 31, 56, 0.9)',
                borderColor: 'rgba(232, 37, 44, 0.35)',
                borderRadius: 10,
              }}
              value={lojaSel}
              onChange={(e) => trocarLoja(e.target.value)}
              title="Escolha a loja física"
            >
              {lojas.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.temConectado ? '🟢' : '⚪'} {l.nome}{l.numeros > 1 ? ` (${l.numeros} chats)` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Seletor de Atendente / Número */}
          <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
            <Smartphone size={14} style={{ position: 'absolute', left: 10, color: '#94A3B8', pointerEvents: 'none' }} />
            <select
              className="input-field"
              style={{
                width: 'auto',
                minWidth: 180,
                paddingLeft: 30,
                paddingRight: 24,
                paddingTop: '0.45rem',
                paddingBottom: '0.45rem',
                fontSize: '0.84rem',
                fontWeight: 600,
                background: 'rgba(19, 31, 56, 0.8)',
                borderRadius: 10,
              }}
              value={usuarioId}
              onChange={(e) => trocarAtendente(e.target.value)}
              disabled={atendentesDaLoja.length <= 1}
              title={atendentesDaLoja.length > 1 ? 'Escolha qual número/atendente desta loja' : 'Número principal desta loja'}
            >
              {atendentesDaLoja.length === 0 ? (
                <option value="">Sem atendente cadastrado</option>
              ) : (
                atendentesDaLoja.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.whatsappConectado ? '🟢' : '⚪'} {u.nome}
                  </option>
                ))
              )}
            </select>
          </div>

          <button
            className="btn btn-secondary"
            style={{ padding: '0.45rem 0.85rem', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', borderRadius: 10 }}
            onClick={abrirMetricas}
            disabled={!usuarioId}
            title="Ver métricas dos últimos 30 dias"
          >
            <BarChart3 size={15} /> Métricas
          </button>

          <button
            className="icon-btn"
            style={{ width: 36, height: 36, borderRadius: 10 }}
            onClick={() => carregarConversas(usuarioId, filtroAtendente)}
            title="Atualizar conversas da loja selecionada"
          >
            <RefreshCw size={15} className={carregandoConversas ? 'spin' : ''} />
          </button>
        </div>
      </div>

      {erro && (
        <div className="owner-banner mb-2" style={{ flexShrink: 0, background: 'rgba(232,37,44,0.08)', border: '1px solid rgba(232,37,44,0.25)', padding: '0.5rem 0.9rem', borderRadius: 10 }}>
          <AlertTriangle size={15} style={{ color: 'var(--danger-color)' }} />
          <span style={{ fontSize: '0.85rem' }}>{erro}</span>
        </div>
      )}

      {/* Caixa de Entrada Principal (Layout Dividido, Glassmorphism & Travado) */}
      <div
        className={`card inbox-shell ${ativa ? 'chat-open' : ''}`}
        style={{
          padding: 0,
          display: 'grid',
          gridTemplateColumns: '370px 1fr',
          flex: 1,
          minHeight: 0,
          height: '100%',
          borderRadius: 16,
          overflow: 'hidden',
          background: '#0a0f1d',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          boxShadow: '0 12px 40px rgba(0, 0, 0, 0.45)',
        }}
      >
        {/* Painel Esquerdo: Lista de Conversas com Header Sólido */}
        <div className="inbox-list" style={{ borderRight: '1px solid rgba(255, 255, 255, 0.08)', display: 'flex', flexDirection: 'column', background: '#0e1628', overflow: 'hidden', height: '100%' }}>
          {/* Barra de Busca e Filtro de Atendente */}
          <div style={{ flexShrink: 0, padding: '12px 14px', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', background: '#121c33', zIndex: 5 }}>
            <div style={{ position: 'relative' }}>
              <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input
                className="input-field"
                style={{ paddingLeft: 36, paddingRight: 32, borderRadius: 10, fontSize: '0.84rem', background: '#0b1120', border: '1px solid rgba(255, 255, 255, 0.1)' }}
                placeholder="Buscar cliente, número ou mensagem…"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
              {busca && (
                <button
                  onClick={() => setBusca('')}
                  style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {mostrarFiltro && (
              <div style={{ marginTop: 8 }}>
                <select
                  className="input-field"
                  style={{ borderRadius: 8, fontSize: '0.78rem', padding: '0.35rem 0.65rem', background: '#0b1120', border: '1px solid rgba(255, 255, 255, 0.1)', fontWeight: 600 }}
                  value={filtroAtendente}
                  onChange={(e) => setFiltroAtendente(e.target.value)}
                  title="Filtre pelas conversas de cada atendente deste número"
                >
                  <option value="">👥 Todas as conversas do número</option>
                  {opcoesFiltro.map((u) => <option key={u.id} value={u.id}>👤 Só {u.nome}</option>)}
                  <option value="sem">⚪ Sem atendente atribuído</option>
                </select>
              </div>
            )}
          </div>

          {/* Lista de Conversas com Scroll Limpo */}
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
            {carregandoConversas && (
              <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                <div className="skeleton-loading" style={{ width: '90%', height: 50, marginBottom: 8 }} />
                <div className="skeleton-loading" style={{ width: '90%', height: 50, marginBottom: 8 }} />
                <div className="skeleton-loading" style={{ width: '90%', height: 50 }} />
                <span style={{ fontSize: '0.82rem', marginTop: 4 }}>Sincronizando conversas da loja…</span>
              </div>
            )}

            {!carregandoConversas && filtradas.length === 0 && (
              <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8' }}>
                <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                  <MessageSquare size={24} style={{ color: '#64748b' }} />
                </div>
                <h4 style={{ fontSize: '0.95rem', color: '#FFFFFF', margin: '0 0 4px 0', fontWeight: 700 }}>
                  {busca ? 'Nenhum resultado' : 'Nenhuma conversa ativa'}
                </h4>
                <p style={{ fontSize: '0.8rem', margin: 0, color: '#64748b', maxWidth: 240, marginInline: 'auto' }}>
                  {busca 
                    ? 'Tente buscar por outro termo ou limpe a busca.' 
                    : atendenteAtivo?.whatsappConectado 
                    ? 'Aguardando novas mensagens de clientes desta loja.'
                    : 'O WhatsApp desta loja está desconectado no momento.'}
                </p>
              </div>
            )}

            {!carregandoConversas && filtradas.map((c) => {
              const selecionada = ativa?.chatJid === c.chatJid;
              const semAtendente = mostrarFiltro && !c.atendenteNome;
              const dataMsg = c.timestamp || c.ultimaMsgData || c.atualizadoEm;

              return (
                <button
                  key={c.chatJid}
                  onClick={() => abrir(c)}
                  className={`link-cell inbox-item ${selecionada ? 'inbox-item-active' : ''}`}
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    textAlign: 'left',
                    cursor: 'pointer',
                    background: selecionada ? 'rgba(232,37,44,0.14)' : 'transparent',
                    borderLeft: selecionada ? '3px solid #E8252C' : '3px solid transparent',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {/* Avatar com Foto Real do WhatsApp */}
                  <ContactAvatar
                    nome={c.chatNome || c.numeroReal}
                    jid={c.chatJid}
                    usuarioId={usuarioId}
                    fotoUrl={c.fotoUrl}
                    size={44}
                    onClick={(avData) => setPerfilPopup({ ...avData, numero: c.numeroReal || c.chatJid })}
                  />

                  {/* Informações da conversa */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                      <strong style={{ fontSize: '0.9rem', color: selecionada ? '#FFFFFF' : '#f1f5f9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: selecionada ? 700 : 600 }}>
                        {c.chatNome || c.numeroReal || 'Cliente'}
                      </strong>
                      <span style={{ fontSize: '0.72rem', color: '#64748b', flexShrink: 0, marginLeft: 6, fontWeight: 500 }}>
                        {dataPrevia(dataMsg)}
                      </span>
                    </div>

                    <div style={{ fontSize: '0.78rem', color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: 0.85, display: 'flex', alignItems: 'center', gap: 4 }}>
                      {c.fromMe && <CheckCheck size={13} style={{ color: '#60a5fa', flexShrink: 0 }} />}
                      <span>{c.texto || c.ultimaMsg || c.numeroReal || 'Conversa iniciada'}</span>
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

        {/* Painel Direito: Janela de Conversa Ativa */}
        <div className="inbox-thread" style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#080d1a', backgroundImage: 'radial-gradient(rgba(255,255,255,0.035) 1px, transparent 1px)', backgroundSize: '20px 20px', overflow: 'hidden' }}>
          {!ativa ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center', color: '#94a3b8', background: '#070c18' }}>
              <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'linear-gradient(135deg, rgba(232,37,44,0.15), rgba(232,37,44,0.04))', border: '1px solid rgba(232,37,44,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                <MessageSquare size={34} style={{ color: '#E8252C' }} />
              </div>
              <h3 style={{ fontSize: '1.25rem', color: '#f8fafc', margin: '0 0 6px 0', fontWeight: 800, letterSpacing: '-0.02em' }}>
                Nenhuma conversa selecionada
              </h3>
              <p style={{ fontSize: '0.88rem', maxWidth: 360, margin: 0, color: '#64748b', lineHeight: 1.5 }}>
                Escolha um cliente na lista à esquerda para acompanhar o histórico completo e responder em tempo real.
              </p>
            </div>
          ) : (
            <>
              {/* Header do Chat */}
              <div
                style={{
                  flexShrink: 0,
                  padding: '12px 18px',
                  borderBottom: '1px solid rgba(255,255,255,0.08)',
                  background: '#0d1527',
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
                    size={44}
                    onClick={(avData) => setPerfilPopup({ ...avData, numero: numAtiva || ativa.chatJid })}
                  />

                  <div style={{ minWidth: 0 }}>
                    <strong style={{ fontSize: '1rem', color: '#FFFFFF', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 700 }}>
                      {ativa.chatNome || numAtiva}
                    </strong>
                    <span style={{ fontSize: '0.78rem', color: '#94a3b8', fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      📱 {numAtiva} {ativa.atendenteNome ? `· Atendido por ${ativa.atendenteNome}` : ''}
                    </span>
                  </div>
                </div>

                <button
                  className="btn btn-secondary"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', fontSize: '0.82rem', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#f8fafc', borderRadius: 10 }}
                  onClick={() => setShowAgenda(true)}
                >
                  <Calendar size={14} style={{ color: '#E8252C' }} /> Agendamentos{agendaContato.length ? ` (${agendaContato.length})` : ''}
                </button>
              </div>

              {/* Área de Mensagens (Thread com scroll) */}
              <div
                ref={listaRef}
                style={{
                  flex: 1,
                  minHeight: 0,
                  overflowY: 'auto',
                  padding: '18px 22px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                }}
              >
                {carregandoMsgs && (
                  <div style={{ alignSelf: 'center', margin: 'auto', padding: '10px 20px', background: '#121c33', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 20, color: '#cbd5e1', fontSize: '0.86rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Clock size={15} /> Carregando mensagens…
                  </div>
                )}

                {!carregandoMsgs && mensagens.length === 0 && (
                  <div style={{ alignSelf: 'center', margin: 'auto', padding: 24, textAlign: 'center', background: '#0e1628', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, maxWidth: 320 }}>
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
                    <Fragment key={m.id || i}>
                      {mudouDia && (
                        <div
                          style={{
                            alignSelf: 'center',
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            color: '#94a3b8',
                            background: '#10192e',
                            border: '1px solid rgba(255,255,255,0.08)',
                            borderRadius: 20,
                            padding: '4px 14px',
                            margin: '8px 0',
                            letterSpacing: '0.02em',
                          }}
                        >
                          {rotuloDia(m.timestamp)}
                        </div>
                      )}

                      <div
                        style={{
                          maxWidth: '75%',
                          alignSelf: m.fromMe ? 'flex-end' : 'flex-start',
                          background: m.fromMe ? 'linear-gradient(135deg, #1d4ed8 0%, #1e3a8a 100%)' : '#141f36',
                          color: '#ffffff',
                          border: m.fromMe ? '1px solid rgba(59,130,246,0.35)' : '1px solid rgba(255,255,255,0.08)',
                          padding: '10px 14px',
                          borderRadius: m.fromMe ? '16px 16px 2px 16px' : '16px 16px 16px 2px',
                          fontSize: '0.92rem',
                          lineHeight: 1.5,
                          boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                          wordBreak: 'break-word',
                        }}
                      >
                        <Conteudo m={m} onAbrirMidia={(midia) => setMidiaPopup(midia)} />
                        <div
                          title={dataAtual ? dataAtual.toLocaleString('pt-BR') : ''}
                          style={{
                            fontSize: '0.68rem',
                            color: m.fromMe ? '#bfdbfe' : '#64748b',
                            textAlign: 'right',
                            marginTop: 4,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'flex-end',
                            gap: 4,
                            fontWeight: 600,
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
                  padding: '14px 20px',
                  borderTop: '1px solid rgba(255,255,255,0.08)',
                  background: '#0d1527',
                }}
              >
                <input
                  className="input-field"
                  style={{
                    flex: 1,
                    borderRadius: 24,
                    padding: '0.72rem 1.3rem',
                    fontSize: '0.92rem',
                    background: '#141f36',
                    color: '#ffffff',
                    border: '1px solid rgba(255,255,255,0.12)',
                  }}
                  placeholder="Digite uma mensagem para responder o cliente…"
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
                    boxShadow: '0 0 16px rgba(232,37,44,0.4)',
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

      {/* Modal de Mídia Popup */}
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
              background: 'rgba(14, 22, 38, 0.98)',
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
              title="Fechar"
              style={{
                position: 'absolute',
                top: -12,
                right: -12,
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
              background: '#0e1628',
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
              title="Fechar"
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

      {/* Modal de Agendamentos do Contato */}
      {showAgenda && ativa && (
        <div onClick={() => setShowAgenda(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} className="card" style={{ width: '100%', maxWidth: 480, maxHeight: '85vh', overflowY: 'auto', background: '#0e1628', border: '1px solid rgba(255,255,255,0.12)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <h3 style={{ margin: 0, color: '#FFFFFF', fontWeight: 700 }}>Agendamentos do Cliente</h3>
              <button className="icon-btn" onClick={() => setShowAgenda(false)}><X size={18} /></button>
            </div>
            <p className="entity-stat-label" style={{ marginTop: 0, color: '#94a3b8' }}>{ativa.chatNome || numAtiva} · {numAtiva}</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: '14px 0' }}>
              {agendaContato.length === 0 && <p className="muted-hint" style={{ margin: 0 }}>Nenhum agendamento ativo para este contato.</p>}
              {agendaContato.map((a) => {
                const dataAg = parseDate(a.enviarEm);
                return (
                  <div key={a.id} style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: 12, background: '#141f36' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                      <strong style={{ fontSize: '0.84rem', color: '#E8252C' }}>
                        {dataAg ? dataAg.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}
                      </strong>
                      <span className="entity-stat-label" style={{ textTransform: 'capitalize', color: '#38bdf8' }}>{a.status}</span>
                    </div>
                    <div style={{ fontSize: '0.86rem', color: '#FFFFFF', marginTop: 6, whiteSpace: 'pre-wrap' }}>{a.mensagem}</div>
                  </div>
                );
              })}
            </div>

            <form onSubmit={criarAgendamento} style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <strong style={{ fontSize: '0.88rem', color: '#FFFFFF', display: 'flex', alignItems: 'center', gap: 6 }}><Plus size={15} /> Novo agendamento</strong>
              <textarea className="input-field" rows={3} placeholder="Mensagem a enviar para o cliente…" value={formAg.mensagem} onChange={(e) => setFormAg({ ...formAg, mensagem: e.target.value })} style={{ resize: 'vertical' }} />
              <label className="entity-stat-label" style={{ color: '#94a3b8' }}>Data e Horário de Envio
                <input className="input-field" type="datetime-local" value={formAg.enviarEm} onChange={(e) => setFormAg({ ...formAg, enviarEm: e.target.value })} style={{ marginTop: 4 }} />
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', color: '#cbd5e1', cursor: 'pointer' }}>
                <input type="checkbox" checked={formAg.cancelar} onChange={(e) => setFormAg({ ...formAg, cancelar: e.target.checked })} />
                Cancelar envio automaticamente se o cliente responder antes
              </label>
              <button type="submit" className="btn btn-primary" style={{ marginTop: 4 }} disabled={salvandoAg || !formAg.mensagem.trim() || !formAg.enviarEm}>
                {salvandoAg ? 'Agendando…' : 'Salvar Agendamento'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Métricas */}
      <Modal open={showMetricas} title="Clientes por Dia (Últimos 30 Dias)" subtitle={atendenteAtivo ? atendenteAtivo.nome : ''} onClose={() => setShowMetricas(false)} width={640}>
        <p className="muted-hint" style={{ marginBottom: 14 }}>
          <strong>Chegaram</strong>: clientes diferentes que enviaram mensagem. <strong>Respondidos</strong>: contatos que tiveram resposta da equipe no mesmo dia.
        </p>
        {carregandoMetricas ? (
          <div className="empty-state">Carregando métricas…</div>
        ) : metricas.length === 0 ? (
          <div className="empty-state"><BarChart3 size={32} style={{ opacity: 0.5 }} /><p>Sem dados no período.</p></div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Dia</th><th style={{ textAlign: 'right' }}>Chegaram</th><th style={{ textAlign: 'right' }}>Respondidos</th><th style={{ textAlign: 'right' }}>Conversão</th></tr></thead>
              <tbody>
                {metricas.map((m) => {
                  const chegaram = m.contatos ?? 0;
                  const respondidos = m.respondidos ?? 0;
                  const percentual = chegaram ? Math.round((respondidos / chegaram) * 100) : 0;
                  return (
                    <tr key={m.dia}>
                      <td>{rotuloDiaMetrica(m.dia)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: '#FFFFFF' }}>{chegaram}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: '#FFFFFF' }}>{respondidos}</td>
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
