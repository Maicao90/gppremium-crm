const { Client } = require("pg");
const fs = require("fs");
const path = require("path");

const configPath = path.join(__dirname, "../config_nuvem.json");
const config = JSON.parse(fs.readFileSync(configPath));

async function test(name, conn) {
  if (!conn) {
    console.log(`=== DB ${name} NOT CONFIGURING ===`);
    return;
  }
  try {
    const client = new Client({ connectionString: conn });
    await client.connect();
    const res = await client.query('SELECT id, nome, email, senha, role FROM "Usuario"');
    console.log(`\n=== DB ${name} ===`);
    console.log(JSON.stringify(res.rows, null, 2));
    await client.end();
  } catch (e) {
    console.log(`=== DB ${name} FAILED: ${e.message}`);
  }
}

async function run() {
  await test("planoA", config.planoA);
  await test("planoB", config.planoB);
  await test("planoC", config.planoC);
}

run();
