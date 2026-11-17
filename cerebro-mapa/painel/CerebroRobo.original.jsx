import { useCallback, useEffect, useMemo, useState } from 'react';
import { Brain, Check, X, Play, RefreshCw, Trash2, Pencil, Send } from 'lucide-react';
import { api } from '../atendimento/api';
import './FluxoAtendimento.css';

// CEREBRO DO ROBO (22/10): o dono ensina o robo ("quando o cliente X, faca Y"), testa, e aprova as correcoes que a
// revisao diaria das conversas sugere. O robo so muda com aprovacao — nada se ensina sozinho.
const ACOES = {
  responder: 'Responder com este texto',
  atendente: 'Passar pra atendente ("só um instante" + etiqueta)',
  silencio: 'Não responder',
  orientar: 'Orientar a IA (ela escreve seguindo a orientação)',
};
const COR_GRAVIDADE = { alta: '#E8252C', media: '#d9892a', baixa: '#8b94a8' };
const TIPOS = {
  preco: 'Preço', repetiu_pergunta: 'Perguntou de novo', nao_entendeu: 'Não entendeu', contradisse_atendente: 'Contradisse a atendente',
  atropelou_atendente: 'Atropelou a atendente', inventou: 'Inventou', fora_de_contexto: 'Fora de contexto', sem_resposta: 'Sem resposta',
  nao_era_cliente: 'Não era cliente', outro: 'Outro',
};
const dataBR = (iso) => (iso ? iso.split('-').reverse().join('/') : '');
const vazio = { situacao: '', acao: 'responder', resposta: '', lojas: [], ativo: true };

