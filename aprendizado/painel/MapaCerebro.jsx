import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, X, Crosshair, Send, Check, Plus, Minus, Pause, Play, RefreshCw, Lightbulb } from 'lucide-react';
import { api } from '../atendimento/api';
import { ACOES, COR_GRAVIDADE, ORIGEM, TIPOS, vazio } from './cerebroConstantes';
import { FormLicao, Bolhas } from './cerebroComum';
import { CardAprendizado } from './AprendizadoJosy';
import './MapaCerebro.css';

// MAPA DO CEREBRO (22/10, pedido do dono: "quero ele todo interativo, tipo com neuronios, neuro links").
// Neuronios = etapas do atendimento, situacoes que o robo reconhece (blocos do fluxo), ensinamentos do dono e
// achados da revisao diaria esperando aprovacao. Sinapses = caminho real das conversas dos ultimos 7 dias
// (bloco -> proximo bloco), vindo de GET /api/cerebro/mapa. Tamanho = uso em 7 dias; brilho pulsando = usado hoje;
// pulsos correndo nas linhas = por onde as conversas mais passam.
// Grafo de forca escrito a mao (sem biblioteca nova), desenhado em canvas: arrastar neuronio, mover o fundo,
// zoom com a roda ou com pinca no celular; clique/toque abre o painel com "Ensinar algo aqui" e "Testar".

const ETAPAS = ['abertura', 'medida', 'preco', 'objecoes', 'fechamento', 'atendente'];
const COR_ETAPA = { abertura: '#38BDF8', medida: '#A78BFA', preco: '#34D399', objecoes: '#F59E0B', fechamento: '#F472B6', atendente: '#94A3B8' };
const COR_ENSINAMENTO = '#2DD4BF';
const COR_ACHADO = '#FB923C';
const COR_APRENDIZADO = '#E879F9';
const NOME_TIPO = { etapa: 'Etapas', categoria: 'Situações', ensinamento: 'Ensinamentos', achado: 'Achados p/ revisar', aprendizado: 'Jeito da Josy' };
const NOME_TIPO_UM = { etapa: 'Etapa do atendimento', categoria: 'Situação que o robô reconhece', ensinamento: 'Ensinamento seu', achado: 'Achado da revisão (esperando você)', aprendizado: 'Jeito da Josy (esperando você)' };
const LIGADO_POR = { conversa: 'pela conversa real (o bloco que respondeu)', texto: 'por texto parecido (pode não ser exato)', tipo: 'pelo tipo do erro', proposta: 'pelo bloco que a análise escolheu', nenhum: 'à IA livre (nenhum bloco parecido)' };
const ATUALIZAR_MS = 120 * 1000;

const corDoNo = (n) => (n.tipo === 'ensinamento' ? (n.ativo ? COR_ENSINAMENTO : '#64748B') : n.tipo === 'achado' ? COR_ACHADO : n.tipo === 'aprendizado' ? COR_APRENDIZADO : COR_ETAPA[n.etapa] || '#94A3B8');
const raioDoNo = (n) => {
  const u = Math.sqrt(Math.max(0, n.usos7d || 0));
  if (n.tipo === 'etapa') return 24 + Math.min(22, u * 2.2);
  if (n.tipo === 'categoria') return 6 + Math.min(22, u * 2.6);
  if (n.tipo === 'ensinamento') return 9 + Math.min(10, u * 2);
  // proposta da Josy: maior = mais vezes nas conversas dela
  if (n.tipo === 'aprendizado') return 8 + Math.min(9, Math.sqrt(Math.max(0, Number(n.extra?.proposta?.frequencia) || 0)) * 0.5);
  return 8;
};
// raio na tela: afastando o zoom o neuronio encolhe menos que o mapa (senao vira poeira no "mostrar tudo")
const raioTela = (n, k) => Math.max(2.5, n.r * (k < 1 ? Math.pow(k, 0.55) : k));
const semAcento = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const cortar = (t, n) => { const s = String(t || ''); return s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s; };
const limitar = (v, a, b) => Math.max(a, Math.min(b, v));

// Onde cada etapa fica no "mundo": em tela larga a conversa anda da esquerda pra direita (atendente embaixo);
// no celular anda de cima pra baixo.
function alvoDaEtapa(etapa, estreito) {
  const i = Math.max(0, ETAPAS.indexOf(etapa));
  if (estreito) {
    if (etapa === 'atendente') return { x: 60, y: 570 };
    return { x: i % 2 ? 70 : -70, y: (i - 2) * 220 - 110 };
  }
  if (etapa === 'atendente') return { x: 160, y: 360 };
  return { x: (i - 2) * 330, y: i % 2 ? -120 : 60 };
}

// ---------------- simulacao de forca (a mao) ----------------
function montarSimulacao(dados, estreito, anterior) {
  const velhos = anterior?.porId || new Map();
  const nos = dados.nos.map((d) => {
    const v = velhos.get(d.id);
    const alvo = alvoDaEtapa(d.etapa, estreito);
    const ang = Math.random() * Math.PI * 2; const dist = d.tipo === 'etapa' ? 0 : 60 + Math.random() * 90;
    return {
      id: d.id, d, r: raioDoNo(d), cor: corDoNo(d), fase: Math.random() * Math.PI * 2,
      x: v ? v.x : alvo.x + Math.cos(ang) * dist, y: v ? v.y : alvo.y + Math.sin(ang) * dist, vx: 0, vy: 0, fx: null, fy: null,
    };
  });
  const porId = new Map(nos.map((n) => [n.id, n]));
  const ligs = [];
  const maxPeso = {};
  for (const l of dados.ligacoes) {
    const a = porId.get(l.de); const b = porId.get(l.para);
    if (!a || !b || a === b) continue;
    ligs.push({ a, b, peso: l.peso || 0, tipo: l.tipo, off: Math.random() });
    maxPeso[l.tipo] = Math.max(maxPeso[l.tipo] || 1, l.peso || 0);
  }
  // ensinamento/achado novo nasce do lado do neuronio a que esta ligado
  for (const l of ligs) {
    if ((l.tipo === 'ensina' || l.tipo === 'achado' || l.tipo === 'aprendizado') && !velhos.get(l.b.id)) { l.b.x = l.a.x + (Math.random() - 0.5) * 50; l.b.y = l.a.y + (Math.random() - 0.5) * 50; }
  }
  const vizinhos = new Map(nos.map((n) => [n.id, new Set()]));
  for (const l of ligs) { vizinhos.get(l.a.id).add(l.b.id); vizinhos.get(l.b.id).add(l.a.id); }
  const maxHoje = Math.max(1, ...nos.filter((n) => n.d.tipo === 'categoria').map((n) => n.d.usosHoje || 0));
  return { nos, ligs, porId, vizinhos, maxPeso, maxHoje, alpha: anterior ? 0.35 : 1, estreito };
}

