import sys

# ---------- painel (AtMetricas.jsx) ----------
p = sys.argv[1]
s = open(p, encoding='utf-8').read()
a = """    const contados = agendamentos.filter((a) => contas.includes(a.criadoPorId)
      && a.status !== 'cancelado'
      && !String(a.observacoes || '').includes('robo-')
      && diaBR(a.criadoEm) >= campanha.de && diaBR(a.criadoEm) <= campanha.ate);
"""
assert s.count(a) == 1
s = s.replace(a, """    // 23/10 (decisao do dono): agendamento do ROBO (retomada/lembrete, observacoes 'robo-') tambem vale ponto, IGUAL a
    // tabela do mes: conta o que sai (ou saiu) no mes da campanha, pelo dia de envio. Os da atendente seguem pelo dia criado.
    const fimDoMes = (() => { const [y, m] = campanha.ate.split('-').map(Number); return isoDia(new Date(Date.UTC(y, m, 0))); })();
    const contados = agendamentos.filter((a) => contas.includes(a.criadoPorId)
      && a.status !== 'cancelado'
      && (String(a.observacoes || '').includes('robo-')
        ? diaEfetivo(a) >= campanha.de && diaEfetivo(a) <= fimDoMes
        : diaBR(a.criadoEm) >= campanha.de && diaBR(a.criadoEm) <= campanha.ate));
""")
open(p, 'w', encoding='utf-8').write(s)

# ---------- ranking publico (scripts/ranking-publico.js) ----------
r = sys.argv[2]
t = open(r, encoding='utf-8').read()
b1 = "      select: { criadoPorId: true, status: true, criadoEm: true, enviarEm: true, observacoes: true },\n"
assert t.count(b1) == 1
t = t.replace(b1, "      select: { criadoPorId: true, status: true, criadoEm: true, enviarEm: true, atualizadoEm: true, observacoes: true },\n")
b0 = "      where: { criadoPorId: { in: todas }, status: { not: 'cancelado' }, criadoEm: { gte: ini, lt: fim } },\n"
assert t.count(b0) == 1
t = t.replace(b0, "      // criados no periodo (atendente) OU do robo com envio no mes da campanha (23/10) — o corte fino e logo abaixo\n      where: { criadoPorId: { in: todas }, status: { not: 'cancelado' }, OR: [{ criadoEm: { gte: ini, lt: fim } }, { observacoes: { contains: 'robo-' } }] },\n")
b2 = """      const contados = ags.filter((a) => contas.includes(a.criadoPorId) && !String(a.observacoes || '').includes('robo-')
        && diaBR(a.criadoEm) >= c.de && diaBR(a.criadoEm) <= c.ate);
"""
assert t.count(b2) == 1
t = t.replace(b2, """      // 23/10 (dono): do ROBO conta igual a tabela do mes (dia de envio dentro do mes da campanha); da atendente, dia criado.
      const [ay, am] = c.ate.split('-').map(Number);
      const fimDoMes = new Date(Date.UTC(ay, am, 0)).toISOString().slice(0, 10);
      const diaEfetivo = (a) => diaBR(a.status === 'enviado' ? a.atualizadoEm : a.enviarEm);
      const contados = ags.filter((a) => contas.includes(a.criadoPorId) && (String(a.observacoes || '').includes('robo-')
        ? diaEfetivo(a) >= c.de && diaEfetivo(a) <= fimDoMes
        : diaBR(a.criadoEm) >= c.de && diaBR(a.criadoEm) <= c.ate));
""")
open(r, 'w', encoding='utf-8').write(t)
print('ok')
