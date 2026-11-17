const p = require('/root/whatsapp-crm/backend/public/anuncios/dados/pontuacao.json');
console.log(JSON.stringify({ ultimaContagem: p.ultimaContagem, bonusDiarioEm: p.bonusDiarioEm, ate: p.ate, ateAutomatico: p.ateAutomatico, atualizadoEm: p.atualizadoEm, ocultar: p.ocultar, juntar: p.juntar, lancamentos: p.lancamentos }, null, 1));
