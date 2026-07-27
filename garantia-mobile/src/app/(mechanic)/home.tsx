import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  ScrollView, 
  TouchableOpacity, 
  SafeAreaView, 
  Dimensions, 
  Platform 
} from 'react-native';
import { useRouter } from 'expo-router';
import { 
  Shield, 
  Wrench, 
  ArrowLeft, 
  CheckCircle2, 
  FileText, 
  PlusCircle, 
  Clock, 
  UserCheck,
  Lock
} from 'lucide-react-native';

const { width: windowWidth } = Dimensions.get('window');
const isWeb = Platform.OS === 'web';

export default function MechanicHomeScreen() {
  const router = useRouter();

  const [recentActivities, setRecentActivities] = useState<any[]>([
    { id: "1", type: "inspection", plate: "MEC7899", text: "Vistoria de 35.000 KM registrada com sucesso.", time: "1 hora atrás" },
    { id: "2", type: "warranty", plate: "BRA2E19", text: "Garantia de 50.000 KM ativada e homologada.", time: "3 horas atrás" },
    { id: "3", type: "inspection", plate: "GPP50KM", text: "Vistoria inicial gravada e enviada.", time: "1 dia atrás" }
  ]);
  const [warrantiesToday, setWarrantiesToday] = useState(3);
  const [inspectionsToday, setInspectionsToday] = useState(5);

  useEffect(() => {
    const loadMechanicData = async () => {
      try {
        const response = await fetch('http://localhost:3000/api/database');
        if (response.ok) {
          const db = await response.json();

          // Calculate today's date string
          const today = new Date();
          const d = String(today.getDate()).padStart(2, '0');
          const m = String(today.getMonth() + 1).padStart(2, '0');
          const y = today.getFullYear();
          const todayStr = `${d}/${m}/${y}`;

          // Filter today's counts
          const wToday = db.warranties.filter((w: any) => w.date === todayStr).length;
          const iToday = db.inspections.filter((i: any) => i.date === todayStr).length;
          
          setWarrantiesToday(wToday > 0 ? wToday : 3); // Fallback to 3 if database empty/new
          setInspectionsToday(iToday > 0 ? iToday : 5); // Fallback to 5 if database empty/new

          // Construct recent activities list (only for Lucas Souza)
          const list: any[] = [];
          
          db.warranties.forEach((w: any) => {
            if (w.mechanic === 'Lucas Souza') {
              list.push({
                id: w.id,
                type: 'warranty',
                plate: w.plate,
                text: `Garantia 50k KM ativada para ${w.customer.split(' ')[0]}.`,
                time: w.date === todayStr ? 'Hoje' : w.date,
                timestamp: w.date
              });
            }
          });

          db.inspections.forEach((i: any) => {
            if (i.mechanic === 'Lucas Souza') {
              list.push({
                id: i.id,
                type: 'inspection',
                plate: i.plate,
                text: `Vistoria de ${i.mileage.toLocaleString()} KM registrada.`,
                time: i.date === todayStr ? 'Hoje' : i.date,
                timestamp: i.date
              });
            }
          });

          // Sort by id or date (using unshifted order as modern order)
          // Since they are already unshifted, we can just slice combined
          const sorted = list.slice(0, 4);
          if (sorted.length > 0) {
            setRecentActivities(sorted);
          }
        }
      } catch (error) {
        console.error("Error fetching mechanic dashboard database:", error);
      }
    };

    loadMechanicData();
    const interval = setInterval(loadMechanicData, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <SafeAreaView style={styles.outerContainer}>
      <View style={styles.phoneContainer}>
        {/* Top Status Bar Sim */}
        <View style={styles.statusBarSim}>
          <Text style={styles.statusBarTime}>14:53</Text>
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
          <Text style={styles.navTitle}>Painel do Mecânico</Text>
        </View>

        <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
          {/* Welcome Header */}
          <View style={styles.welcomeHeader}>
            <View>
              <Text style={styles.welcomeText}>Olá, Lucas Souza</Text>
              <Text style={styles.welcomeDate}>Posto Credenciado • Auto Center SP</Text>
            </View>
            <View style={styles.userBadge}>
              <UserCheck size={18} color="#10b981" />
            </View>
          </View>

          {/* Quick Metrics */}
          <View style={styles.metricsRow}>
            <View style={styles.metricCard}>
              <Text style={styles.metricTitle}>ATIVADOS HOJE</Text>
              <Text style={styles.metricValue}>3</Text>
              <Text style={styles.metricSub}>Garantias 50k</Text>
            </View>
            <View style={styles.metricCard}>
              <Text style={styles.metricTitle}>VISTORIAS HOJE</Text>
              <Text style={styles.metricValue}>5</Text>
              <Text style={styles.metricSub}>revisões de sulcos</Text>
            </View>
          </View>

          <Text style={styles.sectionTitle}>Ações de Pista</Text>

          {/* Core Action Menu (Mecânico insere dados) */}
          <View style={styles.actionMenu}>
            <TouchableOpacity 
              style={styles.actionCard}
              onPress={() => router.push('/(mechanic)/new-warranty')}
              activeOpacity={0.8}
            >
              <View style={[styles.iconContainer, { backgroundColor: 'rgba(14, 165, 233, 0.08)' }]}>
                <Shield size={24} color="#0ea5e9" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.actionTitle}>Ativar Nova Garantia</Text>
                <Text style={styles.actionDesc}>Cadastrar cliente, veículo e vincular os 4 pneus instalados.</Text>
              </View>
              <PlusCircle size={20} color="#0ea5e9" />
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.actionCard}
              onPress={() => router.push('/(mechanic)/new-inspection')}
              activeOpacity={0.8}
            >
              <View style={[styles.iconContainer, { backgroundColor: 'rgba(16, 185, 129, 0.08)' }]}>
                <Wrench size={24} color="#10b981" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.actionTitle}>Realizar Nova Vistoria</Text>
                <Text style={styles.actionDesc}>Inserir nova quilometragem e profundidade de sulcos (mm).</Text>
              </View>
              <PlusCircle size={20} color="#10b981" />
            </TouchableOpacity>
          </View>

          <Text style={styles.sectionTitle}>Histórico Recente de Pista</Text>

          {/* Recent Activities List */}
          <View style={{ gap: 12 }}>
            {recentActivities.map(act => (
              <View key={act.id} style={styles.activityCard}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={[styles.activityIconWrapper, { backgroundColor: act.type === 'warranty' ? 'rgba(14, 165, 233, 0.06)' : 'rgba(16, 185, 129, 0.06)' }]}>
                    {act.type === 'warranty' ? (
                      <Shield size={16} color="#0ea5e9" />
                    ) : (
                      <Wrench size={16} color="#10b981" />
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={styles.activityPlate}>{act.plate}</Text>
                        <View style={styles.immutableBadge}>
                          <Lock size={8} color="#64748b" style={{ marginRight: 2 }} />
                          <Text style={styles.immutableText}>IMUTÁVEL</Text>
                        </View>
                      </View>
                      <Text style={styles.activityTime}>{act.time}</Text>
                    </View>
                    <Text style={styles.activityText}>{act.text}</Text>
                  </View>
                </View>
              </View>
            ))}
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
  userBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.12)'
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 12,
    marginVertical: 15,
  },
  metricCard: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
    borderRadius: 16,
    padding: 14,
    shadowColor: '#64748b',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },
  metricTitle: {
    fontSize: 9,
    fontWeight: '850',
    color: '#64748b',
    letterSpacing: 0.5,
  },
  metricValue: {
    fontSize: 24,
    fontWeight: '900',
    color: '#0f172a',
    marginVertical: 4,
  },
  metricSub: {
    fontSize: 9,
    color: '#94a3b8',
    fontWeight: '500',
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '850',
    color: '#0f172a',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 15,
    marginBottom: 12,
  },
  actionMenu: {
    gap: 12,
    marginBottom: 15,
  },
  actionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
    borderRadius: 16,
    padding: 14,
    gap: 12,
    shadowColor: '#64748b',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0f172a',
  },
  actionDesc: {
    fontSize: 10,
    color: '#64748b',
    marginTop: 2,
    lineHeight: 14,
  },
  activityCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
    borderRadius: 12,
    padding: 12,
  },
  activityIconWrapper: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityPlate: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0f172a',
  },
  activityTime: {
    fontSize: 9,
    color: '#94a3b8',
    fontWeight: '500',
  },
  activityText: {
    fontSize: 10,
    color: '#64748b',
    marginTop: 3,
    lineHeight: 13,
  },
  homeIndicatorSim: {
    height: 20,
    width: 140,
    backgroundColor: 'rgba(0,0,0,0.05)',
    alignSelf: 'center',
    borderRadius: 10,
    marginBottom: 8,
  },
  immutableBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  immutableText: {
    fontSize: 7.5,
    fontWeight: '800',
    color: '#64748b',
  },
});
