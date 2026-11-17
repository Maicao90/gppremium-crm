cd /root/ant-lab
cat tsconfig.json | head -40
time ./node_modules/.bin/tsc --noEmit -p . > /root/gp-aro/ajuste-final/tsc-antes.txt 2>&1; echo "exit=$?"
wc -l /root/gp-aro/ajuste-final/tsc-antes.txt; head -20 /root/gp-aro/ajuste-final/tsc-antes.txt
grep -rln "medidaJuntada\|travaPosOrcamento" /root/ant-lab/src --include=*.ts
