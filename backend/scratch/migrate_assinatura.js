// Adiciona a coluna assinaturaPainel na tabela Usuario (banco ativo planoA). Aditivo/seguro.
const fs = require('fs');
const { Client } = require('pg');

(async () => {
  const url = JSON.parse(fs.readFileSync('/root/whatsapp-crm/backend/config_nuvem.json', 'utf8')).planoA;
  const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 20000 });
  try {
    await c.connect();
    await c.query('ALTER TABLE "Usuario" ADD COLUMN IF NOT EXISTS "assinaturaPainel" TEXT');
    const r = await c.query("SELECT column_name FROM information_schema.columns WHERE table_name='Usuario' AND column_name='assinaturaPainel'");
    console.log('coluna assinaturaPainel:', r.rows.length ? 'OK' : 'FALTANDO');
    await c.end();
  } catch (e) {
    console.error('ERRO:', e.message);
    try { await c.end(); } catch (_) {}
    process.exit(1);
  }
})();
