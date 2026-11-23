// 23/11b (dono: "e os aprendizados? cara e pra ela parar de errar"). A revisao diaria do Cerebro achou 51 erros de 17 a 22/11
// e nenhum foi aprovado no painel — o robo nao aprendeu nada. Aqui os que se repetem viram regra fixa no codigo:
//  B1 "215/60 A16" e "pneu 15 ... 195/55" (aro solto) -> medida inteira (M&G Messias, 💥).
//  B2 base de troca: a loja nao trabalha mais com ela (anuncios novos: "não é à base de troca") -> o robo nao oferece sozinho
//     o "Na base de troca o 185/65/15 sai por R$199" ao cotar (Decio, Manoel, luceir); so explica se o cliente citar 189/199/troca.
//  B3 resposta automatica de outra empresa ("agradece o seu contato... estou dirigindo") -> silencio (A L Transporte).
//  B4 "4" + "Obrigado!" depois de "Quantos pneus?" -> cota os 4, nao se despede (Jeova).
//  B5 pneu comprado fora, so quer a troca -> atendente (eliene).
//  B6 "vende a unidade ou so o par?" -> vende por unidade (Joao Neto).
//  B7 "como funciona a montagem?" / "entregam montado?" -> montagem por conta da loja (weliton, Weminton).
//  B8 boleto / crediario / cheque -> pagamento presencial (Douglas).
//  B9 "84H ou 88H?" (indice de carga) -> atendente (Tiago).
//  B10 "guarda meus pneus ai" -> separa mediante pagamento (Luck).
//  B11 "voces trabalham amanha?" / "ja estao fechados?" -> horario, nunca "Combinado" (Jerry, wilson).
//  B12 "precisa nao" / "ganhou uns meia vida" -> ensinamento de desistencia (Vitor).
const fs = require('fs');
const arq = process.argv[2];
let s = fs.readFileSync(arq, 'utf8');
if (s.includes('CORRECOES 23/11b')) { console.log('ja aplicado'); process.exit(0); }
if (!s.includes('CORRECOES 23/11:')) { console.error('FALHOU: aplique antes o patch 2311'); process.exit(1); }
const trocas = [];
const troca = (nome, de, para) => trocas.push({ nome, de, para });

troca('B1 funcao aro solto',
String.raw`function corrigirLarguraDigitada(t: string): string {`,
String.raw`// CORRECOES 23/11b — "215/60 A16" -> 215/60/16; "pneu 15 ... a numeração é 195/55" -> 195/55/15 (uma largura/perfil sem aro + um aro solto).
function juntarAroSolto(t0: string): string {
  let t = String(t0 || '').replace(/(\d{3}\s*\/\s*\d{2})\s*[aA]\s*(1[2-9]|2[0-2])(?!\d)/g, '$1/$2');
  const lps = t.match(/(?<!\d)\d{3}\s*\/\s*\d{2}(?!\s*[\/\-. xXrR]*\s*\d)(?!\d)/g) || [];
  if (lps.length === 1) {
    const aros = [...new Set([...t.matchAll(/(?<![a-zà-ú])(?:aro|pneu|roda)\s*(1[2-9]|2[0-2])(?!\d)(?!\s*\/)/gi)].map((m) => m[1]))];
    if (aros.length === 1) t = t.replace(lps[0] as string, String(lps[0]).replace(/\s+/g, '') + '/' + aros[0]);
  }
  return t;
}
function corrigirLarguraDigitada(t: string): string {`);

troca('B1 usa o aro solto',
String.raw`const t = corrigirLarguraDigitada(String(t0 || '').replace(/(\d)\s*['’´"]+\s*(?=\d)/g, '$1 '));`,
String.raw`const t = corrigirLarguraDigitada(juntarAroSolto(String(t0 || '').replace(/(\d)\s*['’´"]+\s*(?=\d)/g, '$1 ')));`);

troca('B2 base de troca so se o cliente citar',
'      saida.push(`Na *base de troca* (deixando o seu pneu usado aqui), o ${medida} sai por *R$ ${valor},00* cada.`);',
'      // CORRECOES 23/11b: a loja nao trabalha mais com base de troca — so explica se o cliente citar 189/199/troca/usado.\n' +
'      if (/\\b189\\b|\\b199\\b|base de troca|troca d[oe] (meu )?(pneu )?usado|(pneu|meu) usado/i.test(String(textoCliente || \'\').replace(/^\\s*📢\\s*\\[An[uú]ncio\\][^\\n]*$/gim, \'\'))) saida.push(`Na *base de troca* (deixando o seu pneu usado aqui), o ${medida} sai por *R$ ${valor},00* cada.`);');

