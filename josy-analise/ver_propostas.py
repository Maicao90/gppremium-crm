import json
import re
import sys

sys.stdout.reconfigure(encoding='utf-8')
d = json.load(open('aprendizado-josy.json', encoding='utf-8'))
for p in d['propostas']:
    s = p['sugestao']
    flag = ' <<PRECO>>' if re.search(r'R\$|\d{3}/\d{2}', s['resposta']) else ''
    print(f"- {p['id']} | {p['frequencia']}x | sucesso {p['taxaSucesso']} | {s['acao']} | audios {len(p['audios'])} | {p['ligadoA']}{flag}")
    print('   ', s['situacao'][:120])
    print('   >', s['resposta'][:280].replace('\n', ' / '))