const FORCA_MOLA = { pertence: 0.1, caminho: 0.0015, ensina: 0.25, achado: 0.25, aprendizado: 0.25, etapa: 0 };
function passo(sim) {
  const { nos, ligs, alpha, estreito } = sim;
  const n = nos.length;
  // repulsao (carga maior pra neuronio maior) + colisao
  for (let i = 0; i < n; i++) {
    const a = nos[i];
    for (let j = i + 1; j < n; j++) {
      const b = nos[j];
      let dx = b.x - a.x; let dy = b.y - a.y; let d2 = dx * dx + dy * dy;
      if (d2 > 360000) continue;
      if (d2 < 0.01) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; d2 = dx * dx + dy * dy; }
      const d = Math.sqrt(d2);
      const f = ((22 + a.r * 1.6) + (22 + b.r * 1.6)) * alpha / d2 * 7;
      a.vx -= dx * f; a.vy -= dy * f; b.vx += dx * f; b.vy += dy * f;
      const min = a.r + b.r + 8;
      if (d < min) { const m = ((min - d) / d) * 0.5; a.x -= dx * m * 0.5; a.y -= dy * m * 0.5; b.x += dx * m * 0.5; b.y += dy * m * 0.5; }
    }
  }
  // molas das ligacoes
  for (const l of ligs) {
    const k = FORCA_MOLA[l.tipo] || 0;
    if (!k) continue;
    const dx = l.b.x - l.a.x; const dy = l.b.y - l.a.y; const d = Math.sqrt(dx * dx + dy * dy) || 1;
    const alvo = l.tipo === 'pertence' ? 50 + l.a.r + l.b.r * 1.6 : l.tipo === 'caminho' ? 180 : 34 + l.a.r;
    const m = ((d - alvo) / d) * k * alpha;
    const fixoA = l.a.d.tipo === 'etapa' ? 0.1 : 0.5;
    l.a.vx += dx * m * fixoA; l.a.vy += dy * m * fixoA; l.b.vx -= dx * m * (1 - fixoA); l.b.vy -= dy * m * (1 - fixoA);
  }
  // ancoras: etapa presa ao seu lugar; situacao puxada de leve pra perto da sua etapa
  for (const no of nos) {
    const alvo = alvoDaEtapa(no.d.etapa, estreito);
    const k = no.d.tipo === 'etapa' ? 0.2 : no.d.tipo === 'categoria' ? 0.06 : 0.004;
    no.vx += (alvo.x - no.x) * k * alpha; no.vy += (alvo.y - no.y) * k * alpha;
  }
  for (const no of nos) {
    if (no.fx != null) { no.x = no.fx; no.y = no.fy; no.vx = 0; no.vy = 0; continue; }
    no.vx *= 0.58; no.vy *= 0.58;
    no.x += limitar(no.vx, -40, 40); no.y += limitar(no.vy, -40, 40);
  }
  sim.alpha += (0 - sim.alpha) * 0.02;
}

// brilho redondo pre-desenhado por cor (drawImage e bem mais leve que shadowBlur a cada quadro)
const sprites = new Map();
function brilho(cor) {
  if (sprites.has(cor)) return sprites.get(cor);
  const c = document.createElement('canvas'); c.width = 64; c.height = 64;
  const g = c.getContext('2d').createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, `${cor}ff`); g.addColorStop(0.25, `${cor}88`); g.addColorStop(1, `${cor}00`);
  const x = c.getContext('2d'); x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  sprites.set(cor, c);
  return c;
}

function hexagono(ctx, x, y, r) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + (i * Math.PI) / 3; ctx[i ? 'lineTo' : 'moveTo'](x + r * Math.cos(a), y + r * Math.sin(a)); }
  ctx.closePath();
}
function triangulo(ctx, x, y, r) {
  ctx.beginPath(); ctx.moveTo(x, y - r * 1.15); ctx.lineTo(x + r * 1.05, y + r * 0.75); ctx.lineTo(x - r * 1.05, y + r * 0.75); ctx.closePath();
}
function losango(ctx, x, y, r) {
  ctx.beginPath(); ctx.moveTo(x, y - r * 1.2); ctx.lineTo(x + r * 0.95, y); ctx.lineTo(x, y + r * 1.2); ctx.lineTo(x - r * 0.95, y); ctx.closePath();
}
// ponto de controle da curva (sinapse ida e volta ficam em curvas separadas)
function controle(a, b, curva) {
  const mx = (a.x + b.x) / 2; const my = (a.y + b.y) / 2; const dx = b.x - a.x; const dy = b.y - a.y;
  return { x: mx - dy * curva, y: my + dx * curva };
}
const curvaDoTipo = (t) => (t === 'caminho' ? 0.18 : t === 'etapa' ? 0.12 : 0);

// ---------------- painel lateral ----------------
function Vizinho({ v, peso, rotuloPeso, onIr }) {
  if (!v) return null;
  return (
    <button type="button" className="mc-viz" onClick={() => onIr(v.id)}>
      <span className="mc-ponto" style={{ background: corDoNo(v) }} />
      <span className="mc-viz-nome">{v.rotulo}</span>
      {peso != null && <span className="mc-viz-peso">{peso}{rotuloPeso || 'x'}</span>}
    </button>
  );
}

