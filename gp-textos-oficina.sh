cd /root/whatsapp-crm/backend
U=$(grep ^DATABASE_URL .env | cut -d= -f2- | tr -d '"' | sed 's#^postgresql://##; s#^postgres://##')
q() { docker exec gp-postgres-crm psql -U "${U%%:*}" -d testdb -At -F ' | ' -c "$1"; }
L=72213a6c-31c5-410d-a6b4-504dfd223e2f
q "insert into \"FluxoResposta\" (chave, partes, \"atualizadoPor\", \"atualizadoEm\") values
 ('loja:$L:servico_oficina', \$\$[\"Fazemos sim! Os serviços são feitos aqui na nossa oficina.\",\"Os valores são combinados direto com os meninos da oficina, aqui na loja.\"]\$\$, 'Maicon (ajuste 21/10)', now()),
 ('loja:$L:alinhamento', \$\$[\"Fazemos sim! O alinhamento é feito aqui na nossa oficina.\",\"O valor é combinado direto com os meninos da oficina, aqui na loja.\"]\$\$, 'Maicon (ajuste 21/10)', now())
 on conflict (chave) do update set partes = excluded.partes, \"atualizadoPor\" = excluded.\"atualizadoPor\", \"atualizadoEm\" = now()"
q "select chave, partes from \"FluxoResposta\" where chave like 'loja:$L:%'"
echo "== simulacao no bot-service com os textos da GP"
cat > /tmp/sim.js <<'EOF'
const textos = {
  servico_oficina: ['Fazemos sim! Os serviços são feitos aqui na nossa oficina.', 'Os valores são combinados direto com os meninos da oficina, aqui na loja.'],
  alinhamento: ['Fazemos sim! O alinhamento é feito aqui na nossa oficina.', 'O valor é combinado direto com os meninos da oficina, aqui na loja.'],
};
(async () => {
  for (const msg of ['vcs fazem servico de mecanica?', 'So peneu mesmo cambagem alinhamento', 'faz alinhamento?', 'E remold?']) {
    const r = await fetch('http://127.0.0.1:3010/gerar-resposta', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'user', content: msg }], audioFluxo: true, simular: true, textosFluxo: textos }) }).then((x) => x.json());
    console.log(msg.padEnd(40), '->', JSON.stringify(r.chaves), JSON.stringify(r.partes));
  }
})();
EOF
node /tmp/sim.js
