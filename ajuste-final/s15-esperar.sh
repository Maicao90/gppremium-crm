for i in $(seq 1 110); do pgrep -f "gp-aro/conf/conf.js|teste-aro.js|teste-troca-aro.js|teste-marcelo.js" >/dev/null || break; sleep 5; done
pgrep -fa "conf.js|teste-aro.js|teste-troca|teste-marcelo" || echo "testes terminaram"
