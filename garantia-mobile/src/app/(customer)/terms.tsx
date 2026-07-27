import React, { useState } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, SafeAreaView, Dimensions, Platform, Modal } from 'react-native';
import { useRouter } from 'expo-router';
import { Shield, ArrowLeft, FileText, CheckCircle2 } from 'lucide-react-native';

const { width: windowWidth } = Dimensions.get('window');
const isWeb = Platform.OS === 'web';

const TERMS_OF_USE_TEXT = `Versão 2.4 - Regulamento de Cobertura da Garantia

1. Ao aderir ao sistema GP Premium, você ativa a cobertura de garantia estendida de 50.000 KM contra defeitos de fabricação dos seus pneus novos.
2. A validade da garantia está estritamente condicionada à realização periódica das vistorias físicas de medição de quilometragem e sulcos.
3. As vistorias devem ocorrer preventivamente a cada 10.000 KM rodados ou no intervalo máximo de 6 meses.
4. Qualquer desgaste irregular decorrente de desalinhamento, suspensão danificada ou pressão incorreta é considerado mau uso e não está coberto.
5. Pneus que atingirem o limite legal de desgaste (sulco inferior a 1.6mm no indicador TWI) perdem o direito a acionamentos.`;

const PRIVACY_POLICY_TEXT = `Diretrizes de Privacidade e LGPD

1. Tratamento de Dados: Armazenamos seus dados cadastrais (Nome Completo, CPF, Telefone, Data de Nascimento e E-mail) para fins de registro do certificado físico de garantia de pneus.
2. Armazenamento Seguro: Todos os registros são gravados no banco de dados com criptografia AES-256 e protegidos por políticas de segurança.
3. Processamento de Imagens: As fotos de placas, odômetros e DOTs enviadas pelos postos parceiros são processadas de forma restrita e automatizada para atestar a autenticidade técnica da vistoria.
4. Seus Direitos: Você pode solicitar a revogação deste consentimento a qualquer momento pelo suporte técnico do app.`;

const TECHNICAL_IMAGES_TEXT = `Políticas de Processamento Técnico de Imagens

1. As fotos enviadas pelos mecânicos credenciados servem como comprovação física do estado do pneu e da quilometragem no ato da vistoria.
2. O processamento da foto do DOT e da placa é feito por leitura automatizada para registrar no sistema e conferir a conformidade dos dados de fabricação do pneu.
3. As imagens coletadas são mantidas em servidores de nuvem de alta segurança e sob total conformidade da Lei Geral de Proteção de Dados.`;

