import React, { useState } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, SafeAreaView, TextInput, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, Search, Wrench, AlertTriangle } from 'lucide-react-native';
import { api } from '../../lib/api';
import { FotoBotao } from '../../components/FotoBotao';
import { Foto } from '../../lib/foto';

const ROTULO: Record<string, string> = { dianteiro_esquerdo: 'Dianteiro Esq.', dianteiro_direito: 'Dianteiro Dir.', traseiro_esquerdo: 'Traseiro Esq.', traseiro_direito: 'Traseiro Dir.', estepe: 'Estepe' };
// Profundidade selecionável 1,6 a 10,0
const OPCOES = Array.from({ length: 85 }, (_, i) => Number((1.6 + i * 0.1).toFixed(1)));

type PneuRev = { posicao: string; profundidadeSulco: number | ''; arrancamentoBorracha: boolean; dotLido: string; foto: Foto };

export default function NewInspection() {
  const router = useRouter();
  const [placa, setPlaca] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [garantia, setGarantia] = useState<any>(null);
  const [km, setKm] = useState('');
  const [mecanico, setMecanico] = useState('');
  const [fOdo, setFOdo] = useState<Foto>(null);
  const [pneus, setPneus] = useState<PneuRev[]>([]);
  const [salvando, setSalvando] = useState(false);

  const buscar = async () => {
    const alvo = placa.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (alvo.length !== 7) return Alert.alert('Ops', 'Digite a placa completa (7 caracteres).');
    setBuscando(true); setGarantia(null);
    try {
      const r = await api<any>(`/api/garantia/garantias/por-placa?placa=${alvo}`);
      if (!r.encontrada) { Alert.alert('Nada encontrado', 'Nenhuma garantia em andamento pra essa placa.'); }
      else {
        setGarantia(r.garantia);
        setPneus((r.garantia.pneus || []).filter((p: any) => !p.cancelada).map((p: any) => ({ posicao: p.posicao, profundidadeSulco: '', arrancamentoBorracha: false, dotLido: '', foto: null })));
        setKm('');
      }
    } catch (e: any) { Alert.alert('Erro', e?.message); }
    setBuscando(false);
  };

  const setPneu = (i: number, k: string, v: any) => setPneus((ps) => ps.map((p, j) => (j === i ? { ...p, [k]: v } : p)));

  const salvar = async () => {
    if (km === '') return Alert.alert('Ops', 'Informe o KM da revisão.');
    if (pneus.some((p) => p.profundidadeSulco === '')) return Alert.alert('Ops', 'Selecione a profundidade do sulco de todos os pneus.');
    setSalvando(true);
    try {
      const r = await api<any>('/api/garantia/revisoes', {
        method: 'POST',
        body: {
          garantiaId: garantia.id, km: Number(km), mecanico, fotoOdometroBase64: fOdo?.base64 || null,
          pneus: pneus.map((p) => ({ posicao: p.posicao, profundidadeSulco: Number(p.profundidadeSulco) || 0, arrancamentoBorracha: p.arrancamentoBorracha, dotLido: p.dotLido })),
        },
      });
      let msg = 'Revisão registrada!';
      if (r.pneusCancelados?.length) msg += `\n⛔ Garantia cancelada (arrancamento) no(s) pneu(s): ${r.pneusCancelados.join(', ')}.`;
      if (r.odometroSuspeito) msg += '\n⚠ Odômetro suspeito — foi pra análise.';
      Alert.alert('Pronto', msg, [{ text: 'OK', onPress: () => router.back() }]);
    } catch (e: any) { Alert.alert('Não foi possível salvar', e?.message); }
    setSalvando(false);
  };

  return (
    <SafeAreaView style={s.container}>
      <View style={s.top}><TouchableOpacity onPress={() => router.back()}><ArrowLeft size={22} color="#0f172a" /></TouchableOpacity><Text style={s.topTitle}>Nova Revisão</Text><View style={{ width: 22 }} /></View>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets keyboardDismissMode="interactive">
        <View style={s.card}>
          <Text style={s.cardTitle}>Buscar veículo</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput style={[s.input, { flex: 1 }]} placeholder="Placa" placeholderTextColor="#94a3b8" autoCapitalize="characters" value={placa} onChangeText={(v) => setPlaca(v.toUpperCase())} />
            <TouchableOpacity style={s.btnMini} onPress={buscar} disabled={buscando}>{buscando ? <ActivityIndicator color="#fff" size="small" /> : <Search size={16} color="#fff" />}</TouchableOpacity>
          </View>
          {garantia && <Text style={s.ok}>✓ {garantia.cliente?.nome} — {garantia.veiculo?.marca} {garantia.veiculo?.modelo} (cobertura até {garantia.kmMaximo} km)</Text>}
        </View>

        {garantia && (
          <>
            <View style={s.card}>
              <TextInput style={s.input} placeholder="KM da revisão" placeholderTextColor="#94a3b8" keyboardType="number-pad" value={km} onChangeText={setKm} />
              <TextInput style={s.input} placeholder="Mecânico responsável" placeholderTextColor="#94a3b8" value={mecanico} onChangeText={setMecanico} />
              <FotoBotao label="Foto do odômetro" valor={fOdo} onChange={setFOdo} />
            </View>

            {pneus.map((p, i) => (
              <View key={p.posicao} style={s.card}>
                <Text style={s.cardTitle}>{ROTULO[p.posicao] || p.posicao}</Text>
                <Text style={s.lbl}>Profundidade do sulco (mm)</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                  {OPCOES.map((v) => (
                    <TouchableOpacity key={v} style={[s.chip, p.profundidadeSulco === v && s.chipOn]} onPress={() => setPneu(i, 'profundidadeSulco', v)}>
                      <Text style={[s.chipT, p.profundidadeSulco === v && s.chipTOn]}>{v.toFixed(1).replace('.', ',')}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                <TextInput style={s.input} placeholder="DOT lido (4 dígitos)" placeholderTextColor="#94a3b8" keyboardType="number-pad" value={p.dotLido} onChangeText={(v) => setPneu(i, 'dotLido', v.replace(/\D/g, '').slice(0, 4))} />
                <TouchableOpacity style={[s.arr, p.arrancamentoBorracha && s.arrOn]} onPress={() => setPneu(i, 'arrancamentoBorracha', !p.arrancamentoBorracha)}>
                  <AlertTriangle size={15} color={p.arrancamentoBorracha ? '#e11d48' : '#94a3b8'} />
                  <Text style={[s.arrT, p.arrancamentoBorracha && { color: '#e11d48' }]}>Arrancamento de borracha (cancela este pneu)</Text>
                </TouchableOpacity>
                <FotoBotao label="Foto do sulco / banda" valor={p.foto} onChange={(f) => setPneu(i, 'foto', f)} />
              </View>
            ))}

            <TouchableOpacity style={s.btn} onPress={salvar} disabled={salvando} activeOpacity={0.85}>
              {salvando ? <ActivityIndicator color="#fff" /> : <><Wrench size={18} color="#fff" /><Text style={s.btnText}>REGISTRAR REVISÃO</Text></>}
            </TouchableOpacity>
            <View style={{ height: 30 }} />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  topTitle: { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  scroll: { padding: 16 },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(0,0,0,0.04)' },
  cardTitle: { fontSize: 14, fontWeight: '800', color: '#0f172a', marginBottom: 10 },
  lbl: { fontSize: 12, color: '#475569', fontWeight: '700', marginBottom: 6 },
  input: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)', borderRadius: 9, paddingHorizontal: 11, paddingVertical: 10, fontSize: 13, color: '#0f172a', marginBottom: 8 },
  btnMini: { backgroundColor: '#0ea5e9', borderRadius: 9, width: 46, alignItems: 'center', justifyContent: 'center' },
  ok: { color: '#16a34a', fontSize: 12, marginTop: 8, fontWeight: '600' },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: '#cbd5e1', marginRight: 6 },
  chipOn: { backgroundColor: '#0ea5e9', borderColor: '#0ea5e9' },
  chipT: { fontSize: 13, color: '#475569', fontWeight: '600' },
  chipTOn: { color: '#fff' },
  arr: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 9, borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 4 },
  arrOn: { backgroundColor: 'rgba(225,29,72,0.06)', borderColor: 'rgba(225,29,72,0.4)' },
  arrT: { fontSize: 12, color: '#64748b', flex: 1 },
  btn: { flexDirection: 'row', gap: 8, backgroundColor: '#0ea5e9', borderRadius: 12, padding: 16, alignItems: 'center', justifyContent: 'center' },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 15, letterSpacing: 0.5 },
});
