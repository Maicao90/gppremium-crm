import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, SafeAreaView, Platform, Alert, ActivityIndicator, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Shield, Mail, Lock, User, Store } from 'lucide-react-native';
import { useAuth } from '../lib/auth';

const soDigitos = (s: string) => s.replace(/\D/g, '');
const fmtCPF = (s: string) => {
  const d = soDigitos(s).slice(0, 11);
  return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
};

export default function LoginScreen() {
  const router = useRouter();
  const { identidade, carregando, loginLoja, loginCliente } = useAuth();
  const [modo, setModo] = useState<'cliente' | 'loja'>('cliente');
  const [cpf, setCpf] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [loading, setLoading] = useState(false);

  // Já logado? Manda pra tela certa.
  useEffect(() => {
    if (carregando || !identidade) return;
    if (identidade.tipo === 'cliente') router.replace('/(customer)/home');
    else router.replace('/(mechanic)/home');
  }, [identidade, carregando]);

  const entrar = async () => {
    if (loading) return;
    setLoading(true);
    try {
      if (modo === 'cliente') {
        if (soDigitos(cpf).length !== 11 || !senha) throw new Error('Informe o CPF e a senha.');
        await loginCliente(soDigitos(cpf), senha);
        router.replace('/(customer)/home');
      } else {
        if (!email.trim() || !senha) throw new Error('Informe o e-mail e a senha.');
        await loginLoja(email.trim(), senha);
        router.replace('/(mechanic)/home');
      }
    } catch (e: any) {
      Alert.alert('Não foi possível entrar', e?.message || 'Tente novamente.');
    }
    setLoading(false);
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <View style={styles.iconBox}><Shield size={38} color="#0EA5E9" /></View>
          <Text style={styles.title}>GP PREMIUM</Text>
          <Text style={styles.subtitle}>GARANTIA 50.000 KM</Text>
        </View>

        {/* Alternador cliente / loja */}
        <View style={styles.toggle}>
          <TouchableOpacity style={[styles.toggleBtn, modo === 'cliente' && styles.toggleOn]} onPress={() => setModo('cliente')}>
            <User size={15} color={modo === 'cliente' ? '#fff' : '#64748b'} />
            <Text style={[styles.toggleText, modo === 'cliente' && styles.toggleTextOn]}>Sou cliente</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.toggleBtn, modo === 'loja' && styles.toggleOn]} onPress={() => setModo('loja')}>
            <Store size={15} color={modo === 'loja' ? '#fff' : '#64748b'} />
            <Text style={[styles.toggleText, modo === 'loja' && styles.toggleTextOn]}>Sou loja</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          {modo === 'cliente' ? (
            <View style={styles.inputBox}>
              <User size={16} color="#64748b" />
              <TextInput style={styles.input} placeholder="CPF" placeholderTextColor="#94a3b8"
                keyboardType="number-pad" value={fmtCPF(cpf)} onChangeText={setCpf} />
            </View>
          ) : (
            <View style={styles.inputBox}>
              <Mail size={16} color="#64748b" />
              <TextInput style={styles.input} placeholder="E-mail da loja" placeholderTextColor="#94a3b8"
                autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
            </View>
          )}
          <View style={styles.inputBox}>
            <Lock size={16} color="#64748b" />
            <TextInput style={styles.input} placeholder="Senha" placeholderTextColor="#94a3b8"
              secureTextEntry value={senha} onChangeText={setSenha} />
          </View>

          <TouchableOpacity style={styles.btn} onPress={entrar} disabled={loading} activeOpacity={0.85}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>ENTRAR</Text>}
          </TouchableOpacity>
        </View>

        {modo === 'cliente' && (
          <View style={styles.footer}>
            <Text style={styles.footerText}>Ainda não tem conta?</Text>
            <TouchableOpacity onPress={() => router.push('/(auth)/register')}>
              <Text style={styles.footerLink}> Cadastre-se</Text>
            </TouchableOpacity>
          </View>
        )}
        {modo === 'loja' && <Text style={styles.dica}>Use o mesmo e-mail e senha do painel do CRM.</Text>}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 28 },
  header: { alignItems: 'center', marginBottom: 28 },
  iconBox: { backgroundColor: 'rgba(14,165,233,0.06)', padding: 16, borderRadius: 22, marginBottom: 14, borderWidth: 1, borderColor: 'rgba(14,165,233,0.15)' },
  title: { fontSize: 26, fontWeight: '900', color: '#0f172a', letterSpacing: 1.5 },
  subtitle: { fontSize: 11, color: '#0ea5e9', fontWeight: '700', letterSpacing: 2, marginTop: 4 },
  toggle: { flexDirection: 'row', backgroundColor: '#e2e8f0', borderRadius: 12, padding: 4, marginBottom: 16 },
  toggleBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 9 },
  toggleOn: { backgroundColor: '#0ea5e9' },
  toggleText: { fontSize: 13, fontWeight: '700', color: '#64748b' },
  toggleTextOn: { color: '#fff' },
  card: { backgroundColor: '#fff', borderRadius: 20, padding: 22, borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)' },
  inputBox: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)', borderRadius: 10, marginBottom: 14, paddingHorizontal: 12 },
  input: { flex: 1, paddingVertical: 12, fontSize: 14, color: '#0f172a' },
  btn: { backgroundColor: '#0ea5e9', borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 4 },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 14, letterSpacing: 0.5 },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 22 },
  footerText: { fontSize: 13, color: '#64748b' },
  footerLink: { fontSize: 13, color: '#0ea5e9', fontWeight: '700' },
  dica: { fontSize: 12, color: '#94a3b8', textAlign: 'center', marginTop: 20 },
});
