import { useState, useEffect, useRef } from 'react';
import {
  MessageSquare,
  Search,
  Send,
  RefreshCw,
  AlertTriangle,
  ExternalLink,
  Store,
  Clock,
  ArrowLeft,
  CheckCheck,
  Megaphone,
} from 'lucide-react';
import { api } from '../atendimento/api';

export const OlxChat = () => {
  const [conversas, setConversas] = useState([]);
  const [ativa, setAtiva] = useState(null);
  const [mensagens, setMensagens] = useState([]);
  const [texto, setTexto] = useState('');
  const [busca, setBusca] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [carregandoMsgs, setCarregandoMsgs] = useState(false);
  const [erro, setErro] = useState('');

  const fimRef = useRef(null);

  const carregarConversas = async () => {
    try {
      const res = await api('/api/olx/conversas');
      setConversas(Array.isArray(res) ? res : []);
    } catch (e) {
      setErro(e.message || 'Erro ao carregar conversas da OLX');
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregarConversas();
    const id = setInterval(carregarConversas, 10000);
    return () => clearInterval(id);
  }, []);

  const abrirConversa = async (c) => {
    setAtiva(c);
    setCarregandoMsgs(true);
    try {
      const msgs = await api(`/api/olx/conversas/${c.id}/mensagens`);
      setMensagens(Array.isArray(msgs) ? msgs : []);
    } catch (e) {
      console.error(e);
    } finally {
      setCarregandoMsgs(false);
    }
  };

  useEffect(() => {
    if (!ativa) return;
    const id = setInterval(async () => {
      try {
        const msgs = await api(`/api/olx/conversas/${ativa.id}/mensagens`);
        if (Array.isArray(msgs)) setMensagens(msgs);
      } catch {}
    }, 5000);
    return () => clearInterval(id);
  }, [ativa]);

  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mensagens]);

  const enviarResposta = async (e) => {
    e.preventDefault();
    if (!texto.trim() || !ativa) return;
    setEnviando(true);
    try {
      const res = await api(`/api/olx/conversas/${ativa.id}/enviar`, {
        method: 'POST',
        body: JSON.stringify({ texto: texto.trim() }),
      });
      if (res && res.mensagem) {
        setMensagens((prev) => [...prev, res.mensagem]);
        setTexto('');
        carregarConversas();
      }
    } catch (err) {
      alert(err.message || 'Erro ao responder no chat da OLX.');
    } finally {
      setEnviando(false);
    }
  };

  const filtradas = conversas.filter((c) => {
    const termo = busca.toLowerCase();
    return (
      (c.compradorNome || '').toLowerCase().includes(termo) ||
      (c.anuncioTitulo || '').toLowerCase().includes(termo) ||
      (c.ultimaMsg || '').toLowerCase().includes(termo)
    );
  });

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="page-header" style={{ marginBottom: '1.2rem' }}>
        <div>
          <h1 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            <MessageSquare size={26} style={{ color: 'var(--red)' }} /> Chat Integrado OLX
          </h1>
          <p className="muted-hint" style={{ margin: '4px 0 0 0' }}>
            Responda e acompanhe todas as conversas dos seus anúncios na OLX em tempo real
          </p>
        </div>

        <button
          className="icon-btn"
          onClick={carregarConversas}
          title="Atualizar conversas"
        >
          <RefreshCw size={16} className={carregando ? 'spin' : ''} />
        </button>
      </div>

      {erro && (
        <div className="owner-banner mb-4" style={{ background: 'rgba(232,37,44,0.08)', borderColor: 'rgba(232,37,44,0.25)' }}>
          <AlertTriangle size={18} style={{ color: 'var(--danger-color)' }} />
          <span>{erro}</span>
        </div>
      )}

      {/* Caixa de Entrada OLX */}
      <div className={`card inbox-shell ${ativa ? 'chat-open' : ''}`}>
        {/* Painel Esquerdo: Lista de Chats OLX */}
        <div className="inbox-list" style={{ borderRight: '1px solid var(--panel-border)', display: 'flex', flexDirection: 'column', background: 'var(--panel-bg)', overflow: 'hidden', height: '100%' }}>
          {/* Busca */}
          <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--panel-border)', background: 'var(--panel-bg-2)' }}>
            <div style={{ position: 'relative' }}>
              <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                className="input-field"
                style={{ paddingLeft: 36, borderRadius: 10, fontSize: '0.85rem' }}
                placeholder="Buscar cliente ou anúncio…"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </div>
          </div>

          {/* Lista */}
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
            {filtradas.length === 0 && (
              <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)' }}>
                <Megaphone size={28} style={{ margin: '0 auto 8px', opacity: 0.4 }} />
                <p style={{ fontSize: '0.85rem', margin: 0 }}>Nenhuma conversa de anúncio encontrada.</p>
              </div>
            )}

            {filtradas.map((c) => {
              const selecionada = ativa?.id === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => abrirConversa(c)}
                  className={`link-cell inbox-item ${selecionada ? 'inbox-item-active' : ''}`}
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    borderBottom: '1px solid var(--panel-border)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  {/* Foto do Anúncio / Avatar */}
                  {c.anuncioFoto ? (
                    <img
                      src={c.anuncioFoto}
                      alt=""
                      style={{ width: 44, height: 44, borderRadius: 8, objectFit: 'cover', flexShrink: 0, border: '1px solid var(--panel-border)' }}
                    />
                  ) : (
                    <div
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 8,
                        background: 'var(--brand-gradient)',
                        color: '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 700,
                        fontSize: '0.9rem',
                        flexShrink: 0,
                      }}
                    >
                      OLX
                    </div>
                  )}

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                      <strong style={{ fontSize: '0.9rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.compradorNome || 'Interessado OLX'}
                      </strong>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        {new Date(c.ultimaMsgData).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    <div style={{ fontSize: '0.75rem', color: 'var(--red)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      📢 {c.anuncioTitulo}
                    </div>

                    <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>
                      {c.ultimaMsg || 'Nova mensagem'}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Painel Direito: Chat Aberto */}
        <div className="inbox-thread" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
          {!ativa ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--panel-bg-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                <Megaphone size={30} style={{ color: 'var(--red)' }} />
              </div>
              <h3 style={{ fontSize: '1.1rem', color: 'var(--text-primary)', margin: '0 0 6px 0', fontWeight: 600 }}>Nenhum chat OLX selecionado</h3>
              <p style={{ fontSize: '0.85rem', maxWidth: 320, margin: 0 }}>Selecione um cliente ao lado para responder compradores e fechar vendas.</p>
            </div>
          ) : (
            <>
              {/* Header do Chat OLX */}
              <div
                style={{
                  flexShrink: 0,
                  padding: '12px 18px',
                  borderBottom: '1px solid var(--panel-border)',
                  background: 'var(--panel-bg-2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                  <button className="inbox-back icon-btn" onClick={() => setAtiva(null)}>
                    <ArrowLeft size={18} />
                  </button>

                  <div style={{ minWidth: 0 }}>
                    <strong style={{ fontSize: '0.98rem', color: 'var(--text-primary)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      👤 {ativa.compradorNome || 'Interessado OLX'}
                    </strong>
                    <span style={{ fontSize: '0.78rem', color: 'var(--red)', fontWeight: 600 }}>
                      Anúncio: {ativa.anuncioTitulo} — R$ {ativa.anuncioPreco ? ativa.anuncioPreco.toFixed(2) : '0.00'}
                    </span>
                  </div>
                </div>

                {ativa.anuncio?.linkOlx && (
                  <a
                    href={ativa.anuncio.linkOlx}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-secondary"
                    style={{ padding: '5px 12px', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  >
                    <ExternalLink size={14} /> Ver na OLX
                  </a>
                )}
              </div>

              {/* Mensagens */}
              <div
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
                  <div style={{ alignSelf: 'center', margin: 'auto', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    Carregando mensagens da OLX…
                  </div>
                )}

                {!carregandoMsgs && mensagens.length === 0 && (
                  <div style={{ alignSelf: 'center', margin: 'auto', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    Nenhuma mensagem registrada nesta conversa.
                  </div>
                )}

                {mensagens.map((m) => (
                  <div
                    key={m.id}
                    style={{
                      maxWidth: '75%',
                      alignSelf: m.fromMe ? 'flex-end' : 'flex-start',
                      background: m.fromMe ? 'var(--brand-gradient)' : 'var(--panel-bg-2)',
                      color: m.fromMe ? '#fff' : 'var(--text-primary)',
                      border: m.fromMe ? 'none' : '1px solid var(--panel-border)',
                      padding: '10px 14px',
                      borderRadius: m.fromMe ? '16px 16px 3px 16px' : '16px 16px 16px 3px',
                      fontSize: '0.9rem',
                      lineHeight: 1.45,
                    }}
                  >
                    <div>{m.texto}</div>
                    <div
                      style={{
                        fontSize: '0.65rem',
                        opacity: 0.8,
                        textAlign: 'right',
                        marginTop: 4,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'flex-end',
                        gap: 4,
                      }}
                    >
                      {new Date(m.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      {m.fromMe && <CheckCheck size={13} />}
                    </div>
                  </div>
                ))}
                <div ref={fimRef} />
              </div>

              {/* Form de Envio */}
              <form
                onSubmit={enviarResposta}
                style={{
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '12px 18px',
                  borderTop: '1px solid var(--panel-border)',
                  background: 'var(--panel-bg-2)',
                }}
              >
                <input
                  className="input-field"
                  style={{
                    flex: 1,
                    borderRadius: 24,
                    padding: '0.65rem 1.1rem',
                    fontSize: '0.9rem',
                    background: '#fff',
                  }}
                  placeholder="Digite sua resposta para o comprador na OLX…"
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                />
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{
                    borderRadius: '50%',
                    width: 42,
                    height: 42,
                    padding: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
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
    </div>
  );
};
