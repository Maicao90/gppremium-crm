import React, { useState, useCallback, useEffect } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, SafeAreaView, RefreshControl, ActivityIndicator } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Shield, LogOut, Bell, Wrench, CheckCircle2 } from 'lucide-react-native';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { registrarPush } from '../../lib/push';

const STATUS: Record<string, { label: string; cor: string }> = {
  pendente: { label: 'Aprovação pendente', cor: '#d9892a' },
  em_analise: { label: 'Em análise', cor: '#e11d48' },
  ativa: { label: 'Ativa', cor: '#16a34a' },
  atencao: { label: 'Em atenção', cor: '#d9892a' },
  reprovada: { label: 'Reprovada', cor: '#e11d48' },
  expirada: { label: 'Expirada', cor: '#64748b' },
  cancelada: { label: 'Cancelada', cor: '#64748b' },
};
const fmtKm = (n: any) => Number(n || 0).toLocaleString('pt-BR');

export default function CustomerHome() {
  const router = useRouter();
  const { identidade, sair } = useAuth();
  const [dados, setDados] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const carregar = useCallback(async () => {
    try { setDados(await api('/api/garantia-app/cliente/me')); } catch { /* mantém */ }
    setLoading(false);
  }, []);
  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));
  useEffect(() => { registrarPush(); }, []);

  const naoLidas = (dados?.notificacoes || []).filter((n: any) => !n.enviada).length;
  const sairApp = async () => { await sair(); router.replace('/'); };

  if (loading) return <SafeAreaView style={[s.container, s.center]}><ActivityIndicator color="#0ea5e9" size="large" /></SafeAreaView>;

  return (
    <SafeAreaView style={s.container}>
      <ScrollView contentContainerStyle={s.scroll} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await carregar(); setRefreshing(false); }} />}>
        <View style={s.header}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={s.logo}><Shield size={22} color="#0ea5e9" /></View>
            <View><Text style={s.hi}>Olá,</Text><Text style={s.nome}>{(identidade?.nome || '').split(' ')[0]}</Text></View>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity onPress={() => router.push('/(customer)/notifications')} style={s.iconBtn}>
              <Bell size={18} color="#64748b" />{naoLidas > 0 && <View style={s.badge}><Text style={s.badgeT}>{naoLidas}</Text></View>}
            </TouchableOpacity>
            <TouchableOpacity onPress={sairApp} style={s.iconBtn}><LogOut size={18} color="#64748b" /></TouchableOpacity>
          </View>
        </View>

        {(dados?.garantias || []).length === 0 && (
          <View style={s.vazio}><Shield size={40} color="#cbd5e1" /><Text style={s.vazioT}>Você ainda não tem garantia cadastrada.</Text><Text style={s.vazioS}>Quando a loja ativar a garantia dos seus pneus GP Premium, ela aparece aqui.</Text></View>
        )}

        {(dados?.garantias || []).map((g: any) => {
          const st = STATUS[g.status] || STATUS.pendente;
          const km = g.veiculo?.kmAtual || g.kmInicial;
          const prog = Math.min(100, Math.max(0, ((km - g.kmInicial) / (g.kmMaximo - g.kmInicial)) * 100));
          return (
            <View key={g.id} style={s.card}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={s.placa}>{g.veiculo?.placa}</Text>
                <View style={[s.chip, { backgroundColor: st.cor + '22' }]}><Text style={[s.chipT, { color: st.cor }]}>{st.label}</Text></View>
              </View>
              <Text style={s.carro}>{[g.veiculo?.marca, g.veiculo?.modelo].filter(Boolean).join(' ')}</Text>
              <Text style={s.km}>{fmtKm(km)} de {fmtKm(g.kmMaximo)} km</Text>
              <View style={s.barra}><View style={[s.barraFill, { width: `${prog}%` }]} /></View>
              <Text style={s.pneusInfo}>{(g.pneus || []).length} pneu(s) • {(g.revisoes || []).length} revisão(ões)</Text>

              {(g.revisoes || []).slice(0, 3).map((r: any) => (
                <View key={r.id} style={s.rev}>
                  <Wrench size={14} color="#0ea5e9" />
                  <Text style={s.revT}>Revisão em {fmtKm(r.km)} km — {new Date(r.criadoEm).toLocaleDateString('pt-BR')}</Text>
                  {r.status === 'aprovada' && <CheckCircle2 size={14} color="#16a34a" />}
                </View>
              ))}
            </View>
          );
        })}

        <TouchableOpacity style={s.oficinas} onPress={() => router.push('/(customer)/workshops')}>
          <Text style={s.oficinasT}>📍 Encontrar oficinas autorizadas</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  center: { alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 18, paddingTop: 40 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  logo: { width: 42, height: 42, borderRadius: 12, backgroundColor: 'rgba(14,165,233,0.08)', alignItems: 'center', justifyContent: 'center' },
  hi: { fontSize: 13, color: '#64748b' },
  nome: { fontSize: 18, fontWeight: '900', color: '#0f172a' },
  iconBtn: { padding: 10, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0' },
  badge: { position: 'absolute', top: 2, right: 2, backgroundColor: '#e11d48', minWidth: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  badgeT: { color: '#fff', fontSize: 9, fontWeight: '800' },
  vazio: { alignItems: 'center', padding: 30, backgroundColor: '#fff', borderRadius: 16, marginTop: 10 },
  vazioT: { fontSize: 15, fontWeight: '800', color: '#0f172a', marginTop: 12, textAlign: 'center' },
  vazioS: { fontSize: 13, color: '#64748b', marginTop: 6, textAlign: 'center', lineHeight: 18 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 18, marginBottom: 14, borderWidth: 1, borderColor: 'rgba(0,0,0,0.04)' },
  placa: { fontSize: 18, fontWeight: '900', color: '#0f172a', letterSpacing: 1 },
  chip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  chipT: { fontSize: 11, fontWeight: '800' },
  carro: { fontSize: 13, color: '#64748b', marginTop: 2 },
  km: { fontSize: 13, color: '#0f172a', fontWeight: '700', marginTop: 12 },
  barra: { height: 8, backgroundColor: '#e2e8f0', borderRadius: 4, marginTop: 6, overflow: 'hidden' },
  barraFill: { height: 8, backgroundColor: '#0ea5e9', borderRadius: 4 },
  pneusInfo: { fontSize: 12, color: '#94a3b8', marginTop: 8 },
  rev: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  revT: { flex: 1, fontSize: 12, color: '#475569' },
  oficinas: { backgroundColor: '#fff', borderRadius: 14, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: '#e2e8f0' },
  oficinasT: { fontSize: 14, fontWeight: '700', color: '#0ea5e9' },
});
