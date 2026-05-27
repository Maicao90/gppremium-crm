const { Client } = require("pg");
const fs = require("fs");
const path = require("path");

const configPath = path.join(__dirname, "../config_nuvem.json");
const config = JSON.parse(fs.readFileSync(configPath));

async function run() {
  const client = new Client({ connectionString: config.planoA });
  try {
    await client.connect();
    const res = await client.query('SELECT * FROM "Agendamento" LIMIT 10');
    console.log("=== ULTIMOS AGENDAMENTOS ===");
    console.log(JSON.stringify(res.rows, null, 2));
  } catch (e) {
    console.error("Erro:", e.message);
  } finally {
    await client.end();
  }
}

run();
