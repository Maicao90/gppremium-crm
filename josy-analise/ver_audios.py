import json
import sys

sys.stdout.reconfigure(encoding='utf-8')
d = json.load(open('aprendizado-josy.json', encoding='utf-8'))
for p in d['propostas']:
    if not p['audios']:
        continue
    print(f"## {p['id']} ({p['sugestao']['acao']})")
    for a in p['audios']:
        print(f"  {a['midia']} {a['duracao']}s: {a['transcricao']}")
