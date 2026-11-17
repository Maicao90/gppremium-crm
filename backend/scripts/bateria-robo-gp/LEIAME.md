# Bateria e laboratorio do robo GP (17/11/2026)

- `node roda.js` — casos reais (erros e fugas de 14-16/11, horario, lotes 1 a 4) contra o bot-service (porta 3010, `simular:true`, nao envia nada).
- `node ../regressao-robo-gp.js` — bateria antiga (prints da Josy 12-13/11).
- `sim.js N` + `analisa.js` — repassa N conversas reais da Josy pelo robo do laboratorio (porta 3019) e mede fluxo fixo / IA livre / atendente / silencio.
- `lab-testa3.sh <patch> [sim]` — laboratorio em /root/lab-robo-1711 = copia do server.ts de producao + patch; `SIMN=200` para amostra.
- `publica.sh <patch>` — so publica se o laboratorio passou inteiro; reinicia apenas o bot-service; desfaz se nao subir.
- `patch-1711*.js` — as correcoes de 17/11 ja aplicadas em src/bot-service/server.ts (ficam como registro).
