import React, { useState } from 'react';
import { TouchableOpacity, Text, Image, View, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { Camera, Check } from 'lucide-react-native';
import { tirarFoto, Foto } from '../lib/foto';

// Botão que abre a câmera de verdade e guarda a foto (data-URL base64). Mostra a
// miniatura quando já tem foto.
export function FotoBotao({ label, valor, onChange }: { label: string; valor: Foto; onChange: (f: Foto) => void }) {
  const [carregando, setCarregando] = useState(false);
  const capturar = async () => {
    setCarregando(true);
    try { const f = await tirarFoto(); if (f) onChange(f); }
    catch (e: any) { Alert.alert('Câmera', e?.message || 'Não foi possível abrir a câmera.'); }
    setCarregando(false);
  };
  return (
    <TouchableOpacity style={[s.box, valor && s.boxOk]} onPress={capturar} activeOpacity={0.8}>
      {carregando ? <ActivityIndicator color="#0ea5e9" /> : valor ? (
        <View style={s.row}>
          <Image source={{ uri: valor.uri }} style={s.thumb} />
          <View style={s.ok}><Check size={13} color="#fff" /></View>
          <Text style={s.txtOk} numberOfLines={1}>{label}</Text>
        </View>
      ) : (
        <View style={s.row}><Camera size={18} color="#64748b" /><Text style={s.txt}>{label}</Text></View>
      )}
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  box: { borderWidth: 1, borderColor: '#cbd5e1', borderStyle: 'dashed', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 12, marginTop: 8 },
  boxOk: { borderColor: '#0ea5e9', borderStyle: 'solid', backgroundColor: 'rgba(14,165,233,0.05)' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  txt: { fontSize: 13, color: '#64748b', fontWeight: '600' },
  txtOk: { fontSize: 13, color: '#0f172a', fontWeight: '700', flex: 1 },
  thumb: { width: 30, height: 30, borderRadius: 6 },
  ok: { position: 'absolute', left: 20, top: -4, backgroundColor: '#22c55e', borderRadius: 8, padding: 2 },
});
