// Zera a tabela Contato no banco ATIVO (planoA / Supabase), conforme escolha do usuário.
const fs = require('fs');
const { Client } = require('pg');

(async () => {
  const cfg = JSON.parse(fs.readFileSync('/root/whatsapp-crm/backend/config_nuvem.json', 'utf8'));
  const url = cfg.planoA;
  const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 20000 });
  try {
    await c.connect();
    const before = await c.query('SELECT COUNT(*)::int n FROM "Contato"');
    const del = await c.query('DELETE FROM "Contato"');
    console.log(`Contatos antes: ${before.rows[0].n} | apagados: ${del.rowCount}`);
    await c.end();
  } catch (e) {
    console.error('ERRO:', e.message);
    try { await c.end(); } catch (_) {}
    process.exit(1);
  }
})();
