import React, { useState, useCallback } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { ArrowLeft, Bell } from 'lucide-react-native';
import { api } from '../../lib/api';

export default function Notifications() {
  const router = useRouter();
  const [lista, setLista] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const carregar = useCallback(async () => {
    try { const r = await api<any>('/api/garantia-app/cliente/me'); setLista(r.notificacoes || []); } catch { /* mantém */ }
  }, []);
  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));

  const marcarLida = async (id: string) => {
    try { await api(`/api/garantia-app/cliente/notificacoes/${id}/lida`, { method: 'POST' }); carregar(); } catch { /* noop */ }
  };

  return (
    <SafeAreaView style={s.container}>
      <View style={s.top}><TouchableOpacity onPress={() => router.back()}><ArrowLeft size={22} color="#0f172a" /></TouchableOpacity><Text style={s.topTitle}>Notificações</Text><View style={{ width: 22 }} /></View>
      <ScrollView contentContainerStyle={s.scroll} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await carregar(); setRefreshing(false); }} />}>
        {lista.length === 0 && <View style={s.vazio}><Bell size={36} color="#cbd5e1" /><Text style={s.vazioT}>Sem notificações.</Text></View>}
        {lista.map((n) => (
          <TouchableOpacity key={n.id} style={[s.card, !n.lidaNoApp && s.cardNova]} onPress={() => marcarLida(n.id)} activeOpacity={0.8}>
            {!n.lidaNoApp && <View style={s.dot} />}
            <Text style={s.msg}>{n.mensagem}</Text>
            <Text style={s.data}>{new Date(n.criadoEm).toLocaleDateString('pt-BR')}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  topTitle: { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  scroll: { padding: 16 },
  vazio: { alignItems: 'center', padding: 40 },
  vazioT: { fontSize: 14, color: '#64748b', marginTop: 12 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: 'rgba(0,0,0,0.04)' },
  cardNova: { borderColor: 'rgba(14,165,233,0.4)', backgroundColor: 'rgba(14,165,233,0.04)' },
  dot: { position: 'absolute', top: 14, right: 14, width: 8, height: 8, borderRadius: 4, backgroundColor: '#0ea5e9' },
  msg: { fontSize: 13, color: '#0f172a', lineHeight: 19 },
  data: { fontSize: 11, color: '#94a3b8', marginTop: 8 },
});
