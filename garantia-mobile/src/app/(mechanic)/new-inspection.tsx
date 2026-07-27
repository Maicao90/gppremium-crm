import React, { useState, useEffect } from 'react';
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
  Wrench, 
  ArrowLeft, 
  Gauge, 
  CheckCircle2,
  AlertTriangle,
  ClipboardList,
  Camera,
  User
} from 'lucide-react-native';

const { width: windowWidth } = Dimensions.get('window');
const isWeb = Platform.OS === 'web';

interface WarrantyOption {
  id: string;
  plate: string;
  customer: string;
  model: string;
  mileage: number;
}

export default function NewInspectionScreen() {
  const router = useRouter();

  const [warranties, setWarranties] = useState<WarrantyOption[]>([]);
  const [selectedWarrantyId, setSelectedWarrantyId] = useState('');
  const [mileage, setMileage] = useState('');
  const [notes, setNotes] = useState('');
  const [inspectorName, setInspectorName] = useState('Lucas Souza');
  
  // Photos states
  const [odometerPhoto, setOdometerPhoto] = useState<string | null>(null);
  
  // 3 photos per tire (External, Central, Internal)
  const [photoDE_ext, setPhotoDE_ext] = useState<string | null>(null);
  const [photoDE_cen, setPhotoDE_cen] = useState<string | null>(null);
  const [photoDE_int, setPhotoDE_int] = useState<string | null>(null);

  const [photoDD_ext, setPhotoDD_ext] = useState<string | null>(null);
  const [photoDD_cen, setPhotoDD_cen] = useState<string | null>(null);
  const [photoDD_int, setPhotoDD_int] = useState<string | null>(null);

  const [photoTE_ext, setPhotoTE_ext] = useState<string | null>(null);
  const [photoTE_cen, setPhotoTE_cen] = useState<string | null>(null);
  const [photoTE_int, setPhotoTE_int] = useState<string | null>(null);

  const [photoTD_ext, setPhotoTD_ext] = useState<string | null>(null);
  const [photoTD_cen, setPhotoTD_cen] = useState<string | null>(null);
  const [photoTD_int, setPhotoTD_int] = useState<string | null>(null);

  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Checklist
  const [alignChecked, setAlignChecked] = useState(true);
  const [balChecked, setBalChecked] = useState(true);
  const [pressChecked, setPressChecked] = useState(true);
  const [integChecked, setIntegChecked] = useState(true);

  // Tire inputs (DE, DD, TE, TD)
  const [grooveDE, setGrooveDE] = useState({ ext: '6.5', cen: '6.5', int: '6.4', state: 'excellent' });
  const [grooveDD, setGrooveDD] = useState({ ext: '6.4', cen: '6.5', int: '6.4', state: 'excellent' });
  const [grooveTE, setGrooveTE] = useState({ ext: '5.2', cen: '5.3', int: '5.2', state: 'good' });
  const [grooveTD, setGrooveTD] = useState({ ext: '5.1', cen: '5.2', int: '5.1', state: 'good' });

  const [loading, setLoading] = useState(false);
  const [fetchLoading, setFetchLoading] = useState(true);
  
  // Custom Alert
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertMessage, setAlertMessage] = useState('');
  const [success, setSuccess] = useState(false);

  const selectedWarranty = warranties.find(w => w.id === selectedWarrantyId);

  useEffect(() => {
    fetchWarranties();
  }, []);

  const fetchWarranties = async () => {
    try {
      const response = await fetch('http://localhost:3000/api/database');
      if (response.ok) {
        const db = await response.json();
        const opts = db.warranties.map((w: any) => ({
          id: w.id,
          plate: w.plate,
          customer: w.customer,
          model: w.model,
          mileage: w.mileage
        }));
        setWarranties(opts);
        if (opts.length > 0) {
          setSelectedWarrantyId(opts[0].id);
          setMileage(String(opts[0].mileage + 5000)); // Suggest next 5k milestone
        }
      }
    } catch (error) {
      console.error("Error fetching warranties:", error);
    } finally {
      setFetchLoading(false);
    }
  };

  const handleSelectWarranty = (id: string) => {
    setSelectedWarrantyId(id);
    const selected = warranties.find(w => w.id === id);
    if (selected) {
      setMileage(String(selected.mileage + 5000));
    }
  };

  const showAlert = (message: string, isSuccess = false) => {
    setAlertMessage(message);
    setSuccess(isSuccess);
    setAlertVisible(true);
  };

  const handleSave = async () => {
    if (!selectedWarrantyId || !mileage) {
      showAlert('Por favor, preencha a placa e a quilometragem atual do veículo.');
      return;
    }

    const mileageNum = parseInt(mileage);
    if (isNaN(mileageNum) || mileageNum <= 0) {
      showAlert('Por favor, insira um valor válido de odômetro.');
      return;
    }

    if (!inspectorName.trim()) {
      showAlert('Por favor, informe o nome do inspetor/mecânico responsável.');
      return;
    }

    if (!odometerPhoto) {
      showAlert('A foto do odômetro é obrigatória para comprovar a quilometragem atual do veículo.');
      return;
    }

    if (!photoDE_ext || !photoDE_cen || !photoDE_int ||
        !photoDD_ext || !photoDD_cen || !photoDD_int ||
        !photoTE_ext || !photoTE_cen || !photoTE_int ||
        !photoTD_ext || !photoTD_cen || !photoTD_int) {
      showAlert('As 3 fotos de comprovação de sulcos (Externa, Central e Interna) para todos os 4 pneus são obrigatórias.');
      return;
    }

    setLoading(true);

    try {
      // 1. Fetch current database
      const response = await fetch('http://localhost:3000/api/database');
      if (!response.ok) {
        throw new Error('Falha ao obter dados.');
      }
      const db = await response.json();

      // Find the selected warranty
      const warrantyIndex = db.warranties.findIndex((w: any) => w.id === selectedWarrantyId);
      if (warrantyIndex === -1) {
        throw new Error('Garantia selecionada não encontrada no banco.');
      }

      const warranty = db.warranties[warrantyIndex];

      if (mileageNum <= warranty.mileage) {
        showAlert(`O odômetro informado (${mileageNum} KM) deve ser maior do que o odômetro anterior registrado (${warranty.mileage} KM).`);
        setLoading(false);
        return;
      }

      // 2. Format dates
      const today = new Date();
      const formatDate = (date: Date) => {
        const d = String(date.getDate()).padStart(2, '0');
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const y = date.getFullYear();
        return `${d}/${m}/${y}`;
      };

      const newInspId = `REV-${today.getDate()}${today.getMonth() + 1}-${Math.floor(100 + Math.random() * 900)}`;

      const newInspection = {
        id: newInspId,
        plate: warranty.plate,
        warrantyId: warranty.id,
        mechanic: inspectorName,
        date: formatDate(today),
        status: "approved",
        mileage: mileageNum,
        partnerPost: "Auto Center SP",
        technicalNotes: notes || "Aferição periódica padrão. Calibração realizada. Alinhamento e balanceamento conferidos.",
        tires: {
          DE: { position: "Dianteiro Esquerdo (DE)", external: parseFloat(grooveDE.ext), central: parseFloat(grooveDE.cen), internal: parseFloat(grooveDE.int), state: grooveDE.state },
          DD: { position: "Dianteiro Direito (DD)", external: parseFloat(grooveDD.ext), central: parseFloat(grooveDD.cen), internal: parseFloat(grooveDD.int), state: grooveDD.state },
          TE: { position: "Traseiro Esquerdo (TE)", external: parseFloat(grooveTE.ext), central: parseFloat(grooveTE.cen), internal: parseFloat(grooveTE.int), state: grooveTE.state },
          TD: { position: "Traseiro Direito (TD)", external: parseFloat(grooveTD.ext), central: parseFloat(grooveTD.cen), internal: parseFloat(grooveTD.int), state: grooveTD.state }
        },
        checks: {
          alignment: alignChecked,
          balance: balChecked,
          pressure: pressChecked,
          integrity: integChecked
        }
      };

      // 3. Update warranty odometer
      db.warranties[warrantyIndex].mileage = mileageNum;

      // 4. Append inspection
      db.inspections.unshift(newInspection);

      // 5. Add a simulated notification for the client
      const newNotification = {
        id: String(Date.now()),
        type: "check",
        title: `Vistoria de ${mileageNum} KM Aprovada ➔`,
        desc: `Sua revisão periódica foi registrada no posto Auto Center SP. Pneus em bom estado!`,
        time: "Agora mesmo"
      };
      db.notifications.unshift(newNotification);

      // 6. Write database back
      const writeResponse = await fetch('http://localhost:3000/api/database', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(db),
      });

      if (!writeResponse.ok) {
        throw new Error('Falha ao escrever dados.');
      }

      showAlert(`Vistoria ${newInspId} registrada com sucesso e odômetro atualizado para ${mileageNum} KM!`, true);
    } catch (error) {
      console.error(error);
      showAlert('Erro ao registrar vistoria. Verifique a conexão com o servidor local.');
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
          <Text style={styles.statusBarTime}>14:56</Text>
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
          <Text style={styles.navTitle}>Registrar Vistoria</Text>
        </View>

        <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
          <View style={styles.headerInfo}>
            <Wrench size={24} color="#10b981" />
            <Text style={styles.headerInfoTitle}>Vistoria de Pista periódica</Text>
          </View>

          {fetchLoading ? (
            <ActivityIndicator size="large" color="#10b981" style={{ marginTop: 40 }} />
          ) : (
            <>
              {/* Seção 1: Selecionar Pneu Ativo */}
              <Text style={styles.sectionTitle}>Placa / Veículo em Atendimento</Text>
              <View style={styles.card}>
                <Text style={styles.selectLabel}>Selecione o Veículo Cadastrado:</Text>
                
                <TouchableOpacity 
                  style={styles.dropdownTrigger}
                  onPress={() => setDropdownOpen(!dropdownOpen)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.dropdownTriggerText}>
                    {selectedWarranty ? `🚗 ${selectedWarranty.plate} - ${selectedWarranty.model.split(' ')[0]} (${selectedWarranty.customer.split(' ')[0]})` : 'Escolha um veículo...'}
                  </Text>
                  <Text style={styles.dropdownTriggerArrow}>{dropdownOpen ? '▲' : '▼'}</Text>
                </TouchableOpacity>

                {dropdownOpen && (
                  <View style={styles.dropdownList}>
                    {warranties.map(w => (
                      <TouchableOpacity
                        key={w.id}
                        style={[
                          styles.dropdownItem,
                          selectedWarrantyId === w.id && styles.dropdownItemActive
                        ]}
                        onPress={() => {
                          handleSelectWarranty(w.id);
                          setDropdownOpen(false);
                        }}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={styles.dropdownItemText}>
                            🚗 {w.plate} - {w.model}
                          </Text>
                          <Text style={styles.dropdownItemSubText}>
                            Cliente: {w.customer} | Odôm: {w.mileage} Km
                          </Text>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                <View style={[styles.inputWrapper, { marginTop: 14 }]}>
                  <User size={16} color="#64748b" style={styles.inputIcon} />
                  <TextInput 
                    style={styles.input} 
                    placeholder="Nome do Inspetor Responsável" 
                    placeholderTextColor="#94a3b8"
                    value={inspectorName}
                    onChangeText={setInspectorName}
                  />
                </View>

                <View style={[styles.inputWrapper, { marginTop: 14 }]}>
                  <Gauge size={16} color="#64748b" style={styles.inputIcon} />
                  <TextInput 
                    style={styles.input} 
                    placeholder="Odômetro Atual (KM)" 
                    placeholderTextColor="#94a3b8"
                    value={mileage}
                    onChangeText={setMileage}
                    keyboardType="numeric"
                  />
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
                      onPress={() => setOdometerPhoto('Foto_Odometro_Vistoria.jpg')}
                      activeOpacity={0.7}
                    >
                      <Camera size={18} color="#0ea5e9" style={{ marginRight: 6 }} />
                      <Text style={styles.photoUploadBtnText}>Tirar Foto do Odômetro</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {/* Seção 2: Medição dos Sulcos (mm) */}
              <Text style={styles.sectionTitle}>Profundidade de Sulcos (mm)</Text>
              
              {/* Dianteiro Esquerdo */}
              <View style={styles.tireMeasureCard}>
                <View style={styles.tireHeaderRow}>
                  <View style={styles.greenCircle} />
                  <Text style={styles.tirePosName}>Dianteiro Esquerdo (DE)</Text>
                </View>
                <View style={styles.measureRow}>
                  <View style={styles.measureCol}>
                    <Text style={styles.measureLabel}>Externa</Text>
                    <TextInput style={styles.measureInput} value={grooveDE.ext} onChangeText={t => setGrooveDE({...grooveDE, ext: t})} keyboardType="numeric" />
                  </View>
                  <View style={styles.measureCol}>
                    <Text style={styles.measureLabel}>Central</Text>
                    <TextInput style={styles.measureInput} value={grooveDE.cen} onChangeText={t => setGrooveDE({...grooveDE, cen: t})} keyboardType="numeric" />
                  </View>
                  <View style={styles.measureCol}>
                    <Text style={styles.measureLabel}>Interna</Text>
                    <TextInput style={styles.measureInput} value={grooveDE.int} onChangeText={t => setGrooveDE({...grooveDE, int: t})} keyboardType="numeric" />
                  </View>
                </View>
                <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 10 }}>
                  <Text style={styles.photoLabel}>Fotos Comprovantes (3 Obrigatórias):</Text>
                  <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                    {photoDE_ext ? (
                      <TouchableOpacity style={[styles.photoPreviewCard, { flex: 1, minWidth: 100 }]} onPress={() => setPhotoDE_ext(null)}>
                        <Text style={styles.photoPreviewText}>📸 Ext: Ok (Rem)</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity style={[styles.photoUploadBtn, { flex: 1, minWidth: 100 }]} onPress={() => setPhotoDE_ext('Ext_DE.jpg')}>
                        <Camera size={11} color="#10b981" style={{ marginRight: 4 }} />
                        <Text style={styles.photoUploadBtnText}>Foto Ext.</Text>
                      </TouchableOpacity>
                    )}
                    {photoDE_cen ? (
                      <TouchableOpacity style={[styles.photoPreviewCard, { flex: 1, minWidth: 100 }]} onPress={() => setPhotoDE_cen(null)}>
                        <Text style={styles.photoPreviewText}>📸 Cen: Ok (Rem)</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity style={[styles.photoUploadBtn, { flex: 1, minWidth: 100 }]} onPress={() => setPhotoDE_cen('Cen_DE.jpg')}>
                        <Camera size={11} color="#10b981" style={{ marginRight: 4 }} />
                        <Text style={styles.photoUploadBtnText}>Foto Cen.</Text>
                      </TouchableOpacity>
                    )}
                    {photoDE_int ? (
                      <TouchableOpacity style={[styles.photoPreviewCard, { flex: 1, minWidth: 100 }]} onPress={() => setPhotoDE_int(null)}>
                        <Text style={styles.photoPreviewText}>📸 Int: Ok (Rem)</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity style={[styles.photoUploadBtn, { flex: 1, minWidth: 100 }]} onPress={() => setPhotoDE_int('Int_DE.jpg')}>
                        <Camera size={11} color="#10b981" style={{ marginRight: 4 }} />
                        <Text style={styles.photoUploadBtnText}>Foto Int.</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              </View>

              {/* Dianteiro Direito */}
              <View style={styles.tireMeasureCard}>
                <View style={styles.tireHeaderRow}>
                  <View style={styles.greenCircle} />
                  <Text style={styles.tirePosName}>Dianteiro Direito (DD)</Text>
                </View>
                <View style={styles.measureRow}>
                  <View style={styles.measureCol}>
                    <Text style={styles.measureLabel}>Externa</Text>
                    <TextInput style={styles.measureInput} value={grooveDD.ext} onChangeText={t => setGrooveDD({...grooveDD, ext: t})} keyboardType="numeric" />
                  </View>
                  <View style={styles.measureCol}>
                    <Text style={styles.measureLabel}>Central</Text>
                    <TextInput style={styles.measureInput} value={grooveDD.cen} onChangeText={t => setGrooveDD({...grooveDD, cen: t})} keyboardType="numeric" />
                  </View>
                  <View style={styles.measureCol}>
                    <Text style={styles.measureLabel}>Interna</Text>
                    <TextInput style={styles.measureInput} value={grooveDD.int} onChangeText={t => setGrooveDD({...grooveDD, int: t})} keyboardType="numeric" />
                  </View>
                </View>
                <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 10 }}>
                  <Text style={styles.photoLabel}>Fotos Comprovantes (3 Obrigatórias):</Text>
                  <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                    {photoDD_ext ? (
                      <TouchableOpacity style={[styles.photoPreviewCard, { flex: 1, minWidth: 100 }]} onPress={() => setPhotoDD_ext(null)}>
                        <Text style={styles.photoPreviewText}>📸 Ext: Ok (Rem)</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity style={[styles.photoUploadBtn, { flex: 1, minWidth: 100 }]} onPress={() => setPhotoDD_ext('Ext_DD.jpg')}>
                        <Camera size={11} color="#10b981" style={{ marginRight: 4 }} />
                        <Text style={styles.photoUploadBtnText}>Foto Ext.</Text>
                      </TouchableOpacity>
                    )}
                    {photoDD_cen ? (
                      <TouchableOpacity style={[styles.photoPreviewCard, { flex: 1, minWidth: 100 }]} onPress={() => setPhotoDD_cen(null)}>
                        <Text style={styles.photoPreviewText}>📸 Cen: Ok (Rem)</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity style={[styles.photoUploadBtn, { flex: 1, minWidth: 100 }]} onPress={() => setPhotoDD_cen('Cen_DD.jpg')}>
                        <Camera size={11} color="#10b981" style={{ marginRight: 4 }} />
                        <Text style={styles.photoUploadBtnText}>Foto Cen.</Text>
                      </TouchableOpacity>
                    )}
                    {photoDD_int ? (
                      <TouchableOpacity style={[styles.photoPreviewCard, { flex: 1, minWidth: 100 }]} onPress={() => setPhotoDD_int(null)}>
                        <Text style={styles.photoPreviewText}>📸 Int: Ok (Rem)</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity style={[styles.photoUploadBtn, { flex: 1, minWidth: 100 }]} onPress={() => setPhotoDD_int('Int_DD.jpg')}>
                        <Camera size={11} color="#10b981" style={{ marginRight: 4 }} />
                        <Text style={styles.photoUploadBtnText}>Foto Int.</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              </View>

              {/* Traseiro Esquerdo */}
              <View style={styles.tireMeasureCard}>
                <View style={styles.tireHeaderRow}>
                  <View style={styles.greenCircle} />
                  <Text style={styles.tirePosName}>Traseiro Esquerdo (TE)</Text>
                </View>
                <View style={styles.measureRow}>
                  <View style={styles.measureCol}>
                    <Text style={styles.measureLabel}>Externa</Text>
                    <TextInput style={styles.measureInput} value={grooveTE.ext} onChangeText={t => setGrooveTE({...grooveTE, ext: t})} keyboardType="numeric" />
                  </View>
                  <View style={styles.measureCol}>
                    <Text style={styles.measureLabel}>Central</Text>
                    <TextInput style={styles.measureInput} value={grooveTE.cen} onChangeText={t => setGrooveTE({...grooveTE, cen: t})} keyboardType="numeric" />
                  </View>
                  <View style={styles.measureCol}>
                    <Text style={styles.measureLabel}>Interna</Text>
                    <TextInput style={styles.measureInput} value={grooveTE.int} onChangeText={t => setGrooveTE({...grooveTE, int: t})} keyboardType="numeric" />
                  </View>
                </View>
                <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 10 }}>
                  <Text style={styles.photoLabel}>Fotos Comprovantes (3 Obrigatórias):</Text>
                  <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                    {photoTE_ext ? (
                      <TouchableOpacity style={[styles.photoPreviewCard, { flex: 1, minWidth: 100 }]} onPress={() => setPhotoTE_ext(null)}>
                        <Text style={styles.photoPreviewText}>📸 Ext: Ok (Rem)</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity style={[styles.photoUploadBtn, { flex: 1, minWidth: 100 }]} onPress={() => setPhotoTE_ext('Ext_TE.jpg')}>
                        <Camera size={11} color="#10b981" style={{ marginRight: 4 }} />
                        <Text style={styles.photoUploadBtnText}>Foto Ext.</Text>
                      </TouchableOpacity>
                    )}
                    {photoTE_cen ? (
                      <TouchableOpacity style={[styles.photoPreviewCard, { flex: 1, minWidth: 100 }]} onPress={() => setPhotoTE_cen(null)}>
                        <Text style={styles.photoPreviewText}>📸 Cen: Ok (Rem)</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity style={[styles.photoUploadBtn, { flex: 1, minWidth: 100 }]} onPress={() => setPhotoTE_cen('Cen_TE.jpg')}>
                        <Camera size={11} color="#10b981" style={{ marginRight: 4 }} />
                        <Text style={styles.photoUploadBtnText}>Foto Cen.</Text>
                      </TouchableOpacity>
                    )}
                    {photoTE_int ? (
                      <TouchableOpacity style={[styles.photoPreviewCard, { flex: 1, minWidth: 100 }]} onPress={() => setPhotoTE_int(null)}>
                        <Text style={styles.photoPreviewText}>📸 Int: Ok (Rem)</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity style={[styles.photoUploadBtn, { flex: 1, minWidth: 100 }]} onPress={() => setPhotoTE_int('Int_TE.jpg')}>
                        <Camera size={11} color="#10b981" style={{ marginRight: 4 }} />
                        <Text style={styles.photoUploadBtnText}>Foto Int.</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              </View>

              {/* Traseiro Direito */}
              <View style={styles.tireMeasureCard}>
                <View style={styles.tireHeaderRow}>
                  <View style={styles.greenCircle} />
                  <Text style={styles.tirePosName}>Traseiro Direito (TD)</Text>
                </View>
                <View style={styles.measureRow}>
                  <View style={styles.measureCol}>
                    <Text style={styles.measureLabel}>Externa</Text>
                    <TextInput style={styles.measureInput} value={grooveTD.ext} onChangeText={t => setGrooveTD({...grooveTD, ext: t})} keyboardType="numeric" />
                  </View>
                  <View style={styles.measureCol}>
                    <Text style={styles.measureLabel}>Central</Text>
                    <TextInput style={styles.measureInput} value={grooveTD.cen} onChangeText={t => setGrooveTD({...grooveTD, cen: t})} keyboardType="numeric" />
                  </View>
                  <View style={styles.measureCol}>
                    <Text style={styles.measureLabel}>Interna</Text>
                    <TextInput style={styles.measureInput} value={grooveTD.int} onChangeText={t => setGrooveTD({...grooveTD, int: t})} keyboardType="numeric" />
                  </View>
                </View>
                <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 10 }}>
                  <Text style={styles.photoLabel}>Fotos Comprovantes (3 Obrigatórias):</Text>
                  <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                    {photoTD_ext ? (
                      <TouchableOpacity style={[styles.photoPreviewCard, { flex: 1, minWidth: 100 }]} onPress={() => setPhotoTD_ext(null)}>
                        <Text style={styles.photoPreviewText}>📸 Ext: Ok (Rem)</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity style={[styles.photoUploadBtn, { flex: 1, minWidth: 100 }]} onPress={() => setPhotoTD_ext('Ext_TD.jpg')}>
                        <Camera size={11} color="#10b981" style={{ marginRight: 4 }} />
                        <Text style={styles.photoUploadBtnText}>Foto Ext.</Text>
                      </TouchableOpacity>
                    )}
                    {photoTD_cen ? (
                      <TouchableOpacity style={[styles.photoPreviewCard, { flex: 1, minWidth: 100 }]} onPress={() => setPhotoTD_cen(null)}>
                        <Text style={styles.photoPreviewText}>📸 Cen: Ok (Rem)</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity style={[styles.photoUploadBtn, { flex: 1, minWidth: 100 }]} onPress={() => setPhotoTD_cen('Cen_TD.jpg')}>
                        <Camera size={11} color="#10b981" style={{ marginRight: 4 }} />
                        <Text style={styles.photoUploadBtnText}>Foto Cen.</Text>
                      </TouchableOpacity>
                    )}
                    {photoTD_int ? (
                      <TouchableOpacity style={[styles.photoPreviewCard, { flex: 1, minWidth: 100 }]} onPress={() => setPhotoTD_int(null)}>
                        <Text style={styles.photoPreviewText}>📸 Int: Ok (Rem)</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity style={[styles.photoUploadBtn, { flex: 1, minWidth: 100 }]} onPress={() => setPhotoTD_int('Int_TD.jpg')}>
                        <Camera size={11} color="#10b981" style={{ marginRight: 4 }} />
                        <Text style={styles.photoUploadBtnText}>Foto Int.</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              </View>

              {/* Seção 3: Checklist de Segurança */}
              <Text style={styles.sectionTitle}>Checklist e Serviços Realizados</Text>
              <View style={styles.card}>
                <TouchableOpacity style={styles.checkRow} onPress={() => setAlignChecked(!alignChecked)}>
                  <View style={[styles.checkBox, alignChecked && styles.checkBoxActive]}>
                    {alignChecked && <Text style={styles.checkSymbol}>✓</Text>}
                  </View>
                  <Text style={styles.checkText}>Alinhamento de Direção Feito</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.checkRow} onPress={() => setBalChecked(!balChecked)}>
                  <View style={[styles.checkBox, balChecked && styles.checkBoxActive]}>
                    {balChecked && <Text style={styles.checkSymbol}>✓</Text>}
                  </View>
                  <Text style={styles.checkText}>Balanceamento de Rodas Feito</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.checkRow} onPress={() => setPressChecked(!pressChecked)}>
                  <View style={[styles.checkBox, pressChecked && styles.checkBoxActive]}>
                    {pressChecked && <Text style={styles.checkSymbol}>✓</Text>}
                  </View>
                  <Text style={styles.checkText}>Pressão Calibrada (PSI Recomendada)</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.checkRow} onPress={() => setIntegChecked(!integChecked)}>
                  <View style={[styles.checkBox, integChecked && styles.checkBoxActive]}>
                    {integChecked && <Text style={styles.checkSymbol}>✓</Text>}
                  </View>
                  <Text style={styles.checkText}>Integridade dos Pneus Ok (sem bolhas/cortes)</Text>
                </TouchableOpacity>
              </View>

              {/* Seção 4: Notas Técnicas */}
              <Text style={styles.sectionTitle}>Notas Técnicas & Observações</Text>
              <View style={styles.card}>
                <TextInput
                  style={[styles.input, { height: 70, textAlignVertical: 'top' }]}
                  placeholder="Digite observações sobre o desgaste, alinhamento ou estado geral dos pneus..."
                  placeholderTextColor="#94a3b8"
                  multiline
                  value={notes}
                  onChangeText={setNotes}
                />
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
                  <Text style={styles.btnPrimaryText}>REGISTRAR E FINALIZAR REVISÃO</Text>
                )}
              </TouchableOpacity>
            </>
          )}
        </ScrollView>

        {/* Custom Alert Modal */}
        {(alertVisible) && (
          <View style={styles.alertOverlay}>
            <View style={styles.alertCard}>
              {success ? (
                <CheckCircle2 size={40} color="#10b981" style={{ marginBottom: 12 }} />
              ) : (
                <AlertTriangle size={40} color="#f59e0b" style={{ marginBottom: 12 }} />
              )}
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
    backgroundColor: 'rgba(16, 185, 129, 0.04)',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.1)',
  },
  headerInfoTitle: {
    fontSize: 13,
    fontWeight: '850',
    color: '#10b981',
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
  selectLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 8,
  },
  dropdownTrigger: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    padding: 12,
    backgroundColor: '#f8fafc',
    marginBottom: 8,
  },
  dropdownTriggerText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
  },
  dropdownTriggerArrow: {
    fontSize: 10,
    color: '#64748b',
    fontWeight: 'bold',
  },
  dropdownList: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    backgroundColor: '#ffffff',
    maxHeight: 180,
    overflow: 'hidden',
    shadowColor: '#64748b',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
    marginBottom: 10,
  },
  dropdownItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  dropdownItemActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.04)',
  },
  dropdownItemText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
  },
  dropdownItemSubText: {
    fontSize: 10,
    color: '#64748b',
    marginTop: 2,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.05)',
    borderRadius: 10,
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
  tireMeasureCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
  },
  tireHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    paddingBottom: 6,
  },
  greenCircle: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10b981',
  },
  tirePosName: {
    fontSize: 12,
    fontWeight: '800',
    color: '#334155',
  },
  measureRow: {
    flexDirection: 'row',
    gap: 12,
  },
  measureCol: {
    flex: 1,
  },
  measureLabel: {
    fontSize: 10,
    color: '#64748b',
    marginBottom: 4,
    textAlign: 'center',
    fontWeight: '500',
  },
  measureInput: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.05)',
    borderRadius: 8,
    paddingVertical: 6,
    textAlign: 'center',
    fontSize: 12,
    color: '#0f172a',
    fontWeight: '700',
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
    backgroundColor: 'rgba(16, 185, 129, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.15)',
    borderStyle: 'dashed',
    borderRadius: 8,
    padding: 8,
    marginTop: 4,
  },
  photoUploadBtnText: {
    fontSize: 11,
    color: '#10b981',
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
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f8fafc',
  },
  checkBox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  checkBoxActive: {
    borderColor: '#10b981',
    backgroundColor: '#10b981',
  },
  checkSymbol: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
  },
  checkText: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '600',
  },
  btnPrimary: {
    backgroundColor: '#10b981',
    borderRadius: 12,
    padding: 15,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#10b981',
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
