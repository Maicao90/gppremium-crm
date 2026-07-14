// Conserta um bug do Plasmo 0.90.5: às vezes o manifest.json referencia um CSS
// (ex.: content.<hash>.css) que o build NÃO gera. O Chrome então RECUSA a extensão
// ("erro ao carregar") e nada aparece. Aqui garantimos que todo arquivo referenciado
// exista: se for um .css faltando, CRIAMOS ele vazio (mantém a estrutura do Plasmo
// intacta — mais seguro do que remover a referência). Se faltar outro tipo (.js/.png),
// que não dá pra falsificar, aí sim removemos a referência. Roda no fim do build.
import fs from "node:fs";
import path from "node:path";

const dir = path.resolve("build/chrome-mv3-prod");
const manifestPath = path.join(dir, "manifest.json");
if (!fs.existsSync(manifestPath)) {
  console.error("[fix-manifest] manifest.json não encontrado em", dir);
  process.exit(0);
}
const m = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const existe = (f) => fs.existsSync(path.join(dir, f));
const criados = [];
const removidos = [];

// Mantém só refs válidas; conserta .css faltando criando vazio.
const resolver = (arr) =>
  arr.filter((f) => {
    if (existe(f)) return true;
    if (f.endsWith(".css")) {
      fs.writeFileSync(path.join(dir, f), "/* placeholder gerado pelo fix-manifest (Plasmo não emitiu este CSS) */\n");
      criados.push(f);
      return true;
    }
    removidos.push(f);
    return false;
  });

if (Array.isArray(m.web_accessible_resources)) {
  for (const w of m.web_accessible_resources) {
    if (Array.isArray(w.resources)) w.resources = resolver(w.resources);
  }
  m.web_accessible_resources = m.web_accessible_resources.filter((w) => w.resources && w.resources.length);
}
for (const cs of m.content_scripts || []) {
  if (Array.isArray(cs.css)) cs.css = resolver(cs.css);
  if (Array.isArray(cs.js)) cs.js = resolver(cs.js);
}

fs.writeFileSync(manifestPath, JSON.stringify(m));
console.log(
  `[fix-manifest] CSS criados: ${criados.join(", ") || "(nenhum)"} | refs removidas: ${removidos.join(", ") || "(nenhuma)"}`
);
