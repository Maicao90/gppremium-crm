cd /root/cerebro-lab-painel
npx eslint -f json src/components/MapaCerebro.jsx src/components/cerebroComum.jsx src/pages/CerebroRobo.jsx > /tmp/cerebro-lint.json
node -e "const r=require('/tmp/cerebro-lint.json');for(const f of r)for(const m of f.messages)console.log(f.filePath.split('/').pop()+':'+m.line+':'+m.column,m.ruleId,m.message.split('\n')[0].slice(0,140))"
rm -f /tmp/cerebro-lint.json
