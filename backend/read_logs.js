const fs = require('fs');
try {
  const out = fs.readFileSync('/root/.pm2/logs/whatsapp-crm-out.log', 'utf8').split('\n').slice(-100).join('\n');
  const err = fs.readFileSync('/root/.pm2/logs/whatsapp-crm-error.log', 'utf8').split('\n').slice(-100).join('\n');
  console.log("OUT LOGS:\n", out);
  console.log("ERR LOGS:\n", err);
} catch (e) {
  console.error("Erro:", e.message);
}