function FormLicao({ valor, onChange, lojas, compacto }) {
  const v = valor || vazio;
  const set = (campo, x) => onChange({ ...v, [campo]: x });
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <label className="muted-hint" style={{ margin: 0 }}>Quando o cliente…
        <textarea className="input-field" rows={compacto ? 2 : 2} value={v.situacao} onChange={(e) => set('situacao', e.target.value)} placeholder="ex.: perguntar se a gente entrega o pneu em casa" />
      </label>
      <label className="muted-hint" style={{ margin: 0 }}>O robô deve…
        <select className="input-field" value={v.acao} onChange={(e) => set('acao', e.target.value)}>
          {Object.entries(ACOES).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
        </select>
      </label>
      {v.acao === 'responder' && /R\$\s?\d|\d{3}\/\d{2}/.test(v.resposta || '') && (
        <div className="muted-hint" style={{ margin: 0, color: '#d9892a' }}>
          ⚠️ Esse texto tem preço ou medida. Texto fixo vai igual pra todo cliente — se depende da medida, escolha “Orientar a IA” (ela calcula pela tabela).
        </div>
      )}
      {(v.acao === 'responder' || v.acao === 'orientar') && (
        <label className="muted-hint" style={{ margin: 0 }}>{v.acao === 'responder' ? 'Texto que o robô manda (linha em branco = outra mensagem)' : 'Orientação pra IA'}
          <textarea className="input-field" rows={compacto ? 3 : 4} value={v.resposta} onChange={(e) => set('resposta', e.target.value)}
            placeholder={v.acao === 'responder' ? 'ex.: A gente não faz entrega, mas a montagem aqui na loja é grátis e rapidinha 😊' : 'ex.: diga que não fazemos entrega e convide pra vir na loja, sem prometer prazo'} />
        </label>
      )}
      {lojas?.length > 1 && (
        <div className="muted-hint" style={{ margin: 0, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          Vale para:
          <label><input type="checkbox" checked={!v.lojas?.length} onChange={() => set('lojas', [])} /> todas as lojas</label>
          {lojas.map((l) => (
            <label key={l.id}><input type="checkbox" checked={!!v.lojas?.includes(l.id)} onChange={(e) => set('lojas', e.target.checked ? [...(v.lojas || []), l.id] : (v.lojas || []).filter((x) => x !== l.id))} /> {l.nome}</label>
          ))}
        </div>
      )}
    </div>
  );
}

function Bolhas({ partes }) {
  if (!partes?.length) return <div className="muted-hint">(o robô não manda nada)</div>;
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      {partes.map((p, i) => (
        <div key={i} style={{ justifySelf: 'end', maxWidth: '85%', background: '#144d37', color: '#e9f5ef', padding: '8px 12px', borderRadius: 10, whiteSpace: 'pre-wrap', fontSize: '0.9rem' }}>{p}</div>
      ))}
    </div>
  );
}

function Testar({ lojas, rascunho }) {
  const [msg, setMsg] = useState('');
  const [lojaId, setLojaId] = useState(lojas?.[0]?.id || '');
  const [res, setRes] = useState(null);
  const [rodando, setRodando] = useState(false);
  const [erro, setErro] = useState('');
  const testar = async () => {
    setRodando(true); setErro(''); setRes(null);
    try { setRes(await api('/api/cerebro/testar', { method: 'POST', body: JSON.stringify({ mensagem: msg, lojaId }) })); }
    catch (e) { setErro(e.message); }
    setRodando(false);
  };
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input className="input-field" style={{ flex: 1, minWidth: 220 }} value={msg} onChange={(e) => setMsg(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && msg.trim() && testar()} placeholder="Escreva como se fosse o cliente: ex. vocês entregam em casa?" />
        {lojas?.length > 1 && (
          <select className="input-field" style={{ width: 'auto' }} value={lojaId} onChange={(e) => setLojaId(e.target.value)}>
            {lojas.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
          </select>
        )}
        <button type="button" className="btn btn-primary" disabled={!msg.trim() || rodando} onClick={testar}><Send size={14} /> {rodando ? 'Pensando…' : 'Testar'}</button>
      </div>
      {rascunho && <div className="muted-hint" style={{ margin: 0 }}>Salve o ensinamento antes de testar — o teste usa o que já está salvo.</div>}
      {erro && <div className="muted-hint" style={{ color: '#E8252C', margin: 0 }}>{erro}</div>}
      {res && (
        <div style={{ background: 'var(--panel-bg, #0f1520)', border: '1px solid var(--panel-border)', borderRadius: 12, padding: 12, display: 'grid', gap: 8 }}>
          <div className="muted-hint" style={{ margin: 0 }}>
            {res.via === 'cerebro' ? <>Usou o ensinamento: <b>{res.licao?.situacao}</b></> : res.via === 'fluxo' ? 'Respondeu pelo fluxo (texto fixo / tabela)' : 'Respondeu pela IA'}
          </div>
          <Bolhas partes={res.partes} />
          <div className="muted-hint" style={{ margin: 0, fontSize: '0.75rem' }}>Teste: nada foi enviado pra ninguém.</div>
        </div>
      )}
    </div>
  );
}

function Achado({ a, data, lojas, podeEditar, onDecidido }) {
  const [sug, setSug] = useState(a.sugestao || vazio);
  const [aberto, setAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const decidir = async (status) => {
    setSalvando(true); setErro('');
    try { await api(`/api/cerebro/revisoes/${data}/achados/${a.id}`, { method: 'POST', body: JSON.stringify({ status, licao: sug }) }); onDecidido(); }
    catch (e) { setErro(e.message); }
    setSalvando(false);
  };
  return (
    <div className="card" style={{ padding: 14, display: 'grid', gap: 10, borderLeft: `4px solid ${COR_GRAVIDADE[a.gravidade] || '#8b94a8'}` }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span className="badge" style={{ background: 'rgba(232,37,44,0.12)', color: COR_GRAVIDADE[a.gravidade] }}>{TIPOS[a.tipo] || a.tipo}</span>
        <b>{a.cliente || a.numero || a.chatJid}</b>
        <span className="muted-hint" style={{ margin: 0 }}>{a.numero ? `(${a.numero}) ` : ''}· {a.conta}</span>
        {a.status !== 'pendente' && <span className="badge" style={{ marginLeft: 'auto' }}>{a.status === 'aprovado' ? '✓ virou ensinamento' : 'ignorado'}</span>}
      </div>
      <div>{a.resumo}</div>
      {(a.mensagemCliente || a.respostaRobo) && (
        <div style={{ display: 'grid', gap: 4, fontSize: '0.85rem' }}>
          {a.mensagemCliente && <div><span className="muted-hint">Cliente:</span> “{a.mensagemCliente}”</div>}
          {a.respostaRobo && <div><span className="muted-hint">Robô:</span> “{a.respostaRobo}”</div>}
        </div>
      )}
      <button type="button" className="btn btn-secondary" style={{ justifySelf: 'start', padding: '4px 10px', fontSize: '0.78rem' }} onClick={() => setAberto((x) => !x)}>{aberto ? 'Esconder conversa' : 'Ver a conversa'}</button>
      {aberto && <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.78rem', background: 'rgba(255,255,255,0.03)', padding: 10, borderRadius: 8, margin: 0 }}>{(a.trecho || []).join('\n')}</pre>}
      {a.status === 'pendente' && (
        <>
          <div className="muted-hint" style={{ margin: 0, fontWeight: 700 }}>Correção sugerida (pode ajustar antes de aprovar):</div>
          <FormLicao valor={sug} onChange={setSug} lojas={lojas} compacto />
          {erro && <div className="muted-hint" style={{ color: '#E8252C', margin: 0 }}>{erro}</div>}
          {podeEditar && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn btn-primary" disabled={salvando} onClick={() => decidir('aprovado')}><Check size={14} /> Aprovar e ensinar o robô</button>
              <button type="button" className="btn btn-secondary" disabled={salvando} onClick={() => decidir('ignorado')}><X size={14} /> Ignorar</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export const CerebroRobo = () => {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState('');
  const [aba, setAba] = useState('revisao');
  const [dataRev, setDataRev] = useState('');
  const [rev, setRev] = useState(null);
  const [soPendentes, setSoPendentes] = useState(true);
  const [nova, setNova] = useState(vazio);
  const [editando, setEditando] = useState(null);
  const [msg, setMsg] = useState('');

  const carregar = useCallback(() => api('/api/cerebro/resumo').then((d) => { setDados(d); setErro(''); setDataRev((x) => x || d.revisoes?.[0]?.data || ''); }).catch((e) => setErro(e.message)), []);
  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => { if (!dados?.rodando) return undefined; const t = setInterval(carregar, 15000); return () => clearInterval(t); }, [dados?.rodando, carregar]);
  const carregarRev = useCallback(() => { if (!dataRev) { setRev(null); return; } api(`/api/cerebro/revisoes/${dataRev}`).then(setRev).catch(() => setRev(null)); }, [dataRev]);
  useEffect(() => { carregarRev(); }, [carregarRev, dados?.rodando]);

  const podeEditar = true; // a API recusa quem nao e administrador
  const lojas = dados?.lojas || [];
  const ativas = (dados?.licoes || []).filter((l) => l.ativo).length;
  const pendentesHoje = dados?.revisoes?.[0]?.pendentes || 0;
  const achados = useMemo(() => (rev?.achados || []).filter((a) => !soPendentes || a.status === 'pendente'), [rev, soPendentes]);

  const revisarAgora = async () => {
    setMsg('');
    try { await api('/api/cerebro/revisar', { method: 'POST', body: JSON.stringify({}) }); setMsg('Revisão começou — leva alguns minutos. A tela atualiza sozinha.'); carregar(); }
    catch (e) { setMsg(e.message); }
  };
  const salvarNova = async () => {
    setMsg('');
    try { await api('/api/cerebro/licoes', { method: 'POST', body: JSON.stringify(nova) }); setNova(vazio); setMsg('Ensinado! Já vale na próxima mensagem.'); carregar(); }
    catch (e) { setMsg(e.message); }
  };
  const salvarEdicao = async () => {
    try { await api(`/api/cerebro/licoes/${editando.id}`, { method: 'PUT', body: JSON.stringify(editando) }); setEditando(null); carregar(); }
    catch (e) { setMsg(e.message); }
  };
  const alternar = async (l) => { await api(`/api/cerebro/licoes/${l.id}`, { method: 'PUT', body: JSON.stringify({ ...l, ativo: !l.ativo }) }).catch((e) => setMsg(e.message)); carregar(); };
  const excluir = async (l) => { if (!window.confirm('Apagar esse ensinamento?')) return; await api(`/api/cerebro/licoes/${l.id}`, { method: 'DELETE' }).catch((e) => setMsg(e.message)); carregar(); };

  if (erro) return <div className="card"><div className="empty-state">{erro}</div></div>;
  if (!dados) return <div className="card"><p className="muted-hint">Carregando o cérebro do robô…</p></div>;

  return (
    <div className="animate-fade-in" style={{ display: 'grid', gap: 16 }}>
      <div className="card" style={{ display: 'grid', gap: 10 }}>
        <h3 style={{ margin: 0 }}><Brain size={20} style={{ verticalAlign: -4, marginRight: 8, color: '#d9892a' }} />Cérebro do robô</h3>
        <p className="muted-hint" style={{ margin: 0 }}>
          Todo dia, de noite, o robô relê as conversas do dia e aponta onde errou, já com a correção sugerida. Você aprova (ou ajusta) e ele aprende.
          Você também pode ensinar direto: "quando o cliente…, faça…". Ele só muda com a sua aprovação.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <span className="badge">{ativas} ensinamento{ativas === 1 ? '' : 's'} ativo{ativas === 1 ? '' : 's'}</span>
          {dados.revisoes?.[0] && <span className="badge" style={{ background: 'rgba(217,137,42,0.15)', color: '#d9892a' }}>{pendentesHoje} correç{pendentesHoje === 1 ? 'ão' : 'ões'} pra revisar ({dataBR(dados.revisoes[0].data)})</span>}
          {dados.rodando
            ? <span className="badge" style={{ background: 'rgba(29,158,94,0.14)', color: 'var(--success-color)' }}><RefreshCw size={12} style={{ verticalAlign: -2 }} /> revisando as conversas de {dataBR(dados.rodando.data)}…</span>
            : <button type="button" className="btn btn-secondary" onClick={revisarAgora}><Play size={14} /> Revisar as conversas de hoje agora</button>}
        </div>
        {msg && <div className="muted-hint" style={{ margin: 0 }}>{msg}</div>}
      </div>

      <div className="fx-abas" role="tablist">
        <button type="button" className={`fx-aba ${aba === 'revisao' ? 'fx-aba-ativa' : ''}`} onClick={() => setAba('revisao')}>O que errou (revisão diária)</button>
        <button type="button" className={`fx-aba ${aba === 'ensinar' ? 'fx-aba-ativa' : ''}`} onClick={() => setAba('ensinar')}>Ensinamentos</button>
        <button type="button" className={`fx-aba ${aba === 'testar' ? 'fx-aba-ativa' : ''}`} onClick={() => setAba('testar')}>Testar o robô</button>
      </div>

      {aba === 'revisao' && (
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <select className="input-field" style={{ width: 'auto' }} value={dataRev} onChange={(e) => setDataRev(e.target.value)}>
              {(dados.revisoes || []).map((r) => <option key={r.data} value={r.data}>{dataBR(r.data)} — {r.pendentes} pendente(s) de {r.achados}</option>)}
            </select>
            <label className="muted-hint" style={{ margin: 0 }}><input type="checkbox" checked={soPendentes} onChange={(e) => setSoPendentes(e.target.checked)} /> só pendentes</label>
            {rev && <span className="muted-hint" style={{ margin: 0 }}>{rev.analisadas} conversas lidas</span>}
          </div>
          {!dados.revisoes?.length && <div className="card"><div className="empty-state">Ainda não tem revisão. Clique em “Revisar as conversas de hoje agora”.</div></div>}
          {rev && !achados.length && <div className="card"><div className="empty-state">Nada pendente nesse dia. 👍</div></div>}
          {achados.map((a) => <Achado key={a.id} a={a} data={dataRev} lojas={lojas} podeEditar={podeEditar} onDecidido={() => { carregarRev(); carregar(); }} />)}
        </div>
      )}

      {aba === 'ensinar' && (
        <div style={{ display: 'grid', gap: 12 }}>
          <div className="card" style={{ display: 'grid', gap: 10 }}>
            <h4 style={{ margin: 0 }}>Ensinar o robô</h4>
            <FormLicao valor={nova} onChange={setNova} lojas={lojas} />
            <button type="button" className="btn btn-primary" style={{ justifySelf: 'start' }} onClick={salvarNova}><Check size={14} /> Salvar ensinamento</button>
          </div>
          {(dados.licoes || []).length === 0 && <div className="card"><div className="empty-state">Nenhum ensinamento ainda.</div></div>}
          {(dados.licoes || []).map((l) => (
            <div key={l.id} className="card" style={{ padding: 14, display: 'grid', gap: 8, opacity: l.ativo ? 1 : 0.55 }}>
              {editando?.id === l.id ? (
                <>
                  <FormLicao valor={editando} onChange={setEditando} lojas={lojas} />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" className="btn btn-primary" onClick={salvarEdicao}><Check size={14} /> Salvar</button>
                    <button type="button" className="btn btn-secondary" onClick={() => setEditando(null)}>Cancelar</button>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <b style={{ flex: 1 }}>Quando o cliente {l.situacao.replace(/^quando o cliente\s*/i, '')}</b>
                    <span className="badge">{l.origem === 'revisao' ? 'veio da revisão' : 'você ensinou'}</span>
                    <span className="muted-hint" style={{ margin: 0 }}>usado {l.usos || 0}x</span>
                  </div>
                  <div className="muted-hint" style={{ margin: 0 }}>→ {ACOES[l.acao]}{l.lojas?.length ? ` · ${l.lojas.map((id) => lojas.find((x) => x.id === id)?.nome || id).join(', ')}` : ' · todas as lojas'}</div>
                  {l.resposta && <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.9rem' }}>{l.resposta}</div>}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.78rem' }} onClick={() => alternar(l)}>{l.ativo ? 'Desligar' : 'Ligar'}</button>
                    <button type="button" className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.78rem' }} onClick={() => setEditando({ ...l })}><Pencil size={12} /> Editar</button>
                    <button type="button" className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.78rem' }} onClick={() => excluir(l)}><Trash2 size={12} /> Apagar</button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {aba === 'testar' && (
        <div className="card" style={{ display: 'grid', gap: 10 }}>
          <h4 style={{ margin: 0 }}>Testar o robô</h4>
          <p className="muted-hint" style={{ margin: 0 }}>Escreva uma mensagem como se fosse um cliente e veja o que o robô responderia agora, já com os ensinamentos. Não manda nada pra ninguém.</p>
          <Testar lojas={lojas} />
        </div>
      )}
    </div>
  );
};
