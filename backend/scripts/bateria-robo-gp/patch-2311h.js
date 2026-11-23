// 23/11h — erros REAIS de hoje (auditoria das respostas do robo a clientes reais, 23/11 08h-13h):
//  H-a) cliente pediu o VALOR DA PARCELA 3 vezes ("O valor parcela?", "Parcelando qual o valor?") e recebeu so "Sim, parcelamos em ate 10x"
//       -> com a medida conhecida, o codigo da o valor pela tabela (10x, total da quantidade).
//  H-b) "Voce tem o pneu Landspider 185/70-14?" -> o robo cotou o GP Premium sem dizer que era outra marca -> atendente (ensinamento Lmwdha2fe55k).
const fs = require('fs');
const arq = process.argv[2];
let s = fs.readFileSync(arq, 'utf8');
if (s.includes('CORRECOES 23/11h')) { console.log('ja aplicado'); process.exit(0); }
if (!s.includes('CORRECOES 23/11g')) { console.error('FALHOU: aplique antes o patch 2311g'); process.exit(1); }
const trocas = [];
const troca = (nome, de, para) => trocas.push({ nome, de, para });

troca('H-a valor da parcela pelo codigo',
String.raw`          const decisao = decidirSequenciaPreco(intencoesUsadas.length ? intencoesUsadas : intencoes, estadoUsado, dadosUsados, textosFluxo, { minutosDesdeLocalizacao, jaRespondidas, lojaFalouHaPouco });`,
String.raw`          const decisao = decidirSequenciaPreco(intencoesUsadas.length ? intencoesUsadas : intencoes, estadoUsado, dadosUsados, textosFluxo, { minutosDesdeLocalizacao, jaRespondidas, lojaFalouHaPouco });
          // CORRECOES 23/11h: "O valor parcela?" / "Parcelando qual o valor?" com a medida ja conhecida: o codigo da o valor da parcela pela tabela
          // (antes so saia "Sim, parcelamos em ate 10x" — 3 vezes seguidas para o mesmo cliente em 23/11).
          if (decisao.chaves.includes('parcelamento_generico')) {
            const medP = (decisao.novosDados as any)?.medida || dadosUsados.medida || medidaDoHistorico(anteriores);
            if (medP && encontrarPrecosExatosPorMedida(medP).length) {
              const qtdP = (decisao.novosDados as any)?.quantidade ?? dadosUsados.quantidade ?? null;
              const parcP = decidirSequenciaPreco([{ intencao: 'PERGUNTOU_PARCELAMENTO_ESPECIFICO', parcelasExtraida: 10, medidaExtraida: medP, quantidadeExtraida: qtdP, escolhaAlternativa: null } as any], 'preco_confirmado', { ...dadosUsados, medida: medP }, textosFluxo, { minutosDesdeLocalizacao, jaRespondidas: [], lojaFalouHaPouco: true });
              if (parcP.partes.length && !parcP.chaves.includes('parcelamento_generico')) {
                console.log('[BotService] parcelamento: cliente pediu o valor — da a parcela da tabela (' + medP + ', qtd ' + (qtdP ?? '-') + ').');
                // "Em 10x fica R$ 156,60 cada, total de R$ 1.566,04." e ambiguo ("cada" pneu ou cada parcela?): diz claro (ensinamento Lmvv3thkz6os).
                const claroP = (p: string): string => {
                  const m = /^(\d{3}\/\d{2}\/\d{2})(?: \((\d+) unidades\))?\nEm (\d+)x fica R\$ ([\d.,]+) cada, total de R\$ ([\d.,]+)\.$/.exec(p);
                  if (!m) return p;
                  const qq = Number(m[2] || 1);
                  return (qq > 1 ? 'Os ' + qq + ' pneus *' + m[1] + '*' : 'O pneu *' + m[1] + '*') + ' no cartão ' + (qq > 1 ? 'ficam' : 'fica') + ' em ' + m[3] + 'x de *R$ ' + m[4] + '* (total de R$ ' + m[5] + ').';
                };
                (decisao as any).partes = parcP.partes.map(claroP); (decisao as any).chaves = parcP.chaves; (decisao as any).novoEstado = parcP.novoEstado;
                (decisao as any).novosDados = parcP.novosDados; (decisao as any).acaoPrincipal = parcP.acaoPrincipal;
              }
            }
          }`);

troca('H-b outra marca citada vai pra atendente',
String.raw`      // CORRECOES 23/11b — achados da revisao diaria do Cerebro (17-22/11) que viraram regra fixa.`,
String.raw`      // CORRECOES 23/11h — pergunta por pneu de OUTRA marca ("Voce tem o Landspider 185/70-14?"): a loja so vende GP Premium -> atendente.
      {
        const MARCA_OUTRA_H = /(?<![a-zà-ú])(michelin|pirelli|good ?year|bridgestone|continental|firestone|dunlop|xbri|westlake|landspider|aptany|maxxis|hankook|kumho|yokohama|goodride|sailun|ling ?long|triangle|farroad|lanvigator|sunfull|habilead|windforce|nankang|toyo|falken|cooper|barum|kleber|tigar|dayton|levorin|rinaldi|pneumac|aoteli|compasal|doublestar|hifly|ovation|arivo|tracmax|rotalla|delinte|sumitomo|sentury|joyroad|jinyu|kapsen|apollo|metzeler)(?![a-zà-ú])/i;
        const mH = MARCA_OUTRA_H.exec(ditoE);
        if (mH && !/gp ?premium/i.test(ditoE) && /(tem|t[eê]m|trabalh|vend|possu|dispon|\?)/i.test(ditoE.slice(Math.max(0, mH.index - 45), mH.index + mH[0].length + 45))) { praAtendenteE('outra_marca_citada'); return; }
      }
      // CORRECOES 23/11b — achados da revisao diaria do Cerebro (17-22/11) que viraram regra fixa.`);

for (const t of trocas) {
  const n = s.split(t.de).length - 1;
  if (n !== 1) { console.error('FALHOU: ancora de "' + t.nome + '" apareceu ' + n + 'x (esperado 1). Nada foi gravado.'); process.exit(1); }
}
for (const t of trocas) s = s.replace(t.de, () => t.para);
fs.writeFileSync(arq, s);
console.log('aplicadas ' + trocas.length + ' trocas (23/11h) em ' + arq);
