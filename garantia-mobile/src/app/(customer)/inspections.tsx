import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  ScrollView, 
  TouchableOpacity, 
  SafeAreaView, 
  Dimensions, 
  Platform,
  LayoutAnimation,
  UIManager
} from 'react-native';
import { useRouter } from 'expo-router';
import { 
  ArrowLeft, 
  Wrench, 
  Shield, 
  Calendar, 
  ChevronDown, 
  ChevronUp, 
  CheckCircle2, 
  AlertTriangle,
  TrendingUp,
  FileText,
  MapPin
} from 'lucide-react-native';

const { width: windowWidth } = Dimensions.get('window');
const isWeb = Platform.OS === 'web';

// Ativar animações de layout para Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface TireMeasurement {
  position: string;
  external: number;
  central: number;
  internal: number;
  state: 'excellent' | 'good' | 'regular' | 'bad';
}

interface InspectionItem {
  id: string;
  mileage: number;
  date: string;
  partnerPost: string;
  status: 'approved' | 'pending' | 'rejected';
  technicalNotes: string;
  tires: {
    DE: TireMeasurement;
    DD: TireMeasurement;
    TE: TireMeasurement;
    TD: TireMeasurement;
  };
  checks: {
    alignment: boolean;
    balance: boolean;
    pressure: boolean;
    integrity: boolean;
  };
}

const PAST_INSPECTIONS: InspectionItem[] = [
  {
    id: "REV-35K",
    mileage: 35000,
    date: "28/05/2026",
    partnerPost: "Auto Center Premium SP",
    status: "approved",
    technicalNotes: "Alinhamento tridimensional e balanceamento realizados preventivamente. Profundidades de sulcos de todos os quatro pneus aferidas com paquímetro digital de precisão. Pressão calibrada com 32 PSI nos quatro pneus. Sem presença de bolhas ou cortes.",
    tires: {
      DE: { position: "Dianteiro Esquerdo (DE)", external: 6.5, central: 6.5, internal: 6.4, state: 'excellent' },
      DD: { position: "Dianteiro Direito (DD)", external: 6.4, central: 6.5, internal: 6.4, state: 'excellent' },
      TE: { position: "Traseiro Esquerdo (TE)", external: 5.2, central: 5.3, internal: 5.2, state: 'good' },
      TD: { position: "Traseiro Direito (TD)", external: 5.1, central: 5.2, internal: 5.1, state: 'good' }
    },
    checks: {
      alignment: true,
      balance: true,
      pressure: true,
      integrity: true
    }
  },
  {
    id: "REV-INIT",
    mileage: 31200,
    date: "12/11/2025",
    partnerPost: "Rodas & Cia Campinas",
    status: "approved",
    technicalNotes: "Instalação inicial e ativação de garantia dos 4 pneus GP Sport Premium Max. Fotos de DOT enviadas para o sistema e aprovadas em tempo real. Alinhamento inicial de caster/cambagem realizado conforme padrão do veículo.",
    tires: {
      DE: { position: "Dianteiro Esquerdo (DE)", external: 7.2, central: 7.2, internal: 7.2, state: 'excellent' },
      DD: { position: "Dianteiro Direito (DD)", external: 7.2, central: 7.2, internal: 7.2, state: 'excellent' },
      TE: { position: "Traseiro Esquerdo (TE)", external: 7.2, central: 7.2, internal: 7.2, state: 'excellent' },
      TD: { position: "Traseiro Direito (TD)", external: 7.2, central: 7.2, internal: 7.2, state: 'excellent' }
    },
    checks: {
      alignment: true,
      balance: true,
      pressure: true,
      integrity: true
    }
  }
];

