// LABORATORIO do Mapa do cerebro (22/10): servidor minimo em 127.0.0.1:3015 (so acessivel por tunel SSH) que monta
// as rotas do cerebro lendo COPIAS de data/cerebro (em /root/cerebro-lab-api/data) e o banco em modo somente-leitura.
// - escrita so em ensinamentos/achados, e cai nas copias do lab (licoes.json / revisoes do lab), nunca em producao;
// - "Revisar agora" bloqueado; "Testar" responde com um robo de mentira (nao chama o bot-service de verdade);
// - sem token, o lab assina um token de teste do proprio lab (o token nunca sai daqui);
// - serve a pagina de teste (dist-lab do painel) em /anuncios/.
import path from 'path';
import dotenv from 'dotenv';
import express from 'express';
import jwt from 'jsonwebtoken';
import { rotasCerebro } from './bot-service/cerebro';

dotenv.config({ path: '/root/whatsapp-crm/backend/.env', quiet: true } as any);
const PORTA = 3015;
const app = express();
app.use(express.json());

// robo de mentira pro botao "Testar"
app.post('/lab-gerar-resposta', (req, res) => {
  const msg = String(req.body?.messages?.slice(-1)?.[0]?.content || '').toLowerCase();
  if (/remold|recauch/.test(msg)) return res.json({ via: 'fluxo', chaves: ['remold'], partes: ['(lab) resposta de remold do fluxo'] });
  if (/parcel|vezes|\dx/.test(msg)) return res.json({ via: 'fluxo', chaves: ['parcelamento_especifico'], partes: ['(lab) parcela calculada pela tabela'] });
  if (/onde|endere|localiza/.test(msg)) return res.json({ via: 'fluxo', chaves: ['localizacao'], partes: ['(lab) Segue a nossa localização:'] });
  if (/^(oi|ola|bom dia|boa tarde)/.test(msg)) return res.json({ via: 'fluxo', chaves: ['saudacao', 'pedir_medida'], partes: ['(lab) Oi, tudo bem?', '(lab) Poderia me informar a medida?'] });
  return res.json({ via: 'ia', chaves: [], partes: ['(lab) resposta da IA livre'] });
});

app.use('/api/cerebro', (req, res, next) => {
  if (req.path === '/revisar') return res.status(405).json({ error: 'Laboratório: revisão bloqueada.' });
  if (!req.headers.authorization && process.env.JWT_SECRET) req.headers.authorization = 'Bearer ' + jwt.sign({ sub: 'lab', role: 'master' }, process.env.JWT_SECRET, { expiresIn: '5m' });
  next();
}, rotasCerebro(`http://127.0.0.1:${PORTA}/lab-gerar-resposta`));

app.use('/anuncios', express.static(path.resolve('/root/cerebro-lab-painel/dist-lab'), { index: 'lab.html' }));
app.listen(PORTA, '127.0.0.1', () => console.log(`[lab-cerebro] ouvindo em 127.0.0.1:${PORTA}`));
