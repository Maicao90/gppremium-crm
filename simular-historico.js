// Cliente antigo: a medida foi dita antes (com a atendente). O robo nao pode pedir a medida de novo.
const lojaBot = { nome: 'Pneus GP Premium', telefone: '(61) 3601-2020', horario: '', localizacao: 'Pneus GP Premium', localizacaoTexto: 'na Avenida Perimetral, na Vila Guará, em Luziânia-GO' };
const conversas = [
  { nome: 'cliente deu a medida antes, pergunta parcelamento', messages: [
    { role: 'user', content: 'Bom dia, tem o 225/55/18?' },
    { role: 'assistant', content: 'Bom dia! Tenho sim, R$ 399 à vista.' },
    { role: 'user', content: 'parcela em quantas vezes?' } ] },
  { nome: 'cliente deu a medida antes, diz quantidade', messages: [
    { role: 'user', content: 'Valor de 399' },
    { role: 'user', content: 'é pro 225/55/18' },
    { role: 'assistant', content: 'Já te falo.' },
    { role: 'user', content: 'Pois preciso de 2' } ] },
  { nome: 'atendente cotou a medida, cliente pergunta quanto fica', messages: [
    { role: 'user', content: 'oi' },
    { role: 'assistant', content: 'O 185/60/15 GP-1 está R$ 249,00 à vista.' },
    { role: 'user', content: 'e quanto fica no cartão?' } ] },
  { nome: 'cliente novo sem medida (tem que perguntar)', messages: [
    { role: 'user', content: 'quanto custa o pneu?' } ] },
];
(async () => {
  for (const c of conversas) {
    const r = await fetch('http://127.0.0.1:3010/gerar-resposta', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: c.messages, lojas: [], ultimosTextosCliente: c.messages.filter((m) => m.role === 'user').map((m) => m.content).join('\n'), estadoPreco: 'sem_estado', dadosPreco: '{}', textosFluxo: {}, lojaBot, simular: true, audioFluxo: true }),
    });
    const j = await r.json();
    console.log(`${c.nome}\n  chaves=${JSON.stringify(j.chaves || [])}\n  ROBO: ${JSON.stringify(j.partes)}\n`);
  }
})();
