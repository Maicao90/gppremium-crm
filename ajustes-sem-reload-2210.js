// 22/10 — ajustes que valem na proxima mensagem, sem reiniciar nada:
// 1) regras da IA livre: medida pelo carro sem pedir confirmacao; nada de "so falta o numero do meio";
//    nunca falar de audio que nao foi/nao chegou.
// 2) contatos internos que o robo respondeu como cliente (Super Via e o numero pessoal da Josy).
const fs = require('fs');
const B = '/root/whatsapp-crm/backend/data';
const ts = Date.now();

const fCfg = `${B}/bot-pneus-config.json`;
fs.copyFileSync(fCfg, `${fCfg}.bak-${ts}`);
const cfg = JSON.parse(fs.readFileSync(fCfg, 'utf8'));
const MARCA = 'MEDIDA PELO CARRO (22/10, pedido do dono)';
if (!String(cfg.PROMPT_ATENDIMENTO).includes(MARCA)) {
  const bloco = [
    `${MARCA}: quando o cliente disser o CARRO (modelo, com ou sem ano), descubra voce mesmo a medida ORIGINAL mais comum desse carro e ja passe o preco dela da tabela. NAO peca pra ele conferir a medida na lateral do pneu, NAO pergunte o aro, NAO peca confirmacao — isso cansa o cliente e esfria a venda.`,
    'Se o carro tiver versoes com aros diferentes, use a mais comum e diga numa frase curta no fim: "Se o seu for a versao aro X, me avisa que eu te passo o valor dela." Uma frase so, sem pergunta extra.',
    'Se o cliente souber so PARTE da medida (ex.: "195 aro 15", "15/95"), NUNCA diga "so falta o numero do meio" nem peca pra ele olhar o pneu: passe direto as medidas da tabela com esse comeco, cada uma com o preco a vista, numa lista curta.',
    'NUNCA fale de audio que voce mandou ou nao mandou, nem diga "nao cheguei a mandar audio". Se o cliente disser que o audio nao abriu, apenas escreva o que o audio dizia, sem comentar o audio.',
    '',
  ].join('\n');
  cfg.PROMPT_ATENDIMENTO = bloco + cfg.PROMPT_ATENDIMENTO;
  fs.writeFileSync(fCfg, JSON.stringify(cfg, null, 2));
  console.log('prompt: regra da medida pelo carro adicionada');
} else console.log('prompt: ja tinha');

const fNao = `${B}/bot-nao-atender.json`;
fs.copyFileSync(fNao, `${fNao}.bak-${ts}`);
const nao = JSON.parse(fs.readFileSync(fNao, 'utf8'));
for (const n of ['556196681400', '556196749841']) if (!nao.numeros.includes(n)) nao.numeros.push(n);
fs.writeFileSync(fNao, JSON.stringify(nao, null, 2));
console.log('nao-atender:', nao.numeros.join(', '));
