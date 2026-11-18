// Testa a trava de 18/11 (outra loja / telefone) com frases reais, sem IA. Uso: node testa-outra-loja.js
const OUTRAS_LOJAS = /(borracharia|novo gama|lunabel|pont[aã]o 24h|pneu express|city pneus|feir[aã]o dos pneus|direcional pneus|super ?via|atacad[aã]o dos pneus)/i;
function iaIndicouOutraLoja(partes, lb) {
  const nomeProprio = String(lb?.nome || '').toLowerCase();
  const telProprio = String(lb?.telefone || '').replace(/\D/g, '').slice(-8);
  return (partes || []).some((p) => {
    const t = String(p || '');
    const m = OUTRAS_LOJAS.exec(t);
    if (m && !nomeProprio.includes(String(m[1]).toLowerCase())) return true;
    const tels = t.match(/(?<!\d)(?:\(?\d{2}\)?\s?)?9?\d{4}[-\s.]?\d{4}(?!\d)/g) || [];
    return tels.some((x) => { const d = x.replace(/\D/g, ''); return d.length >= 8 && (!telProprio || d.slice(-8) !== telProprio); });
  });
}
const GP = { nome: 'Pneus GP Premium', telefone: '' };
const casos = [
  [['Claro! Em Novo Gama tem a Borracharia Popular, que deve ficar mais perto de você.', 'O WhatsApp deles é (61) 99999-9000, é só chamar lá.'], true],
  [['Se preferir, a City Pneus também atende aí perto.'], true],
  [['Pode chamar no 61 98888-7777 que eles te ajudam.'], true],
  [['Temos o pneu *175/65/14* da marca *GP Premium* está saindo por *R$ 249,00 à vista*.'], false],
  [['Os 4 pneus saem por *R$ 1.184,70 à vista*. Em 10x fica R$ 125,40 cada.'], false],
  [['O GP Premium é remold de primeira linha, com borracha padrão europeu e controle de qualidade.'], false],
  [['Nossa loja fica na Avenida Perimetral, na Vila Guará, em Luziânia-GO.'], false],
  [['Somos a fábrica GP Premium, aqui em Luziânia-GO 😊 Tem uma placa bem grandona na frente, não tem erro!'], false],
  [['Bom dia! Em São Paulo a gente não tem loja. Nossa loja fica em Luziânia-GO, na Avenida Perimetral, na Vila Guará.'], false],
  [['A medida 225/65/16 sai por R$ 449,00 à vista, 2 pneus R$ 898,00.'], false],
];
let ok = 0;
for (const [p, esperado] of casos) { const r = iaIndicouOutraLoja(p, GP); if (r === esperado) ok++; else console.log('ERRADO', esperado, p.join(' / ')); }
// Borracharia Popular atendendo pela propria config: o nome dela nao e "outra loja".
const BP = { nome: 'Borracharia Popular Pneus', telefone: '(61) 3774-2114' };
if (!iaIndicouOutraLoja(['A Borracharia Popular fica em frente ao posto. Telefone (61) 3774-2114.'], BP)) ok++; else console.log('ERRADO: borracharia falando dela mesma');
console.log(`trava outra loja: ${ok}/${casos.length + 1}`);
process.exitCode = ok === casos.length + 1 ? 0 : 1;
