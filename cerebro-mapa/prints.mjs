// Tira os prints do Mapa do cerebro (lab, via tunel em localhost:3015) com o Edge headless pelo protocolo DevTools.
// Uso: node prints.mjs <pasta-de-saida>
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const SAIDA = process.argv[2] || '.';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const URL = 'http://localhost:3015/anuncios/';
const PORTA = 9339;
const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'edge-mapa-'));
const edge = spawn(EDGE, ['--headless=new', `--remote-debugging-port=${PORTA}`, `--user-data-dir=${perfil}`, '--hide-scrollbars', '--force-color-profile=srgb', 'about:blank'], { stdio: 'ignore' });
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

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

async function print(nome, largura, altura, mobile, acao) {
  await cdp('Emulation.setDeviceMetricsOverride', { width: largura, height: altura, deviceScaleFactor: mobile ? 2 : 1, mobile });
  await cdp('Emulation.setTouchEmulationEnabled', { enabled: mobile, maxTouchPoints: mobile ? 5 : 0 });
  await cdp('Page.navigate', { url: URL });
  await espera(7000);
  await js("document.querySelector('.fx-abas')?.scrollIntoView(); true");
  if (acao) { await js(acao); await espera(2500); }
  const info = await js('JSON.stringify({sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth})');
  const r = await cdp('Page.captureScreenshot', { format: 'png' });
  const arq = path.join(SAIDA, nome);
  fs.writeFileSync(arq, Buffer.from(r.result.data, 'base64'));
  console.log(arq, info);
}

// busca um neuronio pelo campo de busca e aperta Enter (abre o painel dele)
const buscar = (termo) => `(() => { const i = document.querySelector('.mc-busca input'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  set.call(i, ${JSON.stringify(termo)}); i.dispatchEvent(new Event('input', { bubbles: true }));
  return new Promise((r) => setTimeout(() => { i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); r(true); }, 300)); })()`;

await cdp('Page.enable'); await cdp('Runtime.enable');
await print('mapa-1280.png', 1280, 900, false);
await print('mapa-1280-painel-remold.png', 1280, 900, false, buscar('É remold?'));
await print('mapa-1280-achado.png', 1280, 900, false, buscar('interpretou o aro'));
await print('mapa-390.png', 390, 844, true);
await print('mapa-390-painel.png', 390, 844, true, buscar('Preço da medida'));
ws.close(); edge.kill();
await espera(500);
try { fs.rmSync(perfil, { recursive: true, force: true }); } catch { /* o Edge pode segurar arquivo */ }
