// Componentes do "Cerebro do robo" usados em mais de uma tela (abas da pagina e Mapa do cerebro).
// Sairam de pages/CerebroRobo.jsx sem mudar nada (22/10); as constantes estao em cerebroConstantes.js.
import { API_BASE } from '../apiBase';
import { ACOES, RE_MARCADOR_AUDIO, vazio } from './cerebroConstantes';

// semAvisoPreco: quem usa ja mostra o proprio aviso de preco/medida (card do Aprendizado da Josy)
export function FormLicao({ valor, onChange, lojas, compacto, semAvisoPreco }) {
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
      {!semAvisoPreco && v.acao === 'responder' && /R\$\s?\d|\d{3}\/\d{2}/.test(v.resposta || '') && (
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

// Uma bolha por parte. Parte que e marcador de audio ([ENVIAR_AUDIO:nome!N]) vira o player do audio; as N partes
// seguintes aparecem apagadas como "reserva" (so vao se o audio falhar).
export function Bolhas({ partes }) {
  if (!partes?.length) return <div className="muted-hint">(o robô não manda nada)</div>;
  const reserva = new Set();
  partes.forEach((p, i) => {
    const m = RE_MARCADOR_AUDIO.exec(String(p).trim());
    const pula = m?.[2] ? Math.min(Number(m[2]), 4) : 0;
    for (let k = 1; k <= pula; k++) reserva.add(i + k);
  });
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      {partes.map((p, i) => {
        const m = RE_MARCADOR_AUDIO.exec(String(p).trim());
        if (m) {
          const pula = m[2] ? Math.min(Number(m[2]), 4) : 0;
          return (
            <div key={i} style={{ justifySelf: 'end', width: 'min(300px, 85%)', background: '#144d37', color: '#e9f5ef', padding: '8px 10px', borderRadius: 10, display: 'grid', gap: 6, fontSize: '0.8rem' }}>
              <span>🎙 Áudio <b>{m[1]}</b>{pula ? ` (no lugar das ${pula === 1 ? 'próxima mensagem' : `${pula} próximas mensagens`})` : ''}</span>
              <audio controls preload="none" src={`${API_BASE}/midias/bot-audios/${m[1]}.ogg`} style={{ width: '100%', height: 36 }} />
            </div>
          );
        }
        const deReserva = reserva.has(i);
        return (
          <div key={i} style={{ justifySelf: 'end', maxWidth: '85%', background: deReserva ? 'transparent' : '#144d37', border: deReserva ? '1px dashed #2f7a5a' : '0', color: deReserva ? '#9fc9b4' : '#e9f5ef', padding: '8px 12px', borderRadius: 10, whiteSpace: 'pre-wrap', fontSize: '0.9rem' }}>
            {deReserva && <div style={{ fontSize: '0.68rem', fontWeight: 700, opacity: 0.8, marginBottom: 2 }}>reserva (só vai se o áudio falhar)</div>}
            {p}
          </div>
        );
      })}
    </div>
  );
}
