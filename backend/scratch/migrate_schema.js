// Aplica o novo esquema (Contato.usuarioId + unique composto; tabela AutoReplyHistory)
// via SQL idempotente no banco ativo (planoA / Supabase). Tabela Contato já está vazia.
const fs = require('fs');
const { Client } = require('pg');

(async () => {
  const url = JSON.parse(fs.readFileSync('/root/whatsapp-crm/backend/config_nuvem.json', 'utf8')).planoA;
  const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 20000 });

  const stmts = [
    `ALTER TABLE "Contato" ADD COLUMN IF NOT EXISTS "usuarioId" TEXT`,
    `UPDATE "Contato" SET "usuarioId" = '' WHERE "usuarioId" IS NULL`,
    `ALTER TABLE "Contato" ALTER COLUMN "usuarioId" SET NOT NULL`,
    `ALTER TABLE "Contato" DROP CONSTRAINT IF EXISTS "Contato_numero_key"`,
    `DROP INDEX IF EXISTS "Contato_numero_key"`,
    `ALTER TABLE "Contato" ADD CONSTRAINT "Contato_usuarioId_numero_key" UNIQUE ("usuarioId","numero")`,
    `CREATE INDEX IF NOT EXISTS "Contato_usuarioId_idx" ON "Contato" ("usuarioId")`,
    `CREATE TABLE IF NOT EXISTS "AutoReplyHistory" ("id" TEXT PRIMARY KEY, "usuarioId" TEXT NOT NULL, "numero" TEXT NOT NULL, "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "AutoReplyHistory_usuarioId_numero_key" ON "AutoReplyHistory" ("usuarioId","numero")`
  ];

  try {
    await c.connect();
    for (const s of stmts) {
      try { await c.query(s); console.log('OK   :', s.slice(0, 62)); }
      catch (e) { console.log('SKIP :', s.slice(0, 50), '->', e.message); }
    }
    const cols = await c.query(`SELECT column_name FROM information_schema.columns WHERE table_name='Contato' ORDER BY 1`);
    console.log('Colunas Contato:', cols.rows.map(r => r.column_name).join(', '));
    const arh = await c.query(`SELECT to_regclass('"AutoReplyHistory"') AS t`);
    console.log('AutoReplyHistory existe:', arh.rows[0].t);
    await c.end();
  } catch (e) {
    console.error('ERRO CONEXAO:', e.message);
    try { await c.end(); } catch (_) {}
    process.exit(1);
  }
})();