troca('B3-B12 respostas fixas (achados da revisao)',
`textoFixoE(['A troca é bem rápida, feita na nossa própria oficina 😊'], 'RESPONDER_TEMPO_TROCA', 'tempo_troca'); return; }`,
`textoFixoE(['A troca é bem rápida, feita na nossa própria oficina 😊'], 'RESPONDER_TEMPO_TROCA', 'tempo_troca'); return; }
` + String.raw`      // CORRECOES 23/11b — achados da revisao diaria do Cerebro (17-22/11) que viraram regra fixa.
      const semAgrE = ditoE.replace(/(muito )?(obrigad[oa]s?|obg|vlw|valeu|grat[oa])[!.\s]*/gi, ' ').replace(/\s+/g, ' ').trim();
      // B3 Resposta automatica de OUTRA empresa: nao e cliente.
      if (rajada.length <= 2 && !/pneu|\d{3}\s*\/\s*\d{2}/i.test(ditoE) && /(agradece (o |pelo )?(seu )?contato|no momento (estou|n[aã]o (posso|estou|podemos))|estou dirigindo|irei responder|responderei (assim que|em breve|o mais)|retornarei (assim que|em breve|o mais)|mensagem autom[aá]tica|resposta autom[aá]tica)/i.test(ditoE)) {
        res.json({ ...baseE4, partes: [], acaoTipo: 'SILENCIO', chaves: ['resposta_automatica'] }); return;
      }
      // B4 Quantidade + "obrigado" depois de "Quantos pneus?": e a quantidade.
      {
        const medE = [dadosPrecoAtuais.medida, medidaDoHistorico(anteriores)].find((m) => !!m && encontrarPrecosExatosPorMedida(m as string).length > 0) as string | undefined;
        const qE = /^(\d{1,2})( pneus?)?$/i.exec(semAgrE);
        if (medE && qE && semAgrE !== ditoE.trim() && ditasE.slice(-2).some((x) => /Quantos pneus/i.test(x)) && Number(qE[1]) >= 1 && Number(qE[1]) <= 20) {
          const cotE = decidirSequenciaPreco([{ intencao: 'DAR_MEDIDA', medidaExtraida: medE, quantidadeExtraida: Number(qE[1]), escolhaAlternativa: null } as any], 'preco_confirmado', dadosPrecoAtuais, textosFluxo, { minutosDesdeLocalizacao, jaRespondidas: [], lojaFalouHaPouco: true });
          if (cotE.partes.length && cotE.chaves.includes('preco_medida')) {
            const pqE = cotE.partes.filter((p: string) => req.body?.audioFluxo === true || !/^\[ENVIAR_AUDIO:[^\]]+\]$/i.test(p.trim()));
            if (cotE.chaves.length === 1) pqE.push('Quando você consegue passar aqui na loja pra gente fazer a troca?');
            res.json({ ...baseE4, partes: pqE, acaoTipo: cotE.acaoPrincipal, novoEstadoPreco: cotE.novoEstado, novosDadosPreco: JSON.stringify(cotE.novosDados), assuntos: cotE.assuntos, chaves: cotE.chaves }); return;
          }
        }
      }
      // B5 Pneu comprado fora, so quer a troca/montagem: a atendente combina o servico.
      if (/(j[aá] (comprei|tenho|trouxe)|comprei (em outr|fora|na internet|online|pela internet))/i.test(ditoE) && /(troca|trocar|montar|montagem|instalar|colocar)/i.test(ditoE)
        && !/((?<![a-zà-ú])a[ií](?![a-zà-ú])|com voc[eê]s|de voc[eê]s|com vcs|de vcs|nessa loja|na loja de voc)/i.test(ditoE)) { praAtendenteE('montagem_pneu_de_fora'); return; }
      // B6 Vende por unidade?
      if (/((vend(e|em|o)|tem|d[aá] pra|pode|consigo|posso)[^\n?]{0,25}(unidade|avulso|s[oó] (um|1)(?![\d/])|um s[oó])|s[oó] (o |em )?par(?![a-zà-ú])|tem que (levar|comprar) (o |em )?par(?![a-zà-ú])|precis[ao] (levar|comprar) (o |em )?par(?![a-zà-ú]))/i.test(ditoE)) {
        textoFixoE(['Vende sim, por unidade 😊 Pode levar quantos pneus você precisar.'], 'RESPONDER_UNIDADE', 'vende_unidade'); return;
      }
      // B7 Como funciona a montagem / ja vem montado.
      if (!/alinh|balanc|camba|geometr/i.test(ditoE) && /((montagem|montad[oa]s?|instala[cç][aã]o)[^\n]{0,40}(como funciona|funciona como|\?|inclu|cobra|gr[aá]tis|de gra[cç]a|j[aá] vem|tem custo|paga)|(como funciona|entrega[m]?|j[aá] vem|vem)[^\n]{0,30}(montad|montagem)|em rela[cç][aã]o (a|à|da) montagem)/i.test(ditoE)) {
        textoFixoE(['A montagem do GP Premium é por nossa conta 😉', 'É só trazer o carro aqui na loja que a gente monta na nossa própria oficina.'], 'RESPONDER_MONTAGEM', 'montagem'); return;
      }
      // B8 Boleto / crediario / cheque.
      if (/(?<![a-zà-ú])(boleto|credi[aá]rio|carn[eê]|cheque|fiado|promiss[oó]ria)(?![a-zà-ú])/i.test(ditoE)) {
        textoFixoE(['A gente não trabalha com boleto, crediário nem cheque 😊', 'O pagamento é presencial, aqui na loja: à vista ou no cartão em até 10x.'], 'RESPONDER_PAGAMENTO_PRESENCIAL', 'boleto'); return;
      }
      // B9 Indice de carga/velocidade ("84H ou 88H?").
      if (/((?<![\d\/])\d{2,3}\s?[a-z](?![a-z])\s*(ou|\/|e)\s*\d{2,3}\s?[a-z](?![a-z])|[ií]ndice (de )?(carga|velocidade))/i.test(ditoE)) { praAtendenteE('indice_carga'); return; }
      // B10 "Guarda meus pneus ai": separa mediante o pagamento.
      if (/(guard|separ|reserv)(a|e|em)\s+(os |meus |o |as |minhas? |uns |esses? )?pneus?/i.test(ditoE)) {
        textoFixoE(['A gente separa os pneus mediante o pagamento, que é feito aqui na loja 😊', /(t[oô]|estou|t[aá]) indo|indo a[ií]|chego a[ií]/i.test(ditoE) ? 'Te esperamos aqui!' : 'Quando você consegue passar aqui?'], 'RESPONDER_RESERVA', 'reserva'); return;
      }
      // B11 "Voces trabalham amanha?" / "ja estao fechados?": o horario.
      if (/((voc[eê]s|vcs|a loja)\s+(v[aã]o\s+)?(trabalh|abr|funcion|atend)[a-z]*(?![a-zà-ú])[^\n]{0,30}(amanh|hoje|s[aá]bado|domingo|feriado|\?|hein)|(amanh|hoje|s[aá]bado|domingo|feriado)[^\n]{0,40}(voc[eê]s|vcs)\s+(v[aã]o\s+)?(trabalh|abr|funcion|atend)|(j[aá]|ainda)\s+(est[aã]o|t[aã]o|ta|t[aá])\s+(fechad|abert))/i.test(ditoE)) {
        const horE = textoFluxo(textosFluxo, 'horario');
        if (horE.length) { textoFixoE(horE, 'RESPONDER_HORARIO', 'horario'); return; }
      }
      // B12 "Precisa nao" / "ganhou uns meia vida": desistencia (ensinamento do dono).
      if (!/\?/.test(ditoE) && /(^\s*(precisa n[aã]o|n[aã]o precis[ao]( mais)?|n[aã]o vou precisar( mais)?|j[aá] (arrumei|consegui))(?![a-zà-ú])|ganh(ei|ou) (uns |os |um |o |dois |quatro )?(pneus?|meia ?vida))/im.test(ditoE) && fixoE('Lmvk919212kn', 'RESPONDER_DESISTIU', 'desistiu')) return;`);

