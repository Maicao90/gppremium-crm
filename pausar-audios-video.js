// 22/10: clientes nao conseguem abrir os audios do robo ("seu audio nao abre"). Pausa os audios: sem o arquivo,
// o robo manda o texto no lugar (comportamento ja existente). E o link do video so vai junto da explicacao de remold.
const fs = require('fs');
const PASTA = '/root/whatsapp-crm/backend/public/midias/bot-audios';
const GUARDA = '/root/bot-audios-pausados';
fs.mkdirSync(GUARDA, { recursive: true });
for (const f of fs.readdirSync(PASTA)) if (f.endsWith('.ogg')) { fs.renameSync(`${PASTA}/${f}`, `${GUARDA}/${f}`); console.log('pausado', f); }

const fCfg = '/root/whatsapp-crm/backend/data/bot-pneus-config.json';
fs.copyFileSync(fCfg, `${fCfg}.bak-${Date.now()}`);
const cfg = JSON.parse(fs.readFileSync(fCfg, 'utf8'));
const antes = 'Depois desse texto, mande o link do vídeo de prova (NÃO é tag de vídeo, é um link normal de texto): https://youtu.be/e6sdoRnqSpU?t=93 — mande SEM pedir permissão, numa mensagem separada.';
const depois = 'Depois desse texto, mande o link do vídeo de prova (NÃO é tag de vídeo, é um link normal de texto): https://youtu.be/e6sdoRnqSpU?t=93 — mande SEM pedir permissão, numa mensagem separada, mas SÓ na mesma resposta em que você explicou que é remold porque o cliente ACABOU de perguntar. NUNCA mande esse link em outro momento (ex.: quando o cliente diz que o áudio não abriu, que não entendeu, ou fala de outro assunto) e nunca mande duas vezes na conversa (22/10: o link foi fora de contexto).';
const p = String(cfg.PROMPT_ATENDIMENTO);
if (p.includes(antes)) { cfg.PROMPT_ATENDIMENTO = p.replace(antes, depois); fs.writeFileSync(fCfg, JSON.stringify(cfg, null, 2)); console.log('regra do video ajustada'); }
else console.log(p.includes('22/10: o link foi fora de contexto') ? 'regra do video ja ajustada' : 'TRECHO DO VIDEO NAO ACHADO');
