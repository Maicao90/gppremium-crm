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
  Modal
} from 'react-native';
import { useRouter } from 'expo-router';
import { 
  Shield, 
  Bell, 
  Compass, 
  FileText, 
  Gift, 
  MessageSquare, 
  AlertTriangle,
  ArrowLeft,
  X,
  CheckCircle2,
  Wrench,
  MapPin
} from 'lucide-react-native';

const { width: windowWidth } = Dimensions.get('window');
const isWeb = Platform.OS === 'web';

interface TireDetail {
  id: string;
  position: string;
  brand: string;
  model: string;
  measure: string;
  dot: string;
  serialCode: string;
  state: 'excellent' | 'good' | 'regular';
  grooveDepth: string;
}

export default function CustomerHomeScreen() {
  const router = useRouter();
  
  // Estado para gerenciar o pneu selecionado e abrir o modal de detalhes
  const [selectedTire, setSelectedTire] = useState<TireDetail | null>(null);

  // Estados para gerenciar as notificações
  const [notificationsModalVisible, setNotificationsModalVisible] = useState(false);
  const [hasUnreadNotifications, setHasUnreadNotifications] = useState(true);

  const defaultWarranty = {
    carModel: "Civic Touring Turbo 2024",
    plate: "MEC7899",
    status: "active",
    startMileage: 31200,
    currentMileage: 36400,
    maxMileage: 81200, 
    expirationDate: "28/05/2028",
    tires: [
      { id: "DE", position: "Dianteiro Esquerdo (DE)", brand: "GP Sport", model: "Premium Max", measure: "205/55 R16", dot: "0524", serialCode: "GP-FL-90812", state: "excellent" as const, grooveDepth: "6.5mm" },
      { id: "DD", position: "Dianteiro Direito (DD)", brand: "GP Sport", model: "Premium Max", measure: "205/55 R16", dot: "0524", serialCode: "GP-FR-90813", state: "excellent" as const, grooveDepth: "6.4mm" },
      { id: "TE", position: "Traseiro Esquerdo (TE)", brand: "GP Sport", model: "Premium Max", measure: "205/55 R16", dot: "0524", serialCode: "GP-RL-90814", state: "good" as const, grooveDepth: "5.2mm" },
      { id: "TD", position: "Traseiro Direito (TD)", brand: "GP Sport", model: "Premium Max", measure: "205/55 R16", dot: "0524", serialCode: "GP-RR-90815", state: "good" as const, grooveDepth: "5.1mm" }
    ]
  };

  const [activeWarranty, setActiveWarranty] = useState<any>(defaultWarranty);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [dbLoading, setDbLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        const res = await fetch('http://localhost:3000/api/database');
        if (res.ok) {
          const db = await res.json();
          // Find Bruno's warranty or the first active one
          const brunoW = db.warranties.find((w: any) => w.customer.includes('Bruno') || w.cpf === '456.123.789-22') || db.warranties[0];
          if (brunoW) {
            setActiveWarranty({
              carModel: brunoW.model,
              plate: brunoW.plate,
              status: brunoW.status,
              startMileage: brunoW.startMileage || 31200,
              currentMileage: brunoW.mileage,
              maxMileage: brunoW.maxMileage || 81200,
              expirationDate: brunoW.expirationDate || "28/05/2028",
              tires: brunoW.tires || []
            });
          }
          if (db.notifications) {
            setNotifications(db.notifications);
          }
        }
      } catch (err) {
        console.error("Error loading database in CustomerHome:", err);
      } finally {
        setDbLoading(false);
      }
    };
    loadData();
    const interval = setInterval(loadData, 3000);
    return () => clearInterval(interval);
  }, []);

  const mileageRemaining = activeWarranty.maxMileage - activeWarranty.currentMileage;
  const progressPercent = ((activeWarranty.currentMileage - activeWarranty.startMileage) / 50000) * 100;

  const openTireDetail = (id: string) => {
    const tire = activeWarranty.tires.find((t: any) => t.id === id);
    if (tire) {
      setSelectedTire(tire);
    }
  };

  const getTireDotStyle = (id: string) => {
    const tire = activeWarranty.tires.find((t: any) => t.id === id);
    if (!tire) return styles.dotExcellent;
    if (tire.state === 'excellent') return styles.dotExcellent;
    if (tire.state === 'good') return styles.dotGood;
    return styles.dotAttention;
  };

  return (
    <SafeAreaView style={styles.outerContainer}>
      <View style={styles.phoneContainer}>
        {/* Top Status Bar Sim */}
        <View style={styles.statusBarSim}>
          <Text style={styles.statusBarTime}>14:40</Text>
          <View style={styles.statusBarIcons}>
            <View style={styles.batteryIcon} />
          </View>
        </View>

        {/* Header Voltar */}
        <View style={styles.navigationBar}>
          <TouchableOpacity onPress={() => router.push('/')} style={styles.backButton}>
            <ArrowLeft size={18} color="#0EA5E9" />
            <Text style={styles.backText}>Sair</Text>
          </TouchableOpacity>
          <Text style={styles.navTitle}>Painel do Cliente</Text>
        </View>

        <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
          {/* Welcome Header */}
          <View style={styles.welcomeHeader}>
            <View>
              <Text style={styles.welcomeText}>Olá, Bruno Santos</Text>
              <Text style={styles.welcomeDate}>Garantia Ativa • MEC7899</Text>
            </View>
            <TouchableOpacity 
              style={styles.notificationBubble}
              onPress={() => {
                setNotificationsModalVisible(true);
                setHasUnreadNotifications(false);
              }}
              activeOpacity={0.7}
            >
              <Bell size={18} color="#0EA5E9" />
              {hasUnreadNotifications && <View style={styles.redDot} />}
            </TouchableOpacity>
          </View>

          {/* 1. WARRANTY CARD */}
          <View style={styles.glowCard}>
            <View style={styles.warrantyHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Shield size={18} color="#0EA5E9" />
                <Text style={styles.warrantyTitle}>GARANTIA ATIVA</Text>
              </View>
              <View style={styles.activeBadge}>
                <Text style={styles.activeBadgeText}>50k KM</Text>
              </View>
            </View>

            <Text style={styles.carName}>{activeWarranty.carModel}</Text>

            {/* Progress */}
            <View style={styles.progressContainer}>
              <View style={styles.progressLabelRow}>
                <Text style={styles.progressLabel}>Inicial: {activeWarranty.startMileage} Km</Text>
                <Text style={styles.progressLabel}>Atual: {activeWarranty.currentMileage} Km</Text>
              </View>
              <View style={styles.progressBarBg}>
                <View style={[styles.progressBarFill, { width: `${progressPercent}%` }]} />
              </View>
              <Text style={styles.remainingText}>Restam {mileageRemaining} KM de cobertura.</Text>
            </View>

            {/* Alert Box */}
            <View style={styles.alertBox}>
              <AlertTriangle size={15} color="#d97706" style={{ marginRight: 8, marginTop: 1 }} />
              <Text style={styles.alertText}>
                Próxima revisão em 3.600 KM ou até 28/11/2026.
              </Text>
            </View>
          </View>

          {/* 2. VISUAL CAR GRID */}
          <Text style={styles.sectionTitle}>Status dos Pneus (Toque para ver)</Text>
          <View style={styles.tiresGrid}>
            <View style={styles.carLayoutWrapper}>
              <View style={styles.carChassis}>
                
                {/* Dianteiros */}
                <View style={styles.tireRow}>
                  <TouchableOpacity style={styles.tireButton} onPress={() => openTireDetail('DE')}>
                    <Text style={styles.tireInitial}>DE</Text>
                    <View style={[styles.statusDot, getTireDotStyle('DE')]} />
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.tireButton} onPress={() => openTireDetail('DD')}>
                    <Text style={styles.tireInitial}>DD</Text>
                    <View style={[styles.statusDot, getTireDotStyle('DD')]} />
                  </TouchableOpacity>
                </View>

                {/* Chassis center */}
                <View style={styles.carBodyVisual} />

                {/* Traseiros */}
                <View style={styles.tireRow}>
                  <TouchableOpacity style={styles.tireButton} onPress={() => openTireDetail('TE')}>
                    <Text style={styles.tireInitial}>TE</Text>
                    <View style={[styles.statusDot, getTireDotStyle('TE')]} />
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.tireButton} onPress={() => openTireDetail('TD')}>
                    <Text style={styles.tireInitial}>TD</Text>
                    <View style={[styles.statusDot, getTireDotStyle('TD')]} />
                  </TouchableOpacity>
                </View>

              </View>
            </View>

            {/* Legenda */}
            <View style={styles.legendContainer}>
              <View style={styles.legendRow}>
                <View style={[styles.legendIndicator, styles.dotExcellent]} />
                <Text style={styles.legendText}>Excelente (&gt;6mm)</Text>
              </View>
              <View style={styles.legendRow}>
                <View style={[styles.legendIndicator, styles.dotGood]} />
                <Text style={styles.legendText}>Bom (4 a 6mm)</Text>
              </View>
              <View style={styles.legendRow}>
                <View style={[styles.legendIndicator, styles.dotAttention]} />
                <Text style={styles.legendText}>Regular (2 a 4mm)</Text>
              </View>
            </View>
          </View>

          {/* Botão de Atalho para Histórico de Revisões */}
          <TouchableOpacity 
            style={styles.revisionsLinkBtn} 
            onPress={() => router.push('/(customer)/inspections')}
            activeOpacity={0.85}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Wrench size={16} color="#0EA5E9" />
              <Text style={styles.revisionsLinkText}>Histórico de Revisões</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={styles.revisionsLinkCount}>2 ativas</Text>
              <Text style={{ color: '#64748b', fontSize: 14 }}>➔</Text>
            </View>
          </TouchableOpacity>

          {/* 3. CORE SERVICES MENU (CONECTADOS TUDO) */}
          <Text style={styles.sectionTitle}>Serviços Integrados</Text>
          <View style={styles.menuGrid}>
            <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/(customer)/terms')}>
              <View style={[styles.menuIconContainer, { backgroundColor: 'rgba(14, 165, 233, 0.05)' }]}>
                <FileText size={20} color="#0EA5E9" />
              </View>
              <Text style={styles.menuLabel}>Termos LGPD</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/(customer)/raffles')}>
              <View style={[styles.menuIconContainer, { backgroundColor: 'rgba(168, 85, 247, 0.05)' }]}>
                <Gift size={20} color="#a855f7" />
              </View>
              <Text style={styles.menuLabel}>Sorteios</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/(customer)/promotions')}>
              <View style={[styles.menuIconContainer, { backgroundColor: 'rgba(16, 185, 129, 0.05)' }]}>
                <Compass size={20} color="#10b981" />
              </View>
              <Text style={styles.menuLabel}>Promoções</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/(customer)/tickets')}>
              <View style={[styles.menuIconContainer, { backgroundColor: 'rgba(244, 63, 94, 0.05)' }]}>
                <MessageSquare size={20} color="#f43f5e" />
              </View>
              <Text style={styles.menuLabel}>Suporte Técnico</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/(customer)/workshops')}>
              <View style={[styles.menuIconContainer, { backgroundColor: 'rgba(14, 165, 233, 0.05)' }]}>
                <MapPin size={20} color="#0EA5E9" />
              </View>
              <Text style={styles.menuLabel}>Oficinas Rede</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/(customer)/inspections')}>
              <View style={[styles.menuIconContainer, { backgroundColor: 'rgba(14, 165, 233, 0.05)' }]}>
                <Wrench size={20} color="#0EA5E9" />
              </View>
              <Text style={styles.menuLabel}>Minhas Revisões</Text>
            </TouchableOpacity>
          </View>

        </ScrollView>

        {/* MODAL DE DETALHES DO PNEU PARA RESOLVER COMPATIBILIDADE BROWSER E ELEVAR DESIGN */}
        <Modal
          visible={selectedTire !== null}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setSelectedTire(null)}
        >
          <View style={styles.modalOverlay}>
            {selectedTire && (
              <View style={styles.modalCard}>
                <View style={styles.modalHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Shield size={18} color="#0EA5E9" />
                    <Text style={styles.modalTitle}>Diagnóstico Técnico</Text>
                  </View>
                  <TouchableOpacity onPress={() => setSelectedTire(null)} style={styles.closeBtn}>
                    <X size={18} color="#64748b" />
                  </TouchableOpacity>
                </View>

                <Text style={styles.modalPosition}>{selectedTire.position}</Text>

                <View style={styles.modalDivider} />

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Marca/Modelo:</Text>
                  <Text style={styles.detailValue}>{selectedTire.brand} {selectedTire.model}</Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Medida Pneu:</Text>
                  <Text style={styles.detailValue}>{selectedTire.measure}</Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>DOT Gravado:</Text>
                  <Text style={styles.detailValue}>{selectedTire.dot}</Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Nº Série Pneu:</Text>
                  <Text style={styles.detailValue}>{selectedTire.serialCode}</Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Profundidade Média:</Text>
                  <Text style={[styles.detailValue, { color: '#10b981', fontWeight: 'bold' }]}>{selectedTire.grooveDepth}</Text>
                </View>

                <View style={styles.statusBanner}>
                  <CheckCircle2 size={16} color="#10b981" />
                  <Text style={styles.statusBannerText}>
                    Pneu validado pelo sistema. Status: {selectedTire.state.toUpperCase()}
                  </Text>
                </View>
              </View>
            )}
          </View>
        </Modal>

        {/* MODAL DE NOTIFICAÇÕES */}
        <Modal
          visible={notificationsModalVisible}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setNotificationsModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Bell size={18} color="#0EA5E9" />
                  <Text style={styles.modalTitle}>Notificações</Text>
                </View>
                <TouchableOpacity onPress={() => setNotificationsModalVisible(false)} style={styles.closeBtn}>
                  <X size={18} color="#64748b" />
                </TouchableOpacity>
              </View>

              <View style={styles.modalDivider} />

              <ScrollView style={{ maxHeight: 320 }}>
                {notifications.length === 0 ? (
                  <Text style={{ textAlign: 'center', color: '#64748b', fontSize: 12, padding: 20 }}>Nenhuma notificação encontrada.</Text>
                ) : (
                  notifications.map((notif: any) => (
                    <TouchableOpacity 
                      key={notif.id}
                      style={styles.notificationItem}
                      onPress={() => {
                        setNotificationsModalVisible(false);
                        if (notif.title.includes('Vistoria') || notif.title.includes('Revisão') || notif.title.includes('revisão')) {
                          router.push('/(customer)/inspections');
                        } else if (notif.title.includes('Sorteio') || notif.title.includes('Cupom')) {
                          router.push('/(customer)/raffles');
                        }
                      }}
                      activeOpacity={0.7}
                    >
                      <View style={[
                        styles.notificationIconContainer,
                        notif.type === 'check' && { backgroundColor: 'rgba(16, 185, 129, 0.08)' },
                        notif.type === 'gift' && { backgroundColor: 'rgba(168, 85, 247, 0.08)' },
                        notif.type === 'shield' && { backgroundColor: 'rgba(14, 165, 233, 0.08)' },
                      ]}>
                        {notif.type === 'check' ? (
                          <CheckCircle2 size={15} color="#10b981" />
                        ) : notif.type === 'gift' ? (
                          <Gift size={15} color="#a855f7" />
                        ) : (
                          <Shield size={15} color="#0ea5e9" />
                        )}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.notificationItemTitle}>{notif.title}</Text>
                        <Text style={styles.notificationItemDesc}>{notif.desc}</Text>
                        <Text style={styles.notificationItemTime}>{notif.time}</Text>
                      </View>
                    </TouchableOpacity>
                  ))
                )}
              </ScrollView>
            </View>
          </View>
        </Modal>

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
  welcomeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 10,
  },
  welcomeText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
  },
  welcomeDate: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
  },
  notificationBubble: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.05)',
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  redDot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#f43f5e',
  },
  glowCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(14, 165, 233, 0.15)',
    borderRadius: 18,
    padding: 18,
    marginVertical: 15,
    shadowColor: '#64748b',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  warrantyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  warrantyTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: '#0ea5e9',
    letterSpacing: 1.5,
  },
  activeBadge: {
    backgroundColor: 'rgba(14, 165, 233, 0.08)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  activeBadgeText: {
    color: '#0ea5e9',
    fontSize: 9,
    fontWeight: '800',
  },
  carName: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
  },
  progressContainer: {
    marginVertical: 14,
  },
  progressLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  progressLabel: {
    fontSize: 10,
    color: '#64748b',
    fontWeight: '600',
  },
  progressBarBg: {
    height: 6,
    backgroundColor: '#e2e8f0',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#0ea5e9',
    borderRadius: 3,
  },
  remainingText: {
    fontSize: 10,
    color: '#64748b',
    marginTop: 6,
  },
  alertBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(217, 119, 6, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(217, 119, 6, 0.12)',
    borderRadius: 8,
    padding: 10,
  },
  alertText: {
    color: '#d97706',
    fontSize: 11,
    fontWeight: '600',
    flex: 1,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0f172a',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 20,
    marginBottom: 12,
  },
  tiresGrid: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.05)',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#64748b',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    marginBottom: 6,
  },
  revisionsLinkBtn: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(14, 165, 233, 0.15)',
    borderRadius: 12,
    padding: 14,
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#64748b',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  revisionsLinkText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0f172a',
  },
  revisionsLinkCount: {
    fontSize: 10,
    fontWeight: '800',
    color: '#0ea5e9',
    backgroundColor: 'rgba(14, 165, 233, 0.08)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  carLayoutWrapper: {
    flex: 1.2,
    alignItems: 'center',
  },
  carChassis: {
    width: 120,
    height: 160,
    backgroundColor: 'rgba(0, 0, 0, 0.005)',
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: 'rgba(0, 0, 0, 0.02)',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  tireRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 6,
  },
  tireButton: {
    width: 28,
    height: 42,
    backgroundColor: '#f8fafc',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  tireInitial: {
    color: '#64748b',
    fontSize: 9,
    fontWeight: '800',
  },
  statusDot: {
    position: 'absolute',
    bottom: -3,
    right: -3,
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: '#ffffff',
  },
  dotExcellent: {
    backgroundColor: '#10b981',
  },
  dotGood: {
    backgroundColor: '#34d399',
  },
  dotAttention: {
    backgroundColor: '#d97706',
  },
  carBodyVisual: {
    height: 50,
    marginHorizontal: 20,
    backgroundColor: 'rgba(14, 165, 233, 0.03)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(14, 165, 233, 0.06)',
  },
  legendContainer: {
    flex: 1,
    paddingLeft: 8,
    gap: 8,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendText: {
    color: '#64748b',
    fontSize: 10,
    fontWeight: '500',
  },
  menuGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  menuItem: {
    width: '48%',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.05)',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    gap: 6,
    shadowColor: '#64748b',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  menuIconContainer: {
    padding: 8,
    borderRadius: 8,
  },
  menuLabel: {
    color: '#0f172a',
    fontSize: 11,
    fontWeight: '700',
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(15, 23, 42, 0.55)', // Semi-transparent slate-900 overlay
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    zIndex: 9999,
  },
  modalCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    padding: 20,
    width: '100%',
    maxWidth: 365,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 6,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0ea5e9',
    letterSpacing: 0.5,
  },
  closeBtn: {
    padding: 4,
  },
  modalPosition: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0f172a',
    marginTop: 10,
  },
  modalDivider: {
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.05)',
    marginVertical: 14,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 4,
  },
  detailLabel: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '600',
  },
  detailValue: {
    fontSize: 12,
    color: '#0f172a',
    fontWeight: '700',
  },
  statusBanner: {
    backgroundColor: 'rgba(16, 185, 129, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.12)',
    borderRadius: 8,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
  },
  statusBannerText: {
    color: '#10b981',
    fontSize: 11,
    fontWeight: '700',
  },
  homeIndicatorSim: {
    height: 20,
    width: 140,
    backgroundColor: 'rgba(0,0,0,0.05)',
    alignSelf: 'center',
    borderRadius: 10,
    marginBottom: 8,
  },
  notificationItem: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  notificationIconContainer: {
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  notificationItemTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0f172a',
  },
  notificationItemDesc: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
    lineHeight: 14,
  },
  notificationItemTime: {
    fontSize: 9,
    color: '#94a3b8',
    fontWeight: '600',
    marginTop: 4,
  },
});
