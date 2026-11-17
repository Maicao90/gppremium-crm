cd /root/whatsapp-crm
grep -rIl -i "seguran.a ativad\|sistema de seguran" --exclude-dir=node_modules --exclude-dir=.git . 2>/dev/null | head
for f in $(grep -rIl -i "seguran.a ativad\|sistema de seguran" --exclude-dir=node_modules --exclude-dir=.git . 2>/dev/null | head -5); do echo "== $f"; grep -n -i -B6 -A4 "seguran.a ativad\|sistema de seguran" $f | head -40; done
