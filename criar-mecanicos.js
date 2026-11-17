// Cria 1 conta de MECÂNICO (app da garantia) por loja: <loja>@app / senha 111111 (pedido do dono 28/10).
// Perfil igual ao dos mecânicos existentes: role operador + só o módulo garantia50k. Não mexe em quem já existe.
const { PrismaClient } = require('/root/whatsapp-crm/backend/node_modules/@prisma/client');
const bcrypt = require('/root/whatsapp-crm/backend/node_modules/bcryptjs');
const p = new PrismaClient();
const CONTAS = [
  ['borracharia@app', 'Mecânico Borracharia Popular', 'a13f98cd-22d9-4225-a05b-0f3134983e9b'],
  ['city@app', 'Mecânico City Pneus', 'cb13ea54-9df1-44bf-9e12-b59bb46167d4'],
  ['direcional@app', 'Mecânico Direcional Pneus', '22f3010b-5eeb-449c-865c-e194301d5f9b'],
  ['feirao@app', 'Mecânico Feirão dos Pneus', '06498675-da9c-40e6-9502-e8468f0ee439'],
  ['gppremium@app', 'Mecânico GP Premium', '72213a6c-31c5-410d-a6b4-504dfd223e2f'],
  ['supervia@app', 'Mecânico Super Via Pneus', 'c6d8ace4-9d05-4490-83ee-a20f9f9c4b06'],
];
(async () => {
  const hash = await bcrypt.hash('111111', 10);
  for (const [email, nome, lojaId] of CONTAS) {
    const ja = await p.usuario.findFirst({ where: { email } });
    if (ja) { console.log('JA EXISTE', email); continue; }
    await p.usuario.create({ data: { email, nome, senha: hash, role: 'operador', ativo: true, lojaId, modulosPermitidos: JSON.stringify(['garantia50k']) } });
    console.log('CRIADO', email, nome);
  }
  await p.$disconnect();
})().catch((e) => { console.log('ERRO', e.message); process.exit(1); });
