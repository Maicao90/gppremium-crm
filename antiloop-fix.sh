set -e
B=/root/whatsapp-crm/backend
G=$B/src/data/comportamentoGuard.ts
T=$B/src/data/comportamentoGuard.manual-test.ts
cp $G /root/comportamentoGuard.ts.bak-2210
cp $T /root/comportamentoGuard.manual-test.ts.bak-2210
# 22/10: cliente de verdade mandando 8 mensagens em 5 min (pergunta preco, local, remold, quantidade, "?",
# "obrigado") foi pausado 12h como "outro robo". Loop de robo de verdade ja e pego pelo eco e pela repeticao;
# o volume fica so como rede de seguranca pra rajada que gente nao digita.
python3 - "$G" "$T" <<'PY'
import sys
g, t = sys.argv[1], sys.argv[2]
s = open(g, encoding='utf-8').read()
old = "const LIMITE_TURNOS_JANELA = 8;"
new = ("// 22/10: era 8 — cliente real digitando rapido (preco, local, remold, quantidade, \"?\", \"obrigado\")\n"
       "// bateu 8 em 5 min e ficou 12h pausado como \"outro robo\". Gente nao passa de ~15 mensagens em 5 min.\n"
       "const LIMITE_TURNOS_JANELA = 16;")
assert s.count(old) == 1
open(g, 'w', encoding='utf-8').write(s.replace(old, new))

s = open(t, encoding='utf-8').read()
old_blk = "// ===== Volume como rede de seguranca: 8 turnos reais e distintos, sem eco/repeticao ====="
assert s.count(old_blk) == 1
s = s.replace(old_blk, """// ===== Caso real 22/10: cliente digitando rapido (8 mensagens em 5 min) NAO e robo =====
{
  const falas = ['Quanto ta o pneu 265 70/16', 'Qual local da loja', 'Nao e remolde ne?', 'Ok, bom saber',
    'Acredito que precisarei de 2 ai entao divide pelo mesmo valor', '?', 'Obrigado pelas informacoes', 'Ola! Posso ter mais informacoes sobre isso?'];
  const mensagensCliente: MsgAntiLoop[] = falas.map((f, i) => cliente(`wa-real${i}`, f, min(4) - seg(i * 30)));
  const respostasBot: MsgAntiLoop[] = falas.map((_, i) => bot(`resposta ${i} do robo, cada uma diferente da outra, sem repetir nada`, min(4) - seg(i * 30) - seg(5)));
  const r = decidirAntiLoop(mensagensCliente, respostasBot, DESDE);
  checar('Volume: 8 mensagens de um cliente real em 5 min NAO pausa', r.pausar === false, JSON.stringify(r));
}

// ===== Volume como rede de seguranca: 16 turnos reais e distintos, sem eco/repeticao =====""")
s = s.replace("Array.from({ length: 8 }, (_, i) =>\n    cliente(`wa-vol${i}`", "Array.from({ length: 16 }, (_, i) =>\n    cliente(`wa-vol${i}`")
s = s.replace("min(4) - seg(i * 20)),\n  );\n  const respostasBot: MsgAntiLoop[] = Array.from({ length: 8 }", "min(4) - seg(i * 12)),\n  );\n  const respostasBot: MsgAntiLoop[] = Array.from({ length: 16 }")
s = s.replace("min(4) - seg(i * 20) - seg(5)),", "min(4) - seg(i * 12) - seg(5)),")
s = s.replace("'Volume: 8 turnos DISTINTOS do cliente", "'Volume: 16 turnos DISTINTOS do cliente")
open(t, 'w', encoding='utf-8').write(s)
PY
cd $B
grep -n "LIMITE_TURNOS_JANELA = " $G
./node_modules/.bin/tsc --noEmit && echo TSC_OK
./node_modules/.bin/ts-node --transpile-only $T 2>&1 | tail -25
