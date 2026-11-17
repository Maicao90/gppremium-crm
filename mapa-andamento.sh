date +%H:%M
ls -la --time-style=+%H:%M /root/cerebro-lab-painel/src/components/ 2>&1 | grep -i mapa
ls -la --time-style=+%H:%M /root/cerebro-lab-api/ 2>&1 | head
wc -l /root/cerebro-lab-painel/src/components/MapaCerebro.jsx /root/cerebro-lab-api/cerebro.ts 2>/dev/null
ls -la --time-style=+%H:%M /root/cerebro-lab-painel/dist 2>/dev/null | head -3
ss -ltnp | grep -E ":301[5-9]" || true
