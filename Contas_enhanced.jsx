import { useState, useEffect } from 'react';
import { Wallet, AlertTriangle, TrendingDown, Plug, Zap, Store as StoreIcon, PlusCircle, Calendar, Clock, CheckCircle, X } from 'lucide-react';
import { listContas, real, statusDaConta, registrarDeposito } from '../data/contas';
import { useAppContext } from '../context/AppContext';
import { Stores } from './Stores';

// Leva o usuário direto para Configurações → Conexões de Anúncios (conexão automática real)
function irParaConexoes(setCurrentView) {
  try { localStorage.setItem('gp_settings_aba', 'integracoes'); } catch (e) { /* noop */ }
  setCurrentView('settings');
}

const STATUS_INFO = {
  ok: { label: 'Saudável', cor: 'var(--success-color)', bg: 'rgba(29,158,94,0.12)' },
  acabando: { label: 'Acabando', cor: 'var(--warning-color)', bg: 'rgba(217,137,42,0.14)' },
  esgotado: { label: 'Esgotado', cor: 'var(--danger-color)', bg: 'rgba(232,37,44,0.12)' },
};
const PLATAFORMA = { google: { nome: 'Google Ads', cor: '#1e2a6b' }, meta: { nome: 'Meta Ads', cor: '#e8252c' } };
const ORDEM_PLATAFORMAS = ['meta', 'google'];
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const mesRotulo = (m) => { const [a, mm] = String(m || '').split('-'); return mm ? `${MESES[Number(mm) - 1]} de ${a}` : 'este mês'; };
const totalDepConta = (c) => Number(c.depositoMesAtual?.total || 0);
const depositosConta = (c) => (Array.isArray(c.depositoMesAtual?.depositos) ? c.depositoMesAtual.depositos : []);
const diaMes = (d) => { const p = String(d || '').split('-'); return p.length === 3 ? `${p[2]}/${p[1]}` : String(d || ''); };