export default function InspectionsScreen() {
  const router = useRouter();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [inspectionsList, setInspectionsList] = useState<any[]>(PAST_INSPECTIONS);
  const [currentMileage, setCurrentMileage] = useState(36400);
  const [startMileage, setStartMileage] = useState(31200);

  useEffect(() => {
    const loadInspections = async () => {
      try {
        const res = await fetch('http://localhost:3000/api/database');
        if (res.ok) {
          const db = await res.json();
          const brunoW = db.warranties.find((w: any) => w.customer.includes('Bruno') || w.cpf === '456.123.789-22') || db.warranties[0];
          if (brunoW) {
            setCurrentMileage(brunoW.mileage);
            setStartMileage(brunoW.startMileage || 31200);
            
            const filtered = db.inspections.filter((insp: any) => 
              insp.plate === brunoW.plate || insp.warrantyId === brunoW.id
            );
            if (filtered.length > 0) {
              setInspectionsList(filtered);
            }
          }
        }
      } catch (err) {
        console.error("Error loading inspections DB:", err);
      }
    };
    loadInspections();
    const interval = setInterval(loadInspections, 3000);
    return () => clearInterval(interval);
  }, []);

  const toggleExpand = (id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    if (expandedId === id) {
      setExpandedId(null);
    } else {
      setExpandedId(id);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved': return '#10b981';
      case 'pending': return '#ea580c';
      case 'rejected': return '#ef4444';
      default: return '#64748b';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'approved': return 'Aprovada';
      case 'pending': return 'Pendente';
      case 'rejected': return 'Reprovada';
      default: return 'Desconhecido';
    }
  };

  return (
    <SafeAreaView style={styles.outerContainer}>
      <View style={styles.phoneContainer}>
        {/* Top Status Bar Sim */}
        <View style={styles.statusBarSim}>
          <Text style={styles.statusBarTime}>14:43</Text>
          <View style={styles.statusBarIcons}>
            <View style={styles.batteryIcon} />
          </View>
        </View>

        {/* Navigation Header */}
        <View style={styles.navigationBar}>
          <TouchableOpacity onPress={() => router.push('/(customer)/home')} style={styles.backButton}>
            <ArrowLeft size={18} color="#0EA5E9" />
            <Text style={styles.backText}>Painel</Text>
          </TouchableOpacity>
          <Text style={styles.navTitle}>Minhas Revisões</Text>
        </View>

        <ScrollView style={styles.scroll} contentContainerStyle={styles.contentContainer}>
          {/* Header Visual */}
          <View style={styles.header}>
            <Wrench size={32} color="#0EA5E9" style={styles.headerIcon} />
            <Text style={styles.title}>Histórico de Revisões</Text>
            <Text style={styles.subtitle}>Acompanhe as vistorias físicas dos seus pneus</Text>
          </View>

          {/* Resumo de Saúde */}
          <View style={styles.summaryCard}>
            <View style={styles.summaryHeader}>
              <TrendingUp size={16} color="#0EA5E9" />
              <Text style={styles.summaryTitle}>DESGASTE MÉDIO DOS SULCOS</Text>
            </View>
            
            <View style={styles.depthProgressRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.progressText}>Eixo Dianteiro: 6.45mm</Text>
                <View style={styles.progressBg}>
                  <View style={[styles.progressFill, { width: '89.5%', backgroundColor: '#10b981' }]} />
                </View>
              </View>
              <View style={{ flex: 1, marginLeft: 16 }}>
                <Text style={styles.progressText}>Eixo Traseiro: 5.15mm</Text>
                <View style={styles.progressBg}>
                  <View style={[styles.progressFill, { width: '71.5%', backgroundColor: '#34d399' }]} />
                </View>
              </View>
            </View>
            <Text style={styles.summaryDisclaimer}>
              Obs: Limite mínimo de segurança exigido por lei é de 1.6mm (TWI). A garantia de 50.000 KM cobre desgastes regulares acima do limite mínimo.
            </Text>
          </View>

          <Text style={styles.sectionTitle}>Vistorias Efetuadas</Text>

          {/* Lista de Revisões */}
          <View style={{ gap: 14 }}>
            {inspectionsList.map((item) => {
              const isExpanded = expandedId === item.id;
              return (
                <View key={item.id} style={[styles.inspectionCard, isExpanded && styles.expandedCardBorder]}>
                  {/* Cabeçalho do Card (Clicável para expandir) */}
                  <TouchableOpacity 
                    style={styles.cardHeader} 
                    onPress={() => toggleExpand(item.id)}
                    activeOpacity={0.8}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <Calendar size={18} color="#64748b" />
                      <View>
                        <Text style={styles.cardKmTitle}>Revisão {item.mileage.toLocaleString()} KM</Text>
                        <Text style={styles.cardDateSub}>{item.date} • {item.partnerPost}</Text>
                      </View>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) + '15' }]}>
                        <Text style={[styles.statusBadgeText, { color: getStatusColor(item.status) }]}>
                          {getStatusLabel(item.status)}
                        </Text>
                      </View>
                      {isExpanded ? (
                        <ChevronUp size={16} color="#64748b" />
                      ) : (
                        <ChevronDown size={16} color="#64748b" />
                      )}
                    </View>
                  </TouchableOpacity>

                  {/* Detalhes Expandíveis */}
                  {isExpanded && (
                    <View style={styles.cardDetails}>
                      <View style={styles.divider} />
                      
                      {/* Grid de Medição dos Pneus */}
                      <Text style={styles.detailsSectionTitle}>Profundidades Aferidas (Sulcos em mm):</Text>
                      <View style={styles.tiresGrid}>
                        {Object.entries(item.tires).map(([key, tire]) => (
                          <View key={key} style={styles.tireItem}>
                            <View style={styles.tireHeader}>
                              <Text style={styles.tirePositionCode}>{key}</Text>
                              <Text style={styles.tirePositionLabel} numberOfLines={1}>{tire.position.split(' ')[0]}</Text>
                            </View>
                            <View style={styles.tireValuesRow}>
                              <View style={styles.tireValueCol}>
                                <Text style={styles.tireValLabel}>Ext.</Text>
                                <Text style={styles.tireValNum}>{tire.external}mm</Text>
                              </View>
                              <View style={styles.tireValueCol}>
                                <Text style={styles.tireValLabel}>Cent.</Text>
                                <Text style={styles.tireValNum}>{tire.central}mm</Text>
                              </View>
                              <View style={styles.tireValueCol}>
                                <Text style={styles.tireValLabel}>Int.</Text>
                                <Text style={styles.tireValNum}>{tire.internal}mm</Text>
                              </View>
                            </View>
                          </View>
                        ))}
                      </View>

                      {/* Checklist de Itens Revisados */}
                      <Text style={styles.detailsSectionTitle}>Verificações Técnicas Obrigatórias:</Text>
                      <View style={styles.checksList}>
                        <View style={styles.checkRow}>
                          <CheckCircle2 size={14} color="#10b981" />
                          <Text style={styles.checkText}>Alinhamento de Direção</Text>
                        </View>
                        <View style={styles.checkRow}>
                          <CheckCircle2 size={14} color="#10b981" />
                          <Text style={styles.checkText}>Balanceamento das Rodas</Text>
                        </View>
                        <View style={styles.checkRow}>
                          <CheckCircle2 size={14} color="#10b981" />
                          <Text style={styles.checkText}>Pressão dos Pneus Calibrada</Text>
                        </View>
                        <View style={styles.checkRow}>
                          <CheckCircle2 size={14} color="#10b981" />
                          <Text style={styles.checkText}>Integridade da Carcaça Lateral (Sem bolhas)</Text>
                        </View>
                      </View>

                      {/* Notas do Mecânico */}
                      <Text style={styles.detailsSectionTitle}>Notas Técnicas:</Text>
                      <View style={styles.notesBox}>
                        <Text style={styles.notesText}>{item.technicalNotes}</Text>
                      </View>

                      {/* Validação do Sistema */}
                      <View style={styles.aiValidationBox}>
                        <Shield size={14} color="#10b981" />
                        <Text style={styles.aiValidationText}>
                          Laudo de vistoria física homologado digitalmente pelo sistema oficial GP Premium.
                        </Text>
                      </View>
                    </View>
                  )}
                </View>
              );
            })}
          </View>

          {/* CRONOGRAMA DE PRÓXIMAS VISTORIAS DINÂMICAS */}
          <Text style={styles.sectionTitle}>Cronograma de Próximas Vistorias (a cada 5k KM)</Text>
          <View style={styles.timelineCard}>
            
            {/* 1. Próxima Revisão */}
            <View style={styles.timelineItem}>
              <View style={styles.timelinePointActive}>
                <View style={styles.timelinePointInner} />
              </View>
              <View style={styles.timelineContent}>
                <View style={styles.timelineRow}>
                  <Text style={styles.timelineKm}>Revisão {((Math.floor(currentMileage / 5000) * 5000 + 5000)).toLocaleString()} KM</Text>
                  <View style={styles.badgePending}>
                    <Text style={styles.badgePendingText}>Próxima</Text>
                  </View>
                </View>
                <Text style={styles.timelineDesc}>Estimada em {((Math.floor(currentMileage / 5000) * 5000 + 5000)).toLocaleString()} KM. Faltam {(((Math.floor(currentMileage / 5000) * 5000 + 5000) - currentMileage)).toLocaleString()} KM para realizar a vistoria.</Text>
                
                <TouchableOpacity 
                  style={styles.timelineWorkshopBtn}
                  onPress={() => router.push('/(customer)/workshops')}
                  activeOpacity={0.8}
                >
                  <MapPin size={10} color="#0ea5e9" style={{ marginRight: 2 }} />
                  <Text style={styles.timelineWorkshopText}>Encontrar oficina autorizada</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Linha conectora vertical */}
            <View style={styles.timelineLine} />

            {/* 2. Revisão */}
            <View style={styles.timelineItem}>
              <View style={styles.timelinePoint}>
                <View style={styles.timelinePointInnerOff} />
              </View>
              <View style={styles.timelineContent}>
                <Text style={styles.timelineKmOff}>Revisão {((Math.floor(currentMileage / 5000) * 5000 + 10000)).toLocaleString()} KM</Text>
                <Text style={styles.timelineDesc}>Planejada conforme odômetro. Cobertura ativa.</Text>
              </View>
            </View>

            {/* 3. Revisão */}
            <View style={styles.timelineItem}>
              <View style={styles.timelinePoint}>
                <View style={styles.timelinePointInnerOff} />
              </View>
              <View style={styles.timelineContent}>
                <Text style={styles.timelineKmOff}>Revisão {((Math.floor(currentMileage / 5000) * 5000 + 15000)).toLocaleString()} KM</Text>
                <Text style={styles.timelineDesc}>Planejada conforme odômetro. Cobertura ativa.</Text>
              </View>
            </View>

            {/* 4. Revisões futuras resumidas */}
            <View style={[styles.timelineItem, { minHeight: 40 }]}>
              <View style={styles.timelinePoint}>
                <View style={styles.timelinePointInnerOff} />
              </View>
              <View style={styles.timelineContent}>
                <Text style={styles.timelineKmOff}>Revisões até {((startMileage + 50000)).toLocaleString()} KM</Text>
                <Text style={styles.timelineDesc}>Planejadas a cada 5.000 KM adicionais até o término da garantia de 50k KM.</Text>
              </View>
            </View>
          </View>
        </ScrollView>

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
    marginVertical: 14,
  },
  headerIcon: {
    marginBottom: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
  },
  subtitle: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
  },
  summaryCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(14, 165, 233, 0.12)',
    borderRadius: 16,
    padding: 16,
    marginVertical: 14,
    shadowColor: '#64748b',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  summaryTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: '#0ea5e9',
    letterSpacing: 1,
  },
  depthProgressRow: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  progressText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 4,
  },
  progressBg: {
    height: 6,
    backgroundColor: '#e2e8f0',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  summaryDisclaimer: {
    fontSize: 9,
    color: '#94a3b8',
    lineHeight: 13,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '850',
    color: '#0f172a',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 10,
    marginBottom: 12,
  },
  inspectionCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#64748b',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  expandedCardBorder: {
    borderColor: 'rgba(14, 165, 233, 0.25)',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  cardKmTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0f172a',
  },
  cardDateSub: {
    fontSize: 10,
    color: '#64748b',
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusBadgeText: {
    fontSize: 9,
    fontWeight: '800',
  },
  cardDetails: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.05)',
    marginBottom: 12,
  },
  detailsSectionTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 10,
    marginBottom: 8,
  },
  tiresGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  tireItem: {
    width: '48%',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    padding: 8,
  },
  tireHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 6,
  },
  tirePositionCode: {
    backgroundColor: 'rgba(14, 165, 233, 0.08)',
    color: '#0ea5e9',
    fontSize: 9,
    fontWeight: '800',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
  },
  tirePositionLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#334155',
  },
  tireValuesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  tireValueCol: {
    alignItems: 'center',
  },
  tireValLabel: {
    fontSize: 8,
    color: '#94a3b8',
    fontWeight: '600',
  },
  tireValNum: {
    fontSize: 10,
    fontWeight: '700',
    color: '#0f172a',
    marginTop: 1,
  },
  checksList: {
    gap: 6,
    marginBottom: 10,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  checkText: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '500',
  },
  notesBox: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
  },
  notesText: {
    fontSize: 11,
    color: '#475569',
    lineHeight: 15,
  },
  aiValidationBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(16, 185, 129, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.1)',
    borderRadius: 8,
    padding: 8,
  },
  aiValidationText: {
    color: '#10b981',
    fontSize: 9,
    fontWeight: '600',
    flex: 1,
  },
  homeIndicatorSim: {
    height: 20,
    width: 140,
    backgroundColor: 'rgba(0,0,0,0.05)',
    alignSelf: 'center',
    borderRadius: 10,
    marginBottom: 8,
  },
  timelineCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
    borderRadius: 16,
    padding: 16,
    position: 'relative',
    shadowColor: '#64748b',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
    marginBottom: 20,
  },
  timelineItem: {
    flexDirection: 'row',
    gap: 12,
    minHeight: 75,
  },
  timelinePointActive: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#0ea5e9',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 3,
    zIndex: 2,
  },
  timelinePointInner: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#ffffff',
  },
  timelinePoint: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 3,
    zIndex: 2,
  },
  timelinePointInnerOff: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#94a3b8',
  },
  timelineLine: {
    position: 'absolute',
    left: 22,
    top: 20,
    width: 2,
    height: 175,
    backgroundColor: '#e2e8f0',
    zIndex: 1,
  },
  timelineContent: {
    flex: 1,
  },
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  timelineKm: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0f172a',
  },
  timelineKmOff: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
  },
  badgePending: {
    backgroundColor: 'rgba(14, 165, 233, 0.08)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgePendingText: {
    color: '#0ea5e9',
    fontSize: 9,
    fontWeight: '800',
  },
  timelineDesc: {
    fontSize: 10,
    color: '#64748b',
    marginTop: 2,
    lineHeight: 14,
  },
  timelineWorkshopBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(14, 165, 233, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(14, 165, 233, 0.1)',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginTop: 8,
  },
  timelineWorkshopText: {
    color: '#0ea5e9',
    fontSize: 9,
    fontWeight: '800',
  },
});
