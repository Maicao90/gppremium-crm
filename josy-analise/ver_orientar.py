import json
import sys

sys.stdout.reconfigure(encoding='utf-8')
d = json.load(open('aprendizado-josy.json', encoding='utf-8'))
for p in d['propostas']:
    if p['id'] in ('acha_caro', 'informa_cidade', 'retorno_depois_de_dias', 'desistiu', 'desconfia_qualidade', 'fora_da_regiao', 'retorno_cliente_antigo', 'pergunta_marca', 'compara_outra_loja', 'vai_pensar', 'pergunta_entrega', 'pos_venda_problema', 'pede_foto_ou_video'):
        s = p['sugestao']
        print(f"## {p['id']} [{s['acao']}]\nSITUACAO: {s['situacao']}\nRESPOSTA:\n{s['resposta']}\n")
