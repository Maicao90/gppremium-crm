curl -s https://crm.nailacademyprofissional.com/api/usuarios > /tmp/u.json
node -e 'const l=JSON.parse(require("fs").readFileSync("/tmp/u.json","utf8"));if(!Array.isArray(l)){console.log(JSON.stringify(l).slice(0,300));process.exit()}for(const u of l)console.log(u.id.slice(0,8),"|",u.nome,"|",u.whatsappConectado,"|",u.compartilhaWhatsappDeId||"")'
