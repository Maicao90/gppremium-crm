// CONFERENCIA (22/10): servidor descartavel em 127.0.0.1:3016 com as rotas do cerebro novo, dados em COPIA
// (/root/cerebro-conf/data), banco so-leitura. Sem token automatico: testa a autenticacao de verdade.
import dotenv from 'dotenv';
import express from 'express';
import { rotasCerebro } from './bot-service/cerebro';

dotenv.config({ path: '/root/whatsapp-crm/backend/.env', quiet: true } as any);
const PORTA = Number(process.env.CONF_PORTA || 3016);
const app = express();
app.use(express.json());
app.post('/conf-gerar-resposta', (_req, res) => res.json({ via: 'fluxo', chaves: ['saudacao'], partes: ['(conf) oi'] }));
app.use('/api/cerebro', (req, res, next) => {
  if (req.path === '/revisar') return res.status(405).json({ error: 'conf: revisao bloqueada' });
  next();
}, rotasCerebro(`http://127.0.0.1:${PORTA}/conf-gerar-resposta`));
app.listen(PORTA, '127.0.0.1', () => console.log(`[conf] ouvindo 127.0.0.1:${PORTA}`));
