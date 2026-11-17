chmod +x /root/reload-1805.sh
date -u
# 18:05 de Brasilia = 21:05 UTC
alvo=$(date -u -d "21:05" +%s); agora=$(date -u +%s); espera=$((alvo - agora))
echo "espera ${espera}s"
if [ $espera -gt 0 ]; then
  nohup bash -c "sleep $espera; /root/reload-1805.sh" >/dev/null 2>&1 &
  echo "agendado pid $!"
fi
