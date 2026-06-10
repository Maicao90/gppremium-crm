// Cria a tabela Mensagem (Caixa de Entrada) no banco ativo (planoA / Supabase). Aditivo/seguro.
const fs = require('fs');
const { Client } = require('pg');

(async () => {
  const url = JSON.parse(fs.readFileSync('/root/whatsapp-crm/backend/config_nuvem.json', 'utf8')).planoA;
  const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 20000 });
  const stmts = [
    `CREATE TABLE IF NOT EXISTS "Mensagem" (
      "id" TEXT PRIMARY KEY,
      "usuarioId" TEXT NOT NULL,
      "chatJid" TEXT NOT NULL,
      "chatNome" TEXT NOT NULL DEFAULT '',
      "fromMe" BOOLEAN NOT NULL DEFAULT false,
      "texto" TEXT NOT NULL DEFAULT '',
      "tipo" TEXT NOT NULL DEFAULT 'texto',
      "waId" TEXT,
      "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE INDEX IF NOT EXISTS "Mensagem_usuarioId_chatJid_idx" ON "Mensagem" ("usuarioId","chatJid")`,
    `CREATE INDEX IF NOT EXISTS "Mensagem_usuarioId_idx" ON "Mensagem" ("usuarioId")`
  ];
  try {
    await c.connect();
    for (const s of stmts) {
      try { await c.query(s); console.log('OK:', s.slice(0, 50).replace(/\s+/g, ' ')); }
      catch (e) { console.log('SKIP:', e.message); }
    }
    const t = await c.query(`SELECT to_regclass('"Mensagem"') AS t`);
    console.log('Tabela Mensagem existe:', t.rows[0].t);
    await c.end();
  } catch (e) {
    console.error('ERRO:', e.message);
    try { await c.end(); } catch (_) {}
    process.exit(1);
  }
})();
