// Captura de foto REAL (câmera do celular) → data-URL base64 pro backend salvar.
// O backend (/api/garantia) aceita `...Base64` em data-URL.
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

export type Foto = { uri: string; base64: string } | null;

// A câmera devolve a foto em resolução TOTAL do sensor (3000-4000px), mesmo com
// quality:0.6 — "quality" só ajusta artefato de compressão JPEG, não o tamanho. Numa
// revisão com 4 pneus isso passava de 15-20MB numa requisição só (servidor é 1 núcleo
// só, sem paralelismo de verdade — cada foto tem que esperar a anterior processar).
// Reduz pra 1280px de largura ANTES de gerar o base64: corta upload e processamento
// juntos, sem perder nitidez suficiente pra ler DOT/etiqueta ou avaliar desgaste.
const LARGURA_MAX = 1280;
async function reduzir(uri: string): Promise<string> {
  const r = await manipulateAsync(uri, [{ resize: { width: LARGURA_MAX } }], { compress: 0.7, format: SaveFormat.JPEG, base64: true });
  return `data:image/jpeg;base64,${r.base64}`;
}

// Abre a CÂMERA, pede permissão, comprime e devolve { uri, base64 (data-URL) }.
export async function tirarFoto(): Promise<Foto> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) {
    throw new Error('Permissão de câmera negada. Libere nas configurações do celular.');
  }
  const r = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'],
    quality: 0.6,
    exif: false,
  });
  if (r.canceled || !r.assets?.[0]) return null;
  const a = r.assets[0];
  return { uri: a.uri, base64: await reduzir(a.uri) };
}

// Alternativa: escolher da galeria (caso a foto já exista no aparelho).
export async function escolherFoto(): Promise<Foto> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new Error('Permissão de galeria negada.');
  const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.6 });
  if (r.canceled || !r.assets?.[0]) return null;
  const a = r.assets[0];
  return { uri: a.uri, base64: await reduzir(a.uri) };
}