export default function TermsScreen() {
  const router = useRouter();

  const [modalVisible, setModalVisible] = useState(false);
  const [modalTitle, setModalTitle] = useState('');
  const [modalContent, setModalContent] = useState('');

  const openTermDetails = (title: string, content: string) => {
    setModalTitle(title);
    setModalContent(content);
    setModalVisible(true);
  };

  return (
    <SafeAreaView style={styles.outerContainer}>
      <View style={styles.phoneContainer}>
        {/* Top Status Bar Sim */}
        <View style={styles.statusBarSim}>
          <Text style={styles.statusBarTime}>14:37</Text>
          <View style={styles.statusBarIcons}>
            <View style={styles.batteryIcon} />
          </View>
        </View>

        {/* Navigation Bar */}
        <View style={styles.navigationBar}>
          <TouchableOpacity onPress={() => router.push('/(customer)/home')} style={styles.backButton}>
            <ArrowLeft size={18} color="#0EA5E9" />
            <Text style={styles.backText}>Painel</Text>
          </TouchableOpacity>
          <Text style={navTitleStyle()}>Termos & LGPD</Text>
        </View>

        <ScrollView style={styles.scroll} contentContainerStyle={styles.contentContainer}>
          <View style={styles.header}>
            <FileText size={32} color="#0EA5E9" />
            <Text style={styles.title}>Políticas & Regulamentos</Text>
            <Text style={styles.subtitle}>Toque em qualquer item abaixo para ler o documento completo</Text>
          </View>

          {/* Cards Clicáveis */}
          <View style={{ gap: 14 }}>
            <TouchableOpacity 
              style={styles.card} 
              onPress={() => openTermDetails('Termos de Uso Aprovados', TERMS_OF_USE_TEXT)}
              activeOpacity={0.8}
            >
              <View style={styles.row}>
                <CheckCircle2 size={18} color="#10b981" />
                <Text style={styles.bulletTitle}>Termos de Uso Aprovados ➔</Text>
              </View>
              <Text style={styles.desc}>
                Versão 2.4 (Ativação automática de cobertura de 50.000 KM para pneus novos instalados em revendas credenciadas GP Premium).
              </Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.card} 
              onPress={() => openTermDetails('Política de Privacidade', PRIVACY_POLICY_TEXT)}
              activeOpacity={0.8}
            >
              <View style={styles.row}>
                <CheckCircle2 size={18} color="#10b981" />
                <Text style={styles.bulletTitle}>Política de Privacidade ➔</Text>
              </View>
              <Text style={styles.desc}>
                Seus dados cadastrais (CPF, telefone, placa e e-mail) são armazenados de forma criptografada com acesso restrito a auditores autorizados.
              </Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.card} 
              onPress={() => openTermDetails('Uso Técnico de Imagens', TECHNICAL_IMAGES_TEXT)}
              activeOpacity={0.8}
            >
              <View style={styles.row}>
                <CheckCircle2 size={18} color="#10b981" />
                <Text style={styles.bulletTitle}>Uso Técnico de Imagens ➔</Text>
              </View>
              <Text style={styles.desc}>
                As fotos de placas, odômetros e DOTs carregadas pelos mecânicos são processadas de forma estrita, automatizada e segura pelo sistema para validação.
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>

        {/* Modal de Leitura de Termos Completo */}
        <Modal
          visible={modalVisible}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{modalTitle}</Text>
                <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.closeBtn}>
                  <Text style={styles.closeBtnText}>✕</Text>
                </TouchableOpacity>
              </View>
              
              <ScrollView style={styles.modalScroll}>
                <Text style={styles.modalText}>{modalContent}</Text>
              </ScrollView>

              <TouchableOpacity 
                style={styles.modalAcceptBtn}
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.modalAcceptBtnText}>FECHAR</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        <View style={styles.homeIndicatorSim} />
      </View>
    </SafeAreaView>
  );
}

function navTitleStyle() {
  return {
    color: '#334155' as const,
    fontSize: 15,
    fontWeight: '800' as const,
    marginRight: 40,
  };
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
    padding: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 30,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0f172a',
    marginTop: 10,
  },
  subtitle: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 4,
    textAlign: 'center',
  },
  card: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  bulletTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
  },
  desc: {
    fontSize: 12,
    color: '#64748b',
    lineHeight: 17,
  },
  homeIndicatorSim: {
    height: 20,
    width: 140,
    backgroundColor: 'rgba(0,0,0,0.05)',
    alignSelf: 'center',
    borderRadius: 10,
    marginBottom: 8,
  },
  modalOverlay: {
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
    zIndex: 99999,
  },
  modalCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    padding: 20,
    width: '90%',
    maxWidth: 365,
    height: '60%',
    maxHeight: 480,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 6,
    display: 'flex',
    flexDirection: 'column',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0ea5e9',
  },
  closeBtn: {
    padding: 4,
  },
  closeBtnText: {
    fontSize: 16,
    color: '#64748b',
    fontWeight: 'bold',
  },
  modalScroll: {
    flex: 1,
    marginBottom: 16,
  },
  modalText: {
    fontSize: 12,
    color: '#475569',
    lineHeight: 18,
  },
  modalAcceptBtn: {
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
  modalAcceptBtnText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 13,
    letterSpacing: 0.5,
  },
});
