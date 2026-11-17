// LABORATORIO do "Aprendizado da Josy" (22/10): servidor minimo em 127.0.0.1:3017 (so por tunel SSH).
// Monta as rotas do cerebro do LAB (/root/aprendizado-lab-api/src/bot-service/cerebro.ts), que leem/gravam so as
// COPIAS em /root/aprendizado-lab-api/data/cerebro e a pasta FALSA /root/aprendizado-lab-api/public/midias.
// - "Revisar agora" bloqueado; "Testar" usa um robo de mentira que imita o caminho do ensinamento do server.ts
//   (casa por palavras, sem chamar a IA) e devolve partesDaLicao(l, audioFluxo) — o mesmo codigo da producao;
// - sem token, o lab assina um token de teste (master) que nunca sai daqui;
// - serve a pagina de teste (dist-lab do painel) em /anuncios/ e a pasta falsa em /midias/.
import path from 'path';
import dotenv from 'dotenv';
import express from 'express';
import jwt from 'jsonwebtoken';
import { rotasCerebro, licoesAtivasDaLoja, partesDaLicao } from './bot-service/cerebro';

dotenv.config({ path: '/root/whatsapp-crm/backend/.env', quiet: true } as any);
const PORTA = 3017;
const LAB = '/root/aprendizado-lab-api';
const app = express();
app.use(express.json());

const norm = (t: string) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ');
const VAZIAS = new Set('quando cliente perguntar pergunta se o a e de do da que pneu ou tem'.split(' '));

// robo de mentira: imita o caminho "ensinamento -> responder" do server.ts
app.post('/lab-gerar-resposta', (req, res) => {
  const msg = norm(String(req.body?.messages?.slice(-1)?.[0]?.content || ''));
  const palavras = msg.split(/\s+/).filter((p) => p.length >= 4 && !VAZIAS.has(p));
  const l = licoesAtivasDaLoja(req.body?.lojaBot?.nome).find((x) => palavras.some((p) => norm(x.situacao).includes(p)));
  if (l && l.acao === 'responder') {
    return res.json({ via: 'cerebro', chaves: ['cerebro'], licao: { id: l.id, situacao: l.situacao, acao: l.acao }, partes: partesDaLicao(l, req.body?.audioFluxo === true) });
  }
  if (l) return res.json({ via: 'cerebro', chaves: ['cerebro'], licao: { id: l.id, situacao: l.situacao, acao: l.acao }, partes: [`(lab) ${l.acao}: ${l.resposta}`] });
  return res.json({ via: 'ia', chaves: [], partes: ['(lab) resposta da IA livre'] });
});

app.use('/api/cerebro', (req, res, next) => {
  if (req.path === '/revisar') return res.status(405).json({ error: 'Laboratório: revisão bloqueada.' });
  if (!req.headers.authorization && process.env.JWT_SECRET) req.headers.authorization = 'Bearer ' + jwt.sign({ sub: 'lab', role: 'master', nome: 'Dono (lab)' }, process.env.JWT_SECRET, { expiresIn: '5m' });
  next();
}, rotasCerebro(`http://127.0.0.1:${PORTA}/lab-gerar-resposta`));

app.use('/midias', express.static(path.join(LAB, 'public/midias')));
app.use('/anuncios', express.static('/root/aprendizado-lab-painel/dist-lab', { index: 'lab.html' }));
app.listen(PORTA, '127.0.0.1', () => console.log(`[lab-aprendizado] ouvindo em 127.0.0.1:${PORTA}`));
