// Leitura-apenas: testa cada banco do config_nuvem.json e conta dados.
const fs = require('fs');
const { Client } = require('pg');

(async () => {
  const cfg = JSON.parse(fs.readFileSync('/root/whatsapp-crm/backend/config_nuvem.json', 'utf8'));
  for (const [plano, url] of Object.entries(cfg)) {
    if (!url || typeof url !== 'string') continue;
    const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 9000 });
    try {
      await c.connect();
      const u = await c.query('SELECT COUNT(*)::int n FROM "Usuario"');
      const ag = await c.query('SELECT COUNT(*)::int n FROM "Agendamento"').catch(() => ({ rows: [{ n: '?' }] }));
      const ct = await c.query('SELECT COUNT(*)::int n FROM "Contato"').catch(() => ({ rows: [{ n: '?' }] }));
      const jos = await c.query(`SELECT email FROM "Usuario" WHERE email ILIKE '%jos%' OR email ILIKE '%josy%' LIMIT 5`).catch(() => ({ rows: [] }));
      console.log(`${plano}: OK | usuarios=${u.rows[0].n} agendamentos=${ag.rows[0].n} contatos=${ct.rows[0].n} | jos: ${jos.rows.map(r => r.email).join(', ') || '(nenhum)'}`);
      await c.end();
    } catch (e) {
      console.log(`${plano}: ERRO -> ${e.message}`);
      try { await c.end(); } catch (_) {}
    }
  }
  process.exit(0);
})();