troca('B4 a despedida nao apaga a cotacao da quantidade',
String.raw`    if (textoCliente && !textoCliente.includes('?') && ENCERRAMENTO.test(textoCliente) && body.acaoTipo !== 'SILENCIO') {`,
String.raw`    // CORRECOES 23/11b: "4" + "Obrigado!" — o "obrigado" nao apaga a cotacao que acabou de sair (Jeova 22/11).
    if (textoCliente && !textoCliente.includes('?') && ENCERRAMENTO.test(textoCliente) && body.acaoTipo !== 'SILENCIO' && !(Array.isArray(body.chaves) && body.chaves.includes('preco_medida'))) {`);

troca('B7 "como funciona?" da montagem nao vira horario',
String.raw`    if (body && Array.isArray(body.partes) && PERGUNTA_HORARIO.test(ultG) && textoHorario && !body.partes.join(' ').includes(textoHorario.slice(0, 25))) {`,
String.raw`    // CORRECOES 23/11b: "E em relação a montagem / Como funciona?" e pergunta da montagem, nao do horario (weliton 20/11).
    const respostaJaDoAssunto = Array.isArray(body?.chaves) && body.chaves.some((c: string) => ['montagem', 'venda_sem_montagem', 'tempo_troca', 'reserva', 'boleto', 'vende_unidade'].includes(c));
    if (body && Array.isArray(body.partes) && !respostaJaDoAssunto && PERGUNTA_HORARIO.test(ultG) && textoHorario && !body.partes.join(' ').includes(textoHorario.slice(0, 25))) {`);

for (const t of trocas) t.para = t.para.replace("'O pagamento é presencial, aqui na loja: à vista ou no cartão em até 10x.'", "'O pagamento é presencial, aqui na loja.'");

for (const t of trocas) {
  const n = s.split(t.de).length - 1;
  if (n !== 1) { console.error('FALHOU: ancora de "' + t.nome + '" apareceu ' + n + 'x (esperado 1). Nada foi gravado.'); process.exit(1); }
}
for (const t of trocas) s = s.replace(t.de, () => t.para);
fs.writeFileSync(arq, s);
console.log('aplicadas ' + trocas.length + ' trocas (23/11b) em ' + arq);
