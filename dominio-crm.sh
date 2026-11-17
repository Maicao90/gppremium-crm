set -e
F=/etc/nginx/sites-enabled/crm-nailacademyprofissional.conf
cp $F /root/crm-nginx.conf.bak-$(date +%s)
grep -n "server_name" $F
# acrescenta o dominio novo em todos os blocos do CRM (o antigo continua funcionando)
grep -q "crm.pneusgppremium.com.br" $F || sed -i 's/server_name crm.nailacademyprofissional.com;/server_name crm.nailacademyprofissional.com crm.pneusgppremium.com.br;/' $F
grep -n "server_name" $F
nginx -t
systemctl reload nginx
# certificado: amplia o atual pra cobrir os dois nomes
CN=$(grep -o "live/[^/]*" $F | head -1 | cut -d/ -f2)
echo "cert atual: $CN"
certbot certonly --nginx --non-interactive --cert-name "$CN" -d crm.nailacademyprofissional.com -d crm.pneusgppremium.com.br --expand 2>&1 | tail -5
nginx -t && systemctl reload nginx
sleep 2
curl -s -o /dev/null -w "novo: %{http_code}\n" https://crm.pneusgppremium.com.br/anuncios/
curl -s -o /dev/null -w "antigo: %{http_code}\n" https://crm.nailacademyprofissional.com/anuncios/
curl -s -o /dev/null -w "api novo: %{http_code}\n" https://crm.pneusgppremium.com.br/api/health
