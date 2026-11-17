import fs from 'fs';
import { TABELA_PRECOS_GP } from './data/tabelaPrecos';

type Linha = [string, string, string, string, number, number[], number | null];
const foto: Linha[] = JSON.parse(fs.readFileSync('/root/tab7.json', 'utf8'));
const norm = (m: string) => m.toUpperCase().replace(/\s+/g, '');
const chave = (medida: string, modelo: string) => `${medida}|${norm(modelo)}`;
const codigo = new Map<string, any>();
for (const i of TABELA_PRECOS_GP as any[]) codigo.set(chave(i.medida, i.modelo), i);

let dif = 0;
const vistos = new Set<string>();
for (const [medida, modelo, cat, flag, aVista, parc, port] of foto) {
  const k = chave(medida, modelo);
  vistos.add(k);
  const c = codigo.get(k);
  if (!c) { console.log(`FALTA NO ROBO: ${medida} ${modelo} R$${aVista}`); dif++; continue; }
  const prob: string[] = [];
  if (Math.abs(c.aVista - aVista) > 0.009) prob.push(`a vista robo ${c.aVista} foto ${aVista}`);
  const p = c.parcelado;
  const cod = [p.x1, p.x2, p.x3, p.x4, p.x5, p.x6, p.x7, p.x8, p.x9, p.x10];
  cod.forEach((v: number, i: number) => { if (Math.abs(v - (parc[i] as number)) > 0.009) prob.push(`${i + 1}x robo ${v} foto ${parc[i]}`); });
  if ((c.portaria ?? null) !== port && !(port === null && !c.portaria)) prob.push(`portaria robo ${c.portaria} foto ${port}`);
  if (c.categoria !== cat) prob.push(`categoria robo ${c.categoria} foto ${cat}`);
  const promoFoto = flag === 'promo', leve4Foto = flag === 'leve4';
  if (!!c.promocao !== promoFoto) prob.push(`promocao robo ${!!c.promocao} foto ${promoFoto}`);
  if (!!c.compre3Leve4 !== leve4Foto) prob.push(`compre3Leve4 robo ${!!c.compre3Leve4} foto ${leve4Foto}`);
  if (prob.length) { console.log(`DIFERENTE ${medida} ${modelo}: ${prob.join('; ')}`); dif++; }
}
for (const [k, c] of codigo) if (!vistos.has(k)) { console.log(`SO NO ROBO (nao esta na foto): ${c.medida} ${c.modelo} R$${c.aVista}`); dif++; }
console.log(`\nfoto: ${foto.length} linhas | robo: ${codigo.size} linhas | diferencas: ${dif}`);
