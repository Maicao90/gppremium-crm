// Backup automático do banco ativo (planoA / Supabase) -> arquivo JSON com timestamp.
// Guarda as últimas N cópias. Rode via cron (ex.: a cada 6h).
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const BACKUP_DIR = '/root/backups';
const MAX_BACKUPS = 28; // ~1 semana se rodar a cada 6h
const TABELAS = ['Usuario', 'Agendamento', 'Contato', 'Configuracao', 'AutoReplyHistory'];

function carimbo() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}`;
}

(async () => {
  const url = JSON.parse(fs.readFileSync('/root/whatsapp-crm/backend/config_nuvem.json', 'utf8')).planoA;
  const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 30000 });
  try {
    if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
    await c.connect();
    const dump = { geradoEm: new Date().toISOString(), tabelas: {} };
    for (const t of TABELAS) {
      try {
        const r = await c.query(`SELECT * FROM "${t}"`);
        dump.tabelas[t] = r.rows;
        console.log(`${t}: ${r.rows.length} registros`);
      } catch (e) {
        console.log(`${t}: (pulado) ${e.message}`);
      }
    }
    await c.end();

    const arquivo = path.join(BACKUP_DIR, `backup_${carimbo()}.json`);
    fs.writeFileSync(arquivo, JSON.stringify(dump));
    console.log('Backup salvo em', arquivo);

    // Rotaciona: mantém só os MAX_BACKUPS mais recentes
    const arquivos = fs.readdirSync(BACKUP_DIR).filter(f => f.startsWith('backup_') && f.endsWith('.json')).sort();
    while (arquivos.length > MAX_BACKUPS) {
      const antigo = arquivos.shift();
      fs.unlinkSync(path.join(BACKUP_DIR, antigo));
      console.log('Removido backup antigo:', antigo);
    }
  } catch (e) {
    console.error('ERRO no backup:', e.message);
    try { await c.end(); } catch (_) {}
    process.exit(1);
  }
})();
