import React, { useState } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ScrollView, Alert, ActivityIndicator, SafeAreaView } from 'react-native';
import { useRouter } from 'expo-router';
import { Shield, ArrowLeft, Check } from 'lucide-react-native';
import { useAuth } from '../../lib/auth';
import { registrarPush } from '../../lib/push';

const soDigitos = (s: string) => s.replace(/\D/g, '');
const fmtCPF = (s: string) => soDigitos(s).slice(0, 11).replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');

export default function Register() {
  const router = useRouter();
  const { registrarCliente } = useAuth();
  const [f, setF] = useState({ nome: '', cpf: '', telefone: '', email: '', senha: '' });
  const [aceito, setAceito] = useState(false);
  const [loading, setLoading] = useState(false);
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));

  const cadastrar = async () => {
    if (loading) return;
    if (!f.nome.trim()) return Alert.alert('Ops', 'Informe seu nome.');
    if (soDigitos(f.cpf).length !== 11) return Alert.alert('Ops', 'CPF inválido.');
    if (f.senha.length < 4) return Alert.alert('Ops', 'A senha precisa ter ao menos 4 caracteres.');
    if (!aceito) return Alert.alert('Ops', 'Você precisa aceitar os termos da garantia.');
    setLoading(true);
    try {
      await registrarCliente({ nome: f.nome.trim(), cpf: soDigitos(f.cpf), telefone: f.telefone.trim(), email: f.email.trim(), senha: f.senha });
      registrarPush();
      router.replace('/(customer)/home');
    } catch (e: any) {
      Alert.alert('Não foi possível cadastrar', e?.message || 'Tente novamente.');
    }
    setLoading(false);
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <TouchableOpacity style={styles.back} onPress={() => router.back()}><ArrowLeft size={20} color="#0f172a" /><Text style={styles.backText}>Voltar</Text></TouchableOpacity>
        <View style={styles.header}>
          <View style={styles.iconBox}><Shield size={32} color="#0EA5E9" /></View>
          <Text style={styles.title}>Criar conta</Text>
          <Text style={styles.sub}>Acompanhe a garantia e as revisões dos seus pneus.</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Nome completo</Text>
          <TextInput style={styles.input} value={f.nome} onChangeText={(v) => set('nome', v)} placeholder="Seu nome" placeholderTextColor="#94a3b8" />
          <Text style={styles.label}>CPF</Text>
          <TextInput style={styles.input} value={fmtCPF(f.cpf)} onChangeText={(v) => set('cpf', v)} keyboardType="number-pad" placeholder="000.000.000-00" placeholderTextColor="#94a3b8" />
          <Text style={styles.label}>Telefone (WhatsApp)</Text>
          <TextInput style={styles.input} value={f.telefone} onChangeText={(v) => set('telefone', v)} keyboardType="phone-pad" placeholder="(00) 00000-0000" placeholderTextColor="#94a3b8" />
          <Text style={styles.label}>E-mail</Text>
          <TextInput style={styles.input} value={f.email} onChangeText={(v) => set('email', v)} autoCapitalize="none" keyboardType="email-address" placeholder="voce@email.com" placeholderTextColor="#94a3b8" />
          <Text style={styles.label}>Senha</Text>
          <TextInput style={styles.input} value={f.senha} onChangeText={(v) => set('senha', v)} secureTextEntry placeholder="Crie uma senha" placeholderTextColor="#94a3b8" />

          <TouchableOpacity style={styles.termo} onPress={() => setAceito(!aceito)} activeOpacity={0.7}>
            <View style={[styles.check, aceito && styles.checkOn]}>{aceito && <Check size={14} color="#fff" />}</View>
            <Text style={styles.termoText}>Li e aceito os termos da Garantia GP Premium 50.000 KM e a política de privacidade (LGPD).</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.btn} onPress={cadastrar} disabled={loading} activeOpacity={0.85}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>CRIAR CONTA</Text>}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  scroll: { padding: 24, paddingTop: 48 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  backText: { fontSize: 14, color: '#0f172a', fontWeight: '600' },
  header: { alignItems: 'center', marginBottom: 22 },
  iconBox: { backgroundColor: 'rgba(14,165,233,0.06)', padding: 14, borderRadius: 20, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(14,165,233,0.15)' },
  title: { fontSize: 22, fontWeight: '900', color: '#0f172a' },
  sub: { fontSize: 13, color: '#64748b', marginTop: 4, textAlign: 'center' },
  card: { backgroundColor: '#fff', borderRadius: 18, padding: 20, borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)' },
  label: { fontSize: 12, fontWeight: '700', color: '#475569', marginBottom: 5, marginTop: 10 },
  input: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, fontSize: 14, color: '#0f172a' },
  termo: { flexDirection: 'row', gap: 10, marginTop: 18, alignItems: 'flex-start' },
  check: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: '#cbd5e1', alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  checkOn: { backgroundColor: '#0ea5e9', borderColor: '#0ea5e9' },
  termoText: { flex: 1, fontSize: 12, color: '#64748b', lineHeight: 17 },
  btn: { backgroundColor: '#0ea5e9', borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 20 },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 14, letterSpacing: 0.5 },
});
