import sys

ws, ag = sys.argv[1], sys.argv[2]

s = open(ws, encoding='utf-8').read()
a1 = "const waIdsBotIA = new Set<string>();\n"
assert s.count(a1) == 1
s = s.replace(a1, a1 + """// 23/10: textos que o PROPRIO SISTEMA mandou por agendamento do robo (observacoes 'robo-...', ex.: retomada de
// clientes). O eco dessas mensagens nao e "atendente assumiu": sem isto o robo ficava 10 min pausado e quem
// respondia rapido a retomada esperava o vigia.
const textosAgendadosDoRobo = new Map<string, number>();
const normalizarEco = (t: string) => String(t || '').replace(/\\s+/g, ' ').trim().toLowerCase();
export function lembrarTextoAgendadoDoRobo(texto: string) {
  const agora = Date.now();
  for (const [k, t] of textosAgendadosDoRobo) if (agora - t > 10 * 60_000) textosAgendadosDoRobo.delete(k);
  textosAgendadosDoRobo.set(normalizarEco(texto), agora);
}
function ehTextoAgendadoDoRobo(texto: string): boolean {
  const t = textosAgendadosDoRobo.get(normalizarEco(texto));
  return !!t && Date.now() - t < 10 * 60_000;
}
""")
a2 = "        const textoEco = extrairTextoMensagem(desembrulharMensagem(msg.message)) || '';\n        if (cfgBot?.botIaAtivo) {\n"
assert s.count(a2) == 1, s.count(a2)
s = s.replace(a2, "        const textoEco = extrairTextoMensagem(desembrulharMensagem(msg.message)) || '';\n        if (cfgBot?.botIaAtivo && textoEco && ehTextoAgendadoDoRobo(textoEco)) {\n          console.log(`[Bot IA] ${remoteJid}: eco de agendamento do robo (retomada) — robo segue atendendo, sem pausa.`);\n        } else if (cfgBot?.botIaAtivo) {\n")
open(ws, 'w', encoding='utf-8').write(s)

g = open(ag, encoding='utf-8').read()
b1 = "            const sucesso = await enviarMensagem(efetivoId, numeroEnvio, humanizarTexto(agendamento.mensagem), midia);\n"
assert g.count(b1) == 1
g = g.replace(b1, """            const textoEnvio = humanizarTexto(agendamento.mensagem);
            // Agendamento do ROBO (retomada etc.): avisa que o eco dessa mensagem nao e atendente assumindo (23/10).
            if (String(agendamento.observacoes || '').startsWith('robo-')) require('./whatsappService').lembrarTextoAgendadoDoRobo(textoEnvio);
            const sucesso = await enviarMensagem(efetivoId, numeroEnvio, textoEnvio, midia);
""")
open(ag, 'w', encoding='utf-8').write(g)
print('ok')
