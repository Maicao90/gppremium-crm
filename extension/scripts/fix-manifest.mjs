// Conserta um bug do Plasmo 0.90.5: às vezes o manifest.json referencia um CSS
// (ex.: content.<hash>.css) que o build NÃO gera. O Chrome então RECUSA a extensão
// ("erro ao carregar") e nada aparece. Aqui removemos do manifest qualquer arquivo
// referenciado que não exista de fato no build. Roda no fim do `npm run build`.
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
const removidos = [];

if (Array.isArray(m.web_accessible_resources)) {
  for (const w of m.web_accessible_resources) {
    if (Array.isArray(w.resources)) {
      const antes = w.resources.slice();
      w.resources = w.resources.filter(existe);
      removidos.push(...antes.filter((r) => !w.resources.includes(r)));
    }
  }
  m.web_accessible_resources = m.web_accessible_resources.filter((w) => w.resources && w.resources.length);
}
for (const cs of m.content_scripts || []) {
  for (const campo of ["css", "js"]) {
    if (Array.isArray(cs[campo])) {
      const antes = cs[campo].slice();
      cs[campo] = cs[campo].filter(existe);
      removidos.push(...antes.filter((r) => !cs[campo].includes(r)));
    }
  }
}

fs.writeFileSync(manifestPath, JSON.stringify(m));
console.log(
  removidos.length
    ? `[fix-manifest] Referências-fantasma removidas: ${removidos.join(", ")}`
    : "[fix-manifest] Manifest íntegro (nada a remover)."
);
