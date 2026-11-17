set -e
B=/root/whatsapp-crm/backend
S=$B/src/bot-service/server.ts
cp $S /root/server.ts.bak-iaerros-$(date +%s)
python3 - "$S" <<'PY'
import sys
p = sys.argv[1]
s = open(p, encoding='utf-8').read()

old_fn = "function paraMensagensAnthropic(input: any[]): MensagemAnthropic[] {"
new_fn = """// 22/10: o WhatsApp manda print (PNG) rotulado como foto (JPEG) e a Anthropic recusa a imagem com 400 — o
// cliente ficava sem resposta. O tipo certo sai dos primeiros bytes do arquivo, nao do rotulo.
function tipoRealDaImagem(base64: string, rotulo: string): string {
  const inicio = base64.slice(0, 16);
  if (inicio.startsWith('/9j/')) return 'image/jpeg';
  if (inicio.startsWith('iVBORw0KGgo')) return 'image/png';
  if (inicio.startsWith('R0lGOD')) return 'image/gif';
  if (inicio.startsWith('UklGR')) return 'image/webp';
  return rotulo;
}

export function paraMensagensAnthropic(input: any[]): MensagemAnthropic[] {"""
assert s.count(old_fn) == 1
s = s.replace(old_fn, new_fn)

old_img = "if (m) blocos.push({ type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } });"
new_img = "if (m) blocos.push({ type: 'image', source: { type: 'base64', media_type: tipoRealDaImagem(m[2], m[1]), data: m[2] } });"
assert s.count(old_img) == 1
s = s.replace(old_img, new_img)

old_end = """  while (saida.length && saida[0]!.role !== 'user') saida.shift();
  return saida;
}"""
new_end = """  while (saida.length && saida[0]!.role !== 'user') saida.shift();
  // 22/10: quando a loja (robo ou atendente) falou DEPOIS da ultima mensagem do cliente, a conversa termina em
  // "assistant" e a Anthropic recusa com 400 ("does not support assistant message prefill") — o cliente ficava
  // sem resposta. Fecha com uma nota do sistema: responde so o que ainda falta, ou nada.
  if (saida.length && saida[saida.length - 1]!.role === 'assistant') {
    saida.push({ role: 'user', content: [{ type: 'text', text: '(Nota do sistema, nao e o cliente: as mensagens da loja acima ja foram enviadas depois da ultima fala do cliente. Se ainda falta responder algo que o cliente perguntou, responda so isso, sem repetir o que a loja ja disse. Se nao falta nada, devolva {"partes": []}.)' }] });
  }
  return saida;
}"""
assert s.count(old_end) == 1
s = s.replace(old_end, new_end)
open(p, 'w', encoding='utf-8').write(s)
PY
cd $B && ./node_modules/.bin/tsc --noEmit && echo TSC_OK
cat > /root/teste-ia-erros.ts <<'TS'
import { paraMensagensAnthropic } from '/root/whatsapp-crm/backend/src/bot-service/server';
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const r = paraMensagensAnthropic([
  { role: 'user', content: [{ type: 'input_text', text: 'oi' }, { type: 'input_image', image_url: 'data:image/jpeg;base64,' + png }] },
  { role: 'assistant', content: [{ type: 'output_text', text: 'Oi, tudo bem?' }] },
]);
console.log(JSON.stringify(r.map((m) => ({ role: m.role, tipos: (m.content as any[]).map((c) => c.type === 'image' ? c.source.media_type : c.type) }))));
console.log(r[r.length - 1]!.role === 'user' ? 'OK termina em user' : 'FALHOU');
console.log((r[0]!.content as any[])[1].source.media_type === 'image/png' ? 'OK png corrigido' : 'FALHOU png');
process.exit(0);
TS
cd $B && ./node_modules/.bin/ts-node --transpile-only /root/teste-ia-erros.ts 2>&1 | grep -v "^\[" | tail -5
