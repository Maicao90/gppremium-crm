import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, SafeAreaView, Alert, ActivityIndicator, ScrollView, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { Lock, User, Eye, EyeOff } from 'lucide-react-native';
import { useAuth } from '../lib/auth';

const soDigitos = (s: string) => s.replace(/\D/g, '');
const fmtCPF = (s: string) => soDigitos(s).slice(0, 11).replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
// Se o que a pessoa digitou parece CPF (só números, 11 dígitos) → cliente.
// Se tem "@" ou letras → e-mail da loja. É assim que o app identifica sozinho.
const pareceCPF = (v: string) => !v.includes('@') && soDigitos(v).length >= 11 && soDigitos(v).length === v.replace(/[.\-\s]/g, '').length;
// Formata como CPF SÓ quando é só número/pontuação; se tiver letra/@ (e-mail), deixa como está.
const fmtIdent = (v: string) => (v.includes('@') || /[a-zA-Z]/.test(v) ? v : fmtCPF(v));

export default function LoginScreen() {
  const router = useRouter();
  const { identidade, carregando, loginLoja, loginCliente } = useAuth();
  const [ident, setIdent] = useState('');
  const [senha, setSenha] = useState('');
  const [verSenha, setVerSenha] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (carregando || !identidade) return;
    router.replace(identidade.tipo === 'cliente' ? '/(customer)/home' : '/(mechanic)/home');
  }, [identidade, carregando]);

  const entrar = async () => {
    if (loading) return;
    const valor = ident.trim();
    if (!valor || !senha) { Alert.alert('Ops', 'Preencha o e-mail (ou CPF) e a senha.'); return; }
    setLoading(true);
    try {
      if (pareceCPF(valor)) {
        // Cliente (CPF)
        await loginCliente(soDigitos(valor), senha);
        router.replace('/(customer)/home');
      } else {
        // Loja (e-mail do CRM)
        await loginLoja(valor, senha);
        router.replace('/(mechanic)/home');
      }
    } catch (e: any) {
      Alert.alert('Não foi possível entrar', e?.message || 'Confira os dados e tente de novo.');
    }
    setLoading(false);
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets keyboardDismissMode="interactive">
        <View style={styles.header}>
          <Image source={require('../../assets/logo-gp.png')} style={styles.logo} resizeMode="contain" />
          <Text style={styles.subtitle}>GARANTIA 50.000 KM</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.welcome}>Bem-vindo</Text>
          <Text style={styles.desc}>Entre com seu e-mail ou CPF.</Text>

          <View style={styles.inputBox}>
            <User size={16} color="#64748b" />
            <TextInput style={styles.input} placeholder="E-mail ou CPF" placeholderTextColor="#94a3b8"
              autoCapitalize="none" value={ident} onChangeText={setIdent} />
          </View>
          <View style={styles.inputBox}>
            <Lock size={16} color="#64748b" />
            <TextInput style={styles.input} placeholder="Senha" placeholderTextColor="#94a3b8"
              secureTextEntry={!verSenha} value={senha} onChangeText={setSenha} />
            <TouchableOpacity onPress={() => setVerSenha(!verSenha)} hitSlop={10}>
              {verSenha ? <EyeOff size={18} color="#94a3b8" /> : <Eye size={18} color="#94a3b8" />}
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.btn} onPress={entrar} disabled={loading} activeOpacity={0.85}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>ENTRAR</Text>}
          </TouchableOpacity>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Ainda não tem conta?</Text>
          <TouchableOpacity onPress={() => router.push('/(auth)/register')}>
            <Text style={styles.footerLink}> Cadastre-se</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 28 },
  header: { alignItems: 'center', marginBottom: 30 },
  logo: { width: 200, height: 90 },
  subtitle: { fontSize: 12, color: '#1e2a6b', fontWeight: '800', letterSpacing: 2, marginTop: 2 },
  card: { backgroundColor: '#fff', borderRadius: 20, padding: 22, borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)' },
  welcome: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  desc: { fontSize: 12, color: '#64748b', marginTop: 4, marginBottom: 18 },
  inputBox: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)', borderRadius: 10, marginBottom: 14, paddingHorizontal: 12 },
  input: { flex: 1, paddingVertical: 12, fontSize: 14, color: '#0f172a' },
  btn: { backgroundColor: '#e11d2a', borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 4 },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 14, letterSpacing: 0.5 },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 24 },
  footerText: { fontSize: 13, color: '#64748b' },
  footerLink: { fontSize: 13, color: '#e11d2a', fontWeight: '800' },
});
