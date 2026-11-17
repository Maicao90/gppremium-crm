// 22/10: tela "Cerebro do robo" no painel (so administrador ve: podeVer libera tudo pro master/admin).
const fs = require('fs');
const base = process.argv[2];
fs.copyFileSync('/root/CerebroRobo.jsx', base + '/src/pages/CerebroRobo.jsx');
console.log('pages/CerebroRobo.jsx ok');
function patch(rel, trocas, marca) {
  const f = base + '/' + rel;
  let s = fs.readFileSync(f, 'utf8');
  if (s.includes(marca)) { console.log(rel, 'ja aplicado'); return; }
  for (const [a, b] of trocas) {
    if (s.split(a).length !== 2) { console.error(rel, 'ancora', JSON.stringify(a.slice(0, 80))); process.exit(1); }
    s = s.replace(a, () => b);
  }
  fs.writeFileSync(f, s); console.log(rel, 'ok');
}
patch('src/App.jsx', [
  [`import { FluxoAtendimento } from './pages/FluxoAtendimento';`, `import { FluxoAtendimento } from './pages/FluxoAtendimento';\nimport { CerebroRobo } from './pages/CerebroRobo';`],
  [`          {view === 'at-fluxo' && <FluxoAtendimento />}`, `          {view === 'at-fluxo' && <FluxoAtendimento />}\n          {view === 'at-cerebro' && ehMaster(usuario) && <CerebroRobo />}`],
], 'CerebroRobo');
patch('src/components/Sidebar.jsx', [
  [`Bot, Send, LogOut, Workflow } from 'lucide-react';`, `Bot, Send, LogOut, Workflow, Brain } from 'lucide-react';`],
  [`      { id: 'at-fluxo', label: 'Fluxo do atendimento', icon: Workflow },`, `      { id: 'at-fluxo', label: 'Fluxo do atendimento', icon: Workflow },\n      { id: 'at-cerebro', label: 'Cérebro do robô', icon: Brain },`],
], 'at-cerebro');
