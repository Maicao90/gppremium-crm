import React, { useState } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  TextInput, 
  TouchableOpacity, 
  ScrollView, 
  Alert, 
  ActivityIndicator,
  Platform,
  Dimensions,
  Modal
} from 'react-native';
import { useRouter } from 'expo-router';
import { Shield, Check, FileText, ArrowLeft } from 'lucide-react-native';

const { width: windowWidth } = Dimensions.get('window');
const isWeb = Platform.OS === 'web';

const TERMS_OF_USE_TEXT = `Versão 2.4 - Regulamento de Cobertura

1. Ao cadastrar-se no sistema GP Premium, você ativa a cobertura de garantia estendida de 50.000 KM contra defeitos de fabricação dos seus pneus novos.
2. A validade da garantia está estritamente condicionada à realização periódica das vistorias físicas de medição de quilometragem e sulcos.
3. As vistorias devem ocorrer preventivamente a cada 10.000 KM rodados ou no intervalo máximo de 6 meses.
4. Qualquer desgaste irregular decorrente de desalinhamento, suspensão danificada ou pressão incorreta é considerado mau uso e não está coberto.
5. Pneus que atingirem o limite legal de desgaste (sulco inferior a 1.6mm no indicador TWI) perdem o direito a acionamentos.`;

const PRIVACY_POLICY_TEXT = `Diretrizes de Privacidade e LGPD

1. Tratamento de Dados: Armazenamos seus dados cadastrais (Nome Completo, CPF, Telefone, Data de Nascimento e E-mail) para fins de registro do certificado físico de garantia de pneus.
2. Armazenamento Seguro: Todos os registros são gravados no banco de dados Supabase com criptografia AES-256 e protegidos por políticas restritas de RLS (Row Level Security).
3. Processamento de Imagens: As fotos de placas, odômetros e DOTs enviadas pelos postos parceiros são processadas de forma restrita e automatizada para atestar a autenticidade técnica da vistoria.
4. Seus Direitos: Você pode solicitar a revogação deste consentimento a qualquer momento pelo suporte técnico do app, ciente de que isso desativará a sua apólice ativa de cobertura de garantia de 50k KM.`;

