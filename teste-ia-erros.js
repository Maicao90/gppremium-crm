// 22/10: casos que davam 400 na Anthropic — so no LAB (3011), teste:true (nada vai pro WhatsApp)
const URL = 'http://127.0.0.1:3011/gerar-resposta';
const fs = require('fs');
const lojaBot = { nome: 'Pneus GP Premium', telefone: '(61) 3601-2020', horario: '', localizacao: 'Pneus GP Premium', localizacaoTexto: 'na Avenida Perimetral, na Vila Guará, em Luziânia-GO' };
const U = (content) => ({ role: 'user', content });
const A = (content) => ({ role: 'assistant', content });
const casos = [
  ['termina com a loja (antes: 400 prefill)', [U('Olá'), U('Boa tarde'), A('Oi, tudo bem?'), U('Eu falo com o Charles ?'), A('Poderia me informar a medida do pneu ou o modelo do seu carro?'), A('Eu sou a Josy, em que posso ajudar?')]],
  ['termina com a loja, cliente sem pergunta pendente', [U('qual o endereco de voces?'), A('Segue a nossa localização:'), A('Avenida Perimetral, Vila Guará, Luziânia-GO')]],
];
(async () => {
  for (const [nome, messages] of casos) {
    const body = { messages, lojas: [], ultimosTextosCliente: messages.filter((m) => m.role === 'user').map((m) => m.content).join('\n'), estadoPreco: 'sem_estado', dadosPreco: '{}', textosFluxo: {}, lojaBot, minutosDesdeLocalizacao: null, minutosDesdeUltimaDaLoja: 1, simular: false, teste: true };
    const r = await fetch(URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(async (x) => ({ status: x.status, ...(await x.json().catch(() => ({}))) })).catch((e) => ({ erro: e.message }));
    console.log(`# ${nome}\n  http=${r.status} via=${r.via} acao=${r.acaoTipo} erro=${r.error || r.erro || '-'}\n  > ${(r.partes || []).join('\n  > ')}`);
  }
})();