export const Contas = () => {
  const { setCurrentView } = useAppContext();
  const [contas, setContas] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modal de Depósito Rápido
  const [modalDepAberto, setModalDepAberto] = useState(false);
  const [contaSelecionada, setContaSelecionada] = useState(null);
  const [depValor, setDepValor] = useState('');
  const [depData, setDepData] = useState(() => new Date().toISOString().slice(0, 10));
  const [salvandoDep, setSalvandoDep] = useState(false);

  const [aba, setAba] = useState(() => {
    try {
      const alvo = localStorage.getItem('gp_contas_aba');
      if (alvo) { localStorage.removeItem('gp_contas_aba'); return alvo; }
    } catch (e) { /* noop */ }
    return 'saldos';
  });

  const recarregar = async () => {
    try {
      const lista = await listContas();
      setContas(lista);
    } catch (e) { console.error(e); }
    setLoading(false);
  };
  useEffect(() => { recarregar(); }, []);

  const abrirModalDeposito = (conta) => {
    setContaSelecionada(conta);
    setDepValor('');
    setDepData(new Date().toISOString().slice(0, 10));
    setModalDepAberto(true);
  };

  const handleSalvarDeposito = async (e) => {
    e.preventDefault();
    if (!contaSelecionada || !depValor || Number(depValor) <= 0) return;
    setSalvandoDep(true);
    try {
      await registrarDeposito(contaSelecionada.id, {
        valor: Number(depValor),
        data: depData
      });
      setModalDepAberto(false);
      await recarregar();
    } catch (err) {
      alert(err.message || 'Erro ao registrar depósito.');
    }
    setSalvandoDep(false);
  };

  const emAlerta = contas.filter((c) => statusDaConta(c) !== 'ok');

  const mesDep = contas.find((c) => c.depositoMesAtual?.mes)?.depositoMesAtual?.mes || '';
  const totalDepMes = contas.reduce((a, c) => a + totalDepConta(c), 0);
  const totalDepPlat = (plat) => contas.filter((c) => c.plataforma === plat).reduce((a, c) => a + totalDepConta(c), 0);

  // ===== Agrupamento por LOJA =====
  const nomeCurtoDe = (c) => String(c.nome || '').replace(/^(Google Ads|Meta Ads)\s*[—-]\s*/i, '').trim();

  const grupos = (() => {
    const mapa = new Map();
    contas.forEach((c) => {
      const chave = c.storeId || nomeCurtoDe(c) || 'Geral';
      if (!mapa.has(chave)) {
        mapa.set(chave, {
          chave,
          titulo: c.storeName || nomeCurtoDe(c) || 'Geral',
          contas: [],
        });
      }
      mapa.get(chave).contas.push(c);
    });
    mapa.forEach((g) => g.contas.sort((a, b) =>
      ORDEM_PLATAFORMAS.indexOf(a.plataforma || 'google') - ORDEM_PLATAFORMAS.indexOf(b.plataforma || 'google')));
    return [...mapa.values()];
  })();

  const blocoConta = (c, comDivisor) => {
    const posPaga = c.conexaoId && Number(c.saldo) <= 0;
    const st = posPaga
      ? { label: 'Pós-paga', cor: 'var(--text-secondary)', bg: 'rgba(139,148,168,0.15)' }
      : STATUS_INFO[statusDaConta(c)];
    const plat = PLATAFORMA[c.plataforma] || PLATAFORMA.google;
    const dias = Number(c.gastoDia) > 0 ? Math.floor(Number(c.saldo) / Number(c.gastoDia)) : null;

    return (
      <div key={c.id} style={comDivisor ? { borderTop: '1px solid var(--panel-border)', paddingTop: '0.9rem', marginTop: '0.9rem' } : undefined}>
        <div className="flex items-center justify-between" style={{ gap: 8, flexWrap: 'wrap' }}>
          <div className="flex items-center" style={{ gap: 8, minWidth: 0 }}>
            <span className="kpi-icon" style={{ background: plat.cor, color: '#fff', width: 30, height: 30, fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{c.plataforma === 'google' ? 'G' : 'M'}</span>
            <strong style={{ fontSize: '0.9rem' }}>{plat.nome}</strong>
            {c.conexaoId && <span className="badge badge-success" style={{ fontSize: '0.58rem', padding: '0.12rem 0.45rem' }} title="Saldo e gasto/dia atualizados automaticamente pela conexão">Automático</span>}
          </div>
          <div className="flex items-center" style={{ gap: 6 }}>
            <span className="badge" style={{ background: st.bg, color: st.cor, flexShrink: 0 }}>{st.label}</span>
            <button
              className="btn btn-outline btn-sm"
              style={{ padding: '0.2rem 0.45rem', fontSize: '0.72rem', display: 'inline-flex', alignItems: 'center', gap: 4 }}
              onClick={() => abrirModalDeposito(c)}
              title="Registrar depósito PIX/Boleto nesta conta"
            >
              <PlusCircle size={12} /> + Depósito
            </button>
          </div>
        </div>

        <div style={{ marginTop: 8 }}>
          <div className="stat-label">{posPaga ? 'Gasto hoje' : 'Saldo atual'}</div>
          <div className="stat-value" style={{ fontSize: '1.55rem', color: posPaga || statusDaConta(c) === 'ok' ? 'var(--text-primary)' : st.cor }}>
            {posPaga ? real(c.gastoDia) : real(c.saldo)}
          </div>
          {posPaga && <span className="kpi-hint">conta no cartão (pós-paga) — a plataforma não informa saldo</span>}
        </div>

        {!posPaga && (
          <div className="entity-stats" style={{ gridTemplateColumns: '1fr 1fr', marginTop: '0.3rem', paddingTop: '0.7rem' }}>
            <div>
              <span className="entity-stat-label"><TrendingDown size={13} /> Gasto hoje</span>
              <strong>{real(c.gastoDia)}</strong>
            </div>
            <div>
              <span className="entity-stat-label"><Clock size={13} /> Previsão</span>
              <strong style={{ color: dias !== null && dias <= 3 ? 'var(--danger-color)' : dias !== null && dias <= 7 ? 'var(--warning-color)' : 'var(--success-color)' }}>
                {dias !== null ? `~${dias} dias` : '—'}
              </strong>
            </div>
          </div>
        )}

        {totalDepConta(c) > 0 && (
          <div className="entity-stats" style={{ gridTemplateColumns: '1fr', marginTop: 0, paddingTop: '0.4rem' }}>
            <div>
              <span className="entity-stat-label"><Wallet size={13} /> Depositado no mês</span>
              <strong style={{ color: 'var(--success-color)' }}>{real(totalDepConta(c))}</strong>
            </div>
          </div>
        )}

        {depositosConta(c).length > 0 && (
          <div style={{ marginTop: '0.4rem', display: 'flex', flexDirection: 'column', gap: 3 }}>
            {depositosConta(c).map((d) => (
              <div key={d.id} className="flex items-center justify-between" style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                <span>📅 {diaMes(d.data)}</span>
                <strong style={{ color: 'var(--success-color)' }}>{real(d.valor)}</strong>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="animate-fade-in">
      <div className="segmented mb-6">
        <button className={`seg-btn ${aba === 'saldos' ? 'seg-active' : ''}`} onClick={() => setAba('saldos')}><Wallet size={15} /> Saldos</button>
        <button className={`seg-btn ${aba === 'lojas' ? 'seg-active' : ''}`} onClick={() => setAba('lojas')}><StoreIcon size={15} /> Lojas</button>
      </div>

      {aba === 'lojas' ? (
        <Stores />
      ) : (
        <>
          <div className="page-header mb-6">
            <div>
              <h1>Saldos das Contas</h1>
              <p className="muted-hint">Saldo restante, previsões e depósitos por loja. Sincronizado com Google Ads e Meta Ads.</p>
            </div>
            <button className="btn btn-primary" onClick={() => irParaConexoes(setCurrentView)}><Zap size={16} /> Conectar conta (Google/Meta)</button>
          </div>

          {loading ? <div className="empty-state">Carregando…</div> : contas.length === 0 ? (
            <div className="empty-state">
              <Plug size={40} style={{ color: 'var(--red)', opacity: 0.8 }} />
              <h3>Nenhuma conta conectada</h3>
              <p>Conecte sua conta do <strong>Google Ads</strong> ou do <strong>Meta</strong> em Configurações → Conexões de Anúncios.</p>
              <button className="btn btn-primary mt-4" onClick={() => irParaConexoes(setCurrentView)}><Zap size={16} /> Conectar conta (Google/Meta)</button>
            </div>
          ) : (
            <>
              {emAlerta.length > 0 && (
                <div className="owner-banner mb-6" style={{ background: 'rgba(232,37,44,0.08)', border: '1px solid rgba(232,37,44,0.25)' }}>
                  <AlertTriangle size={18} style={{ color: 'var(--danger-color)' }} />
                  <span><strong>{emAlerta.length} conta(s)</strong> com saldo acabando — reabasteça para não pausar os anúncios.</span>
                </div>
              )}

              {/* Total Depositado no Mês */}
              <div className="card glass-panel mb-6" style={{ padding: '1.2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                <div>
                  <div className="stat-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Wallet size={15} /> Depositado em anúncios em {mesRotulo(mesDep)}</div>
                  <div className="stat-value" style={{ fontSize: '2rem' }}>{real(totalDepMes)}</div>
                  <span className="kpi-hint">Soma dos depósitos de PIX/Boleto registrados no mês vigente</span>
                </div>
                <div className="flex" style={{ gap: 22 }}>
                  <div style={{ textAlign: 'right' }}>
                    <div className="entity-stat-label" style={{ color: PLATAFORMA.meta.cor }}>Meta Ads</div>
                    <strong style={{ fontSize: '1.1rem' }}>{real(totalDepPlat('meta'))}</strong>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="entity-stat-label" style={{ color: PLATAFORMA.google.cor }}>Google Ads</div>
                    <strong style={{ fontSize: '1.1rem' }}>{real(totalDepPlat('google'))}</strong>
                  </div>
                </div>
              </div>

              {/* Grid das 6 Lojas */}
              <div className="grid grid-cols-3">
                {grupos.map((g) => (
                  <div className="card kpi-card" key={g.chave} style={{ gap: '0.5rem' }}>
                    <strong style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.titulo}</strong>
                    {g.contas.map((c, i) => blocoConta(c, i > 0))}
                  </div>
                ))}
              </div>
            </>
          )}

          <p className="muted-hint mt-6">
            <strong>Tudo automático e sob controle:</strong> o saldo restante e o gasto do dia são monitorados por loja. Utilize o botão <strong>+ Depósito</strong> para registrar entradas de crédito PIX ou Boleto a qualquer momento.
          </p>

          {/* Modal de Registro de Depósito */}
          {modalDepAberto && contaSelecionada && (
            <div className="modal-backdrop">
              <div className="modal card" style={{ maxWidth: 440, width: '90%' }}>
                <div className="flex items-center justify-between mb-4">
                  <h3>Registrar Depósito</h3>
                  <button className="icon-btn" onClick={() => setModalDepAberto(false)}><X size={18} /></button>
                </div>
                <p className="muted-hint mb-4">
                  Adicionando crédito para <strong>{contaSelecionada.nome}</strong>.
                </p>
                <form onSubmit={handleSalvarDeposito}>
                  <div className="form-group mb-4">
                    <label className="form-label">Valor do Depósito (R$)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="1"
                      required
                      className="form-input"
                      placeholder="Ex: 1500.00"
                      value={depValor}
                      onChange={(e) => setDepValor(e.target.value)}
                      autoFocus
                    />
                  </div>
                  <div className="form-group mb-6">
                    <label className="form-label">Data do Depósito</label>
                    <input
                      type="date"
                      required
                      className="form-input"
                      value={depData}
                      onChange={(e) => setDepData(e.target.value)}
                    />
                  </div>
                  <div className="flex justify-end" style={{ gap: 8 }}>
                    <button type="button" className="btn btn-outline" onClick={() => setModalDepAberto(false)}>Cancelar</button>
                    <button type="submit" className="btn btn-primary" disabled={salvandoDep}>
                      {salvandoDep ? 'Salvando…' : 'Salvar Depósito'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
