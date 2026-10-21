// Simula conversas no bot-service (porta 3010) como se fosse o numero da GP. Nao manda nada pro WhatsApp.
const casos = [
  'boa tarde, quanto ta o pneu 175/70/14?',
  'qual o endereço de vocês?',
  'tem a promoção compre 3 leve 4?',
  'qual a garantia?',
  'é remold?',
  'vcs tem 225/40/18?',
  'que horas vocês fecham?',
  'parcela em 10x?',
];
const lojaBot = { nome: 'Pneus GP Premium', telefone: '(61) 3601-2020', horario: '', localizacao: 'Pneus GP Premium\nAvenida Perimetral, Vila Guará, Luziânia-GO', localizacaoTexto: 'na Avenida Perimetral, na Vila Guará, em Luziânia-GO' };
(async () => {
  for (const msg of casos) {
    const r = await fetch('http://127.0.0.1:3010/gerar-resposta', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: msg }], lojas: [], ultimosTextosCliente: msg, estadoPreco: 'sem_estado', dadosPreco: '{}', textosFluxo: {}, lojaBot, simular: true, audioFluxo: true }),
    });
    const j = await r.json();
    console.log(`CLIENTE: ${msg}\n  via=${j.via || (j.deterministico ? 'fluxo' : 'livre')} chaves=${JSON.stringify(j.chaves || [])}\n  ROBO: ${JSON.stringify(j.partes)}\n`);
  }
})();
