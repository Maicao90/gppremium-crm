// Componentes do "Cerebro do robo" usados em mais de uma tela (abas da pagina e Mapa do cerebro).
// Sairam de pages/CerebroRobo.jsx sem mudar nada (22/10); as constantes estao em cerebroConstantes.js.
import { ACOES, vazio } from './cerebroConstantes';

export function FormLicao({ valor, onChange, lojas, compacto }) {
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

export function Bolhas({ partes }) {
  if (!partes?.length) return <div className="muted-hint">(o robô não manda nada)</div>;
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      {partes.map((p, i) => (
        <div key={i} style={{ justifySelf: 'end', maxWidth: '85%', background: '#144d37', color: '#e9f5ef', padding: '8px 12px', borderRadius: 10, whiteSpace: 'pre-wrap', fontSize: '0.9rem' }}>{p}</div>
      ))}
    </div>
  );
}
