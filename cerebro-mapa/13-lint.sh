P=/root/cerebro-lab-painel
cd $P
echo "=== apiBase"; cat src/apiBase.js
echo "=== getToken"; grep -n "export function getToken\|export const getToken\|localStorage" src/context/AuthContext.jsx | head
echo "=== eslint"
npx eslint src/components/MapaCerebro.jsx src/components/cerebroComum.jsx src/pages/CerebroRobo.jsx 2>&1 | tail -n 40
echo "=== eslint do original (pra comparar)"
cd /root/crm-de-anuncios && npx eslint src/pages/CerebroRobo.jsx 2>&1 | tail -n 8
