import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, SafeAreaView, Linking, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, MapPin, Phone } from 'lucide-react-native';
import { api } from '../../lib/api';

export default function Workshops() {
  const router = useRouter();
  const [lojas, setLojas] = useState<any[]>([]);
  const [busca, setBusca] = useState('');

  useEffect(() => { api<any[]>('/api/garantia-app/oficinas').then(setLojas).catch(() => setLojas([])); }, []);

  const filtradas = lojas.filter((l) => {
    const t = busca.trim().toLowerCase();
    return !t || `${l.nome} ${l.cidade}`.toLowerCase().includes(t);
  });
  const ligar = (tel: string) => { const d = String(tel || '').replace(/\D/g, ''); if (d) Linking.openURL(`tel:${d}`); };
  const mapa = (l: any) => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${l.nome} ${l.cidade} ${l.estado}`)}`);

  return (
    <SafeAreaView style={s.container}>
      <View style={s.top}><TouchableOpacity onPress={() => router.back()}><ArrowLeft size={22} color="#0f172a" /></TouchableOpacity><Text style={s.topTitle}>Oficinas autorizadas</Text><View style={{ width: 22 }} /></View>
      <View style={{ padding: 16, paddingBottom: 0 }}>
        <TextInput style={s.busca} placeholder="Buscar por nome ou cidade…" placeholderTextColor="#94a3b8" value={busca} onChangeText={setBusca} />
      </View>
      <ScrollView contentContainerStyle={s.scroll}>
        {filtradas.length === 0 && <Text style={s.vazio}>Nenhuma oficina encontrada.</Text>}
        {filtradas.map((l) => (
          <View key={l.id} style={s.card}>
            <Text style={s.nome}>{l.nome}</Text>
            <Text style={s.cidade}>{[l.cidade, l.estado].filter(Boolean).join(' - ')}</Text>
            <View style={s.acoes}>
              {l.telefone ? <TouchableOpacity style={s.acao} onPress={() => ligar(l.telefone)}><Phone size={15} color="#0ea5e9" /><Text style={s.acaoT}>Ligar</Text></TouchableOpacity> : null}
              <TouchableOpacity style={s.acao} onPress={() => mapa(l)}><MapPin size={15} color="#0ea5e9" /><Text style={s.acaoT}>Como chegar</Text></TouchableOpacity>
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  topTitle: { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  busca: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#0f172a' },
  scroll: { padding: 16 },
  vazio: { textAlign: 'center', color: '#64748b', marginTop: 30 },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: 'rgba(0,0,0,0.04)' },
  nome: { fontSize: 15, fontWeight: '800', color: '#0f172a' },
  cidade: { fontSize: 13, color: '#64748b', marginTop: 2 },
  acoes: { flexDirection: 'row', gap: 10, marginTop: 12 },
  acao: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(14,165,233,0.08)', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 9 },
  acaoT: { color: '#0ea5e9', fontWeight: '700', fontSize: 13 },
});
