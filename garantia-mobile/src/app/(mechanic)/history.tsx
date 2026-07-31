import React, { useState, useCallback } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, SafeAreaView, RefreshControl, ActivityIndicator } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { ArrowLeft, CheckCircle2, XCircle, Clock } from 'lucide-react-native';
import { api } from '../../lib/api';

// Histórico das revisões que ESTA loja já fez (o backend já escopa por lojaId sozinho
// pra quem não é master — mesma rota que o painel usa).
export default function History() {
  const router = useRouter();
  const [revisoes, setRevisoes] = useState<any[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [erro, setErro] = useState('');

  const carregar = useCallback(async () => {
    try { setRevisoes(await api<any[]>('/api/garantia/revisoes')); setErro(''); }
    catch (e: any) { setErro(e?.message || 'Erro ao carregar histórico.'); }
    setCarregando(false);
  }, []);
  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));

  const badgeDe = (status: string) => {
    if (status === 'aprovada') return { cor: '#16a34a', bg: 'rgba(22,163,74,0.1)', label: 'Aprovada', Icon: CheckCircle2 };
    if (status === 'reprovada') return { cor: '#e11d48', bg: 'rgba(225,29,72,0.1)', label: 'Reprovada', Icon: XCircle };
    return { cor: '#d9892a', bg: 'rgba(217,137,42,0.12)', label: 'Pendente', Icon: Clock };
  };

  return (
    <SafeAreaView style={s.container}>
      <View style={s.top}>
        <TouchableOpacity onPress={() => router.back()}><ArrowLeft size={22} color="#0f172a" /></TouchableOpacity>
        <Text style={s.topTitle}>Histórico de Revisões</Text>
        <View style={{ width: 22 }} />
      </View>
      <ScrollView contentContainerStyle={s.scroll} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await carregar(); setRefreshing(false); }} />}>
        {carregando ? (
          <ActivityIndicator style={{ marginTop: 40 }} color="#0ea5e9" />
        ) : erro ? (
          <Text style={s.erro}>{erro}</Text>
        ) : revisoes.length === 0 ? (
          <Text style={s.vazio}>Nenhuma revisão registrada ainda.</Text>
        ) : (
          revisoes.map((r) => {
            const b = badgeDe(r.status);
            const diffPct = r.kmEsperado ? Math.round((Math.abs(r.km - r.kmEsperado) / r.kmEsperado) * 100) : null;
            const foraDoIntervalo = diffPct !== null && diffPct > 10;
            return (
              <View key={r.id} style={[s.card, r.status === 'reprovada' && s.cardReprovada]}>
                <View style={s.linhaTopo}>
                  <Text style={s.placa}>{r.veiculo?.placa || '—'}</Text>
                  <View style={[s.badge, { backgroundColor: b.bg }]}>
                    <b.Icon size={13} color={b.cor} />
                    <Text style={[s.badgeT, { color: b.cor }]}>{b.label}</Text>
                  </View>
                </View>
                <Text style={s.cliente}>{r.cliente?.nome || ''}</Text>
                <Text style={s.linha}>{new Date(r.criadoEm).toLocaleDateString('pt-BR')} • {Number(r.km || 0).toLocaleString('pt-BR')} km</Text>
                {r.kmEsperado != null && (
                  <Text style={[s.linhaMuted, foraDoIntervalo ? { color: '#e11d48', fontWeight: '700' } : null]}>
                    Esperado: {Number(r.kmEsperado).toLocaleString('pt-BR')} km {foraDoIntervalo ? `— ⚠ ${diffPct}% fora do intervalo` : `(${diffPct}% de diferença)`}
                  </Text>
                )}
                {r.mecanico ? <Text style={s.linhaMuted}>Mecânico: {r.mecanico}</Text> : null}
                {r.status === 'reprovada' && <Text style={s.avisoReprovada}>Esta revisão foi reprovada e a garantia foi cancelada.</Text>}
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
  cardReprovada: { borderColor: '#e11d48', borderWidth: 1 },
  linhaTopo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  placa: { fontSize: 15, fontWeight: '800', color: '#0f172a' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  badgeT: { fontSize: 11, fontWeight: '700' },
  cliente: { fontSize: 12, color: '#64748b', marginTop: 2 },
  linha: { fontSize: 13, color: '#334155', marginTop: 8, fontWeight: '600' },
  linhaMuted: { fontSize: 12, color: '#64748b', marginTop: 4 },
  avisoReprovada: { fontSize: 12, color: '#e11d48', marginTop: 8, fontWeight: '700' },
  erro: { color: '#e11d48', textAlign: 'center', marginTop: 30 },
  vazio: { color: '#64748b', textAlign: 'center', marginTop: 30 },
});
