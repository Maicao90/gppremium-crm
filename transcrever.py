import sys, io, subprocess
import numpy as np
from faster_whisper import WhisperModel

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
modelo = sys.argv[1]
arquivos = sys.argv[2:]
FFMPEG = r"C:\Users\MaiconBatn\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.1.1-full_build\bin\ffmpeg.exe"


def carregar(caminho):
    # PyAV desta venv e antigo (sem metadata_errors): decodifica com o ffmpeg e entrega o array pronto.
    cmd = [FFMPEG, "-nostdin", "-v", "error", "-i", caminho, "-f", "f32le", "-ac", "1", "-ar", "16000", "-"]
    bruto = subprocess.run(cmd, capture_output=True, check=True).stdout
    return np.frombuffer(bruto, dtype=np.float32)


m = WhisperModel(modelo, device="cpu", compute_type="int8")
for a in arquivos:
    audio = carregar(a)
    segs, info = m.transcribe(audio, language="pt", vad_filter=True, beam_size=5)
    print("=== " + a + f"  ({len(audio) / 16000:.0f}s)")
    for s in segs:
        print(f"[{s.start:6.1f}-{s.end:6.1f}] {s.text.strip()}")
    print()