// Montado com key = id do neuronio: trocar de neuronio zera formulario, teste e avisos.
function Painel({ d, dados, lojas, onFechar, onIr, onMudou, onDisparo }) {
  const [modo, setModo] = useState(null); // 'ensinar' | 'testar' | null
  const [form, setForm] = useState(vazio);
  const [msgTeste, setMsgTeste] = useState(d.extra?.exemplos?.[0] || d.extra?.proposta?.exemplos?.[0]?.cliente || '');
  const [lojaId, setLojaId] = useState(lojas?.[0]?.id || '');
  const [res, setRes] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState('');
  const [verConversa, setVerConversa] = useState(false);
  const [sug, setSug] = useState(d.extra?.achado?.sugestao || vazio);

  const porId = useMemo(() => new Map(dados.nos.map((n) => [n.id, n])), [dados]);
  const entrada = dados.ligacoes.filter((l) => l.para === d.id && l.tipo === 'caminho').sort((a, b) => b.peso - a.peso);
  const saida = dados.ligacoes.filter((l) => l.de === d.id && l.tipo === 'caminho').sort((a, b) => b.peso - a.peso);
  const filhos = dados.ligacoes.filter((l) => l.de === d.id && l.tipo !== 'caminho' && l.tipo !== 'etapa').map((l) => porId.get(l.para)).filter(Boolean);
  const pai = d.tipo === 'categoria' ? porId.get(`etapa:${d.etapa}`) : d.extra?.ligadoA ? porId.get(d.extra.ligadoA) : null;
  const ligadoA = d.tipo === 'etapa' || d.tipo === 'categoria' ? d.id : d.extra?.ligadoA || null;

  const ensinar = async () => {
    setOcupado(true); setAviso('');
    try {
      const r = await api('/api/cerebro/licoes', { method: 'POST', body: JSON.stringify({ ...form, ligadoA }) });
      setForm(vazio); setModo(null); setAviso('Ensinado! Já vale na próxima mensagem.');
      await onMudou(r?.licao?.id ? `ensinamento:${r.licao.id}` : null);
    } catch (e) { setAviso(e.message); }
    setOcupado(false);
  };
  const testar = async () => {
    setOcupado(true); setAviso(''); setRes(null);
    try {
      const r = await api('/api/cerebro/testar', { method: 'POST', body: JSON.stringify({ mensagem: msgTeste, lojaId }) });
      setRes(r);
      const ids = r.via === 'cerebro' && r.licao?.id ? [`ensinamento:${r.licao.id}`]
        : r.via === 'fluxo' ? (r.chaves || []).filter((k) => !String(k).startsWith('cerebro')).map((k) => `categoria:${k}`) : ['categoria:ia_livre'];
      onDisparo(ids);
    } catch (e) { setAviso(e.message); }
    setOcupado(false);
  };
  const alternar = async () => {
    setOcupado(true); setAviso('');
    try { const l = d.extra.licao; await api(`/api/cerebro/licoes/${l.id}`, { method: 'PUT', body: JSON.stringify({ ...l, ativo: !l.ativo }) }); await onMudou(d.id); }
    catch (e) { setAviso(e.message); }
    setOcupado(false);
  };
  const decidir = async (status) => {
    setOcupado(true); setAviso('');
    try {
      const r = await api(`/api/cerebro/revisoes/${d.extra.data}/achados/${d.extra.achado.id}`, { method: 'POST', body: JSON.stringify({ status, licao: { ...sug, ligadoA: d.extra.ligadoA } }) });
      await onMudou(status === 'aprovado' && r?.achado?.licaoId ? `ensinamento:${r.achado.licaoId}` : null);
    } catch (e) { setAviso(e.message); }
    setOcupado(false);
  };

  const a = d.extra?.achado;
  const licao = d.extra?.licao;
  return (
    <aside className="mc-painel" aria-label={`Detalhes: ${d.rotulo}`}>
      <div className="mc-painel-topo">
        <span className="mc-tipo" style={{ color: corDoNo(d), borderColor: `${corDoNo(d)}66` }}>{NOME_TIPO_UM[d.tipo]}</span>
        <button type="button" className="mc-icone" onClick={onFechar} aria-label="Fechar"><X size={16} /></button>
      </div>
      {d.tipo !== 'aprendizado' && (
        <h4 className="mc-titulo">
          {d.tipo === 'ensinamento' ? `Quando o cliente ${String(d.descricao).replace(/^quando o cliente\s*/i, '')}`
            : d.tipo === 'achado' ? `${TIPOS[d.extra?.achado?.tipo] || 'Erro'} — ${d.extra?.achado?.cliente || d.extra?.achado?.numero || 'cliente'}` : d.rotulo}
        </h4>
      )}

      {/* proposta do Aprendizado da Josy: o MESMO card da aba (aprovar com audio / so texto / ignorar) */}
      {d.tipo === 'aprendizado' && d.extra?.proposta && (
        <>
          <CardAprendizado p={d.extra.proposta} lojas={lojas} noMapa
            onDecidido={(r) => onMudou(r?.proposta?.licaoId ? `ensinamento:${r.proposta.licaoId}` : null)} />
          <p className="mc-dica">Ligado no mapa {LIGADO_POR[d.extra.ligadoPor] || ''}.</p>
        </>
      )}

      {d.tipo !== 'achado' && d.tipo !== 'aprendizado' && (
        <div className="mc-numeros">
          <div><b>{d.usosHoje}</b><span>hoje</span></div>
          <div><b>{d.usos7d}</b><span>em 7 dias</span></div>
          {d.tipo === 'ensinamento' && <div><b>{licao?.usos || 0}</b><span>no total</span></div>}
          {d.tipo === 'etapa' && dados.uso?.mensagens7d > 0 && <div><b>{Math.round((d.usos7d / dados.uso.mensagens7d) * 100)}%</b><span>das msgs</span></div>}
        </div>
      )}

      {d.tipo !== 'ensinamento' && d.tipo !== 'achado' && d.tipo !== 'aprendizado' && d.descricao &&<p className="mc-texto">{d.tipo === 'categoria' ? <><b>Quando entra: </b>{d.descricao}</> : d.descricao}</p>}

      {d.tipo === 'categoria' && d.extra?.exemplos?.length > 0 && (
        <div className="mc-bloco">
          <div className="mc-rotulo">O cliente fala tipo</div>
          <div className="mc-chips">{d.extra.exemplos.map((x) => <button type="button" key={x} className="mc-chip" title="Testar esta frase" onClick={() => { setMsgTeste(x); setModo('testar'); }}>“{x}”</button>)}</div>
        </div>
      )}

      {d.tipo === 'categoria' && d.extra?.chave !== 'ia_livre' && (
        <div className="mc-bloco">
          <div className="mc-rotulo">O que o robô faz</div>
          {d.extra?.silencio ? <p className="mc-texto">Fica calado: o código decide não responder e a equipe vê no painel.</p>
            : d.extra?.partes?.length ? <Bolhas partes={d.extra.partes} />
              : d.extra?.calculado ? <p className="mc-texto"><b>Calculado pela tabela: </b>{d.extra.calculado}</p> : null}
          {d.extra?.acaoExtra && <p className="mc-dica">+ {d.extra.acaoExtra}</p>}
          {d.extra?.audio && <p className="mc-dica">🎙 Vai em áudio com a voz do dono ({d.extra.audio.modo === 'substitui' ? 'no lugar do texto' : `${d.extra.audio.modo} do texto`}){d.extra.audio.transcricao ? `: “${d.extra.audio.transcricao}”` : ''}</p>}
          {d.extra?.textosLoja?.map((t, i) => (
            <div key={i} className="mc-loja">
              <div className="mc-dica">Texto trocado para <b>{t.loja}</b>:</div>
              <Bolhas partes={t.partes} />
            </div>
          ))}
        </div>
      )}

      {d.extra?.chave === 'ia_livre' && (
        <div className="mc-bloco">
          <div className="mc-rotulo">Por que caiu na IA livre (7 dias)</div>
          <p className="mc-texto">{d.acao}</p>
        </div>
      )}

      {d.tipo === 'ensinamento' && licao && (
        <div className="mc-bloco">
          <div className="mc-rotulo">O robô deve</div>
          <p className="mc-texto">{ACOES[licao.acao] || licao.acao}{licao.lojas?.length ? ` · ${licao.lojas.map((id) => lojas.find((x) => x.id === id)?.nome || id).join(', ')}` : ' · todas as lojas'}</p>
          {licao.acao === 'responder' ? <Bolhas partes={String(licao.resposta || '').split(/\n\s*\n/).filter(Boolean)} /> : licao.resposta ? <p className="mc-texto mc-citacao">{licao.resposta}</p> : null}
          <p className="mc-dica">{licao.ativo ? '● Ligado' : '○ Desligado'} · {ORIGEM[licao.origem] || ORIGEM.dono}{d.extra?.ligadoAutomatico ? ' · ligado no mapa pelo assunto parecido' : ''}</p>
        </div>
      )}

      {d.tipo === 'achado' && a && (
        <div className="mc-bloco">
          <div className="mc-chips">
            <span className="mc-chip mc-chip-fixo" style={{ color: COR_GRAVIDADE[a.gravidade] || '#8b94a8' }}>gravidade {a.gravidade}</span>
            <span className="mc-chip mc-chip-fixo">{a.numero || 'sem número'} · {a.conta}</span>
            {d.extra.data && <span className="mc-chip mc-chip-fixo">revisão de {String(d.extra.data).split('-').reverse().join('/')}</span>}
          </div>
          <p className="mc-texto">{a.resumo}</p>
          {a.mensagemCliente && <p className="mc-texto"><span className="mc-dica">Cliente:</span> “{a.mensagemCliente}”</p>}
          {a.respostaRobo && <p className="mc-texto"><span className="mc-dica">Robô:</span> “{a.respostaRobo}”</p>}
          <p className="mc-dica">Ligado {LIGADO_POR[d.extra.ligadoPor] || ''}.</p>
          <button type="button" className="mc-link" onClick={() => setVerConversa((x) => !x)}>{verConversa ? 'Esconder conversa' : 'Ver a conversa'}</button>
          {verConversa && <pre className="mc-conversa">{(a.trecho || []).join('\n')}</pre>}
          <div className="mc-rotulo" style={{ marginTop: 6 }}>Correção sugerida (pode ajustar antes de aprovar)</div>
          <FormLicao valor={sug} onChange={setSug} lojas={lojas} compacto />
          <div className="mc-botoes">
            <button type="button" className="btn btn-primary" disabled={ocupado} onClick={() => decidir('aprovado')}><Check size={14} /> Aprovar e ensinar</button>
            <button type="button" className="btn btn-secondary" disabled={ocupado} onClick={() => decidir('ignorado')}><X size={14} /> Ignorar</button>
          </div>
        </div>
      )}

      {aviso && <div className="mc-aviso">{aviso}</div>}

      <div className="mc-botoes mc-botoes-fim">
        {d.tipo !== 'achado' && d.tipo !== 'aprendizado' && <button type="button" className={`btn ${modo === 'ensinar' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setModo((m) => (m === 'ensinar' ? null : 'ensinar'))}><Lightbulb size={14} /> Ensinar algo aqui</button>}
        <button type="button" className={`btn ${modo === 'testar' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setModo((m) => (m === 'testar' ? null : 'testar'))}><Send size={14} /> Testar</button>
        {d.tipo === 'ensinamento' && licao && <button type="button" className="btn btn-secondary" disabled={ocupado} onClick={alternar}>{licao.ativo ? 'Desligar' : 'Ligar'}</button>}
      </div>

      {modo === 'ensinar' && (
        <div className="mc-bloco mc-form">
          <p className="mc-dica">O ensinamento fica ligado a <b>{porId.get(ligadoA)?.rotulo || d.rotulo}</b> no mapa e vale na próxima mensagem.</p>
          <FormLicao valor={form} onChange={setForm} lojas={lojas} compacto />
          <button type="button" className="btn btn-primary" disabled={ocupado || form.situacao.trim().length < 5} onClick={ensinar}><Check size={14} /> Salvar ensinamento</button>
        </div>
      )}
      {modo === 'testar' && (
        <div className="mc-bloco mc-form">
          <input className="input-field" value={msgTeste} onChange={(e) => setMsgTeste(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && msgTeste.trim() && !ocupado && testar()} placeholder="Escreva como se fosse o cliente" />
          {lojas?.length > 1 && (
            <select className="input-field" value={lojaId} onChange={(e) => setLojaId(e.target.value)}>
              {lojas.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
            </select>
          )}
          <button type="button" className="btn btn-primary" disabled={!msgTeste.trim() || ocupado} onClick={testar}><Send size={14} /> {ocupado ? 'Pensando…' : 'Testar'}</button>
          {res && (
            <div className="mc-resultado">
              <div className="mc-dica">{res.via === 'cerebro' ? <>Usou o ensinamento: <b>{res.licao?.situacao}</b></> : res.via === 'fluxo' ? 'Respondeu pelo fluxo — os neurônios que dispararam estão piscando no mapa' : 'Respondeu pela IA livre'}</div>
              <Bolhas partes={res.partes} />
              <div className="mc-dica">Teste: nada foi enviado pra ninguém.</div>
            </div>
          )}
        </div>
      )}

      {/* sinapses deste neuronio: clicar leva pro vizinho */}
      {(pai || entrada.length > 0 || saida.length > 0 || filhos.length > 0) && (
        <div className="mc-bloco mc-ligacoes">
          {pai && <><div className="mc-rotulo">{d.tipo === 'categoria' ? 'Etapa' : 'Ligado a'}</div><Vizinho v={pai} onIr={onIr} /></>}
          {entrada.length > 0 && <><div className="mc-rotulo">Costuma vir depois de</div>{entrada.slice(0, 6).map((l) => <Vizinho key={l.de} v={porId.get(l.de)} peso={l.peso} onIr={onIr} />)}</>}
          {saida.length > 0 && <><div className="mc-rotulo">E leva para</div>{saida.slice(0, 6).map((l) => <Vizinho key={l.para} v={porId.get(l.para)} peso={l.peso} onIr={onIr} />)}</>}
          {filhos.length > 0 && (
            <>
              <div className="mc-rotulo">{d.tipo === 'etapa' ? 'Situações desta etapa' : 'Ensinamentos, achados e propostas ligados aqui'}</div>
              {[...filhos].sort((x, y) => y.usos7d - x.usos7d).slice(0, 14).map((f) => <Vizinho key={f.id} v={f} peso={f.tipo === 'achado' || f.tipo === 'aprendizado' ? null : f.usos7d} rotuloPeso=" em 7d" onIr={onIr} />)}
            </>
          )}
        </div>
      )}
    </aside>
  );
}

// ---------------- mapa ----------------
export function MapaCerebro({ lojas, onMudou }) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [selId, setSelId] = useState(null);
  const [dica, setDica] = useState(null); // { no, x, y }
  const [busca, setBusca] = useState('');
  const [tiposOn, setTiposOn] = useState({ etapa: true, categoria: true, ensinamento: true, achado: true, aprendizado: true });
  const [pausado, setPausado] = useState(() => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  const [toque, setToque] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches);
  // no celular o painel vira gaveta presa no rodape da tela (portal no body: a pagina tem transform da animacao de entrada,
  // que prenderia o position:fixed dentro dela)
  const [celular, setCelular] = useState(() => typeof window !== 'undefined' && window.matchMedia?.('(max-width: 720px)').matches);
  useEffect(() => {
    const mq = window.matchMedia?.('(max-width: 720px)');
    if (!mq) return undefined;
    const mudou = () => setCelular(mq.matches);
    mq.addEventListener('change', mudou);
    return () => mq.removeEventListener('change', mudou);
  }, []);

  const caixaRef = useRef(null);
  const canvasRef = useRef(null);
  const simRef = useRef(null);
  const viewRef = useRef({ k: 1, x: 0, y: 0 });
  const viewAlvoRef = useRef(null);
  const tamRef = useRef({ w: 0, h: 0, dpr: 1 });
  // interagiu = a pessoa ja mexeu na camera (ai o mapa nao se reenquadra sozinho); ativo = clicou no mapa (roda vira zoom)
  const estadoRef = useRef({ selId: null, hoverId: null, busca: '', tiposOn, pausado, disparo: null, visivel: true, interagiu: false, enquadrou: false, ativo: false });
  const [avisoRoda, setAvisoRoda] = useState(false);
  const gestoRef = useRef(null);
  const ptrsRef = useRef(new Map());
  const ajustouRef = useRef(false);

  const visivelNo = (n) => estadoRef.current.tiposOn[n.d.tipo];
  const telaParaMundo = (x, y) => { const v = viewRef.current; return { x: (x - v.x) / v.k, y: (y - v.y) / v.k }; };

  const ajustar = useCallback((animar = true) => {
    const sim = simRef.current; const { w, h } = tamRef.current;
    if (!sim || !w) return;
    const vis = sim.nos.filter(visivelNo);
    if (!vis.length) return;
    let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
    for (const n of vis) { x0 = Math.min(x0, n.x - n.r); y0 = Math.min(y0, n.y - n.r); x1 = Math.max(x1, n.x + n.r); y1 = Math.max(y1, n.y + n.r); }
    const pad = 40;
    const k = limitar(Math.min((w - pad * 2) / (x1 - x0 || 1), (h - pad * 2) / (y1 - y0 || 1)), 0.2, 1.6);
    const alvo = { k, x: w / 2 - ((x0 + x1) / 2) * k, y: h / 2 - ((y0 + y1) / 2) * k };
    if (animar) viewAlvoRef.current = alvo; else viewRef.current = alvo;
  }, []);

  // leva o neuronio pro meio da parte do mapa que o painel nao cobre (no PC o painel fica a direita;
  // no celular a gaveta cobre a metade de baixo). manterZoom = so desliza, sem aproximar.
  const centralizar = useCallback((id, manterZoom = false) => {
    const n = simRef.current?.porId.get(id); const { w, h } = tamRef.current;
    if (!n || !w) return;
    const k = manterZoom ? viewRef.current.k : Math.max(viewRef.current.k, 1.05);
    const celular = window.matchMedia?.('(max-width: 720px)').matches;
    const cx = celular ? w / 2 : Math.max(w * 0.25, (w - 400) / 2); const cy = celular ? h * 0.28 : h / 2;
    viewAlvoRef.current = { k, x: cx - n.x * k, y: cy - n.y * k };
  }, []);

  const selecionar = useCallback((id, mover = false) => {
    setSelId(id); setDica(null);
    if (!id) return;
    if (mover) { centralizar(id); return; }
    // clicou direto: so mexe a camera se o painel for cobrir o neuronio
    const n = simRef.current?.porId.get(id); const { w, h } = tamRef.current; const v = viewRef.current;
    if (!n || !w) return;
    const x = n.x * v.k + v.x; const y = n.y * v.k + v.y;
    const celular = window.matchMedia?.('(max-width: 720px)').matches;
    if (celular ? y > h * 0.4 : x > w - 410) centralizar(id, true);
  }, [centralizar]);

  // ---- dados
  const carregar = useCallback(async (silencioso) => {
    if (!silencioso) setCarregando(true);
    try { const d = await api('/api/cerebro/mapa'); setDados(d); setErro(''); return d; }
    catch (e) { if (!silencioso) setErro(e.message); return null; }
    finally { if (!silencioso) setCarregando(false); }
  }, []);
  useEffect(() => {
    api('/api/cerebro/mapa').then((d) => { setDados(d); setErro(''); }).catch((e) => setErro(e.message));
    const t = setInterval(() => { if (!document.hidden && estadoRef.current.visivel) carregar(true); }, ATUALIZAR_MS);
    return () => clearInterval(t);
  }, [carregar]);

  // ---- monta / atualiza a simulacao quando os dados chegam (mantem a posicao de quem ja existia)
  useEffect(() => {
    if (!dados) return;
    const estreito = tamRef.current.w > 0 && tamRef.current.w < 640;
    const sim = montarSimulacao(dados, estreito, simRef.current);
    if (!simRef.current) { for (let i = 0; i < 260; i++) passo(sim); sim.alpha = 0.25; }
    simRef.current = sim;
    if (!ajustouRef.current && tamRef.current.w) { ajustar(false); ajustouRef.current = true; }
  }, [dados, ajustar]);

  // espelha o estado do React pro laco de desenho
  useEffect(() => { Object.assign(estadoRef.current, { selId, busca: semAcento(busca.trim()), tiposOn, pausado }); }, [selId, busca, tiposOn, pausado]);

  // ---- tamanho do canvas
  useEffect(() => {
    const caixa = caixaRef.current; const canvas = canvasRef.current;
    if (!caixa || !canvas) return undefined;
    const medir = () => {
      const r = caixa.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const eraEstreito = tamRef.current.w > 0 && tamRef.current.w < 640;
      tamRef.current = { w: r.width, h: r.height, dpr };
      canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr);
      canvas.style.width = `${r.width}px`; canvas.style.height = `${r.height}px`;
      const estreito = r.width < 640;
      if (simRef.current && estreito !== eraEstreito) { simRef.current.estreito = estreito; simRef.current.alpha = 0.8; ajustouRef.current = false; }
      if (simRef.current && !ajustouRef.current) { for (let i = 0; i < 120; i++) passo(simRef.current); ajustar(false); ajustouRef.current = true; }
    };
    medir();
    const ro = new ResizeObserver(medir); ro.observe(caixa);
    const io = new IntersectionObserver(([e]) => { estadoRef.current.visivel = !!e?.isIntersecting; });
    io.observe(caixa);
    return () => { ro.disconnect(); io.disconnect(); };
  }, [ajustar]);

  // ---- laco: simula + desenha
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    let raf = 0;
    const desenhar = (agora) => {
      raf = requestAnimationFrame(desenhar);
      const sim = simRef.current; const est = estadoRef.current; const { w, h, dpr } = tamRef.current;
      if (!sim || !w || !est.visivel) return;
      if (sim.alpha > 0.003) passo(sim);
      // quando o desenho assenta pela 1a vez, enquadra tudo (se a pessoa ainda nao mexeu na camera)
      if (!est.enquadrou && sim.alpha < 0.03) { est.enquadrou = true; if (!est.interagiu) ajustar(true); }
      // camera indo suave pro alvo (centralizar / ajustar)
      const alvo = viewAlvoRef.current; const v = viewRef.current;
      if (alvo) {
        v.k += (alvo.k - v.k) * 0.14; v.x += (alvo.x - v.x) * 0.14; v.y += (alvo.y - v.y) * 0.14;
        if (Math.abs(alvo.k - v.k) < 0.002 && Math.abs(alvo.x - v.x) < 0.5 && Math.abs(alvo.y - v.y) < 0.5) viewAlvoRef.current = null;
      }
      const t = est.pausado ? 0 : agora / 1000;
      const sx = (x) => x * v.k + v.x; const sy = (y) => y * v.k + v.y;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      // foco: neuronio escolhido/apontado + vizinhos; busca acende quem bate
      const focoId = est.hoverId || est.selId;
      const foco = focoId ? new Set([focoId, ...(sim.vizinhos.get(focoId) || [])]) : null;
      const achou = est.busca ? new Set(sim.nos.filter((n) => semAcento(`${n.d.rotulo} ${n.d.descricao} ${(n.d.extra?.exemplos || []).join(' ')}`).includes(est.busca)).map((n) => n.id)) : null;
      const disparo = est.disparo && agora < est.disparo.ate ? est.disparo : null;
      const apagado = (n) => (foco ? !foco.has(n.id) : achou ? !achou.has(n.id) : false);

      // ---- sinapses
      for (const l of sim.ligs) {
        if (!visivelNo(l.a) || !visivelNo(l.b)) continue;
        const fraco = foco ? !(foco.has(l.a.id) && foco.has(l.b.id) && (l.a.id === focoId || l.b.id === focoId)) : achou ? !(achou.has(l.a.id) || achou.has(l.b.id)) : false;
        const rel = Math.min(1, (l.peso || 0) / (sim.maxPeso[l.tipo] || 1));
        const c = controle(l.a, l.b, curvaDoTipo(l.tipo));
        ctx.beginPath(); ctx.moveTo(sx(l.a.x), sy(l.a.y)); ctx.quadraticCurveTo(sx(c.x), sy(c.y), sx(l.b.x), sy(l.b.y));
        ctx.setLineDash(l.tipo === 'ensina' || l.tipo === 'achado' || l.tipo === 'aprendizado' ? [4, 4] : []);
        if (l.tipo === 'etapa') {
          const g = ctx.createLinearGradient(sx(l.a.x), sy(l.a.y), sx(l.b.x), sy(l.b.y));
          g.addColorStop(0, l.a.cor); g.addColorStop(1, l.b.cor);
          ctx.strokeStyle = g; ctx.globalAlpha = (fraco ? 0.06 : 0.16 + rel * 0.4); ctx.lineWidth = Math.max(1.2, (2 + rel * 9) * v.k);
        } else if (l.tipo === 'caminho') {
          ctx.strokeStyle = '#E2E8F0'; ctx.globalAlpha = fraco ? 0.03 : 0.08 + rel * 0.5; ctx.lineWidth = Math.max(0.6, (0.7 + rel * 3.2) * v.k);
        } else if (l.tipo === 'pertence') {
          ctx.strokeStyle = l.a.cor; ctx.globalAlpha = fraco ? 0.04 : 0.2; ctx.lineWidth = Math.max(0.5, 1 * v.k);
        } else if (l.tipo === 'aprendizado') {
          ctx.strokeStyle = COR_APRENDIZADO; ctx.globalAlpha = fraco ? 0.06 : 0.4 + 0.2 * Math.sin(t * 2); ctx.lineWidth = Math.max(0.8, 1.4 * v.k);
        } else {
          ctx.strokeStyle = l.tipo === 'achado' ? COR_ACHADO : COR_ENSINAMENTO;
          ctx.globalAlpha = fraco ? 0.06 : l.tipo === 'achado' ? 0.35 + 0.3 * Math.sin(t * 4) : 0.55; ctx.lineWidth = Math.max(0.8, 1.4 * v.k);
        }
        ctx.stroke();
        // pulsos correndo pelas sinapses mais usadas
        if (!est.pausado && (l.tipo === 'caminho' || l.tipo === 'etapa') && l.peso > 0 && !fraco) {
          const qtd = Math.min(4, Math.ceil(Math.log2(l.peso + 1)));
          const comp = Math.hypot(l.b.x - l.a.x, l.b.y - l.a.y) || 1;
          const spr = brilho(l.tipo === 'etapa' ? l.b.cor : '#FFFFFF');
          const tam = Math.max(5, (l.tipo === 'etapa' ? 16 : 10 + rel * 8) * v.k);
          ctx.globalAlpha = l.tipo === 'etapa' ? 0.85 : 0.5 + rel * 0.5;
          for (let i = 0; i < qtd; i++) {
            const p = ((t * 70) / comp + l.off + i / qtd) % 1; const q = 1 - p;
            const px = q * q * l.a.x + 2 * q * p * c.x + p * p * l.b.x; const py = q * q * l.a.y + 2 * q * p * c.y + p * p * l.b.y;
            ctx.drawImage(spr, sx(px) - tam / 2, sy(py) - tam / 2, tam, tam);
          }
        }
      }
      ctx.setLineDash([]);

      // ---- disparo do "Testar": anel crescendo nos neuronios que responderam
      if (disparo) {
        const prog = 1 - (disparo.ate - agora) / 2600;
        for (const id of disparo.ids) {
          const n = sim.porId.get(id); if (!n) continue;
          for (let i = 0; i < 2; i++) {
            const pr = (prog * 2 + i * 0.5) % 1;
            ctx.beginPath(); ctx.arc(sx(n.x), sy(n.y), raioTela(n, v.k) + 6 + pr * 40, 0, Math.PI * 2);
            ctx.strokeStyle = '#FFFFFF'; ctx.globalAlpha = (1 - pr) * 0.8; ctx.lineWidth = 2; ctx.stroke();
          }
        }
      }

      // ---- neuronios
      const ordem = ['etapa', 'categoria', 'ensinamento', 'achado', 'aprendizado'];
      for (const tipo of ordem) {
        for (const n of sim.nos) {
          if (n.d.tipo !== tipo || !visivelNo(n)) continue;
          const x = sx(n.x); const y = sy(n.y); const r = raioTela(n, v.k);
          if (x < -80 || y < -80 || x > w + 80 || y > h + 80) continue;
          const fraco = apagado(n);
          const hoje = n.d.usosHoje > 0 ? Math.min(1, 0.35 + n.d.usosHoje / sim.maxHoje) : 0;
          const respira = 0.7 + 0.3 * Math.sin(t * 2.2 + n.fase);
          const pisca = n.d.tipo === 'achado' ? 0.45 + 0.55 * Math.abs(Math.sin(t * 2.6 + n.fase)) : 1;
          const disparou = disparo?.ids.includes(n.id);
          // brilho
          const gl = r * (n.d.tipo === 'etapa' ? 3.2 : 3.6) * (disparou ? 1.6 : 1);
          ctx.globalAlpha = fraco ? 0.05 : Math.min(1, (n.d.tipo === 'achado' ? 0.55 * pisca : n.d.tipo === 'aprendizado' ? 0.35 + 0.25 * respira : 0.18 + hoje * 0.6 * respira) + (disparou ? 0.5 : 0));
          ctx.drawImage(brilho(n.cor), x - gl / 2, y - gl / 2, gl, gl);
          // corpo
          ctx.globalAlpha = fraco ? 0.18 : n.d.tipo === 'ensinamento' && !n.d.ativo ? 0.55 : n.d.tipo === 'achado' ? 0.6 + 0.4 * pisca : 1;
          const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
          g.addColorStop(0, '#FFFFFF'); g.addColorStop(0.25, n.cor); g.addColorStop(1, `${n.cor}AA`);
          ctx.fillStyle = g;
          if (n.d.tipo === 'ensinamento') hexagono(ctx, x, y, r);
          else if (n.d.tipo === 'achado') triangulo(ctx, x, y, r);
          else if (n.d.tipo === 'aprendizado') losango(ctx, x, y, r);
          else { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); }
          ctx.fill();
          if (n.d.tipo === 'etapa') {
            ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.stroke();
            ctx.beginPath(); ctx.arc(x, y, r * 0.62, 0, Math.PI * 2); ctx.fillStyle = 'rgba(7,11,20,0.82)'; ctx.fill();
            ctx.fillStyle = '#FFFFFF'; ctx.font = `800 ${Math.max(10, Math.min(22, r * 0.55))}px Outfit, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(String(n.d.usosHoje), x, y - r * 0.06);
            ctx.font = `600 ${Math.max(7, Math.min(10, r * 0.24))}px "Plus Jakarta Sans", sans-serif`; ctx.fillStyle = 'rgba(255,255,255,0.6)';
            if (r > 22) ctx.fillText('hoje', x, y + r * 0.34);
          }
          if (n.d.tipo === 'achado' && r > 5) { ctx.fillStyle = '#1a0f05'; ctx.font = `800 ${Math.max(8, r * 0.95)}px Outfit, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('!', x, y + r * 0.12); }
          if (n.d.tipo === 'ensinamento' && !n.d.ativo) { ctx.setLineDash([3, 3]); ctx.strokeStyle = '#CBD5E1'; ctx.lineWidth = 1; hexagono(ctx, x, y, r + 2); ctx.stroke(); ctx.setLineDash([]); }
          // anel de escolhido / achado na busca
          if (n.id === est.selId || (achou && achou.has(n.id))) {
            ctx.globalAlpha = 1; ctx.beginPath(); ctx.arc(x, y, r + 5 + (n.id === est.selId ? 2 * Math.sin(t * 5) : 0), 0, Math.PI * 2);
            ctx.strokeStyle = n.id === est.selId ? '#FFFFFF' : '#FDE047'; ctx.lineWidth = 2; ctx.stroke();
          }
        }
      }

      // ---- nomes (etapa sempre; situacao quando cabe; o resto so em foco)
      // prioridade: escolhido/foco > etapa > mais usado; nome que bateria num nome ja escrito fica de fora
      ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.lineJoin = 'round';
      const candidatos = [];
      for (const n of sim.nos) {
        if (!visivelNo(n)) continue;
        const emFoco = (foco && foco.has(n.id)) || (achou && achou.has(n.id)) || n.id === est.selId;
        const mostra = n.d.tipo === 'etapa' || emFoco || (n.d.tipo === 'categoria' && (v.k >= 0.95 || n.d.usos7d >= 8)) || (v.k >= 1.7);
        if (!mostra || (apagado(n) && !emFoco)) continue;
        const x = sx(n.x); const y = sy(n.y) + raioTela(n, v.k) + 4;
        if (x < -60 || y < -40 || x > w + 60 || y > h + 20) continue;
        const prio = (n.id === est.selId ? 1e6 : 0) + (emFoco ? 1e5 : 0) + (n.d.tipo === 'etapa' ? 1e4 : 0) + (n.d.usos7d || 0);
        candidatos.push({ n, x, y, emFoco, prio });
      }
      candidatos.sort((a, b) => b.prio - a.prio);
      const ocupados = [];
      for (const c of candidatos) {
        const { n, y, emFoco } = c; let { x } = c;
        const etapa = n.d.tipo === 'etapa';
        const tam = etapa ? limitar(13 * Math.sqrt(v.k), 11, 16) : limitar(11 * Math.sqrt(v.k), 10, 13);
        ctx.font = etapa ? `800 ${tam}px Outfit, sans-serif` : `600 ${tam}px "Plus Jakarta Sans", sans-serif`;
        const txt = cortar(n.d.rotulo, etapa ? 30 : emFoco ? 44 : 34);
        const lw = ctx.measureText(txt).width;
        x = limitar(x, lw / 2 + 6, w - lw / 2 - 6); // nome nao sai pela borda do mapa
        const caixa = { x0: x - lw / 2 - 2, x1: x + lw / 2 + 2, y0: y - 1, y1: y + tam + 2 };
        if (ocupados.some((o) => caixa.x0 < o.x1 && caixa.x1 > o.x0 && caixa.y0 < o.y1 && caixa.y1 > o.y0)) continue;
        ocupados.push(caixa);
        ctx.globalAlpha = 1; ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(7,11,20,0.92)'; ctx.strokeText(txt, x, y);
        ctx.fillStyle = etapa ? '#FFFFFF' : emFoco ? '#F1F5F9' : 'rgba(203,213,225,0.85)'; ctx.fillText(txt, x, y);
      }
      ctx.globalAlpha = 1;
    };
    raf = requestAnimationFrame(desenhar);
    return () => cancelAnimationFrame(raf);
  }, [ajustar]);

  // ---- toque / mouse
  const acharNo = (px, py, tolerancia) => {
    const sim = simRef.current; if (!sim) return null;
    const p = telaParaMundo(px, py); const k = viewRef.current.k;
    let melhor = null; let dist = Infinity;
    for (const n of sim.nos) {
      if (!visivelNo(n)) continue;
      const d = Math.hypot(n.x - p.x, n.y - p.y);
      const lim = (raioTela(n, k) + tolerancia) / k;
      const folga = d * k - raioTela(n, k);
      if (d <= lim && folga < dist) { dist = folga; melhor = n; }
    }
    return melhor;
  };
  const posicao = (e) => { const r = canvasRef.current.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };

  const aoBaixar = (e) => {
    const c = canvasRef.current; c.setPointerCapture?.(e.pointerId);
    const p = posicao(e); ptrsRef.current.set(e.pointerId, p);
    if (e.pointerType === 'touch') setToque(true);
    viewAlvoRef.current = null;
    Object.assign(estadoRef.current, { interagiu: true, ativo: true }); setAvisoRoda(false);
    if (ptrsRef.current.size === 2) {
      const [a, b] = [...ptrsRef.current.values()];
      const meio = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      if (gestoRef.current?.no) { gestoRef.current.no.fx = null; gestoRef.current.no.fy = null; }
      gestoRef.current = { tipo: 'pinca', d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, k0: viewRef.current.k, mundo: telaParaMundo(meio.x, meio.y) };
      return;
    }
    const no = acharNo(p.x, p.y, e.pointerType === 'touch' ? 14 : 4);
    gestoRef.current = { tipo: no ? 'no' : 'fundo', no, x0: p.x, y0: p.y, vx0: viewRef.current.x, vy0: viewRef.current.y, moveu: false };
    if (no) { no.fx = no.x; no.fy = no.y; }
  };
  const aoMover = (e) => {
    const p = posicao(e);
    if (ptrsRef.current.has(e.pointerId)) ptrsRef.current.set(e.pointerId, p);
    const g = gestoRef.current;
    if (!g) {
      if (e.pointerType !== 'mouse') return;
      const no = acharNo(p.x, p.y, 4);
      const id = no?.id || null;
      if (estadoRef.current.hoverId !== id) { estadoRef.current.hoverId = id; canvasRef.current.style.cursor = no ? 'pointer' : 'grab'; }
      setDica(no ? { no: no.d, x: Math.min(p.x + 14, tamRef.current.w - 250), y: Math.max(8, p.y - 12) } : null);
      return;
    }
    if (g.tipo === 'pinca') {
      if (ptrsRef.current.size < 2) return;
      const [a, b] = [...ptrsRef.current.values()];
      const meio = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const k = limitar(g.k0 * (Math.hypot(a.x - b.x, a.y - b.y) / g.d0), 0.15, 4);
      viewRef.current = { k, x: meio.x - g.mundo.x * k, y: meio.y - g.mundo.y * k };
      return;
    }
    if (!g.moveu && Math.hypot(p.x - g.x0, p.y - g.y0) > 5) { g.moveu = true; setDica(null); }
    if (!g.moveu) return;
    if (g.tipo === 'no') {
      const m = telaParaMundo(p.x, p.y); g.no.fx = m.x; g.no.fy = m.y;
      simRef.current.alpha = Math.max(simRef.current.alpha, 0.25);
    } else {
      viewRef.current = { ...viewRef.current, x: g.vx0 + (p.x - g.x0), y: g.vy0 + (p.y - g.y0) };
      canvasRef.current.style.cursor = 'grabbing';
    }
  };
  const aoSoltar = (e) => {
    ptrsRef.current.delete(e.pointerId);
    const g = gestoRef.current;
    if (!g) return;
    if (g.tipo === 'pinca') { if (ptrsRef.current.size === 0) gestoRef.current = null; return; }
    if (g.no) { g.no.fx = null; g.no.fy = null; }
    if (!g.moveu && e.type === 'pointerup') selecionar(g.no ? g.no.id : null, false);
    gestoRef.current = null;
    canvasRef.current.style.cursor = 'grab';
  };
  const aoSair = () => { if (!gestoRef.current) { Object.assign(estadoRef.current, { hoverId: null, ativo: false }); setDica(null); } };

  // roda do mouse = zoom no ponto do cursor, mas so com Ctrl/Cmd ou depois de clicar no mapa — senao a roda rola a
  // pagina normalmente (o mapa ocupa quase a tela toda e prenderia a rolagem). Listener nao-passivo pro preventDefault.
  useEffect(() => {
    const c = canvasRef.current; if (!c) return undefined;
    let timer = 0;
    const roda = (e) => {
      if (!e.ctrlKey && !e.metaKey && !estadoRef.current.ativo) {
        setAvisoRoda(true); clearTimeout(timer); timer = setTimeout(() => setAvisoRoda(false), 1400);
        return;
      }
      e.preventDefault(); viewAlvoRef.current = null; estadoRef.current.interagiu = true;
      const r = c.getBoundingClientRect(); const px = e.clientX - r.left; const py = e.clientY - r.top;
      const v = viewRef.current; const k = limitar(v.k * Math.exp(-e.deltaY * 0.0015), 0.15, 4);
      viewRef.current = { k, x: px - ((px - v.x) / v.k) * k, y: py - ((py - v.y) / v.k) * k };
    };
    c.addEventListener('wheel', roda, { passive: false });
    return () => { c.removeEventListener('wheel', roda); clearTimeout(timer); };
  }, []);

  const zoom = (f) => {
    estadoRef.current.interagiu = true;
    const { w, h } = tamRef.current; const v = viewAlvoRef.current || viewRef.current; const k = limitar(v.k * f, 0.15, 4);
    viewAlvoRef.current = { k, x: w / 2 - ((w / 2 - v.x) / v.k) * k, y: h / 2 - ((h / 2 - v.y) / v.k) * k };
  };

  const aposMudar = useCallback(async (novoSel) => {
    const d = await carregar(true);
    onMudou?.();
    if (d) setSelId((atual) => (novoSel && d.nos.some((n) => n.id === novoSel) ? novoSel : d.nos.some((n) => n.id === atual) ? atual : null));
    if (novoSel) setTimeout(() => centralizar(novoSel), 400);
  }, [carregar, onMudou, centralizar]);
  const disparar = useCallback((ids) => { estadoRef.current.disparo = { ids, ate: performance.now() + 2600 }; }, []);

  const contagem = useMemo(() => {
    const c = { etapa: 0, categoria: 0, ensinamento: 0, achado: 0, aprendizado: 0 };
    for (const n of dados?.nos || []) c[n.tipo]++;
    return c;
  }, [dados]);
  const resultados = useMemo(() => {
    const q = semAcento(busca.trim());
    if (!q || !dados) return [];
    return dados.nos.filter((n) => semAcento(`${n.rotulo} ${n.descricao} ${(n.extra?.exemplos || []).join(' ')}`).includes(q))
      .sort((a, b) => (a.tipo === 'etapa' ? -1 : 0) - (b.tipo === 'etapa' ? -1 : 0) || b.usos7d - a.usos7d).slice(0, 8);
  }, [busca, dados]);
  const noSel = (selId && dados?.nos.find((n) => n.id === selId)) || null;

  // erro na 1a carga NAO pode desmontar o canvas: os efeitos (laco de desenho, ResizeObserver, roda) ficam presos ao
  // canvas antigo e o mapa ficaria em branco mesmo depois que a API voltasse. O erro aparece por cima do palco.
  const u = dados?.uso;
  const pctRoteiro = u?.mensagens7d ? Math.round((u.viaFluxo / u.mensagens7d) * 100) : null;

  return (
    <div className="mc">
      <div className="mc-barra">
        <div className="mc-busca">
          <Search size={15} />
          <input className="input-field" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar neurônio: remold, parcela, localização…"
            onKeyDown={(e) => { if (e.key === 'Enter' && resultados[0]) { selecionar(resultados[0].id, true); setBusca(''); } if (e.key === 'Escape') setBusca(''); }} aria-label="Buscar no mapa" />
          {busca && <button type="button" className="mc-icone" onClick={() => setBusca('')} aria-label="Limpar busca"><X size={14} /></button>}
          {resultados.length > 0 && (
            <ul className="mc-resultados" role="listbox">
              {resultados.map((n) => (
                <li key={n.id}>
                  <button type="button" onClick={() => { selecionar(n.id, true); setBusca(''); }}>
                    <span className="mc-ponto" style={{ background: corDoNo(n) }} /><span className="mc-viz-nome">{n.rotulo}</span><span className="mc-viz-peso">{NOME_TIPO[n.tipo]}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="mc-filtros" role="group" aria-label="Mostrar no mapa">
          {Object.keys(NOME_TIPO).map((t) => (
            <button key={t} type="button" className={`mc-filtro ${tiposOn[t] ? 'mc-filtro-on' : ''}`} aria-pressed={tiposOn[t]}
              onClick={() => setTiposOn((x) => ({ ...x, [t]: !x[t] }))}>
              <span className={`mc-forma mc-forma-${t}`} />{NOME_TIPO[t]} <b>{contagem[t]}</b>
            </button>
          ))}
        </div>
      </div>

      {u && (
        <div className="mc-resumo">
          <span><b>{u.mensagensHoje}</b> respostas hoje</span>
          <span><b>{u.mensagens7d}</b> em 7 dias</span>
          {pctRoteiro != null && <span><b>{pctRoteiro}%</b> pelo roteiro</span>}
          <span><b>{u.viaLivre}</b> na IA livre</span>
          {dados.revisao && <span className="mc-resumo-alerta"><b>{dados.revisao.pendentes}</b> achados pra revisar</span>}
          {dados.aprendizado?.pendente > 0 && <span className="mc-resumo-josy"><b>{dados.aprendizado.pendente}</b> propostas do jeito da Josy</span>}
          {u.fonte !== 'rastro' && <span className="mc-resumo-alerta">contagem só pelo log ({u.erro || 'sem rastro'})</span>}
          <button type="button" className="mc-icone" onClick={() => carregar(false)} title="Atualizar agora" aria-label="Atualizar agora"><RefreshCw size={14} className={carregando ? 'mc-gira' : ''} /></button>
        </div>
      )}

      <div className={`mc-palco ${noSel ? 'mc-palco-com-painel' : ''}`} ref={caixaRef}>
        <canvas ref={canvasRef} className="mc-canvas" tabIndex={0} aria-label="Mapa do cérebro do robô. Use a busca acima para achar um neurônio pelo teclado."
          onPointerDown={aoBaixar} onPointerMove={aoMover} onPointerUp={aoSoltar} onPointerCancel={aoSoltar} onPointerLeave={aoSair}
          onDoubleClick={() => ajustar(true)} onKeyDown={(e) => { if (e.key === 'Escape') selecionar(null); }} />
        {!dados && <div className="mc-carregando">{erro ? `${erro} — tentando de novo em 2 min.` : 'Ligando os neurônios…'}</div>}
        <div className="mc-ajuda">{toque ? 'Toque num neurônio · arraste · pinça pra zoom' : 'Clique num neurônio · arraste · Ctrl + roda (ou clique e role) pra zoom · duplo clique enquadra'}</div>
        {avisoRoda && <div className="mc-aviso-roda">Segure Ctrl (⌘ no Mac) e role pra dar zoom — ou clique no mapa antes</div>}
        <div className="mc-controles">
          <button type="button" className="mc-icone" onClick={() => zoom(1.3)} aria-label="Aproximar"><Plus size={16} /></button>
          <button type="button" className="mc-icone" onClick={() => zoom(1 / 1.3)} aria-label="Afastar"><Minus size={16} /></button>
          <button type="button" className="mc-icone" onClick={() => ajustar(true)} aria-label="Mostrar tudo"><Crosshair size={16} /></button>
          <button type="button" className="mc-icone" onClick={() => setPausado((x) => !x)} aria-label={pausado ? 'Ligar animação' : 'Pausar animação'}>{pausado ? <Play size={16} /> : <Pause size={16} />}</button>
        </div>
        {dica && !noSel && (
          <div className="mc-dica-flutuante" style={{ left: dica.x, top: dica.y }}>
            <div className="mc-dica-tipo" style={{ color: corDoNo(dica.no) }}>{NOME_TIPO_UM[dica.no.tipo]}</div>
            <b>{cortar(dica.no.rotulo, 70)}</b>
            {dica.no.tipo !== 'achado' && <div className="mc-dica-num">hoje <b>{dica.no.usosHoje}</b> · 7 dias <b>{dica.no.usos7d}</b></div>}
            <div className="mc-dica-txt">{cortar(dica.no.descricao, 130)}</div>
          </div>
        )}
        {noSel && dados && (() => {
          const painel = <Painel key={noSel.id} d={noSel} dados={dados} lojas={lojas} onFechar={() => selecionar(null)} onIr={(id) => selecionar(id, true)} onMudou={aposMudar} onDisparo={disparar} />;
          return celular ? createPortal(painel, document.body) : painel;
        })()}
      </div>

      <div className="mc-legenda">
        <span><span className="mc-forma mc-forma-etapa" /> etapa da conversa (número = respostas hoje)</span>
        <span><span className="mc-forma mc-forma-categoria" /> situação que o robô reconhece — maior = mais usada em 7 dias</span>
        <span><span className="mc-forma mc-forma-ensinamento" /> seu ensinamento</span>
        <span><span className="mc-forma mc-forma-achado" /> achado da revisão piscando (esperando você)</span>
        <span><span className="mc-forma mc-forma-aprendizado" /> proposta do jeito da Josy (esperando você; maior = mais vezes nas conversas)</span>
        <span><span className="mc-pulso" /> pulsos = caminho real das conversas (mais pulsos, mais gente passou)</span>
        <span>brilho pulsando = usado hoje</span>
        <span className="mc-cores">{ETAPAS.map((e) => <span key={e}><span className="mc-ponto" style={{ background: COR_ETAPA[e] }} />{dados?.nos.find((n) => n.id === `etapa:${e}`)?.rotulo || e}</span>)}</span>
      </div>
    </div>
  );
}
