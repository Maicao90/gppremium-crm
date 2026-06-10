// Cria a tabela Template (mensagens rápidas) no banco ativo (planoA). Aditivo/seguro.
const fs = require('fs');
const { Client } = require('pg');

(async () => {
  const url = JSON.parse(fs.readFileSync('/root/whatsapp-crm/backend/config_nuvem.json', 'utf8')).planoA;
  const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 20000 });
  try {
    await c.connect();
    await c.query(`CREATE TABLE IF NOT EXISTS "Template" (
      "id" TEXT PRIMARY KEY,
      "atalho" TEXT NOT NULL DEFAULT '',
      "texto" TEXT NOT NULL,
      "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    const t = await c.query(`SELECT to_regclass('"Template"') AS t`);
    console.log('Tabela Template:', t.rows[0].t);
    await c.end();
  } catch (e) {
    console.error('ERRO:', e.message);
    try { await c.end(); } catch (_) {}
    process.exit(1);
  }
})();
