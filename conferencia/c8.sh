cat > /tmp/conf-q.js <<'JS'
const { PrismaClient } = require('/root/ant-lab/node_modules/@prisma/client');
const p = new PrismaClient();
const J = (x) => JSON.stringify(x, (k, v) => typeof v === 'bigint' ? Number(v) : v, 1);
(async () => {
  const q = async (sql) => { try { return await p.$queryRawUnsafe(sql); } catch (e) { return 'ERR ' + e.message.slice(0, 300); } };
  console.log(J(await q(`select count(*) n, max("timestamp") ult from "Mensagem"`)));
  console.log(J(await q(`select "chatJid", "timestamp", "fromMe", left(texto,200) t from "Mensagem" where "timestamp" > '2026-10-22 14:30' and "timestamp" < '2026-10-22 14:50' and (texto ilike '%195/55%' or texto ilike '%aro 16%') order by "timestamp" limit 20`)));
  console.log(J(await q(`select "chatJid" from "Mensagem" where "chatJid" like '%98132318%' limit 3`)));
  console.log(J(await q(`select left(texto,160) t, count(*) n from "Mensagem" where texto like '📢 [Anúncio]%' and split_part(texto, E'\n', 2) <> '' group by 1 order by 2 desc limit 15`)));
  console.log(J(await q(`select count(*) n from "Mensagem" where texto like '📢 [Anúncio]%'`)));
  console.log(J(await q(`select left(texto,100) t, count(*) n from "Mensagem" where texto like '📢 [Anúncio]%' group by 1 order by 2 desc limit 12`)));
  await p.$disconnect();
})();
JS
set -a; . /root/whatsapp-crm/backend/.env; set +a
node /tmp/conf-q.js
