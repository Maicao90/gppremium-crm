// Captura de foto REAL (câmera do celular) → data-URL base64 pro backend salvar.
// O backend (/api/garantia) aceita `...Base64` em data-URL.
import * as ImagePicker from 'expo-image-picker';

export type Foto = { uri: string; base64: string } | null;

// Abre a CÂMERA, pede permissão, comprime e devolve { uri, base64 (data-URL) }.
export async function tirarFoto(): Promise<Foto> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) {
    throw new Error('Permissão de câmera negada. Libere nas configurações do celular.');
  }
  const r = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'],
    quality: 0.6,
    base64: true,
    exif: false,
  });
  if (r.canceled || !r.assets?.[0]) return null;
  const a = r.assets[0];
  const dataUrl = `data:image/jpeg;base64,${a.base64}`;
  return { uri: a.uri, base64: dataUrl };
}

// Alternativa: escolher da galeria (caso a foto já exista no aparelho).
export async function escolherFoto(): Promise<Foto> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new Error('Permissão de galeria negada.');
  const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.6, base64: true });
  if (r.canceled || !r.assets?.[0]) return null;
  const a = r.assets[0];
  return { uri: a.uri, base64: `data:image/jpeg;base64,${a.base64}` };
}