export default function RegisterScreen() {
  const router = useRouter();

  const [fullName, setFullName] = useState('Bruno Santos Oliveira');
  const [cpf, setCpf] = useState('456.123.789-22');
  const [phone, setPhone] = useState('(11) 98765-4321');
  const [email, setEmail] = useState('bruno@gmail.com');
  const [birthDate, setBirthDate] = useState('15/08/1995');
  const [password, setPassword] = useState('********');
  
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [acceptPrivacy, setAcceptPrivacy] = useState(false);
  const [acceptDataUsage, setAcceptDataUsage] = useState(false);
  const [acceptMarketing, setAcceptMarketing] = useState(false);

  const [loading, setLoading] = useState(false);

  // Custom Alert state
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertTitle, setAlertTitle] = useState('');
  const [alertMessage, setAlertMessage] = useState('');
  const [alertCallback, setAlertCallback] = useState<(() => void) | null>(null);

  // Custom Terms/Privacy Modal state
  const [infoModalVisible, setInfoModalVisible] = useState(false);
  const [infoModalTitle, setInfoModalTitle] = useState('');
  const [infoModalContent, setInfoModalContent] = useState('');

  const showAlert = (title: string, message: string, callback?: () => void) => {
    setAlertTitle(title);
    setAlertMessage(message);
    setAlertCallback(() => callback || null);
    setAlertVisible(true);
  };

  const openInfoModal = (title: string, content: string) => {
    setInfoModalTitle(title);
    setInfoModalContent(content);
    setInfoModalVisible(true);
  };

  const handleRegister = async () => {
    if (!fullName || !cpf || !phone || !email || !birthDate || !password) {
      showAlert('Erro', 'Por favor, preencha todos os campos obrigatórios.');
      return;
    }

    if (!acceptTerms || !acceptPrivacy || !acceptDataUsage) {
      showAlert(
        'Consentimento Obrigatório', 
        'Para prosseguir com a ativação da sua cobertura de garantia de 50k KM, é obrigatório aprovar os Termos de Uso, Política de Privacidade e Consentimento de Dados.'
      );
      return;
    }

    setLoading(true);

    try {
      setTimeout(() => {
        setLoading(false);
        showAlert(
          'Sucesso!', 
          'Cadastro finalizado e Termos LGPD gravados com sucesso! Redirecionando para o seu painel de pneus...',
          () => {
            router.push('/(customer)/home');
          }
        );
      }, 1000);

    } catch (error) {
      setLoading(false);
      showAlert('Erro no Cadastro', 'Ocorreu um erro.');
    }
  };

  return (
    <View style={styles.outerContainer}>
      <View style={styles.phoneContainer}>
        {/* Top Status Bar Sim */}
        <View style={styles.statusBarSim}>
          <Text style={styles.statusBarTime}>14:33</Text>
          <View style={styles.statusBarIcons}>
            <View style={styles.batteryIcon} />
          </View>
        </View>

        {/* Header Voltar */}
        <View style={styles.navigationBar}>
          <TouchableOpacity onPress={() => router.push('/')} style={styles.backButton}>
            <ArrowLeft size={18} color="#0EA5E9" />
            <Text style={styles.backText}>Voltar</Text>
          </TouchableOpacity>
          <Text style={styles.navTitle}>Registro</Text>
        </View>

        <ScrollView style={styles.scroll} contentContainerStyle={styles.contentContainer}>
          <View style={styles.header}>
            <View style={styles.iconContainer}>
              <Shield size={28} color="#0EA5E9" />
            </View>
            <Text style={styles.title}>CADASTRE-SE</Text>
            <Text style={styles.subtitle}>Insira seus dados para ativar a Garantia 50k KM</Text>
          </View>

          {/* Form */}
          <View style={styles.formCard}>
            <Text style={styles.label}>Nome Completo</Text>
            <TextInput style={styles.input} value={fullName} onChangeText={setFullName} />

            <Text style={styles.label}>CPF</Text>
            <TextInput style={styles.input} keyboardType="numeric" value={cpf} onChangeText={setCpf} />

            <View style={styles.row}>
              <View style={{ flex: 1, marginRight: 10 }}>
                <Text style={styles.label}>Celular</Text>
                <TextInput style={styles.input} keyboardType="phone-pad" value={phone} onChangeText={setPhone} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Nascimento</Text>
                <TextInput style={styles.input} value={birthDate} onChangeText={setBirthDate} />
              </View>
            </View>

            <Text style={styles.label}>E-mail</Text>
            <TextInput style={styles.input} keyboardType="email-address" autoCapitalize="none" value={email} onChangeText={setEmail} />

            <Text style={styles.label}>Senha</Text>
            <TextInput style={styles.input} secureTextEntry value={password} onChangeText={setPassword} />
          </View>

          {/* LGPD Consent Section */}
          <View style={styles.lgpdCard}>
            <View style={styles.lgpdTitleRow}>
              <FileText size={18} color="#0EA5E9" />
              <Text style={styles.lgpdTitle}>Consentimento & LGPD</Text>
            </View>
            
            <Text style={styles.lgpdDisclaimer}>
              Precisamos da sua aprovação estrita dos itens abaixo para vinculação física de garantia.
            </Text>

            {/* Checkbox Termos de Uso (Click no azul abre o modal) */}
            <View style={styles.checkboxRow}>
              <TouchableOpacity 
                style={[styles.checkbox, acceptTerms && styles.checkboxActive]} 
                onPress={() => setAcceptTerms(!acceptTerms)}
                activeOpacity={0.7}
              >
                {acceptTerms && <Check size={12} color="#fff" />}
              </TouchableOpacity>
              <Text style={styles.checkboxText}>
                Aceito os <Text style={styles.linkText} onPress={() => openInfoModal('Termos de Uso', TERMS_OF_USE_TEXT)}>Termos de Uso</Text> do GP Premium. <Text style={styles.requiredAsterisk}>*</Text>
              </Text>
            </View>

            {/* Checkbox Politica de Privacidade (Click no azul abre o modal) */}
            <View style={styles.checkboxRow}>
              <TouchableOpacity 
                style={[styles.checkbox, acceptPrivacy && styles.checkboxActive]} 
                onPress={() => setAcceptPrivacy(!acceptPrivacy)}
                activeOpacity={0.7}
              >
                {acceptPrivacy && <Check size={12} color="#fff" />}
              </TouchableOpacity>
              <Text style={styles.checkboxText}>
                Aceito a <Text style={styles.linkText} onPress={() => openInfoModal('Política de Privacidade', PRIVACY_POLICY_TEXT)}>Política de Privacidade</Text>. <Text style={styles.requiredAsterisk}>*</Text>
              </Text>
            </View>

            <TouchableOpacity style={styles.checkboxRow} onPress={() => setAcceptDataUsage(!acceptDataUsage)}>
              <View style={[styles.checkbox, acceptDataUsage && styles.checkboxActive]}>
                {acceptDataUsage && <Check size={12} color="#fff" />}
              </View>
              <Text style={styles.checkboxText}>
                Autorizo a coleta e uso de dados dos pneus. <Text style={styles.requiredAsterisk}>*</Text>
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.checkboxRow} onPress={() => setAcceptMarketing(!acceptMarketing)}>
              <View style={[styles.checkbox, acceptMarketing && styles.checkboxActive]}>
                {acceptMarketing && <Check size={12} color="#fff" />}
              </View>
              <Text style={styles.checkboxText}>
                Aceito receber ofertas e participar de sorteios.
              </Text>
            </TouchableOpacity>
          </View>

          {/* Button */}
          <TouchableOpacity 
            style={[
              styles.btnRegister, 
              (!acceptTerms || !acceptPrivacy || !acceptDataUsage) && styles.btnRegisterDisabled
            ]}
            onPress={handleRegister}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.btnRegisterText}>FINALIZAR CADASTRO</Text>
            )}
          </TouchableOpacity>
        </ScrollView>

        {/* Custom Alert Dialog */}
        {alertVisible && (
          <View style={styles.alertOverlay}>
            <View style={styles.alertCard}>
              <Text style={styles.alertCardTitle}>{alertTitle}</Text>
              <Text style={styles.alertCardMessage}>{alertMessage}</Text>
              <TouchableOpacity 
                style={styles.alertCardBtn} 
                onPress={() => {
                  setAlertVisible(false);
                  if (alertCallback) alertCallback();
                }}
                activeOpacity={0.8}
              >
                <Text style={styles.alertCardBtnText}>OK</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Modal de Leitura de Termos / Privacidade */}
        <Modal
          visible={infoModalVisible}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setInfoModalVisible(false)}
        >
          <View style={styles.infoModalOverlay}>
            <View style={styles.infoModalCard}>
              <View style={styles.infoModalHeader}>
                <Text style={styles.infoModalTitle}>{infoModalTitle}</Text>
                <TouchableOpacity onPress={() => setInfoModalVisible(false)} style={styles.infoModalCloseBtn}>
                  <Text style={styles.infoModalCloseBtnText}>✕</Text>
                </TouchableOpacity>
              </View>
              
              <ScrollView style={styles.infoModalScroll}>
                <Text style={styles.infoModalText}>{infoModalContent}</Text>
              </ScrollView>

              <TouchableOpacity 
                style={styles.infoModalAcceptBtn}
                onPress={() => {
                  setInfoModalVisible(false);
                  if (infoModalTitle === 'Termos de Uso') {
                    setAcceptTerms(true);
                  } else if (infoModalTitle === 'Política de Privacidade') {
                    setAcceptPrivacy(true);
                  }
                }}
              >
                <Text style={styles.infoModalAcceptBtnText}>LI E CONCORDO</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        <View style={styles.homeIndicatorSim} />
      </View>
    </View>
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
  navigationBar: {
    height: 48,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    justifyContent: 'space-between',
    backgroundColor: '#cbd5e1',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  backText: {
    color: '#334155',
    fontSize: 14,
    fontWeight: '600',
  },
  navTitle: {
    color: '#334155',
    fontSize: 15,
    fontWeight: '800',
    marginRight: 40,
  },
  scroll: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    marginVertical: 20,
  },
  iconContainer: {
    backgroundColor: 'rgba(14, 165, 233, 0.05)',
    padding: 12,
    borderRadius: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(14, 165, 233, 0.15)',
  },
  title: {
    fontSize: 20,
    fontWeight: '900',
    color: '#0f172a',
    letterSpacing: 1,
  },
  subtitle: {
    fontSize: 11,
    color: '#64748b',
    textAlign: 'center',
    marginTop: 4,
  },
  formCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.05)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#64748b',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  label: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748b',
    textTransform: 'uppercase',
    marginBottom: 4,
    marginTop: 10,
  },
  input: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.05)',
    borderRadius: 8,
    padding: 10,
    fontSize: 13,
    color: '#0f172a',
  },
  row: {
    flexDirection: 'row',
  },
  lgpdCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.05)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    shadowColor: '#64748b',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  lgpdTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  lgpdTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0f172a',
  },
  lgpdDisclaimer: {
    fontSize: 11,
    color: '#64748b',
    lineHeight: 15,
    marginBottom: 12,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 6,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.15)',
    marginRight: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8fafc',
  },
  checkboxActive: {
    backgroundColor: '#0EA5E9',
    borderColor: '#0EA5E9',
  },
  checkboxText: {
    fontSize: 12,
    color: '#475569',
    flex: 1,
  },
  linkText: {
    color: '#0EA5E9',
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  requiredAsterisk: {
    color: '#f43f5e',
  },
  btnRegister: {
    backgroundColor: '#0EA5E9',
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
  btnRegisterDisabled: {
    backgroundColor: '#cbd5e1',
    shadowOpacity: 0,
    elevation: 0,
  },
  btnRegisterText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 14,
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
  infoModalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    zIndex: 999999,
  },
  infoModalCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    padding: 20,
    width: '90%',
    maxWidth: 365,
    height: '70%',
    maxHeight: 560,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 6,
    display: 'flex',
    flexDirection: 'column',
  },
  infoModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  infoModalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0ea5e9',
  },
  infoModalCloseBtn: {
    padding: 4,
  },
  infoModalCloseBtnText: {
    fontSize: 16,
    color: '#64748b',
    fontWeight: 'bold',
  },
  infoModalScroll: {
    flex: 1,
    marginBottom: 16,
  },
  infoModalText: {
    fontSize: 12,
    color: '#475569',
    lineHeight: 18,
  },
  infoModalAcceptBtn: {
    backgroundColor: '#0ea5e9',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    shadowColor: '#0ea5e9',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 3,
  },
  infoModalAcceptBtnText: {
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
