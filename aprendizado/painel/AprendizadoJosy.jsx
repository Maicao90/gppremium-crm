import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, X, Mic, AlertTriangle, ChevronDown, ChevronUp, MessageSquareText, RefreshCw } from 'lucide-react';
import { api } from '../atendimento/api';
import { API_BASE } from '../apiBase';
import { FormLicao, Bolhas } from './cerebroComum';
import { RE_MARCADOR_AUDIO, avisosPrecoMedida, paragrafos, vazio } from './cerebroConstantes';
import './AprendizadoJosy.css';

// APRENDIZADO DA JOSY (22/10, pedido do dono): trocar a IA livre por respostas FIXAS do jeito que a atendente Josy
// atende, com os audios dela na hora certa. A analise das conversas dela gera propostas (GET /api/cerebro/aprendizado);
// o dono aprova uma a uma (com o audio, so o texto) ou ignora. Nada vale no robo sem aprovacao.
// O mesmo card aparece na aba "Aprendizado da Josy" e no Mapa do cerebro (clicando no losango da proposta).

const MAX_TEXTOS_COM_AUDIO = 4; // o robo pula no maximo 4 mensagens depois do audio
const STATUS = { pendente: 'Esperando você', aprovado: 'Virou ensinamento', ignorado: 'Ignorada' };
const pct = (x) => (x == null || Number.isNaN(Number(x)) ? null : Math.round(Number(x) * 100));
const segundos = (d) => (d ? `${Math.round(Number(d))}s` : '');
const quandoBR = (iso) => { try { return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };
const nomeLigado = (id) => (id ? String(id).replace(/^categoria:/, '').replace(/^etapa:/, 'etapa ').replace(/_/g, ' ') : null);
const corTaxa = (p) => (p == null ? '#64748B' : p >= 60 ? '#34D399' : p >= 40 ? '#F59E0B' : '#F87171');

function AvisoPreco({ onde, tipos }) {
  if (!tipos.length) return null;
  return (
    <div className="aj-alerta" role="alert">
      <AlertTriangle size={15} />
      <span>
        {onde} tem <b>{tipos.join(' e ')}</b>. Resposta fixa vai igual pra todo cliente — preço tem que sair da tabela, nunca de texto ou áudio fixo.
        {onde === 'O texto' ? ' Tire o número ou escolha “Orientar a IA” (ela calcula pela tabela).' : ' Prefira aprovar só o texto.'}
      </span>
    </div>
  );
}

export function CardAprendizado({ p, lojas, noMapa, onDecidido }) {
  const [sug, setSug] = useState(() => ({ ...vazio, ...(p.sugestao || {}), lojas: Array.isArray(p.sugestao?.lojas) ? p.sugestao.lojas : [] }));
  const audios = useMemo(() => (Array.isArray(p.audios) ? p.audios.filter((a) => a?.midia) : []), [p.audios]);
  const [audioSel, setAudioSel] = useState(audios[0]?.midia || null);
  const [verExemplos, setVerExemplos] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');

  const pendente = p.status === 'pendente';
  const taxa = pct(p.taxaSucesso);
  const exemplos = Array.isArray(p.exemplos) ? p.exemplos : [];
  const frases = Array.isArray(p.frasesQueFuncionaram) ? p.frasesQueFuncionaram : [];
  const audio = audios.find((a) => a.midia === audioSel) || null;
  const textos = paragrafos(sug.resposta).filter((x) => !RE_MARCADOR_AUDIO.test(x));
  const avisoTexto = avisosPrecoMedida(sug.resposta);
  const avisoAudio = audio ? avisosPrecoMedida(audio.transcricao) : [];
  // por que o botao do audio esta desligado (mostra embaixo dos botoes)
  const semAudioPorque = !audios.length ? null
    : sug.acao !== 'responder' ? 'Áudio só vai junto quando o robô responde com texto fixo (“Responder com este texto”).'
      : !textos.length ? 'Escreva o texto de reserva: ele vai se o áudio falhar.'
        : textos.length > MAX_TEXTOS_COM_AUDIO ? `Com áudio, no máximo ${MAX_TEXTOS_COM_AUDIO} mensagens de texto de reserva.` : null;

  const decidir = async (decisao, comAudio) => {
    if (decisao === 'aprovar') {
      const riscos = [...(avisoTexto.length && sug.acao === 'responder' ? [`o texto tem ${avisoTexto.join(' e ')}`] : []), ...(comAudio && avisoAudio.length ? [`o áudio fala ${avisoAudio.join(' e ')}`] : [])];
      if (riscos.length && !window.confirm(`Atenção: ${riscos.join(' e ')}. Isso vai igual pra todo cliente, e preço tem que vir da tabela.\n\nAprovar mesmo assim?`)) return;
    }
    setOcupado(true); setErro('');
    try {
      const r = await api(`/api/cerebro/aprendizado/${encodeURIComponent(p.id)}`, {
        method: 'POST', body: JSON.stringify({ decisao, licao: sug, audio: comAudio ? audioSel : null }),
      });
      onDecidido?.(r);
    } catch (e) { setErro(e.message); }
    setOcupado(false);
  };

  return (
    <article className={`aj-card ${noMapa ? 'aj-card-mapa' : 'card'} aj-${p.status}`} aria-label={p.titulo || p.id}>
      <header className="aj-topo">
        <div className="aj-titulo-linha">
          <h4 className="aj-titulo">{p.titulo || p.id}</h4>
          <span className={`aj-selo aj-selo-${p.status}`}>{STATUS[p.status] || p.status}</span>
        </div>
        {p.quando && <p className="aj-quando">{p.quando}</p>}
        <div className="aj-numeros">
          <div><b>{p.frequencia ?? '—'}</b><span>vezes nas conversas</span></div>
          <div>
            <b style={{ color: corTaxa(taxa) }}>{taxa == null ? '—' : `${taxa}%`}</b><span>deu certo</span>
            {taxa != null && <i className="aj-barra"><i style={{ width: `${taxa}%`, background: corTaxa(taxa) }} /></i>}
          </div>
          <div><b>{audios.length}</b><span>áudio{audios.length === 1 ? '' : 's'} dela</span></div>
        </div>
        <p className="aj-dica">
          {p.respondidasPelaLoja ? `${p.respondidasPelaLoja} respondidas pela loja · ` : ''}
          {nomeLigado(p.ligadoA) ? <>liga no mapa em <b>{nomeLigado(p.ligadoA)}</b></> : 'sem bloco escolhido (o mapa liga pelo assunto parecido)'}
        </p>
      </header>

      {p.comoJosyFaz && (
        <section className="aj-bloco">
          <div className="aj-rotulo">Como a Josy faz</div>
          <p className="aj-texto aj-citacao">{p.comoJosyFaz}</p>
        </section>
      )}

      {frases.length > 0 && (
        <section className="aj-bloco">
          <div className="aj-rotulo">Frases que funcionaram</div>
          <ul className="aj-frases">{frases.map((f, i) => <li key={i}>“{f}”</li>)}</ul>
        </section>
      )}

      {exemplos.length > 0 && (
        <section className="aj-bloco">
          <button type="button" className="aj-link" onClick={() => setVerExemplos((x) => !x)} aria-expanded={verExemplos}>
            <MessageSquareText size={14} /> {verExemplos ? 'Esconder' : 'Ver'} {exemplos.length} exemplo{exemplos.length === 1 ? '' : 's'} das conversas {verExemplos ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {verExemplos && (
            <div className="aj-exemplos">
              {exemplos.map((e, i) => (
                <div key={i} className="aj-exemplo">
                  {e.cliente && <div className="aj-msg aj-msg-cliente"><span>Cliente</span>{e.cliente}</div>}
                  {e.loja && <div className="aj-msg aj-msg-loja"><span>Josy</span>{e.loja}</div>}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {audios.length > 0 && (
        <section className="aj-bloco">
          <div className="aj-rotulo">Áudios dela {pendente && audios.length > 1 ? '— escolha qual vai' : ''}</div>
          <div className="aj-audios" role={pendente ? 'radiogroup' : undefined} aria-label="Áudios da Josy">
            {audios.map((a) => {
              const escolhido = pendente ? a.midia === audioSel : a.midia === p.audioEscolhido;
              const avisoA = avisosPrecoMedida(a.transcricao);
              return (
                <div key={a.midia} className={`aj-audio ${escolhido ? 'aj-audio-sel' : ''}`}>
                  <div className="aj-audio-topo">
                    {pendente ? (
                      <label className="aj-audio-escolha">
                        <input type="radio" name={`audio-${p.id}`} checked={a.midia === audioSel} onChange={() => setAudioSel(a.midia)} />
                        <Mic size={14} /> {segundos(a.duracao) || 'áudio'}
                      </label>
                    ) : (
                      <span className="aj-audio-escolha"><Mic size={14} /> {segundos(a.duracao) || 'áudio'}{escolhido ? ' · foi o escolhido' : ''}</span>
                    )}
                    {a.vezesUsado ? <span className="aj-dica">ela usou {a.vezesUsado}x</span> : null}
                    {avisoA.length > 0 && <span className="aj-selo aj-selo-alerta">fala {avisoA.join(' e ')}</span>}
                  </div>
                  <audio controls preload="none" src={`${API_BASE}${a.midia}`} className="aj-player" />
                  {a.transcricao && <p className="aj-texto aj-transcricao">“{a.transcricao}”</p>}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {pendente ? (
        <section className="aj-bloco aj-form">
          <div className="aj-rotulo">Resposta sugerida (pode ajustar antes de aprovar)</div>
          <FormLicao valor={sug} onChange={setSug} lojas={lojas} compacto semAvisoPreco />
          <AvisoPreco onde="O texto" tipos={avisoTexto} />
          {audio && sug.acao === 'responder' && <AvisoPreco onde="O áudio escolhido" tipos={avisoAudio} />}
          {audio && !semAudioPorque && (
            <p className="aj-dica">
              Com áudio, o robô manda o áudio da Josy ({segundos(audio.duracao) || 'áudio'}) no lugar {textos.length === 1 ? 'da mensagem de texto' : `das ${textos.length} mensagens de texto`} acima — elas ficam de reserva se o áudio falhar.
            </p>
          )}
          {erro && <div className="aj-erro">{erro}</div>}
          <div className="aj-botoes">
            {audios.length > 0 && (
              <button type="button" className="btn btn-primary" disabled={ocupado || !!semAudioPorque || !audioSel} onClick={() => decidir('aprovar', true)}>
                <Mic size={14} /> Aprovar com este áudio
              </button>
            )}
            <button type="button" className={`btn ${audios.length ? 'btn-secondary' : 'btn-primary'}`} disabled={ocupado} onClick={() => decidir('aprovar', false)}>
              <Check size={14} /> Aprovar só texto
            </button>
            <button type="button" className="btn btn-secondary aj-ignorar" disabled={ocupado} onClick={() => decidir('ignorar', false)}>
              <X size={14} /> Ignorar
            </button>
          </div>
          {semAudioPorque && <p className="aj-dica">{semAudioPorque}</p>}
        </section>
      ) : (
        <section className="aj-bloco">
          <div className="aj-rotulo">{p.status === 'aprovado' ? 'Virou ensinamento' : 'Ignorada'}</div>
          <p className="aj-dica">
            {p.decididoEm ? `${quandoBR(p.decididoEm)}` : ''}{p.decididoPor ? ` · por ${p.decididoPor}` : ''}
            {p.status === 'aprovado' ? (p.audioEscolhido ? ' · com o áudio da Josy' : ' · só texto') : ''}
          </p>
          {p.status === 'aprovado' && p.respostaAprovada && (
            p.acaoAprovada === 'responder'
              ? <Bolhas partes={paragrafos(p.respostaAprovada)} />
              : <p className="aj-texto aj-citacao">{p.respostaAprovada}</p>
          )}
        </section>
      )}
    </article>
  );
}

export function AprendizadoJosy({ lojas, onMudou }) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState('');
  const [filtro, setFiltro] = useState('pendente');
  const [aviso, setAviso] = useState('');
  const [carregando, setCarregando] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try { setDados(await api('/api/cerebro/aprendizado')); setErro(''); }
    catch (e) { setErro(e.message); }
    setCarregando(false);
  }, []);
  // 1a carga: setState so no retorno da API (nao direto no efeito)
  useEffect(() => {
    let vivo = true;
    api('/api/cerebro/aprendizado').then((d) => { if (vivo) { setDados(d); setErro(''); } }).catch((e) => { if (vivo) setErro(e.message); });
    return () => { vivo = false; };
  }, []);

  const contagem = dados?.contagem || { pendente: 0, aprovado: 0, ignorado: 0, total: 0 };
  const lista = useMemo(() => (dados?.propostas || []).filter((p) => p.status === filtro)
    .sort((a, b) => (b.frequencia || 0) - (a.frequencia || 0)), [dados, filtro]);

  const decidido = (r) => {
    const st = r?.proposta?.status;
    setAviso(st === 'aprovado' ? `“${r.proposta.titulo || r.proposta.id}” virou ensinamento${r.proposta.audioEscolhido ? ' com o áudio da Josy' : ''}. Já vale na próxima mensagem.` : st === 'ignorado' ? 'Proposta ignorada.' : '');
    carregar(); onMudou?.();
  };

  if (erro && !dados) return <div className="card"><div className="empty-state">{erro}</div></div>;
  if (!dados) return <div className="card"><p className="muted-hint">Carregando o aprendizado da Josy…</p></div>;

  return (
    <div className="aj">
      <div className="card aj-cabeca">
        <div className="aj-cabeca-linha">
          <div className="aj-contador" aria-live="polite"><b>{contagem.pendente}</b><span>proposta{contagem.pendente === 1 ? '' : 's'} esperando você</span></div>
          <p className="muted-hint aj-explica">
            {dados.existe
              ? <>A análise leu <b>{Number(dados.conversasLidas || 0).toLocaleString('pt-BR')}</b> conversas da Josy e separou o jeito dela em cada situação, com os áudios que ela usa. Cada proposta só vale no robô depois que você aprovar.{dados.geradoEm ? ` Gerado em ${quandoBR(dados.geradoEm)}.` : ''}</>
              : 'A análise das conversas da Josy ainda não terminou. Quando terminar, as propostas aparecem aqui pra você aprovar uma a uma.'}
          </p>
          <button type="button" className="aj-atualizar" onClick={carregar} aria-label="Atualizar" title="Atualizar"><RefreshCw size={14} className={carregando ? 'aj-gira' : ''} /></button>
        </div>
        <div className="aj-filtros" role="tablist" aria-label="Filtrar propostas">
          {['pendente', 'aprovado', 'ignorado'].map((f) => (
            <button key={f} type="button" role="tab" aria-selected={filtro === f} className={`aj-filtro ${filtro === f ? 'aj-filtro-on' : ''}`} onClick={() => setFiltro(f)}>
              {f === 'pendente' ? 'Pendentes' : f === 'aprovado' ? 'Aprovados' : 'Ignorados'} <b>{contagem[f] || 0}</b>
            </button>
          ))}
        </div>
        {aviso && <div className="aj-ok">{aviso}</div>}
        {erro && <div className="aj-erro">{erro}</div>}
      </div>

      {dados.existe && !lista.length && (
        <div className="card"><div className="empty-state">{filtro === 'pendente' ? 'Nada esperando você. 👍' : filtro === 'aprovado' ? 'Nenhuma proposta aprovada ainda.' : 'Nenhuma proposta ignorada.'}</div></div>
      )}
      {lista.map((p) => <CardAprendizado key={`${p.id}:${p.status}`} p={p} lojas={lojas} onDecidido={decidido} />)}
    </div>
  );
}
