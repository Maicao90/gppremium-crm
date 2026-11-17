const PORT = process.env.PORTA || 3010;
const URL = `http://127.0.0.1:${PORT}/gerar-resposta`;
const casos = require('./casos-novos.js');
(async () => {
  let falhas = 0;
  for (const c of casos) {
    let j = {};
    try {
      j = await (await fetch(URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: c.msgs, estadoPreco: c.estado || 'sem_estado', dadosPreco: c.dados ? JSON.stringify(c.dados) : null, imagem: c.imagem, minutosDesdeUltimaDaLoja: c.minutosLoja, agoraTeste: c.agora, lojaBot: { nome: 'Pneus GP Premium' }, simular: true }) })).json();
    } catch (e) { j = { erro: String(e) }; }
    const passou = (() => { try { return !!c.ok(j); } catch { return false; } })();
    if (!passou) falhas++;
    const partes = (j.partes || []).concat(j.partesAntesDoInstante ? ['<<antes do instante>>', ...j.partesAntesDoInstante] : []);
    console.log(`${passou ? 'PASSOU' : 'FALHOU'} | ${c.nome}\n         acao=${j.acaoTipo} via=${j.via} mot=${j.motivoLivre || ''} chaves=${JSON.stringify(j.chaves)} ${j.erro || ''}\n         partes=${partes.join(' / ').slice(0, 360)}`);
  }
  console.log(`\n${casos.length - falhas}/${casos.length} passaram`);
})();
