import React, { useState, useCallback } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, RefreshControl, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Plus, Wrench, LogOut, AlertTriangle, ClipboardList } from 'lucide-react-native';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';

export default function MechanicHome() {
  const router = useRouter();
  const { identidade, sair } = useAuth();
  const [resumo, setResumo] = useState<any>(null);
  const [erro, setErro] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const carregar = useCallback(async () => {
    try { setResumo(await api('/api/garantia/resumo')); setErro(''); }
    catch (e: any) { setErro(e?.message || 'Erro ao carregar.'); }
  }, []);
  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));

  const podeCadastrar = resumo ? resumo.podeCadastrar !== false : true;
  const sairApp = () => Alert.alert('Sair', 'Deseja sair da conta?', [
    { text: 'Cancelar', style: 'cancel' },
    { text: 'Sair', style: 'destructive', onPress: async () => { await sair(); router.replace('/'); } },
  ]);

  return (
    <SafeAreaView style={s.container}>
      <ScrollView contentContainerStyle={s.scroll} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await carregar(); setRefreshing(false); }} />}>
        <View style={s.header}>
          <View><Text style={s.hi}>Olá,</Text><Text style={s.nome}>{identidade?.nome || 'Loja'}</Text></View>
          <TouchableOpacity onPress={sairApp} style={s.logout}><LogOut size={18} color="#64748b" /></TouchableOpacity>
        </View>

        {erro ? <View style={s.alerta}><AlertTriangle size={16} color="#e11d48" /><Text style={s.alertaTxt}>{erro}</Text></View> : null}
        {!podeCadastrar && <View style={s.aviso}><Text style={s.avisoTxt}>Sua loja ainda não está credenciada no programa Garantia 50k. Fale com a GP Premium para liberar o cadastro e as revisões.</Text></View>}

        <View style={s.kpis}>
          <TouchableOpacity style={s.kpi} onPress={() => router.push('/(mechanic)/garantias?filtro=ativa')} activeOpacity={0.7}>
            <Text style={s.kpiN}>{resumo?.ativas ?? '—'}</Text><Text style={s.kpiL}>Ativas</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.kpi} onPress={() => router.push('/(mechanic)/garantias?filtro=pendente')} activeOpacity={0.7}>
            <Text style={s.kpiN}>{resumo?.pendentes ?? '—'}</Text><Text style={s.kpiL}>Pendentes</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.kpi} onPress={() => router.push('/(mechanic)/garantias?filtro=total')} activeOpacity={0.7}>
            <Text style={s.kpiN}>{resumo?.total ?? '—'}</Text><Text style={s.kpiL}>Total</Text>
          </TouchableOpacity>
        </View>

        {podeCadastrar && (
          <>
            <TouchableOpacity style={[s.acao, { backgroundColor: '#0ea5e9' }]} onPress={() => router.push('/(mechanic)/new-warranty')} activeOpacity={0.85}>
              <Plus size={26} color="#fff" /><View><Text style={s.acaoT}>Ativar Garantia</Text><Text style={s.acaoS}>Cadastrar carro e pneus na venda</Text></View>
            </TouchableOpacity>
            <TouchableOpacity style={[s.acao, { backgroundColor: '#0f172a' }]} onPress={() => router.push('/(mechanic)/new-inspection')} activeOpacity={0.85}>
              <Wrench size={26} color="#fff" /><View><Text style={s.acaoT}>Nova Revisão</Text><Text style={s.acaoS}>Medir sulcos e registrar a revisão</Text></View>
            </TouchableOpacity>
            <TouchableOpacity style={[s.acao, { backgroundColor: '#475569' }]} onPress={() => router.push('/(mechanic)/history')} activeOpacity={0.85}>
              <ClipboardList size={26} color="#fff" /><View><Text style={s.acaoT}>Histórico</Text><Text style={s.acaoS}>Ver revisões já feitas e o status delas</Text></View>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  scroll: { padding: 20, paddingTop: 40 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 },
  hi: { fontSize: 14, color: '#64748b' },
  nome: { fontSize: 22, fontWeight: '900', color: '#0f172a' },
  logout: { padding: 10, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0' },
  alerta: { flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: 'rgba(225,29,72,0.08)', borderRadius: 10, padding: 12, marginBottom: 14 },
  alertaTxt: { color: '#e11d48', fontSize: 13, flex: 1 },
  aviso: { backgroundColor: 'rgba(217,137,42,0.1)', borderRadius: 10, padding: 14, marginBottom: 14 },
  avisoTxt: { color: '#b45309', fontSize: 13, lineHeight: 18 },
  kpis: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  kpi: { flex: 1, backgroundColor: '#fff', borderRadius: 14, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(0,0,0,0.04)' },
  kpiN: { fontSize: 24, fontWeight: '900', color: '#0f172a' },
  kpiL: { fontSize: 11, color: '#64748b', marginTop: 2 },
  acao: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 16, padding: 20, marginBottom: 12 },
  acaoT: { color: '#fff', fontSize: 17, fontWeight: '800' },
  acaoS: { color: 'rgba(255,255,255,0.8)', fontSize: 12, marginTop: 2 },
});
