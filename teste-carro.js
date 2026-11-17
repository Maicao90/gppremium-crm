// Medida pelo carro e medida pela metade, no bot-service de producao (simulado, nada vai pro WhatsApp).
const PERGUNTA = 'Poderia me informar a medida do pneu (ex.: 175/65/14) ou o modelo do seu carro?';
const casos = [
  ['carro: Spin', [{ role: 'assistant', content: PERGUNTA }, { role: 'user', content: 'Spin' }]],
  ['carro: Grand Siena 2018', [{ role: 'assistant', content: PERGUNTA }, { role: 'user', content: 'Grande siena 2018' }]],
  ['carro: Bravo', [{ role: 'assistant', content: PERGUNTA }, { role: 'user', content: 'Bravo' }]],
  ['meia medida: 15/95', [{ role: 'assistant', content: PERGUNTA }, { role: 'user', content: 'Só sei que é 15/95' }, { role: 'user', content: 'Não sei o restante' }]],
  ['promocao leve 4', [{ role: 'assistant', content: PERGUNTA }, { role: 'user', content: 'Como e essa promoção 3 pneus e ganha 1' }]],
];
(async () => {
  for (const [nome, messages] of casos) {
    const r = await fetch('http://127.0.0.1:3010/gerar-resposta', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages, audioFluxo: true, simular: true, lojaBot: { nome: 'Pneus GP Premium' }, textosFluxo: nome.startsWith('promocao') ? { promocao_leve4: ['A promoção *compre 3 e leve 4* funciona assim: você paga 3 pneus e leva 4 — o 4º sai de graça.', 'Ela vale para os pneus da marca GP Premium nas medidas 195/65/15 e 215/55/17.'] } : undefined }) }).then((x) => x.json());
    console.log(`\n# ${nome} (via ${r.via})\n  ${(r.partes || []).join('\n  ')}`);
  }
})();
