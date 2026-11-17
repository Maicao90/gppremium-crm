// Minera o historico real: quando o cliente disse o carro, qual medida a LOJA cotou na mesma conversa?
// So leitura. Uso: node carros-minerar.js > carros-minerados.txt
const { execSync } = require('child_process');
const CARROS = ['gol', 'uno', 'palio', 'celta', 'onix', 'hb20', 'hb20s', 'fox', 'kwid', 'ka', 'fiesta', 'corsa', 'sandero', 'logan', 'prisma', 'cobalt', 'spin', 'strada', 'saveiro', 'hilux', 's10', 'ranger', 'toro', 'compass', 'creta', 'kicks', 'renegade', 'voyage', 'polo', 'virtus', 'argo', 'mobi', 'cronos', 'siena', 'civic', 'corolla', 'fit', 'city', 'etios', 'yaris', 'march', 'versa', 'tracker', 'ecosport', 'duster', '208', '2008', '207', '206', 'c3', 'up', 'fusca', 'parati', 'golf', 'jetta', 'hrv', 'captur', 'oroch', 'frontier', 'l200', 'amarok', 'tucson', 'ix35', 'sportage', 'i30', 'focus', 'meriva', 'zafira', 'astra', 'vectra', 'classic', 'agile', 'montana', 'idea', 'punto', 'doblo', 'fiorino', 'clio', 'cruze', 'spacefox', 'crossfox', 'sentra', 'livina', 'kombi', 'pajero', 'bravo', 'linea', 'weekend', 'courier', 'escort', 'tiida', 'picanto', 'c4', 'tcross', 'nivus', 'pulse', 'fastback', 'kardian', 'stepway', 'santana', 'monza', 'chevette', 'opala', 'bros', 'titan', 'biz', 'fan'];
const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/hb ?20 ?s/g, 'hb20s').replace(/hb ?20/g, 'hb20').replace(/s ?-?10\b/g, 's10').replace(/hr-?v/g, 'hrv').replace(/t-?cross/g, 'tcross').replace(/eco ?sport/g, 'ecosport').replace(/l ?200/g, 'l200').replace(/ix ?35/g, 'ix35').replace(/pegout|pegeout|peugeout|pegeot/g, 'peugeot').replace(/grand siena/g, 'siena');
const RE_CARRO = new RegExp(`(?<![a-z0-9])(${CARROS.join('|')})(?![a-z0-9])`, 'g');
const RE_MED = /(?<![\d$.,])(1[3-9]5|2\d5|3[0-3]5)\s*[\/xX.\- ]\s*([2-8][05])\s*[\/xX.\- ]?\s*[rR]?\s*(1[2-9]|2[0-2])(?!\d)/g;
const sql = `select json_build_array("chatJid", "fromMe", coalesce(texto,''), extract(epoch from timestamp)::bigint) from "Mensagem" where "chatJid" not like '%@g.us' and texto is not null and length(texto) between 2 and 600 and timestamp > now() - interval '200 days' order by "chatJid", timestamp;`;
const linhas = execSync('docker exec -i gp-postgres-crm psql -U postgres -d testdb -tA', { input: sql, maxBuffer: 1500 * 1024 * 1024 }).toString().split('\n').filter(Boolean);
const chats = new Map();
for (const l of linhas) { let a; try { a = JSON.parse(l); } catch { continue; } if (!chats.has(a[0])) chats.set(a[0], []); chats.get(a[0]).push(a); }
const pares = {}, total = {};
for (const msgs of chats.values()) {
  for (let i = 0; i < msgs.length; i++) {
    if (msgs[i][1]) continue;
    const t = norm(msgs[i][2]);
    if (/\d{3}\s*[\/x.\- ]\s*\d{2}/.test(t)) continue; // o proprio cliente ja deu medida: nao serve de evidencia do carro
    const carros = [...new Set([...t.matchAll(RE_CARRO)].map((m) => m[1]))].filter((c) => !(['ka', 'up', 'fit', 'city', 'fan', 'idea', 'classic', 'c3', 'c4', 'fox', 'polo', 'golf', 'march', 'titan', 'biz', 'bros', '206', '207', '208', '2008'].includes(c) && !/carro|pneu|meu|pra|pro|do |da |modelo|ano|\b(19|20)\d\d\b/.test(t)));
    if (carros.length !== 1) continue;
    const carro = carros[0];
    // primeira medida que a LOJA diz nas 6 mensagens seguintes (ate 3h depois)
    let med = null;
    for (let k = i + 1; k < Math.min(msgs.length, i + 8); k++) {
      if (msgs[k][3] - msgs[i][3] > 3 * 3600) break;
      if (!msgs[k][1]) { if (/\d{3}\s*[\/x.\- ]\s*\d{2}/.test(msgs[k][2])) break; continue; }
      const m = [...String(msgs[k][2]).matchAll(RE_MED)].map((x) => `${x[1]}/${x[2]}/${x[3]}`);
      if (m.length) { med = [...new Set(m)]; break; }
    }
    total[carro] = (total[carro] || 0) + 1;
    if (!med || med.length > 3) continue;
    pares[carro] = pares[carro] || {};
    for (const m of med) pares[carro][m] = (pares[carro][m] || 0) + 1;
  }
}
console.log(`conversas: ${chats.size}`);
for (const c of Object.keys(total).sort((a, b) => total[b] - total[a])) {
  const p = Object.entries(pares[c] || {}).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([m, n]) => `${m}×${n}`).join('  ');
  console.log(`${c.padEnd(10)} citado ${String(total[c]).padStart(3)}x | loja cotou: ${p || '-'}`);
}
