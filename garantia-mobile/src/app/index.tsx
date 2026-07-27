import React, { useState } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  TextInput, 
  TouchableOpacity, 
  SafeAreaView, 
  Dimensions, 
  Platform,
  Alert,
  ActivityIndicator
} from 'react-native';
import { useRouter } from 'expo-router';
import { Shield, Key, Mail, Lock } from 'lucide-react-native';

const { width: windowWidth } = Dimensions.get('window');
const isWeb = Platform.OS === 'web';

export default function LoginScreen() {
  const router = useRouter();

  const [cpfOrEmail, setCpfOrEmail] = useState('bruno@gmail.com');
  const [password, setPassword] = useState('123456');
  const [loading, setLoading] = useState(false);

  // Custom Alert state
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertTitle, setAlertTitle] = useState('');
  const [alertMessage, setAlertMessage] = useState('');

  const showAlert = (title: string, message: string) => {
    setAlertTitle(title);
    setAlertMessage(message);
    setAlertVisible(true);
  };

  const handleLogin = () => {
    if (!cpfOrEmail || !password) {
      showAlert('Erro', 'Por favor, preencha todos os campos.');
      return;
    }

    setLoading(true);

    // Simulação de Login autenticando no Supabase
    setTimeout(() => {
      setLoading(false);
      const emailLower = cpfOrEmail.toLowerCase().trim();
      if (emailLower === 'mecanico@gmail.com') {
        router.push('/(mechanic)/home');
      } else if (emailLower === 'admin@gmail.com') {
        router.push('/(admin)/home');
      } else {
        router.push('/(customer)/home');
      }
    }, 800);
  };

  return (
    <SafeAreaView style={styles.outerContainer}>
      <View style={styles.phoneContainer}>
        {/* Top Status Bar Simulator */}
        <View style={styles.statusBarSim}>
          <Text style={styles.statusBarTime}>14:36</Text>
          <View style={styles.statusBarIcons}>
            <View style={styles.batteryIcon} />
          </View>
        </View>

        <View style={styles.content}>
          {/* Header Premium Light Mode */}
          <View style={styles.header}>
            <View style={styles.iconContainer}>
              <Shield size={38} color="#0EA5E9" />
            </View>
            <Text style={styles.title}>GP PREMIUM</Text>
            <Text style={styles.subtitle}>GARANTIA 50.000 KM</Text>
            <View style={styles.glowLine} />
          </View>

          {/* Form de Login */}
          <View style={styles.formCard}>
            <Text style={styles.welcomeLabel}>Bem-vindo de volta</Text>
            <Text style={styles.welcomeDesc}>Acesse sua conta para monitorar seus pneus</Text>

            {/* Input CPF/Email */}
            <View style={styles.inputContainer}>
              <Mail size={16} color="#64748b" style={styles.inputIcon} />
              <TextInput 
                style={styles.input} 
                placeholder="E-mail ou CPF" 
                placeholderTextColor="#94a3b8"
                value={cpfOrEmail}
                onChangeText={setCpfOrEmail}
                autoCapitalize="none"
              />
            </View>

            {/* Input Senha */}
            <View style={styles.inputContainer}>
              <Lock size={16} color="#64748b" style={styles.inputIcon} />
              <TextInput 
                style={styles.input} 
                placeholder="Senha" 
                placeholderTextColor="#94a3b8"
                secureTextEntry
                value={password}
                onChangeText={setPassword}
              />
            </View>

            <TouchableOpacity style={styles.forgotBtn} onPress={() => showAlert('Recuperar Senha', 'Link de recuperação enviado ao seu e-mail cadastrado.')}>
              <Text style={styles.forgotText}>Esqueceu a senha?</Text>
            </TouchableOpacity>

            {/* Botão Entrar */}
            <TouchableOpacity 
              style={styles.btnPrimary} 
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.btnPrimaryText}>ENTRAR</Text>
              )}
            </TouchableOpacity>

            {/* Credenciais de Teste */}
            <View style={{ marginTop: 16, padding: 8, backgroundColor: '#f1f5f9', borderRadius: 8, borderWidth: 1, borderColor: '#cbd5e1' }}>
              <Text style={{ fontSize: 10, fontWeight: '800', color: '#475569', marginBottom: 4, textAlign: 'center' }}>📌 CREDENCIAIS DE TESTE:</Text>
              <Text style={{ fontSize: 10, color: '#64748b' }}>• Cliente: <Text style={{ fontWeight: '700', color: '#0f172a' }}>bruno@gmail.com</Text></Text>
              <Text style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>• Mecânico: <Text style={{ fontWeight: '700', color: '#0f172a' }}>mecanico@gmail.com</Text></Text>
              <Text style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>• Admin: <Text style={{ fontWeight: '700', color: '#0f172a' }}>admin@gmail.com</Text></Text>
            </View>
          </View>

          {/* Footer de Cadastro */}
          <View style={styles.footerRow}>
            <Text style={styles.footerText}>Não tem conta de garantia?</Text>
            <TouchableOpacity onPress={() => router.push('/(auth)/register')}>
              <Text style={styles.footerLink}> Cadastre-se</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Custom Alert Dialog */}
        {alertVisible && (
          <View style={styles.alertOverlay}>
            <View style={styles.alertCard}>
              <Text style={styles.alertCardTitle}>{alertTitle}</Text>
              <Text style={styles.alertCardMessage}>{alertMessage}</Text>
              <TouchableOpacity 
                style={styles.alertCardBtn} 
                onPress={() => setAlertVisible(false)}
                activeOpacity={0.8}
              >
                <Text style={styles.alertCardBtnText}>OK</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Bottom Home Indicator Simulator */}
        <View style={styles.homeIndicatorSim} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  outerContainer: {
    flex: 1,
    backgroundColor: '#e2e8f0', 
    alignItems: 'center',
    justifyContent: 'center',
  },
  phoneContainer: {
    width: isWeb && windowWidth > 480 ? 410 : '100%',
    height: isWeb && windowWidth > 480 ? 840 : '100%',
    backgroundColor: '#f8fafc', 
    borderRadius: isWeb && windowWidth > 480 ? 40 : 0,
    borderWidth: isWeb && windowWidth > 480 ? 12 : 0,
    borderColor: '#cbd5e1', 
    overflow: 'hidden',
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: isWeb ? 10 : 0,
  },
  statusBarSim: {
    height: 38,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 28,
    backgroundColor: '#cbd5e1',
  },
  statusBarTime: {
    color: '#334155',
    fontSize: 12,
    fontWeight: '600',
  },
  statusBarIcons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  batteryIcon: {
    width: 20,
    height: 10,
    borderRadius: 2,
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#334155',
  },
  content: {
    flex: 1,
    padding: 28,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  iconContainer: {
    backgroundColor: 'rgba(14, 165, 233, 0.05)',
    padding: 16,
    borderRadius: 22,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(14, 165, 233, 0.15)',
  },
  title: {
    fontSize: 26,
    fontWeight: '900',
    color: '#0f172a',
    letterSpacing: 1.5,
  },
  subtitle: {
    fontSize: 11,
    color: '#0ea5e9',
    fontWeight: '700',
    letterSpacing: 2,
    marginTop: 4,
  },
  glowLine: {
    width: 60,
    height: 2,
    backgroundColor: '#0ea5e9',
    marginTop: 14,
    borderRadius: 1,
  },
  formCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.05)',
    borderRadius: 20,
    padding: 22,
    shadowColor: '#64748b',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  welcomeLabel: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
  },
  welcomeDesc: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 4,
    marginBottom: 20,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.05)',
    borderRadius: 10,
    marginBottom: 14,
    paddingHorizontal: 12,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0f172a',
  },
  forgotBtn: {
    alignSelf: 'flex-end',
    marginBottom: 20,
  },
  forgotText: {
    color: '#0ea5e9',
    fontSize: 12,
    fontWeight: '600',
  },
  btnPrimary: {
    backgroundColor: '#0ea5e9',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0ea5e9',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  btnPrimaryText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 14,
    letterSpacing: 0.5,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 24,
  },
  footerText: {
    fontSize: 13,
    color: '#64748b',
  },
  footerLink: {
    fontSize: 13,
    color: '#0ea5e9',
    fontWeight: '700',
  },
  alertOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    zIndex: 99999,
  },
  alertCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.06)',
    padding: 22,
    width: '85%',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 5,
  },
  alertCardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 8,
    textAlign: 'center',
  },
  alertCardMessage: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 16,
  },
  alertCardBtn: {
    backgroundColor: '#0ea5e9',
    borderRadius: 10,
    paddingVertical: 12,
    width: '100%',
    alignItems: 'center',
    shadowColor: '#0ea5e9',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  alertCardBtnText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 13,
    letterSpacing: 0.5,
  },
  homeIndicatorSim: {
    height: 20,
    width: 140,
    backgroundColor: 'rgba(0,0,0,0.05)',
    alignSelf: 'center',
    borderRadius: 10,
    marginBottom: 8,
  },
});
