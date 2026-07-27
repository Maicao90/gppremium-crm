import React, { useState } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ScrollView, Alert, ActivityIndicator, SafeAreaView, Modal, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, Check, X, Eye, EyeOff } from 'lucide-react-native';
import { useAuth } from '../../lib/auth';
import { registrarPush } from '../../lib/push';

const soDigitos = (s: string) => s.replace(/\D/g, '');
const fmtCPF = (s: string) => soDigitos(s).slice(0, 11).replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');

const TERMOS = `TERMOS DA GARANTIA GP PREMIUM 50.000 KM

1. COBERTURA
A GP Premium oferece garantia de durabilidade de 50.000 km OU 2 anos (o que ocorrer primeiro) contra desgaste prematuro dos pneus GP Premium, contados a partir da data da instalação registrada no ato da venda.

2. REVISÕES OBRIGATÓRIAS
A garantia só é válida com as revisões periódicas feitas em uma loja credenciada GP Premium (a cada 10.000 km rodados, aproximadamente). Nessas revisões é feito o rodízio dos pneus GRATUITAMENTE e a medição dos sulcos.

3. O QUE CANCELA A GARANTIA
- Marcas de tração/arrancamento de borracha na banda de rodagem (sinal de "cavalo de pau"/patinação) cancelam a garantia do pneu envolvido.
- Desgaste por desalinhamento, suspensão danificada, calibragem incorreta ou mau uso não é coberto.
- Adulteração do odômetro do veículo cancela a garantia.
- Pneu que atingir o sulco mínimo legal de 1,6 mm perde o direito ao acionamento.

4. NOTIFICAÇÕES
Enviaremos lembretes aproximados da data de revisão. O acompanhamento da quilometragem e a realização das revisões no prazo são de responsabilidade do cliente, mesmo que uma notificação não seja recebida.

5. PRIVACIDADE (LGPD)
Seus dados (nome, CPF, telefone, e-mail, veículo e fotos) são usados apenas para gerir a garantia, as revisões e a comunicação com você. Não são vendidos a terceiros. Você pode solicitar a exclusão dos seus dados a qualquer momento.`;

export default function Register() {
  const router = useRouter();
  const [verTermos, setVerTermos] = useState(false);
  const { registrarCliente } = useAuth();
  const [f, setF] = useState({ nome: '', cpf: '', telefone: '', email: '', senha: '' });
  const [aceito, setAceito] = useState(false);
  const [loading, setLoading] = useState(false);
  const [verSenha, setVerSenha] = useState(false);
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
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets keyboardDismissMode="interactive">
        <TouchableOpacity style={styles.back} onPress={() => router.back()}><ArrowLeft size={20} color="#0f172a" /><Text style={styles.backText}>Voltar</Text></TouchableOpacity>
        <View style={styles.header}>
          <Image source={require('../../../assets/logo-gp.png')} style={styles.logo} resizeMode="contain" />
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
          <View style={styles.senhaBox}>
            <TextInput style={styles.senhaInput} value={f.senha} onChangeText={(v) => set('senha', v)} secureTextEntry={!verSenha} placeholder="Crie uma senha" placeholderTextColor="#94a3b8" />
            <TouchableOpacity onPress={() => setVerSenha(!verSenha)} hitSlop={10}>
              {verSenha ? <EyeOff size={18} color="#94a3b8" /> : <Eye size={18} color="#94a3b8" />}
            </TouchableOpacity>
          </View>

          <View style={styles.termo}>
            <TouchableOpacity onPress={() => setAceito(!aceito)} activeOpacity={0.7}>
              <View style={[styles.check, aceito && styles.checkOn]}>{aceito && <Check size={14} color="#fff" />}</View>
            </TouchableOpacity>
            <Text style={styles.termoText}>
              Li e aceito os{' '}
              <Text style={styles.termoLink} onPress={() => setVerTermos(true)}>termos da Garantia GP Premium 50.000 KM e a política de privacidade (LGPD)</Text>.
              {'  '}<Text style={styles.termoLink} onPress={() => setVerTermos(true)}>(ler)</Text>
            </Text>
          </View>

          <TouchableOpacity style={styles.btn} onPress={cadastrar} disabled={loading} activeOpacity={0.85}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>CRIAR CONTA</Text>}
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Modal com os termos pra LER */}
      <Modal visible={verTermos} animationType="slide" onRequestClose={() => setVerTermos(false)}>
        <SafeAreaView style={styles.container}>
          <View style={styles.modalTop}>
            <Text style={styles.modalTitle}>Termos da Garantia</Text>
            <TouchableOpacity onPress={() => setVerTermos(false)}><X size={24} color="#0f172a" /></TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 20 }}>
            <Text style={styles.termosTexto}>{TERMOS}</Text>
          </ScrollView>
          <View style={{ padding: 16 }}>
            <TouchableOpacity style={styles.btn} onPress={() => { setAceito(true); setVerTermos(false); }} activeOpacity={0.85}>
              <Text style={styles.btnText}>LI E ACEITO</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  scroll: { padding: 24, paddingTop: 48 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  backText: { fontSize: 14, color: '#0f172a', fontWeight: '600' },
  header: { alignItems: 'center', marginBottom: 22 },
  logo: { width: 150, height: 66, marginBottom: 8 },
  title: { fontSize: 22, fontWeight: '900', color: '#0f172a' },
  sub: { fontSize: 13, color: '#64748b', marginTop: 4, textAlign: 'center' },
  card: { backgroundColor: '#fff', borderRadius: 18, padding: 20, borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)' },
  label: { fontSize: 12, fontWeight: '700', color: '#475569', marginBottom: 5, marginTop: 10 },
  input: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, fontSize: 14, color: '#0f172a' },
  senhaBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f8fafc', borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)', borderRadius: 10, paddingHorizontal: 12 },
  senhaInput: { flex: 1, paddingVertical: 11, fontSize: 14, color: '#0f172a' },
  termo: { flexDirection: 'row', gap: 10, marginTop: 18, alignItems: 'flex-start' },
  check: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: '#cbd5e1', alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  checkOn: { backgroundColor: '#e11d2a', borderColor: '#e11d2a' },
  termoText: { flex: 1, fontSize: 12, color: '#64748b', lineHeight: 17 },
  termoLink: { color: '#e11d2a', fontWeight: '700', textDecorationLine: 'underline' },
  btn: { backgroundColor: '#e11d2a', borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 20 },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 14, letterSpacing: 0.5 },
  modalTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  modalTitle: { fontSize: 17, fontWeight: '800', color: '#0f172a' },
  termosTexto: { fontSize: 13, color: '#334155', lineHeight: 21 },
});
