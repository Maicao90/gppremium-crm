"""Transcreve os audios da GP (Josy e clientes) na placa de video do PC.

Uso: .venv\\Scripts\\python.exe transcrever.py <pasta_audios> <saida.jsonl>
Retoma de onde parou: pula arquivo que ja esta no jsonl.
"""
import json
import os
import sys
import glob
import time

# DLLs do CUDA instaladas pelo pip (nvidia-cublas / nvidia-cudnn)
for pacote in ('cublas', 'cudnn'):
    for d in glob.glob(os.path.join(sys.prefix, 'Lib', 'site-packages', 'nvidia', pacote, 'bin')):
        os.add_dll_directory(d)
        os.environ['PATH'] = d + os.pathsep + os.environ['PATH']

from faster_whisper import WhisperModel  # noqa: E402

VOCABULARIO = ('Atendimento de loja de pneus no WhatsApp. Pneus GP Premium, remold, Luziânia. '
               'Medidas como 175/70 aro 14, 185/65/15, 195/55/15, 205/55/16, 265/70/16. '
               'Alinhamento, balanceamento, à vista, Pix, cartão, parcelar em 10 vezes, garantia de 2 anos e 60 mil km.')


def main():
    pasta, saida = sys.argv[1], sys.argv[2]
    feitos = set()
    if os.path.exists(saida):
        with open(saida, encoding='utf-8') as f:
            for linha in f:
                try:
                    feitos.add(json.loads(linha)['arquivo'])
                except Exception:
                    pass
    arquivos = sorted(p for p in glob.glob(os.path.join(pasta, '**', '*'), recursive=True) if os.path.isfile(p))
    pendentes = [p for p in arquivos if os.path.relpath(p, pasta).replace('\\', '/') not in feitos]
    print(f'{len(arquivos)} arquivos, {len(feitos)} ja feitos, {len(pendentes)} pendentes', flush=True)

    try:
        modelo = WhisperModel('large-v3-turbo', device='cuda', compute_type='float16')
    except Exception as e:  # sem memoria de video suficiente
        print('float16 falhou, indo de int8_float16:', e, flush=True)
        modelo = WhisperModel('large-v3-turbo', device='cuda', compute_type='int8_float16')

    inicio = time.time()
    with open(saida, 'a', encoding='utf-8') as out:
        for i, caminho in enumerate(pendentes, 1):
            rel = os.path.relpath(caminho, pasta).replace('\\', '/')
            try:
                segs, info = modelo.transcribe(caminho, language='pt', vad_filter=True, initial_prompt=VOCABULARIO, beam_size=5)
                texto = ' '.join(s.text.strip() for s in segs).strip()
                reg = {'arquivo': rel, 'texto': texto, 'duracao': round(info.duration, 1)}
            except Exception as e:
                reg = {'arquivo': rel, 'texto': '', 'erro': str(e)[:200]}
            out.write(json.dumps(reg, ensure_ascii=False) + '\n')
            out.flush()
            if i % 100 == 0:
                gasto = time.time() - inicio
                print(f'{i}/{len(pendentes)} em {gasto/60:.1f} min (falta ~{gasto/i*(len(pendentes)-i)/60:.0f} min)', flush=True)
    print('PRONTO', flush=True)


if __name__ == '__main__':
    main()
