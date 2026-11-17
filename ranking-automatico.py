import sys, json

p = sys.argv[1]
s = open(p, encoding='utf-8').read()
alvo = "    const c = JSON.parse(fs.readFileSync(ARQ_CAMPANHA, 'utf8'));\n"
assert s.count(alvo) == 1
s = s.replace(alvo, alvo + """    // 23/10 (dono: "agendamentos tem que atualizar automatico"): com ateAutomatico, o fim do periodo e sempre HOJE
    // (Brasilia) — os agendamentos programados ate agora entram sozinhos. Grava de volta pro painel ler o mesmo periodo.
    if (c.ateAutomatico) {
      const hoje = diaBR(Date.now());
      if (c.ate !== hoje) { c.ate = hoje; fs.writeFileSync(ARQ_CAMPANHA, JSON.stringify(c, null, 1)); }
    }
""")
open(p, 'w', encoding='utf-8').write(s)

j = sys.argv[2]
c = json.load(open(j, encoding='utf-8'))
c['ateAutomatico'] = True
json.dump(c, open(j, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('ok')
