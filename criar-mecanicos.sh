for e in borracharia@app city@app direcional@app feirao@app gppremium@app supervia@app; do
  code=$(curl -s -o /root/l.json -w "%{http_code}" -X POST https://crm.nailacademyprofissional.com/api/usuarios/login -H 'Content-Type: application/json' -d "{\"email\":\"$e\",\"senha\":\"111111\"}")
  echo "login $e: $code $(grep -o '"error":"[^"]*"' /root/l.json) $(grep -o '"role":"[^"]*"' /root/l.json)"
done
rm -f /root/l.json
