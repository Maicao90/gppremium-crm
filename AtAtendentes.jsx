import { useState, useEffect } from 'react';
import { Search, UserPlus, Trash2, Mail, Shield, RefreshCw, AlertTriangle, Pencil, Unplug, CalendarDays, X, KeyRound, Store, Users, Smartphone, Bot } from 'lucide-react';
import { api } from '../atendimento/api';
import { useAppContext } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { ehMaster, MODULOS_GERENTE, MODULOS_VENDEDOR } from '../config/modulos';

// Cores dos status de agendamento (mesma linguagem do painel antigo)
const STATUS_AG = {
  pendente: { label: 'Pendente', bg: 'rgba(217,137,42,0.14)', cor: '#b06f1e' },
  enviado: { label: 'Enviado', bg: 'rgba(29,158,94,0.14)', cor: '#15794a' },
  cancelado: { label: 'Cancelado', bg: 'rgba(139,148,168,0.18)', cor: 'var(--text-secondary)' },
  falhou: { label: 'Falhou', bg: 'rgba(232,37,44,0.12)', cor: 'var(--red-600)' },
  cliente_respondeu: { label: 'Cliente respondeu', bg: 'rgba(30,42,107,0.12)', cor: 'var(--accent-color)' },
  enviando: { label: 'Enviando…', bg: 'rgba(217,137,42,0.14)', cor: '#b06f1e' },
};

// Selo de papel do usuário na lista. Antes só existia ADMIN vs VENDEDOR — o gerente
// caía no "VENDEDOR" por engano. Agora cada papel tem seu próprio rótulo/cor.
const SELO_ROLE = {
  master: { txt: 'ADMIN', bg: 'rgba(232,37,44,0.14)', cor: 'var(--accent-2)' },
  admin: { txt: 'ADMIN', bg: 'rgba(232,37,44,0.14)', cor: 'var(--accent-2)' },
  gerente: { txt: 'GERENTE', bg: 'rgba(217,137,42,0.16)', cor: '#c07d1e' },
  operador: { txt: 'VENDEDOR', bg: 'rgba(74,97,201,0.16)', cor: 'var(--accent-color)' },
  mecanico: { txt: 'MECÂNICO', bg: 'rgba(29,158,94,0.16)', cor: '#15794a' },
};

// Mecânico não é um `role` no banco — é um operador cujo acesso é só o app da Garantia
// (módulo garantia50k, sem nenhum módulo de atendimento). Detectar isso aqui é o que
// permite dar a ele o selo certo e NÃO oferecer QR Code (ele não atende WhatsApp).
const lerModulos = (u) => {
  const v = u?.modulosPermitidos;
  if (Array.isArray(v)) return v;
  try { const a = JSON.parse(v || '[]'); return Array.isArray(a) ? a : []; } catch { return []; }
};
export const ehMecanico = (u) => {
  if (!u || u.role !== 'operador') return false;
  const mods = lerModulos(u);
  return mods.length > 0 && mods.includes('garantia50k') && !mods.some((m) => String(m).startsWith('at-'));
};
const seloRole = (u) => (ehMecanico(u) ? SELO_ROLE.mecanico : (SELO_ROLE[u?.role] || SELO_ROLE.operador));

// Quem NÃO conecta WhatsApp: gestão (gerente/admin/master) e mecânico. Só o VENDEDOR
// lê QR Code / código de pareamento — era o caso de gente aparecendo com opção de ler
// QR sem precisar. Esses aparecem como "Visualizador" em vez de "Desconectado".
const soVisualiza = (u) => ['gerente', 'master', 'admin'].includes(u?.role) || ehMecanico(u);

// PERFIS de cadastro. Cada um já resolve role + módulos sozinho, pra ninguém precisar
// entender a diferença entre "role" e "módulo permitido" pra criar um usuário. Antes
// só existiam Vendedor e Administrador aqui — não dava pra criar gerente nem mecânico
// por esta tela, e o mecânico exigia marcar o módulo garantia50k na mão.
const PERFIS = [
  { id: 'operador', label: 'Vendedor (atende WhatsApp)', role: 'operador', modulos: MODULOS_VENDEDOR,
    hint: 'Atende clientes no WhatsApp. É o único perfil que conecta número (QR Code / código).' },
  { id: 'gerente', label: 'Gerente (gere uma loja)', role: 'gerente', modulos: MODULOS_GERENTE,
    hint: 'Vê métricas, atendentes e conversas da loja dele. Não conecta WhatsApp próprio.' },
  { id: 'mecanico', label: 'Mecânico (app da Garantia)', role: 'operador', modulos: ['garantia50k'],
    hint: 'Usa o aplicativo pra cadastrar garantia e fazer revisão. Não entra no painel nem atende WhatsApp.' },
  { id: 'admin', label: 'Administrador (vê tudo)', role: 'admin', modulos: [],
    hint: 'Acesso total ao painel, todas as lojas.' },
];
// Descobre o perfil de um usuário já cadastrado (pra abrir a edição no item certo).
const perfilDe = (u) => {
  if (['master', 'admin'].includes(u?.role)) return 'admin';
  if (u?.role === 'gerente') return 'gerente';
  if (ehMecanico(u)) return 'mecanico';
  return 'operador';
};

