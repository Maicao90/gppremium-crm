// 23/10 (dono: "os agendamentos estao desatualizados"): o periodo da campanha vai ate HOJE (agendamentos programados ate hoje).
const fs = require('fs');
const f = '/root/whatsapp-crm/backend/public/anuncios/dados/pontuacao.json';
const p = JSON.parse(fs.readFileSync(f, 'utf8'));
const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
console.log('ate:', p.ate, '->', hoje);
p.ate = hoje;
fs.writeFileSync(f, JSON.stringify(p, null, 1));
