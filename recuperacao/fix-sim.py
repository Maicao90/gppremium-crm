import sys

p = sys.argv[1]
s = open(p, encoding='utf-8').read()
alvo = "    const { rajada, rabo, anteriores, temMidiaSemTexto } = separarRajada(messages);\n"
assert s.count(alvo) == 1
novo = alvo + """    // 23/10 (retomada de clientes): "sim" / "quero" / "preciso" respondendo a mensagem de RETOMADA da loja
    // ("...os pneus 185/65/15. Ainda está precisando?") vale como se o cliente tivesse mandado essa medida -> preco
    // pela tabela. Sem isso a IA livre respondia "pode repetir, por favor?". Sem medida na retomada, segue normal.
    {
      const ultimaDaLoja = String([...anteriores].reverse().find((m: any) => m?.role === 'assistant')?.content || '');
      const AFIRMATIVO = /^(sim|s|ss|sim sim|quero|quero sim|sim quero|preciso|preciso sim|sim preciso|ainda preciso|ainda estou precisando|t[oô] precisando|estou precisando|t[oô] sim|pode ser|pode|pode sim|manda|pode mandar|me passa|passa|claro|claro que sim|isso|opa|uhum|aham|yes|ok|blz|beleza|bora|tenho interesse|tenho sim)[\\s!.,😊👍🙏]*$/i;
      if (/Ainda está precisando\\?/i.test(ultimaDaLoja) && rajada.length && rajada.every((t: string) => AFIRMATIVO.test(String(t).trim()))) {
        const medidaRetomada = extrairMedidasDoTexto(ultimaDaLoja)[0];
        if (medidaRetomada) {
          console.log(`[BotService] retomada: "${rajada.join(' / ')}" -> medida ${medidaRetomada} da mensagem da loja`);
          rajada.splice(0, rajada.length, medidaRetomada);
        }
      }
    }
"""
s = s.replace(alvo, novo)
open(p, 'w', encoding='utf-8').write(s)
print('ok')
