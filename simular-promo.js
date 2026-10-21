const lojaBot = { nome: 'Pneus GP Premium', telefone: '(61) 3601-2020', horario: '', localizacao: 'Pneus GP Premium', localizacaoTexto: 'na Avenida Perimetral, em Luziânia-GO' };
const casos = ['quanto ta o 195/65/15?', 'quanto o 175/70/14?', 'preciso de 4 pneus 215/55/17', 'quanto o 205/55/16?', 'o 195/65/15 em 10x?'];
(async () => {
  for (const msg of casos) {
    const r = await fetch('http://127.0.0.1:3010/gerar-resposta', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: msg }], lojas: [], ultimosTextosCliente: msg, estadoPreco: 'sem_estado', dadosPreco: '{}', textosFluxo: {}, lojaBot, simular: true, audioFluxo: true }) });
    const j = await r.json();
    console.log(`CLIENTE: ${msg}`); (j.partes || []).forEach((p) => console.log('   > ' + p)); console.log();
  }
})();