export const AtAtendentes = () => {
  const { data } = useAppContext();
  const { usuario } = useAuth();
  // Só master/admin cadastra atendente. Gerente (e demais) não veem o formulário.
  const podeCadastrar = ehMaster(usuario);
  const lojasPorId = Object.fromEntries((data.stores || []).map((s) => [s.id, s]));
  const [lista, setLista] = useState([]);
  const [busca, setBusca] = useState('');
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [aba, setAba] = useState('equipe');
  const [form, setForm] = useState({ nome: '', email: '', senha: '', perfil: 'operador', lojaId: '' });
  // Loja credenciada na Garantia? Usado pra avisar antes de criar mecânico numa loja
  // que ainda não pode usar o app.
  const lojaCredenciada = (id) => !!lojasPorId[id]?.credenciadaGarantia;
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState('');

  const carregar = async () => {
    setLoading(true); setErro('');
    try { setLista(await api('/api/usuarios')); }
    catch (e) { setErro(e.message || 'Erro ao carregar atendentes.'); }
    setLoading(false);
  };
  useEffect(() => { carregar(); }, []);

  const salvar = async (e) => {
    e.preventDefault();
    setMsg(''); setSalvando(true);
    try {
      const perfil = PERFIS.find((p) => p.id === form.perfil) || PERFIS[0];
      // Gerente e mecânico só fazem sentido amarrados a uma loja (o escopo deles é ela).
      if ((form.perfil === 'gerente' || form.perfil === 'mecanico') && !form.lojaId) {
        setMsg('❌ Escolha a loja — esse perfil precisa estar ligado a uma.');
        setSalvando(false); return;
      }
      // O perfil já define role + módulos: quem cadastra não precisa saber a diferença.
      await api('/api/usuarios/cadastrar', {
        method: 'POST',
        body: JSON.stringify({
          nome: form.nome, email: form.email, senha: form.senha,
          role: perfil.role,
          lojaId: perfil.role === 'admin' ? null : (form.lojaId || null),
          modulosPermitidos: perfil.modulos,
        }),
      });
      setForm({ nome: '', email: '', senha: '', perfil: 'operador', lojaId: '' });
      setMsg('✅ Usuário cadastrado!');
      carregar();
    } catch (err) { setMsg('❌ ' + (err.message || 'Erro ao cadastrar.')); }
    setSalvando(false);
  };

  const excluir = async (u) => {
    if (!window.confirm(`Remover o atendente ${u.nome}?`)) return;
    try { await api(`/api/usuarios/${u.id}`, { method: 'DELETE' }); carregar(); }
    catch (err) { alert(err.message || 'Erro ao remover.'); }
  };

  const [editar, setEditar] = useState(null); // { id, nome, email, senha, role }

  // Modal de agendamentos do atendente (lista completa, mensagem inteira legível)
  const [verAgenda, setVerAgenda] = useState(null); // usuário selecionado
  const [agenda, setAgenda] = useState([]);
  const [agendaLoading, setAgendaLoading] = useState(false);
  const [agendaBusca, setAgendaBusca] = useState('');
  const [agendaStatus, setAgendaStatus] = useState('todos'); // filtro por status (chips)
  const abrirAgenda = async (u) => {
    setVerAgenda(u); setAgenda([]); setAgendaBusca(''); setAgendaStatus('todos'); setAgendaLoading(true);
    try {
      const lista = await api(`/api/agendamentos?criadoPorId=${u.id}`);
      // Mais recentes primeiro
      lista.sort((a, b) => new Date(b.enviarEm) - new Date(a.enviarEm));
      setAgenda(lista);
    } catch (e) { alert(e.message || 'Erro ao carregar agendamentos.'); }
    setAgendaLoading(false);
  };
  // Contagem por status (para os chips do filtro)
  const contagemStatus = agenda.reduce((acc, a) => { acc[a.status] = (acc[a.status] || 0) + 1; return acc; }, {});
  const agendaFiltrada = agenda
    .filter((a) => agendaStatus === 'todos' || a.status === agendaStatus)
    .filter((a) => `${a.cliente} ${a.numero} ${a.mensagem} ${a.status}`.toLowerCase().includes(agendaBusca.toLowerCase().trim()));
  const salvarEdicao = async (e) => {
    e.preventDefault();
    const perfil = PERFIS.find((p) => p.id === editar.perfil) || PERFIS[0];
    if ((editar.perfil === 'gerente' || editar.perfil === 'mecanico') && !editar.lojaId) {
      alert('Escolha a loja — esse perfil precisa estar ligado a uma.');
      return;
    }
    try {
      // Mesma tradução perfil -> role + módulos usada no cadastro, pra edição não
      // desconfigurar o acesso de quem já existe.
      const body = {
        nome: editar.nome, email: editar.email,
        role: perfil.role,
        lojaId: perfil.role === 'admin' ? null : (editar.lojaId || null),
        modulosPermitidos: perfil.modulos,
      };
      if (editar.senha) body.senha = editar.senha;
      await api(`/api/usuarios/${editar.id}`, { method: 'PUT', body: JSON.stringify(body) });
      setEditar(null); carregar();
    } catch (err) { alert(err.message || 'Erro ao salvar.'); }
  };
  const desconectar = async (u) => {
    if (!window.confirm(`Desconectar o WhatsApp de ${u.nome}? Vai precisar ler o QR Code de novo na extensão.`)) return;
    try { await api(`/api/usuarios/${u.id}/desconectar`, { method: 'POST' }); carregar(); alert('WhatsApp desconectado. Gere um novo QR na extensão do atendente.'); }
    catch (err) { alert(err.message || 'Erro ao desconectar.'); }
  };

  const [alterandoBot, setAlterandoBot] = useState('');
  const alternarBot = async (u) => {
    const ativar = !u.botIaAtivo;
    if (ativar && !u.whatsappConectado) {
      alert('Conecte o WhatsApp deste atendente antes de ativar a IA.');
      return;
    }
    if (ativar && !window.confirm(`Ativar o bot de vendas no WhatsApp de ${u.nome}? A recepção automática antiga será desligada para não duplicar respostas.`)) return;
    setAlterandoBot(u.id);
    try {
      const atualizado = await api(`/api/usuarios/${u.id}/bot-ia`, {
        method: 'PUT',
        body: JSON.stringify({ ativo: ativar, pausaManualMin: 120 }),
      });
      setLista((itens) => itens.map((item) => item.id === u.id ? { ...item, ...atualizado } : item));
    } catch (err) {
      alert(err.message || 'Erro ao alterar o bot de atendimento.');
    }
    setAlterandoBot('');
  };

  // Compartilhamento de WhatsApp: este atendente pode "compartilhar" a conexão de
  // outro (mesmo número, sem sessão Baileys própria) em vez de ter conexão própria.
  const alterarCompartilhamento = async (u, novoDonoId) => {
    if (novoDonoId) {
      const dono = lista.find((x) => x.id === novoDonoId);
      if (!window.confirm(`${u.nome} vai passar a compartilhar o WhatsApp de ${dono?.nome || 'outro atendente'}. Isso desconecta qualquer sessão própria que ${u.nome} já tenha. Confirmar?`)) { carregar(); return; }
      try { await api(`/api/usuarios/${u.id}/compartilhar-whatsapp`, { method: 'POST', body: JSON.stringify({ donoId: novoDonoId }) }); carregar(); }
      catch (err) { alert(err.message || 'Erro ao configurar compartilhamento.'); carregar(); }
    } else {
      if (!window.confirm(`Parar de compartilhar? ${u.nome} vai precisar conectar um número próprio do zero (QR ou código).`)) { carregar(); return; }
      try { await api(`/api/usuarios/${u.id}/parar-compartilhar`, { method: 'POST' }); carregar(); }
      catch (err) { alert(err.message || 'Erro ao parar compartilhamento.'); carregar(); }
    }
  };

  // Conexão por CÓDIGO (sem QR): gera 8 dígitos que o atendente digita no WhatsApp.
  const [codigoModal, setCodigoModal] = useState(null); // { u, numero, codigo, loading, erro }
  const abrirCodigo = (u) => setCodigoModal({ u, numero: '', codigo: '', loading: false, erro: '' });
  const gerarCodigo = async () => {
    let num = String(codigoModal.numero || '').replace(/\D/g, '');
    // Aceita FIXO (DDD + 8 dígitos = 10) e CELULAR (DDD + 9 = 11): adiciona o 55 do Brasil.
    if (num.startsWith('0')) num = num.replace(/^0+/, '');
    if (num.length === 10 || num.length === 11) num = '55' + num;
    if (num.length < 12 || num.length > 13) {
      setCodigoModal({ ...codigoModal, erro: 'Número inválido. Digite DDD + número (fixo: 10 dígitos como 6136012020, celular: 11).' });
      return;
    }
    setCodigoModal({ ...codigoModal, loading: true, erro: '', codigo: '' });
    try {
      const r = await api(`/api/usuarios/${codigoModal.u.id}/codigo-pareamento`, { method: 'POST', body: JSON.stringify({ numero: num }) });
      setCodigoModal((m) => ({ ...m, loading: false, codigo: r.codigo }));
    } catch (err) {
      setCodigoModal((m) => ({ ...m, loading: false, erro: err.message || 'Erro ao gerar código.' }));
    }
  };

  const filtrados = lista.filter((u) =>
    `${u.nome} ${u.email}`.toLowerCase().includes(busca.toLowerCase().trim()));

  // Agrupa por loja (ordem alfabética pelo nome da loja), com "Sem loja definida" por último.
  const grupos = (() => {
    const porLoja = {};
    filtrados.forEach((u) => {
      const chave = u.lojaId || '__sem_loja__';
      (porLoja[chave] = porLoja[chave] || []).push(u);
    });
    const chaves = Object.keys(porLoja)
      .filter((k) => k !== '__sem_loja__')
      .sort((a, b) => (lojasPorId[a]?.store_name || '').localeCompare(lojasPorId[b]?.store_name || ''));
    const grupos = chaves.map((k) => ({ chave: k, titulo: lojasPorId[k]?.store_name || 'Loja removida', itens: porLoja[k] }));
    if (porLoja.__sem_loja__) grupos.push({ chave: '__sem_loja__', titulo: 'Sem loja definida', itens: porLoja.__sem_loja__ });
    return grupos;
  })();

  return (
    <div className="animate-fade-in">
      <div className="page-header mb-4">
        <div><h1>Usuários</h1><p className="muted-hint">Quem acessa o painel, o WhatsApp e o aplicativo da Garantia.</p></div>
        <button className="icon-btn" onClick={carregar} title="Atualizar"><RefreshCw size={16} /></button>
      </div>

      {/* Abas: equipe (painel/WhatsApp/app), clientes do app e credenciamento de loja.
          Só o master mexe em cliente do app e credenciamento. */}
      <div className="segmented mb-6">
        <button className={`seg-btn ${aba === 'equipe' ? 'seg-active' : ''}`} onClick={() => setAba('equipe')}><Users size={15} /> Equipe</button>
        {podeCadastrar && <button className={`seg-btn ${aba === 'clientes' ? 'seg-active' : ''}`} onClick={() => setAba('clientes')}><Smartphone size={15} /> Clientes do app</button>}
        {podeCadastrar && <button className={`seg-btn ${aba === 'lojas' ? 'seg-active' : ''}`} onClick={() => setAba('lojas')}><Store size={15} /> Lojas da Garantia</button>}
      </div>

      {aba === 'clientes' && podeCadastrar && <ClientesDoApp />}
      {aba === 'lojas' && podeCadastrar && <LojasDaGarantia />}

      {aba === 'equipe' && (
      <div className={`atendentes-layout ${podeCadastrar ? '' : 'atendentes-solo'}`}>
        <div className="card">
          <h3 className="mb-4">Todos os Usuários</h3>
          <div className="input-wrapper mb-4" style={{ position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input className="input-field" style={{ paddingLeft: 38 }} placeholder="Buscar usuário por nome ou e-mail…" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>
          {erro && <div className="owner-banner mb-4" style={{ background: 'rgba(232,37,44,0.08)', border: '1px solid rgba(232,37,44,0.25)' }}><AlertTriangle size={16} style={{ color: 'var(--danger-color)' }} /><span>{erro}</span></div>}
          {loading ? <p className="muted-hint">Carregando…</p> : filtrados.length === 0 ? (
            <div className="empty-state">Nenhum usuário encontrado.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {grupos.map((g) => (
              <div key={g.chave}>
                <div className="flex items-center gap-2" style={{ marginBottom: 8, color: 'var(--text-secondary)' }}>
                  <Store size={14} />
                  <strong style={{ fontSize: '0.82rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{g.titulo}</strong>
                  <span className="badge" style={{ background: 'rgba(139,148,168,0.15)', color: 'var(--text-muted)' }}>{g.itens.length}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {g.itens.map((u) => (
                <div key={u.id} className="atendente-item">
                  <div className="atendente-info">
                    <div className="entity-avatar" style={{ width: 44, height: 44, borderRadius: '50%', fontWeight: 700, flexShrink: 0 }}>{(u.nome || '?').charAt(0).toUpperCase()}</div>
                    <div style={{ minWidth: 0 }}>
                      <div className="flex items-center gap-2" style={{ flexWrap: 'wrap' }}>
                        <strong style={{ fontSize: '0.98rem' }}>{u.nome}</strong>
                        <span className="badge" style={{ background: seloRole(u).bg, color: seloRole(u).cor, fontSize: '0.58rem' }}>{seloRole(u).txt}</span>
                      </div>
                      <div className="entity-stat-label" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>{u.email}</div>
                    </div>
                  </div>
                  <div className="atendente-acoes">
                    {u.whatsappDonoId ? (
                      <span className="badge" style={{ background: 'rgba(74,97,201,0.14)', color: 'var(--accent-color)' }}>
                        Compartilha WhatsApp com {u.whatsappDonoNome || '—'}
                      </span>
                    ) : soVisualiza(u) ? (
                      <span className="badge" style={{ background: 'rgba(139,148,168,0.15)', color: 'var(--text-muted)' }} title="Perfil de gestão — só visualiza os dados, não atende no WhatsApp">Visualizador</span>
                    ) : (
                      <span className={`badge ${u.whatsappConectado ? 'badge-success' : ''}`} style={u.whatsappConectado ? {} : { background: 'rgba(139,148,168,0.15)', color: 'var(--text-muted)' }}>
                        {u.whatsappConectado ? '● Conectado' : '○ Desconectado'}
                      </span>
                    )}
                    {podeCadastrar && !u.whatsappDonoId && !soVisualiza(u) && (
                      <button
                        className={`btn ${u.botIaAtivo ? 'btn-primary' : 'btn-secondary'}`}
                        style={{ padding: '5px 9px', fontSize: '0.72rem', display: 'inline-flex', alignItems: 'center', gap: 5 }}
                        onClick={() => alternarBot(u)}
                        disabled={alterandoBot === u.id || (!u.whatsappConectado && !u.botIaAtivo)}
                        title={u.botIaAtivo ? 'Desativar o bot neste número' : 'Ativar o bot somente neste número'}
                      >
                        <Bot size={13} /> {alterandoBot === u.id ? 'Alterando…' : u.botIaAtivo ? 'IA ativa' : 'Ativar IA'}
                      </button>
                    )}
                    {!u.whatsappDonoId && !u.whatsappConectado && !soVisualiza(u) && <button className="icon-btn" onClick={() => abrirCodigo(u)} title="Conectar WhatsApp por código (sem QR)"><KeyRound size={15} /></button>}
                    <button className="icon-btn" onClick={() => abrirAgenda(u)} title="Ver agendamentos"><CalendarDays size={15} /></button>
                    <button className="icon-btn" onClick={() => setEditar({ id: u.id, nome: u.nome, email: u.email, senha: '', perfil: perfilDe(u), lojaId: u.lojaId || '' })} title="Editar"><Pencil size={15} /></button>
                    {!u.whatsappDonoId && !soVisualiza(u) && <button className="icon-btn" onClick={() => desconectar(u)} title="Desconectar WhatsApp"><Unplug size={15} /></button>}
                    <button className="icon-btn icon-btn-danger" onClick={() => excluir(u)} title="Remover"><Trash2 size={15} /></button>
                  </div>
                </div>
                  ))}
                </div>
              </div>
              ))}
            </div>
          )}
        </div>

        {podeCadastrar && (
        <form className="card" onSubmit={salvar}>
          <h3 className="mb-4"><UserPlus size={18} style={{ verticalAlign: -3, marginRight: 6, color: 'var(--red)' }} />Cadastrar Usuário</h3>
          <div className="form-group"><label className="form-label">Nome completo</label><input className="input-field" required placeholder="Ex: João Silva" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></div>
          <div className="form-group mt-4"><label className="form-label"><Mail size={13} style={{ verticalAlign: -2 }} /> E-mail de login</label><input className="input-field" type="email" required placeholder="vendedor@crm.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div className="form-group mt-4"><label className="form-label">Senha de acesso</label><input className="input-field" type="password" required placeholder="Senha forte" value={form.senha} onChange={(e) => setForm({ ...form, senha: e.target.value })} /></div>
          <div className="form-group mt-4"><label className="form-label"><Shield size={13} style={{ verticalAlign: -2 }} /> Nível de permissão</label>
            <select className="input-field" value={form.perfil} onChange={(e) => setForm({ ...form, perfil: e.target.value })}>
              {PERFIS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
            <span className="form-hint">{PERFIS.find((p) => p.id === form.perfil)?.hint}</span>
          </div>
          <div className="form-group mt-4"><label className="form-label"><Store size={13} style={{ verticalAlign: -2 }} /> Loja</label>
            <select className="input-field" value={form.lojaId} onChange={(e) => setForm({ ...form, lojaId: e.target.value })}>
              <option value="">Sem loja definida</option>
              {(data.stores || []).map((s) => <option key={s.id} value={s.id}>{s.store_name}</option>)}
            </select>
            <span className="form-hint">
              {form.perfil === 'gerente' ? 'Obrigatória: o gerente só enxerga os dados desta loja.'
                : form.perfil === 'mecanico' ? 'Obrigatória: o mecânico só cadastra garantia pela loja dele — e ela precisa estar credenciada.'
                : 'Serve pra organizar a lista e separar a Caixa de Entrada por loja.'}
            </span>
          </div>
          {/* Aviso que evita o erro silencioso: mecânico de loja NÃO credenciada instala
              o app, faz login e só descobre que não pode cadastrar na hora de usar. */}
          {form.perfil === 'mecanico' && form.lojaId && !lojaCredenciada(form.lojaId) && (
            <div className="owner-banner mt-4" style={{ background: 'rgba(217,137,42,0.10)', border: '1px solid rgba(217,137,42,0.32)' }}>
              <AlertTriangle size={15} style={{ color: 'var(--warning-color)', flexShrink: 0 }} />
              <span style={{ fontSize: '0.82rem' }}>Esta loja <strong>não está credenciada</strong> na Garantia 50k. O mecânico vai conseguir entrar no app, mas não vai conseguir cadastrar garantia nem revisão. Credencie na aba <strong>Lojas da Garantia</strong>.</span>
            </div>
          )}
          <button className="btn btn-primary mt-6" style={{ width: '100%' }} disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar usuário'}</button>
          {msg && <p className="muted-hint mt-4" style={{ textAlign: 'center' }}>{msg}</p>}
        </form>
        )}
      </div>
      )}

      {/* Modal: conectar WhatsApp por CÓDIGO (sem QR) */}
      {codigoModal && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setCodigoModal(null); }}>
          <div className="modal card" style={{ maxWidth: 440 }}>
            <div className="modal-header">
              <h2 style={{ margin: 0 }}><KeyRound size={19} style={{ verticalAlign: -3, marginRight: 8, color: 'var(--red)' }} />Conectar {codigoModal.u.nome} por código</h2>
              <button className="icon-btn" onClick={() => setCodigoModal(null)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              {!codigoModal.codigo ? (
                <>
                  <p className="muted-hint" style={{ margin: 0 }}>Sem QR Code. Digite o número do WhatsApp do atendente (com DDD) e gere um código de 8 dígitos.</p>
                  <div className="form-group">
                    <label className="form-label">Número do WhatsApp (com DDD)</label>
                    <input className="input-field" placeholder="Fixo: 6136012020 · Celular: 61999998888" value={codigoModal.numero} onChange={(e) => setCodigoModal({ ...codigoModal, numero: e.target.value })} />
                    <span className="form-hint">Digite DDD + número, exatamente o número onde o WhatsApp da pessoa está. Serve fixo (WhatsApp Business) ou celular — o 55 do Brasil é adicionado sozinho.</span>
                  </div>
                  {codigoModal.erro && <p style={{ color: 'var(--danger-color)', fontSize: '0.82rem', margin: 0 }}>{codigoModal.erro}</p>}
                </>
              ) : (
                <>
                  <p className="muted-hint" style={{ margin: 0 }}>No celular do atendente, abra o <strong>WhatsApp → Aparelhos conectados → Conectar um aparelho → Conectar com número de telefone</strong> e digite:</p>
                  <div style={{ textAlign: 'center', fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 700, letterSpacing: '0.35rem', color: 'var(--navy)', background: 'var(--panel-bg-2)', border: '1px dashed var(--panel-border-strong)', borderRadius: 12, padding: '1rem' }}>
                    {codigoModal.codigo}
                  </div>
                  <p className="form-hint" style={{ margin: 0 }}>O código vale por poucos minutos. Assim que ela digitar, o WhatsApp conecta e o painel fica verde.</p>
                </>
              )}
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setCodigoModal(null)}>Fechar</button>
              {!codigoModal.codigo && <button type="button" className="btn btn-primary" onClick={gerarCodigo} disabled={codigoModal.loading}>{codigoModal.loading ? 'Gerando…' : 'Gerar código'}</button>}
            </div>
          </div>
        </div>
      )}

      {/* Modal: TODOS os agendamentos do atendente, com a mensagem completa legível */}
      {verAgenda && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setVerAgenda(null); }}>
          <div className="modal card" style={{ maxWidth: 640 }}>
            <div className="modal-header">
              <div>
                <h2 style={{ margin: 0 }}><CalendarDays size={19} style={{ verticalAlign: -3, marginRight: 8, color: 'var(--red)' }} />Agendamentos de {verAgenda.nome}</h2>
                <p className="muted-hint" style={{ margin: '4px 0 0' }}>{agenda.length} agendamento(s) no total</p>
              </div>
              <button className="icon-btn" onClick={() => setVerAgenda(null)} title="Fechar"><X size={18} /></button>
            </div>
            <div className="modal-body">
              {/* Chips de filtro por status — separa Pendentes / Enviados / etc. */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button type="button" className={`seg-btn ${agendaStatus === 'todos' ? 'seg-active' : ''}`} style={{ border: '1px solid var(--panel-border)', borderRadius: 999, padding: '0.32rem 0.8rem', fontSize: '0.78rem' }} onClick={() => setAgendaStatus('todos')}>
                  Todos ({agenda.length})
                </button>
                {Object.entries(STATUS_AG).filter(([k]) => contagemStatus[k]).map(([k, st]) => (
                  <button key={k} type="button" className={`seg-btn ${agendaStatus === k ? 'seg-active' : ''}`} style={{ border: '1px solid var(--panel-border)', borderRadius: 999, padding: '0.32rem 0.8rem', fontSize: '0.78rem' }} onClick={() => setAgendaStatus(agendaStatus === k ? 'todos' : k)}>
                    {st.label} ({contagemStatus[k]})
                  </button>
                ))}
              </div>
              <input className="input-field" placeholder="Filtrar por cliente, número ou mensagem…" value={agendaBusca} onChange={(e) => setAgendaBusca(e.target.value)} />
              {agendaLoading ? <p className="muted-hint">Carregando…</p> : agendaFiltrada.length === 0 ? (
                <p className="muted-hint">Nenhum agendamento{agendaBusca ? ' com esse filtro' : ''}.</p>
              ) : (
                agendaFiltrada.map((a) => {
                  const st = STATUS_AG[a.status] || { label: a.status, bg: 'var(--panel-bg-2)', cor: 'var(--text-secondary)' };
                  return (
                    <div key={a.id} style={{ border: '1px solid var(--panel-border)', borderRadius: 12, padding: '0.85rem 1rem', background: 'var(--panel-bg-2)' }}>
                      <div className="flex items-center justify-between" style={{ gap: 8, flexWrap: 'wrap' }}>
                        <strong style={{ fontSize: '0.92rem' }}>{a.cliente || a.numero}</strong>
                        <span className="badge" style={{ background: st.bg, color: st.cor }}>{st.label}</span>
                      </div>
                      <div className="entity-stat-label" style={{ marginTop: 2 }}>
                        {a.numero} · enviar em {new Date(a.enviarEm).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </div>
                      <div style={{ marginTop: 8, fontSize: '0.9rem', color: 'var(--text-primary)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{a.mensagem}</div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {editar && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setEditar(null); }}>
          <form className="modal card" style={{ maxWidth: 420 }} onSubmit={salvarEdicao}>
            <div className="modal-header"><h2>Editar Usuário</h2></div>
            <div className="modal-body">
              <div className="form-group"><label className="form-label">Nome completo</label><input className="input-field" required value={editar.nome} onChange={(e) => setEditar({ ...editar, nome: e.target.value })} /></div>
              <div className="form-group"><label className="form-label">E-mail de login</label><input className="input-field" type="email" required value={editar.email} onChange={(e) => setEditar({ ...editar, email: e.target.value })} /></div>
              <div className="form-group"><label className="form-label">Senha de acesso</label><input className="input-field" type="text" required placeholder="defina a senha do usuário" value={editar.senha} onChange={(e) => setEditar({ ...editar, senha: e.target.value })} /><span className="form-hint">Confirme ou redefina a senha que ele usa pra entrar.</span></div>
              <div className="form-group"><label className="form-label">Nível de permissão</label>
                <select className="input-field" value={editar.perfil} onChange={(e) => setEditar({ ...editar, perfil: e.target.value })}>
                  {PERFIS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                </select>
                <span className="form-hint">{PERFIS.find((p) => p.id === editar.perfil)?.hint}</span>
              </div>
              <div className="form-group"><label className="form-label"><Store size={13} style={{ verticalAlign: -2 }} /> Loja</label>
                <select className="input-field" value={editar.lojaId} onChange={(e) => setEditar({ ...editar, lojaId: e.target.value })}>
                  <option value="">Sem loja definida</option>
                  {(data.stores || []).map((s) => <option key={s.id} value={s.id}>{s.store_name}</option>)}
                </select>
                <span className="form-hint">
                  {editar.perfil === 'gerente' ? 'Obrigatória: o gerente só enxerga esta loja.'
                    : editar.perfil === 'mecanico' ? 'Obrigatória: e a loja precisa estar credenciada na Garantia.'
                    : 'Organiza a lista e separa a Caixa de Entrada por loja.'}
                </span>
              </div>
              {editar.perfil === 'mecanico' && editar.lojaId && !lojaCredenciada(editar.lojaId) && (
                <div className="owner-banner" style={{ background: 'rgba(217,137,42,0.10)', border: '1px solid rgba(217,137,42,0.32)' }}>
                  <AlertTriangle size={15} style={{ color: 'var(--warning-color)', flexShrink: 0 }} />
                  <span style={{ fontSize: '0.8rem' }}>Loja <strong>não credenciada</strong> na Garantia 50k — o mecânico entra no app mas não consegue cadastrar.</span>
                </div>
              )}
              <div className="form-group">
                <label className="form-label">WhatsApp deste atendente</label>
                <select
                  className="input-field"
                  value={(lista.find((x) => x.id === editar.id)?.whatsappDonoId) || ''}
                  onChange={(e) => { const u = lista.find((x) => x.id === editar.id); if (u) alterarCompartilhamento(u, e.target.value || null); }}
                >
                  <option value="">Nenhum (tem número próprio)</option>
                  {lista.filter((x) => x.id !== editar.id && !x.whatsappDonoId).map((x) => (
                    <option key={x.id} value={x.id}>Compartilha o WhatsApp de {x.nome}</option>
                  ))}
                </select>
                <span className="form-hint">Use quando 2+ atendentes precisam falar pelo MESMO número de WhatsApp. Muda na hora (desconecta a sessão própria se houver).</span>
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setEditar(null)}>Cancelar</button>
              <button type="submit" className="btn btn-primary">Salvar</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// ABA: CLIENTES DO APP
// Os clientes da Garantia moram numa tabela própria (login por CPF, separado dos
// usuários do painel) e até agora eram INVISÍVEIS aqui — não dava pra saber quem já
// criou senha, quem instalou o app, nem ajudar quem esqueceu a senha.
// ─────────────────────────────────────────────────────────────────────────────
const fmtCPF = (d) => {
  const s = String(d || '').replace(/\D/g, '').slice(0, 11);
  return s.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
};

const ClientesDoApp = () => {
  const [lista, setLista] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [busca, setBusca] = useState('');

  const carregar = async () => {
    setLoading(true);
    try { setLista(await api('/api/garantia/clientes')); setErro(''); }
    catch (e) { setErro(e.message || 'Erro ao carregar clientes.'); }
    setLoading(false);
  };
  useEffect(() => { carregar(); }, []);

  // Não define senha pelo painel: apaga a atual pra o cliente criar a dele no app.
  // Assim ninguém aqui fica sabendo/escolhendo a senha de um cliente.
  const liberarSenha = async (c) => {
    if (!window.confirm(`Liberar nova senha para ${c.nome}?\n\nA senha atual é apagada e ele define uma nova ao entrar no app com o CPF.`)) return;
    try {
      await api(`/api/garantia/clientes/${c.id}/liberar-senha`, { method: 'POST' });
      alert(`Pronto! ${c.nome} já pode abrir o app, digitar o CPF e criar uma senha nova.`);
      carregar();
    } catch (e) { alert(e.message || 'Erro ao liberar.'); }
  };

  const filtrados = lista.filter((c) =>
    `${c.nome} ${c.cpf} ${c.telefone || ''}`.toLowerCase().includes(busca.toLowerCase().trim()));

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4" style={{ gap: 10, flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0 }}>Clientes do aplicativo ({lista.length})</h3>
        <button className="icon-btn" onClick={carregar} title="Atualizar"><RefreshCw size={16} /></button>
      </div>
      <p className="muted-hint mb-4">Quem tem garantia cadastrada e acessa pelo app com CPF. O cadastro nasce quando a loja ativa a garantia — aqui você acompanha e ajuda quem travou no acesso.</p>

      <div className="input-wrapper mb-4" style={{ position: 'relative' }}>
        <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
        <input className="input-field" style={{ paddingLeft: 38 }} placeholder="Buscar por nome, CPF ou telefone…" value={busca} onChange={(e) => setBusca(e.target.value)} />
      </div>

      {erro && <div className="owner-banner mb-4" style={{ background: 'rgba(232,37,44,0.08)', border: '1px solid rgba(232,37,44,0.25)' }}><AlertTriangle size={16} style={{ color: 'var(--danger-color)' }} /><span>{erro}</span></div>}

      {loading ? <p className="muted-hint">Carregando…</p> : filtrados.length === 0 ? (
        <div className="empty-state"><Smartphone size={32} style={{ opacity: 0.5 }} /><p>Nenhum cliente ainda. Eles aparecem aqui quando a loja ativa a primeira garantia.</p></div>
      ) : (
        <div className="table-wrap">
          <table className="data-table cards-mobile">
            <thead><tr><th>Cliente</th><th>Contato</th><th>Garantias</th><th>Acesso ao app</th><th>Ações</th></tr></thead>
            <tbody>
              {filtrados.map((c) => (
                <tr key={c.id}>
                  <td data-label="Cliente">
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{c.nome}</div>
                    <div className="entity-stat-label">CPF {fmtCPF(c.cpf)}</div>
                  </td>
                  <td data-label="Contato">
                    <div>{c.telefone || '—'}</div>
                    <div className="entity-stat-label">{c.email || 'sem e-mail'}</div>
                  </td>
                  <td data-label="Garantias">
                    <strong>{c.garantiasAtivas}</strong> ativa(s)
                    <div className="entity-stat-label">{c.garantias} no total</div>
                  </td>
                  <td data-label="Acesso ao app">
                    {c.temSenha
                      ? <span className="badge badge-success">Senha criada</span>
                      : <span className="badge" style={{ background: 'rgba(217,137,42,0.14)', color: '#b06f1e' }}>Ainda não acessou</span>}
                    <div className="entity-stat-label" style={{ marginTop: 4 }}>
                      {c.appInstalado ? '📱 app instalado (recebe notificação)' : 'sem app instalado'}
                    </div>
                  </td>
                  <td data-label="Ações">
                    {c.temSenha && (
                      <button className="btn gar-btn-mini" onClick={() => liberarSenha(c)} title="O cliente esqueceu a senha? Libera pra ele criar outra no app">
                        <KeyRound size={13} /> Liberar nova senha
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// ABA: LOJAS DA GARANTIA
// Credenciar/descredenciar loja no programa. Antes isso só existia no banco — e uma
// loja não credenciada faz o mecânico dela travar na hora de cadastrar, sem explicação.
// ─────────────────────────────────────────────────────────────────────────────
const LojasDaGarantia = () => {
  const { data, updateStore } = useAppContext();
  const [salvando, setSalvando] = useState('');
  const lojas = [...(data.stores || [])].sort((a, b) => (a.store_name || '').localeCompare(b.store_name || ''));

  const alternar = async (loja) => {
    const novo = !loja.credenciadaGarantia;
    const txt = novo
      ? `Credenciar "${loja.store_name}" na Garantia 50k?\n\nOs mecânicos dela poderão cadastrar garantia e fazer revisão pelo app.`
      : `Descredenciar "${loja.store_name}"?\n\nOs mecânicos dela param de conseguir cadastrar garantia e revisão (as já feitas continuam valendo).`;
    if (!window.confirm(txt)) return;
    setSalvando(loja.id);
    try { await updateStore(loja.id, { credenciadaGarantia: novo }); }
    catch (e) { alert(e.message || 'Erro ao salvar.'); }
    setSalvando('');
  };

  const credenciadas = lojas.filter((l) => l.credenciadaGarantia).length;

  return (
    <div className="card">
      <h3 className="mb-2">Lojas credenciadas na Garantia 50k</h3>
      <p className="muted-hint mb-4">Só loja credenciada pode cadastrar garantia e fazer revisão pelo aplicativo. <strong>{credenciadas}</strong> de {lojas.length} credenciada(s).</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {lojas.map((l) => (
          <div key={l.id} className="atendente-item">
            <div className="atendente-info">
              <div className="entity-avatar" style={{ width: 40, height: 40, borderRadius: 10, flexShrink: 0 }}><Store size={18} /></div>
              <div style={{ minWidth: 0 }}>
                <strong style={{ fontSize: '0.95rem' }}>{l.store_name}</strong>
                <div className="entity-stat-label">{[l.city, l.state].filter(Boolean).join(' - ') || 'sem cidade'}</div>
              </div>
            </div>
            <div className="atendente-acoes">
              {l.credenciadaGarantia
                ? <span className="badge badge-success">✓ Credenciada</span>
                : <span className="badge" style={{ background: 'rgba(139,148,168,0.15)', color: 'var(--text-muted)' }}>Não credenciada</span>}
              <button className="btn gar-btn-mini" disabled={salvando === l.id} onClick={() => alternar(l)}>
                {salvando === l.id ? '…' : l.credenciadaGarantia ? 'Descredenciar' : 'Credenciar'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
