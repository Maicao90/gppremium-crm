set -e
cd /root/josy-analise
rm -rf conversas && tar -xzf conversas.tgz
ls conversas/*/ | grep -c txt || true
grep -l "áudio\] \"" conversas/2026-09/*.txt | head -2
node analisar.mjs enviar
node analisar.mjs status
