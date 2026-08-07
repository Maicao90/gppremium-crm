import React, { useState } from 'react';
import { TouchableOpacity, Text, View, StyleSheet, Platform, Modal } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Calendar } from 'lucide-react-native';

// Campo de data com CALENDÁRIO nativo (toca, escolhe o dia/mês, troca o ano navegando
// no topo) em vez de digitar "AAAA-MM-DD" na mão — pensado pro mecânico usar com uma
// mão só/dedo sujo de graxa, sem precisar acertar o formato do teclado.
// `valor`/`onChange` continuam em "AAAA-MM-DD" (mesmo formato que o backend já espera),
// só a INTERAÇÃO vira calendário.

const paraISO = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const paraData = (iso: string) => {
  const [a, m, d] = String(iso || '').split('-').map(Number);
  return a && m && d ? new Date(a, m - 1, d) : new Date();
};
const paraBR = (iso: string) => {
  if (!iso) return '';
  const [a, m, d] = iso.split('-');
  return a && m && d ? `${d}/${m}/${a}` : iso;
};

export function CampoData({ label, valor, onChange }: { label: string; valor: string; onChange: (iso: string) => void }) {
  const [aberto, setAberto] = useState(false);

  const selecionou = (evento: any, data?: Date) => {
    if (Platform.OS === 'android') {
      setAberto(false);
      if (evento?.type === 'set' && data) onChange(paraISO(data));
      return;
    }
    if (data) onChange(paraISO(data)); // iOS: atualiza ao vivo, fecha só no "Confirmar"
  };

  return (
    <>
      <TouchableOpacity style={s.box} onPress={() => setAberto(true)} activeOpacity={0.8}>
        <Calendar size={16} color="#64748b" />
        <Text style={[s.txt, !valor && s.placeholder]}>{valor ? paraBR(valor) : label}</Text>
      </TouchableOpacity>

      {aberto && Platform.OS === 'android' && (
        <DateTimePicker value={paraData(valor)} mode="date" display="calendar" maximumDate={new Date()} onChange={selecionou} />
      )}

      {Platform.OS === 'ios' && (
        <Modal visible={aberto} transparent animationType="fade" onRequestClose={() => setAberto(false)}>
          <View style={s.modalFundo}>
            <View style={s.modalCard}>
              <Text style={s.modalTitulo}>{label}</Text>
              <DateTimePicker value={paraData(valor)} mode="date" display="inline" maximumDate={new Date()} onChange={selecionou} />
              <TouchableOpacity style={s.btnOk} onPress={() => setAberto(false)} activeOpacity={0.85}>
                <Text style={s.btnOkTxt}>Confirmar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
    </>
  );
}

const s = StyleSheet.create({
  box: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)', borderRadius: 10, marginBottom: 14, paddingHorizontal: 12, paddingVertical: 12 },
  txt: { fontSize: 14, color: '#0f172a' },
  placeholder: { color: '#94a3b8' },
  modalFundo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 24 },
  modalCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16 },
  modalTitulo: { fontSize: 14, fontWeight: '800', color: '#0f172a', marginBottom: 8 },
  btnOk: { backgroundColor: '#e11d2a', borderRadius: 10, padding: 12, alignItems: 'center', marginTop: 8 },
  btnOkTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },
});
