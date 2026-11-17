"""Monta cada conversa da GP como um arquivo de texto legivel (texto + audios transcritos), pra leitura.

Uso: python montar_conversas.py   (na pasta josy-analise)
Saida: conversas/AAAA-MM/<id>.txt  +  conversas/indice.csv
"""
import csv
import gzip
import hashlib
import json
import os
from collections import defaultdict
from datetime import datetime, timedelta

AQUI = os.path.dirname(os.path.abspath(__file__))
JOSY_PAINEL = '34268c16-7bed-400a-bf1e-a3d9e37d8774'

transcricoes = {}
caminho_tr = os.path.join(AQUI, 'transcricoes.jsonl')
if os.path.exists(caminho_tr):
    with open(caminho_tr, encoding='utf-8') as f:
        for linha in f:
            try:
                r = json.loads(linha)
                transcricoes[r['arquivo']] = r.get('texto', '').strip()
            except Exception:
                pass

csv.field_size_limit(10_000_000)
por_chat = defaultdict(list)
with gzip.open(os.path.join(AQUI, 'josy-mensagens.csv.gz'), 'rt', encoding='utf-8') as f:
    for m in csv.DictReader(f):
        jid = m['chatJid']
        if jid.endswith('@g.us') or jid.endswith('@broadcast') or jid.startswith('status'):
            continue
        por_chat[jid].append(m)


def quem(m):
    if m['fromMe'] != 't':
        return 'CLIENTE'
    if m['enviado_por'] == 'bot':
        return 'ROBÔ'
    return 'LOJA'  # Josy/atendente (celular ou painel)


def hora(ts):
    # banco em UTC -> Brasilia
    t = datetime.fromisoformat(ts[:19]) - timedelta(hours=3)
    return t


def linha_msg(m):
    q = quem(m)
    tipo = m['tipo']
    texto = (m['texto'] or '').strip().replace('\r', '')
    if tipo == 'audio':
        arq = (m['midia'] or '').lstrip('/')
        tr = transcricoes.get(arq)
        if tr is None:
            corpo = '[áudio — sem transcrição]'
        elif not tr:
            corpo = '[áudio sem fala]'
        else:
            corpo = f'[áudio] "{tr}"'
        if q == 'LOJA' and arq:
            corpo += f'  {{audio:{arq}}}'
        return q, corpo
    if tipo in ('imagem', 'video', 'documento', 'figurinha', 'localizacao', 'contato'):
        rot = {'imagem': 'foto', 'video': 'vídeo', 'documento': 'documento', 'figurinha': 'figurinha', 'localizacao': 'localização', 'contato': 'contato'}[tipo]
        return q, f'[{rot}]' + (f' {texto}' if texto else '')
    if tipo == 'outro' and (not texto or 'secretEncrypted' in texto):
        return q, None
    return q, texto or None


os.makedirs(os.path.join(AQUI, 'conversas'), exist_ok=True)
indice = []
for jid, msgs in por_chat.items():
    msgs.sort(key=lambda m: m['timestamp'])
    # mensagens repetidas (mesmo waId) aparecem 2x quando duas contas do painel estao no mesmo numero
    vistos, unicas = set(), []
    for m in msgs:
        chave = m['waId'] or (m['timestamp'], m['texto'])
        if chave in vistos:
            continue
        vistos.add(chave)
        unicas.append(m)
    n_cli = sum(1 for m in unicas if m['fromMe'] != 't')
    n_loja = sum(1 for m in unicas if quem(m) == 'LOJA')
    n_bot = sum(1 for m in unicas if quem(m) == 'ROBÔ')
    if n_cli == 0 or (n_loja + n_bot) == 0:
        continue
    cid = hashlib.sha1(jid.encode()).hexdigest()[:10]
    inicio = hora(unicas[0]['timestamp'])
    fim = hora(unicas[-1]['timestamp'])
    nome = next((m['chatNome'] for m in unicas if m['chatNome']), '')
    linhas = [f'CONVERSA {cid} | contato: {nome or "(sem nome)"} | {inicio:%d/%m/%Y %H:%M} até {fim:%d/%m/%Y %H:%M} | '
              f'{n_cli} msgs do cliente, {n_loja} da loja, {n_bot} do robô', '']
    ultimo_dia = None
    for m in unicas:
        q, corpo = linha_msg(m)
        if corpo is None:
            continue
        t = hora(m['timestamp'])
        if t.date() != ultimo_dia:
            linhas.append(f'--- {t:%d/%m/%Y (%a)} ---')
            ultimo_dia = t.date()
        linhas.append(f'[{t:%H:%M}] {q}: {corpo}')
    pasta = os.path.join(AQUI, 'conversas', f'{inicio:%Y-%m}')
    os.makedirs(pasta, exist_ok=True)
    with open(os.path.join(pasta, f'{cid}.txt'), 'w', encoding='utf-8') as out:
        out.write('\n'.join(linhas) + '\n')
    indice.append({'id': cid, 'mes': f'{inicio:%Y-%m}', 'inicio': f'{inicio:%Y-%m-%d %H:%M}', 'fim': f'{fim:%Y-%m-%d %H:%M}',
                   'msgs_cliente': n_cli, 'msgs_loja': n_loja, 'msgs_robo': n_bot, 'nome': nome,
                   'tamanho': sum(len(x) for x in linhas)})

indice.sort(key=lambda r: r['inicio'])
with open(os.path.join(AQUI, 'conversas', 'indice.csv'), 'w', encoding='utf-8', newline='') as f:
    w = csv.DictWriter(f, fieldnames=list(indice[0].keys()))
    w.writeheader()
    w.writerows(indice)
total = sum(r['tamanho'] for r in indice)
print(f'{len(indice)} conversas, {total/1e6:.1f} milhoes de caracteres (~{total/3.5/1e6:.1f} M tokens); transcricoes carregadas: {len(transcricoes)}')
from collections import Counter
print(Counter(r['mes'] for r in indice))
