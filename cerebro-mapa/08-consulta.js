// Consulta SO LEITURA do rastro do fluxo (FluxoEvento) pra entender o formato dos dados.
require('/root/whatsapp-crm/backend/node_modules/dotenv').config({ path: '/root/whatsapp-crm/backend/.env', quiet: true });
const { Client } = require('/root/whatsapp-crm/backend/node_modules/pg');
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL, options: '-c default_transaction_read_only=on -c statement_timeout=5000' });
  await c.connect();
  const q = async (sql) => (await c.query(sql)).rows;
  console.log('via 7d', await q(`SELECT via, count(*)::int n FROM "FluxoEvento" WHERE "criadoEm" > now() - interval '7 days' GROUP BY via`));
  console.log('motivos', await q(`SELECT "motivoLivre", count(*)::int n FROM "FluxoEvento" WHERE "criadoEm" > now() - interval '7 days' GROUP BY 1 ORDER BY 2 DESC LIMIT 15`));
  console.log('chaves', await q(`SELECT ch, count(*)::int n FROM "FluxoEvento", jsonb_array_elements_text(chaves::jsonb) ch WHERE "criadoEm" > now() - interval '7 days' GROUP BY ch ORDER BY n DESC`));
  console.log('assuntos amostra', await q(`SELECT assuntos, chaves, via, "estadoAntes", "estadoDepois" FROM "FluxoEvento" ORDER BY "criadoEm" DESC LIMIT 6`));
  console.log('FluxoResposta', await q(`SELECT chave, length(partes) tam FROM "FluxoResposta" ORDER BY chave LIMIT 60`));
  console.log('min data', await q(`SELECT min("criadoEm"), count(*)::int FROM "FluxoEvento"`));
  await c.end();
})().catch((e) => { console.error('ERRO', e.message); process.exit(1); });
