cd /root/whatsapp-crm/backend
U=$(grep ^DATABASE_URL .env | cut -d= -f2- | tr -d '"' | sed 's#^postgresql://##; s#^postgres://##')
q() { docker exec gp-postgres-crm psql -U "${U%%:*}" -d testdb -At -F ' | ' -c "$1"; }
echo "== colunas da Mensagem"
q "select string_agg(column_name, ',') from information_schema.columns where table_name='Mensagem'"
echo "== mensagens de candidatos (texto)"
q "select tipo, left(replace(coalesce(texto,''),E'\n',' '),120) from \"Mensagem\" where not \"fromMe\" and (texto ilike '%curr%culo%' or texto ilike '%curriculum%' or texto ilike '%vaga%' or texto ilike '%emprego%' or texto ilike '%contratando%' or texto ilike '%trabalhar com voc%') order by timestamp desc limit 25"
echo "== tipos de documento recebidos (amostra)"
q "select tipo, left(coalesce(texto,''),80), left(coalesce(\"midiaUrl\",''),60) from \"Mensagem\" where not \"fromMe\" and tipo not in ('texto','imagem','audio','video','sticker','localizacao','outro') order by timestamp desc limit 10"
