import React, { useState, useCallback } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, RefreshControl, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { api } from '../../lib/api';

// Mesmos status/cores do painel web (STATUS_GARANTIA).
const STATUS: Record<string, { label: string; cor: string; bg: string }> = {
  pendente: { label: 'Aprovação pendente', cor: '#d9892a', bg: 'rgba(217,137,42,0.14)' },
  em_analise: { label: 'DOT divergente', cor: '#e11d48', bg: 'rgba(225,29,72,0.12)' },
  ativa: { label: 'Ativa', cor: '#16a34a', bg: 'rgba(22,163,74,0.12)' },
  atencao: { label: 'Em atenção', cor: '#d9892a', bg: 'rgba(217,137,42,0.14)' },
  reprovada: { label: 'Reprovada', cor: '#e11d48', bg: 'rgba(225,29,72,0.12)' },
  cancelada: { label: 'Cancelada', cor: '#64748b', bg: 'rgba(100,116,139,0.15)' },
  expirada: { label: 'Expirada (50.000 km)', cor: '#64748b', bg: 'rgba(100,116,139,0.15)' },
};

const TITULOS: Record<string, string> = { ativa: 'Garantias Ativas', pendente: 'Garantias Pendentes', total: 'Todas as Garantias' };

export default function Garantias() {
  const router = useRouter();
  const { filtro } = useLocalSearchParams<{ filtro?: string }>();
  const [lista, setLista] = useState<any[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [erro, setErro] = useState('');

  const carregar = useCallback(async () => {
    try { setLista(await api<any[]>('/api/garantia/garantias')); setErro(''); }
    catch (e: any) { setErro(e?.message || 'Erro ao carregar garantias.'); }
    setCarregando(false);
  }, []);
  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));

  const filtrada = filtro && filtro !== 'total' ? lista.filter((g) => g.status === filtro) : lista;

  return (
    <SafeAreaView style={s.container}>
      <View style={s.top}>
        <TouchableOpacity onPress={() => router.back()}><ArrowLeft size={22} color="#0f172a" /></TouchableOpacity>
        <Text style={s.topTitle}>{TITULOS[filtro || 'total'] || 'Garantias'}</Text>
        <View style={{ width: 22 }} />
      </View>
      <ScrollView contentContainerStyle={s.scroll} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await carregar(); setRefreshing(false); }} />}>
        {carregando ? (
          <ActivityIndicator style={{ marginTop: 40 }} color="#0ea5e9" />
        ) : erro ? (
          <Text style={s.erro}>{erro}</Text>
        ) : filtrada.length === 0 ? (
          <Text style={s.vazio}>Nenhuma garantia encontrada.</Text>
        ) : (
          filtrada.map((g) => {
            const st = STATUS[g.status] || STATUS.pendente;
            return (
              <View key={g.id} style={s.card}>
                <View style={s.linhaTopo}>
                  <Text style={s.placa}>{g.veiculo?.placa || '—'}</Text>
                  <View style={[s.badge, { backgroundColor: st.bg }]}><Text style={[s.badgeT, { color: st.cor }]}>{st.label}</Text></View>
                </View>
                <Text style={s.cliente}>{g.cliente?.nome || '—'}</Text>
                <Text style={s.linhaMuted}>{[g.veiculo?.marca, g.veiculo?.modelo].filter(Boolean).join(' ')} • {(g.pneus || []).length} pneu(s)</Text>
                <Text style={s.linhaMuted}>Cobertura: {Number(g.kmInicial || 0).toLocaleString('pt-BR')} → {Number(g.kmMaximo || 0).toLocaleString('pt-BR')} km</Text>
              </View>
            );
          })
        )}
        <View style={{ height: 30 }} />
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
  linhaTopo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  placa: { fontSize: 15, fontWeight: '800', color: '#0f172a' },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  badgeT: { fontSize: 11, fontWeight: '700' },
  cliente: { fontSize: 13, color: '#334155', marginTop: 6, fontWeight: '600' },
  linhaMuted: { fontSize: 12, color: '#64748b', marginTop: 2 },
  erro: { color: '#e11d48', textAlign: 'center', marginTop: 30 },
  vazio: { color: '#64748b', textAlign: 'center', marginTop: 30 },
});
