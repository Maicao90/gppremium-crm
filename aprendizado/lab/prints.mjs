// Prints do "Aprendizado da Josy" (lab via tunel em localhost:3017) com o Edge headless (DevTools).
// Uso: node prints.mjs <pasta-de-saida>
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const SAIDA = process.argv[2] || '.';
fs.mkdirSync(SAIDA, { recursive: true });
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const URL = 'http://localhost:3017/anuncios/';
const PORTA = 9341;
const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'edge-aj-'));
const edge = spawn(EDGE, ['--headless=new', `--remote-debugging-port=${PORTA}`, `--user-data-dir=${perfil}`, '--hide-scrollbars', '--force-color-profile=srgb', '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: 'ignore' });
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
setTimeout(() => { console.error('tempo esgotado'); edge.kill(); process.exit(1); }, 240000);

async function alvo() {
  for (let i = 0; i < 40; i++) {
    try { const l = await (await fetch(`http://127.0.0.1:${PORTA}/json/list`)).json(); const p = l.find((x) => x.type === 'page'); if (p) return p.webSocketDebuggerUrl; } catch { /* subindo */ }
    await espera(250);
  }
  throw new Error('Edge nao respondeu');
}
const ws = new WebSocket(await alvo());
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let seq = 0; const pend = new Map();
ws.addEventListener('message', (ev) => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
const cdp = (method, params = {}) => new Promise((r) => { const id = ++seq; pend.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const js = async (expr) => (await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;

const abaJosy = "(() => { const b = [...document.querySelectorAll('.fx-aba')].find((x) => x.textContent.startsWith('Aprendizado da Josy')); b?.click(); return !!b; })()";
// abre a 1a proposta da Josy no mapa pela busca
const noJosy = (termo) => `(() => { const i = document.querySelector('.mc-busca input'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  set.call(i, ${JSON.stringify(termo)}); i.dispatchEvent(new Event('input', { bubbles: true }));
  return new Promise((r) => setTimeout(() => { const b = [...document.querySelectorAll('.mc-resultados button')].find((x) => x.textContent.includes('Jeito da Josy')); b?.click(); r(!!b); }, 400)); })()`;

async function print(nome, largura, altura, mobile, acoes = [], inteira = false) {
  await cdp('Emulation.setDeviceMetricsOverride', { width: largura, height: altura, deviceScaleFactor: mobile ? 2 : 1, mobile });
  await cdp('Emulation.setTouchEmulationEnabled', { enabled: mobile, maxTouchPoints: mobile ? 5 : 0 });
  await cdp('Page.navigate', { url: URL });
  await espera(6000);
  for (const a of acoes) { const r = await js(a); if (r === false) console.log('  acao sem efeito:', a.slice(0, 60)); await espera(2500); }
  const info = await js('JSON.stringify({sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, h: document.documentElement.scrollHeight})');
  let r;
  if (inteira) {
    const h = Math.min(JSON.parse(info).h, 9000);
    await cdp('Emulation.setDeviceMetricsOverride', { width: largura, height: h, deviceScaleFactor: mobile ? 2 : 1, mobile });
    await espera(1200);
    r = await cdp('Page.captureScreenshot', { format: 'png' });
  } else r = await cdp('Page.captureScreenshot', { format: 'png' });
  const arq = path.join(SAIDA, nome);
  fs.writeFileSync(arq, Buffer.from(r.result.data, 'base64'));
  console.log(arq, info);
}

const rolarAte = (sel, n = 0) => `(() => { const e = document.querySelectorAll(${JSON.stringify(sel)})[${n}]; if (!e) return false; e.scrollIntoView({ block: 'start' }); return true; })()`;
const verExemplos = "(() => { const b = document.querySelector('.aj-card .aj-link'); b?.click(); return !!b; })()";
const filtro = (t) => `(() => { const b = [...document.querySelectorAll('.aj-filtro')].find((x) => x.textContent.startsWith(${JSON.stringify(t)})); b?.click(); return !!b; })()`;
const modo = process.argv[3] || 'pendentes';

await cdp('Page.enable'); await cdp('Runtime.enable');
if (modo === 'pendentes') {
  await print('josy-1280.png', 1280, 900, false, [abaJosy]);
  await print('josy-1280-card-inteiro.png', 1280, 900, false, [abaJosy, verExemplos, rolarAte('.aj-card')], false);
  await print('josy-1280-pagina.png', 1280, 900, false, [abaJosy], true);
  await print('josy-390.png', 390, 844, true, [abaJosy]);
  await print('josy-390-audios.png', 390, 844, true, [abaJosy, rolarAte('.aj-audios')]);
  await print('josy-390-botoes.png', 390, 844, true, [abaJosy, rolarAte('.aj-form')]);
  await print('josy-390-pagina-1o-card.png', 390, 844, true, [abaJosy, verExemplos], true);
  await print('mapa-1280-no-josy.png', 1280, 900, false, [noJosy('remold')]);
  await print('mapa-390-no-josy.png', 390, 844, true, [noJosy('remold')]);
} else {
  await print('josy-1280-aprovados.png', 1280, 900, false, [abaJosy, filtro('Aprovados')]);
  await print('josy-390-aprovados.png', 390, 844, true, [abaJosy, filtro('Aprovados')]);
  await print('ensinamentos-1280-com-audio.png', 1280, 900, false, ["(() => { const b = [...document.querySelectorAll('.fx-aba')].find((x) => x.textContent.startsWith('Ensinamentos')); b?.click(); return !!b; })()", rolarAte('.card', 3)]);
}
ws.close(); edge.kill();
await espera(500);
try { fs.rmSync(perfil, { recursive: true, force: true }); } catch { /* o Edge pode segurar arquivo */ }
process.exit(0);
