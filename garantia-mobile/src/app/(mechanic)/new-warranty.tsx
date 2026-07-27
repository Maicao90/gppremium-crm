import React, { useState } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  ScrollView, 
  TouchableOpacity, 
  SafeAreaView, 
  TextInput, 
  Dimensions, 
  Platform,
  ActivityIndicator
} from 'react-native';
import { useRouter } from 'expo-router';
import { 
  Shield, 
  ArrowLeft, 
  User, 
  CreditCard, 
  Car, 
  Calendar, 
  MapPin, 
  Gauge, 
  FileCode2,
  CheckCircle2,
  Camera
} from 'lucide-react-native';

const { width: windowWidth } = Dimensions.get('window');
const isWeb = Platform.OS === 'web';

export default function NewWarrantyScreen() {
  const router = useRouter();
  
  // Form states
  const [customerName, setCustomerName] = useState('');
  const [cpf, setCpf] = useState('');
  const [plate, setPlate] = useState('');
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState('');
  const [mileage, setMileage] = useState('');
  const [dot, setDot] = useState('');
  const [odometerPhoto, setOdometerPhoto] = useState<string | null>(null);
  const [photoDE, setPhotoDE] = useState<string | null>(null);
  const [photoDD, setPhotoDD] = useState<string | null>(null);
  const [photoTE, setPhotoTE] = useState<string | null>(null);
  const [photoTD, setPhotoTD] = useState<string | null>(null);
  
  // Tire serials
  const [serialDE, setSerialDE] = useState('');
  const [serialDD, setSerialDD] = useState('');
  const [serialTE, setSerialTE] = useState('');
  const [serialTD, setSerialTD] = useState('');

  const [loading, setLoading] = useState(false);
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertMessage, setAlertMessage] = useState('');
  const [success, setSuccess] = useState(false);

  const showAlert = (message: string, isSuccess = false) => {
    setAlertMessage(message);
    setSuccess(isSuccess);
    setAlertVisible(true);
  };

  const handleSave = async () => {
    if (!customerName || !cpf || !plate || !brand || !model || !year || !mileage || !dot) {
      showAlert('Por favor, preencha todos os dados do cliente e do veículo.');
      return;
    }

    if (!odometerPhoto) {
      showAlert('A foto do odômetro é obrigatória para comprovar a quilometragem atual do veículo.');
      return;
    }

    if (!serialDE || !serialDD || !serialTE || !serialTD) {
      showAlert('Por favor, insira o código de série dos 4 pneus instalados.');
      return;
    }

    if (!photoDE || !photoDD || !photoTE || !photoTD) {
      showAlert('A foto de comprovação lateral/série para cada um dos 4 pneus é obrigatória.');
      return;
    }

    setLoading(true);

    try {
      // 1. Fetch current database
      const response = await fetch('http://localhost:3000/api/database');
      if (!response.ok) {
        throw new Error('Falha ao conectar com o banco de dados.');
      }
      const db = await response.json();

      // 2. Format dates
      const today = new Date();
      const expiration = new Date();
      expiration.setFullYear(today.getFullYear() + 2);

      const formatDate = (date: Date) => {
        const d = String(date.getDate()).padStart(2, '0');
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const y = date.getFullYear();
        return `${d}/${m}/${y}`;
      };

      const startMileageNum = parseInt(mileage);
      const newWarrantyId = `WARR-${100 + db.warranties.length + 1}`;

      const newWarranty = {
        id: newWarrantyId,
        customer: customerName,
        cpf: cpf,
        plate: plate.toUpperCase(),
        model: `${model} ${year}`,
        brand: brand,
        year: parseInt(year),
        tiresCount: 4,
        status: "active",
        date: formatDate(today),
        mileage: startMileageNum,
        startMileage: startMileageNum,
        maxMileage: startMileageNum + 50000,
        expirationDate: formatDate(expiration),
        dotRegistered: dot,
        dotScanned: dot,
        mechanic: "Lucas Souza",
        tires: [
          { id: "DE", position: "Dianteiro Esquerdo (DE)", brand: "GP Sport", model: "Premium Max", measure: "205/55 R16", dot: dot, serialCode: serialDE, state: "excellent", grooveDepth: "7.2mm" },
          { id: "DD", position: "Dianteiro Direito (DD)", brand: "GP Sport", model: "Premium Max", measure: "205/55 R16", dot: dot, serialCode: serialDD, state: "excellent", grooveDepth: "7.2mm" },
          { id: "TE", position: "Traseiro Esquerdo (TE)", brand: "GP Sport", model: "Premium Max", measure: "205/55 R16", dot: dot, serialCode: serialTE, state: "excellent", grooveDepth: "7.2mm" },
          { id: "TD", position: "Traseiro Direito (TD)", brand: "GP Sport", model: "Premium Max", measure: "205/55 R16", dot: dot, serialCode: serialTD, state: "excellent", grooveDepth: "7.2mm" }
        ]
      };

      // 3. Append and save
      db.warranties.unshift(newWarranty);

      // Add a simulation notification
      const newNotification = {
        id: String(Date.now()),
        type: "shield",
        title: "Nova Garantia Ativa ➔",
        desc: `Sua garantia de 50.000 KM para o veículo ${model} (${plate.toUpperCase()}) foi ativada com sucesso!`,
        time: "Agora mesmo"
      };
      db.notifications.unshift(newNotification);

      const writeResponse = await fetch('http://localhost:3000/api/database', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(db),
      });

      if (!writeResponse.ok) {
        throw new Error('Falha ao registrar dados no banco de dados.');
      }

      showAlert(`Garantia ${newWarrantyId} cadastrada e ativada com sucesso!`, true);
    } catch (error) {
      console.error(error);
      showAlert('Erro ao registrar garantia. Por favor, tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const handleCloseAlert = () => {
    setAlertVisible(false);
    if (success) {
      router.push('/(mechanic)/home');
    }
  };

  return (
    <SafeAreaView style={styles.outerContainer}>
      <View style={styles.phoneContainer}>
        {/* Top Status Bar Sim */}
        <View style={styles.statusBarSim}>
          <Text style={styles.statusBarTime}>14:55</Text>
          <View style={styles.statusBarIcons}>
            <View style={styles.batteryIcon} />
          </View>
        </View>

        {/* Header Voltar */}
        <View style={styles.navigationBar}>
          <TouchableOpacity onPress={() => router.push('/(mechanic)/home')} style={styles.backButton}>
            <ArrowLeft size={18} color="#0EA5E9" />
            <Text style={styles.backText}>Painel</Text>
          </TouchableOpacity>
          <Text style={styles.navTitle}>Nova Garantia</Text>
        </View>

        <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
          <View style={styles.headerInfo}>
            <Shield size={24} color="#0ea5e9" />
            <Text style={styles.headerInfoTitle}>Ativação de Garantia GP Premium</Text>
          </View>

          {/* Seção 1: Dados do Cliente */}
          <Text style={styles.sectionTitle}>Dados do Cliente</Text>
          
          <View style={styles.card}>
            <View style={styles.inputWrapper}>
              <User size={16} color="#64748b" style={styles.inputIcon} />
              <TextInput 
                style={styles.input} 
                placeholder="Nome Completo do Cliente" 
                placeholderTextColor="#94a3b8"
                value={customerName}
                onChangeText={setCustomerName}
              />
            </View>

            <View style={styles.inputWrapper}>
              <CreditCard size={16} color="#64748b" style={styles.inputIcon} />
              <TextInput 
                style={styles.input} 
                placeholder="CPF (apenas números ou formatado)" 
                placeholderTextColor="#94a3b8"
                value={cpf}
                onChangeText={setCpf}
                keyboardType="numeric"
              />
            </View>
          </View>

          {/* Seção 2: Dados do Veículo */}
          <Text style={styles.sectionTitle}>Dados do Veículo</Text>
          
          <View style={styles.card}>
            <View style={styles.inputWrapper}>
              <Car size={16} color="#64748b" style={styles.inputIcon} />
              <TextInput 
                style={styles.input} 
                placeholder="Placa do Veículo (ex: MEC7899)" 
                placeholderTextColor="#94a3b8"
                value={plate}
                onChangeText={setPlate}
                autoCapitalize="characters"
              />
            </View>

            <View style={styles.row}>
              <View style={[styles.inputWrapper, { flex: 1, marginBottom: 0 }]}>
                <TextInput 
                  style={styles.input} 
                  placeholder="Marca" 
                  placeholderTextColor="#94a3b8"
                  value={brand}
                  onChangeText={setBrand}
                />
              </View>
              <View style={[styles.inputWrapper, { flex: 1.2, marginBottom: 0 }]}>
                <TextInput 
                  style={styles.input} 
                  placeholder="Modelo" 
                  placeholderTextColor="#94a3b8"
                  value={model}
                  onChangeText={setModel}
                />
              </View>
            </View>

            <View style={[styles.row, { marginTop: 12 }]}>
              <View style={[styles.inputWrapper, { flex: 1, marginBottom: 0 }]}>
                <Calendar size={16} color="#64748b" style={styles.inputIcon} />
                <TextInput 
                  style={styles.input} 
                  placeholder="Ano" 
                  placeholderTextColor="#94a3b8"
                  value={year}
                  onChangeText={setYear}
                  keyboardType="numeric"
                  maxLength={4}
                />
              </View>
              <View style={[styles.inputWrapper, { flex: 1.2, marginBottom: 0 }]}>
                <Gauge size={16} color="#64748b" style={styles.inputIcon} />
                <TextInput 
                  style={styles.input} 
                  placeholder="KM Odômetro" 
                  placeholderTextColor="#94a3b8"
                  value={mileage}
                  onChangeText={setMileage}
                  keyboardType="numeric"
                />
              </View>
            </View>

            <View style={{ marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#f1f5f9' }}>
              <Text style={styles.photoLabel}>Foto Comprovante do Odômetro (Obrigatória):</Text>
              {odometerPhoto ? (
                <View style={styles.photoPreviewCard}>
                  <Text style={styles.photoPreviewText}>📸 {odometerPhoto}</Text>
                  <TouchableOpacity onPress={() => setOdometerPhoto(null)}>
                    <Text style={styles.photoRemoveText}>Remover</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity 
                  style={styles.photoUploadBtn} 
                  onPress={() => setOdometerPhoto('Foto_Painel_Odometro_OK.jpg')}
                  activeOpacity={0.7}
                >
                  <Camera size={18} color="#0ea5e9" style={{ marginRight: 6 }} />
                  <Text style={styles.photoUploadBtnText}>Tirar Foto do Odômetro</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Seção 3: Identificação dos Pneus */}
          <Text style={styles.sectionTitle}>Identificação dos Pneus</Text>
          
          <View style={styles.card}>
            <View style={[styles.inputWrapper, { marginBottom: 16 }]}>
              <FileCode2 size={16} color="#64748b" style={styles.inputIcon} />
              <TextInput 
                style={styles.input} 
                placeholder="Código DOT dos Pneus (ex: 2225)" 
                placeholderTextColor="#94a3b8"
                value={dot}
                onChangeText={setDot}
                maxLength={4}
                keyboardType="numeric"
              />
            </View>

            <Text style={styles.subLabel}>Códigos de Série (Gravações nas Laterais)</Text>
            
            <View style={styles.tireSerialContainer}>
              <Text style={styles.tirePosLabel}>Dianteiro Esquerdo (DE):</Text>
              <TextInput 
                style={styles.serialInput}
                placeholder="Ex: GP-FL-12001"
                placeholderTextColor="#94a3b8"
                value={serialDE}
                onChangeText={setSerialDE}
                autoCapitalize="characters"
              />
              {photoDE ? (
                <View style={styles.photoPreviewCard}>
                  <Text style={styles.photoPreviewText}>📸 {photoDE}</Text>
                  <TouchableOpacity onPress={() => setPhotoDE(null)}>
                    <Text style={styles.photoRemoveText}>Remover</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity 
                  style={styles.photoUploadBtn} 
                  onPress={() => setPhotoDE('Foto_Pneu_Lateral_DE.jpg')}
                  activeOpacity={0.7}
                >
                  <Camera size={14} color="#0ea5e9" style={{ marginRight: 6 }} />
                  <Text style={styles.photoUploadBtnText}>Foto do Pneu DE</Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.tireSerialContainer}>
              <Text style={styles.tirePosLabel}>Dianteiro Direito (DD):</Text>
              <TextInput 
                style={styles.serialInput}
                placeholder="Ex: GP-FR-12002"
                placeholderTextColor="#94a3b8"
                value={serialDD}
                onChangeText={setSerialDD}
                autoCapitalize="characters"
              />
              {photoDD ? (
                <View style={styles.photoPreviewCard}>
                  <Text style={styles.photoPreviewText}>📸 {photoDD}</Text>
                  <TouchableOpacity onPress={() => setPhotoDD(null)}>
                    <Text style={styles.photoRemoveText}>Remover</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity 
                  style={styles.photoUploadBtn} 
                  onPress={() => setPhotoDD('Foto_Pneu_Lateral_DD.jpg')}
                  activeOpacity={0.7}
                >
                  <Camera size={14} color="#0ea5e9" style={{ marginRight: 6 }} />
                  <Text style={styles.photoUploadBtnText}>Foto do Pneu DD</Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.tireSerialContainer}>
              <Text style={styles.tirePosLabel}>Traseiro Esquerdo (TE):</Text>
              <TextInput 
                style={styles.serialInput}
                placeholder="Ex: GP-RL-12003"
                placeholderTextColor="#94a3b8"
                value={serialTE}
                onChangeText={setSerialTE}
                autoCapitalize="characters"
              />
              {photoTE ? (
                <View style={styles.photoPreviewCard}>
                  <Text style={styles.photoPreviewText}>📸 {photoTE}</Text>
                  <TouchableOpacity onPress={() => setPhotoTE(null)}>
                    <Text style={styles.photoRemoveText}>Remover</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity 
                  style={styles.photoUploadBtn} 
                  onPress={() => setPhotoTE('Foto_Pneu_Lateral_TE.jpg')}
                  activeOpacity={0.7}
                >
                  <Camera size={14} color="#0ea5e9" style={{ marginRight: 6 }} />
                  <Text style={styles.photoUploadBtnText}>Foto do Pneu TE</Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.tireSerialContainer}>
              <Text style={styles.tirePosLabel}>Traseiro Direito (TD):</Text>
              <TextInput 
                style={styles.serialInput}
                placeholder="Ex: GP-RR-12004"
                placeholderTextColor="#94a3b8"
                value={serialTD}
                onChangeText={setSerialTD}
                autoCapitalize="characters"
              />
              {photoTD ? (
                <View style={styles.photoPreviewCard}>
                  <Text style={styles.photoPreviewText}>📸 {photoTD}</Text>
                  <TouchableOpacity onPress={() => setPhotoTD(null)}>
                    <Text style={styles.photoRemoveText}>Remover</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity 
                  style={styles.photoUploadBtn} 
                  onPress={() => setPhotoTD('Foto_Pneu_Lateral_TD.jpg')}
                  activeOpacity={0.7}
                >
                  <Camera size={14} color="#0ea5e9" style={{ marginRight: 6 }} />
                  <Text style={styles.photoUploadBtnText}>Foto do Pneu TD</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Salvar Botão */}
          <TouchableOpacity 
            style={styles.btnPrimary} 
            onPress={handleSave}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.btnPrimaryText}>REGISTRAR E ATIVAR GARANTIA</Text>
            )}
          </TouchableOpacity>
        </ScrollView>

        {/* Custom Alert Modal */}
        {alertVisible && (
          <View style={styles.alertOverlay}>
            <View style={styles.alertCard}>
              {success ? (
                <CheckCircle2 size={40} color="#10b981" style={{ marginBottom: 12 }} />
              ) : null}
              <Text style={styles.alertCardTitle}>{success ? 'Sucesso!' : 'Atenção'}</Text>
              <Text style={styles.alertCardMessage}>{alertMessage}</Text>
              <TouchableOpacity 
                style={[styles.alertCardBtn, { backgroundColor: success ? '#10b981' : '#0ea5e9' }]} 
                onPress={handleCloseAlert}
                activeOpacity={0.8}
              >
                <Text style={styles.alertCardBtnText}>OK</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

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
    position: 'relative'
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
  container: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 40,
  },
  headerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 18,
    backgroundColor: 'rgba(14, 165, 233, 0.04)',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(14, 165, 233, 0.1)',
  },
  headerInfoTitle: {
    fontSize: 13,
    fontWeight: '850',
    color: '#0ea5e9',
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '850',
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    shadowColor: '#64748b',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 2,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.05)',
    borderRadius: 10,
    marginBottom: 12,
    paddingHorizontal: 12,
  },
  inputIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    paddingVertical: 8,
    fontSize: 13,
    color: '#0f172a',
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  subLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    paddingBottom: 4,
  },
  tireSerialContainer: {
    marginBottom: 12,
  },
  tirePosLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 4,
  },
  serialInput: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.05)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 12,
    color: '#0f172a',
  },
  photoLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 6,
  },
  photoUploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(14, 165, 233, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(14, 165, 233, 0.15)',
    borderStyle: 'dashed',
    borderRadius: 8,
    padding: 8,
    marginTop: 4,
  },
  photoUploadBtnText: {
    fontSize: 11,
    color: '#0ea5e9',
    fontWeight: '700',
  },
  photoPreviewCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.15)',
    borderRadius: 8,
    padding: 8,
    marginTop: 4,
  },
  photoPreviewText: {
    fontSize: 11,
    color: '#10b981',
    fontWeight: '700',
  },
  photoRemoveText: {
    fontSize: 10,
    color: '#ef4444',
    fontWeight: '700',
  },
  btnPrimary: {
    backgroundColor: '#0ea5e9',
    borderRadius: 12,
    padding: 15,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0ea5e9',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 3,
    marginTop: 10,
  },
  btnPrimaryText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 13,
    letterSpacing: 0.5,
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
    borderRadius: 10,
    paddingVertical: 12,
    width: '100%',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
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
