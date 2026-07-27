import React from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, SafeAreaView, Dimensions, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Shield, ArrowLeft, Gift, Ticket } from 'lucide-react-native';

const { width: windowWidth } = Dimensions.get('window');
const isWeb = Platform.OS === 'web';

export default function RafflesScreen() {
  const router = useRouter();

  const mockRaffle = {
    title: "Sorteio Junho GP Premium 🎟️",
    desc: "Concorra a um jogo de 4 pneus esportivos novos da nossa linha de alta performance.",
    drawDate: "15/06/2026",
    ticketNumber: "TKT-50K-89212",
    status: "Qualificado"
  };

  return (
    <SafeAreaView style={styles.outerContainer}>
      <View style={styles.phoneContainer}>
        {/* Top Status Bar Sim */}
        <View style={styles.statusBarSim}>
          <Text style={styles.statusBarTime}>14:38</Text>
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
          <Text style={styles.navTitle}>Meus Sorteios</Text>
        </View>

        <ScrollView style={styles.scroll} contentContainerStyle={styles.contentContainer}>
          <View style={styles.header}>
            <Gift size={32} color="#a855f7" />
            <Text style={styles.title}>Sorteios Corporativos</Text>
            <Text style={styles.subtitle}>Sua fidelidade premiada pela GP Premium</Text>
          </View>

          {/* Card do Sorteio Ativo */}
          <View style={styles.glowCard}>
            <View style={styles.cardHeader}>
              <Text style={styles.raffleBadge}>ATIVO</Text>
              <Text style={styles.drawDate}>Data: {mockRaffle.drawDate}</Text>
            </View>
            
            <Text style={styles.raffleTitle}>{mockRaffle.title}</Text>
            <Text style={styles.raffleDesc}>{mockRaffle.desc}</Text>

            {/* Bilhete Gerado */}
            <View style={styles.ticketBox}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ticket size={16} color="#a855f7" />
                <Text style={styles.ticketLabel}>SEU NÚMERO DO BILHETE:</Text>
              </View>
              <Text style={styles.ticketNumber}>{mockRaffle.ticketNumber}</Text>
            </View>

            <View style={styles.statusBox}>
              <Text style={styles.statusText}>Status de Participação: </Text>
              <Text style={styles.statusValue}>{mockRaffle.status}</Text>
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
  },
  glowCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(168, 85, 247, 0.15)',
    borderRadius: 18,
    padding: 20,
    shadowColor: '#64748b',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  raffleBadge: {
    backgroundColor: 'rgba(168, 85, 247, 0.08)',
    color: '#a855f7',
    fontSize: 10,
    fontWeight: '800',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  drawDate: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '600',
  },
  raffleTitle: {
    fontSize: 16,
    fontWeight: '850',
    color: '#0f172a',
    marginBottom: 6,
  },
  raffleDesc: {
    fontSize: 12,
    color: '#64748b',
    lineHeight: 17,
    marginBottom: 20,
  },
  ticketBox: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.03)',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
    marginBottom: 14,
  },
  ticketLabel: {
    fontSize: 10,
    color: '#64748b',
    fontWeight: '800',
  },
  ticketNumber: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0f172a',
    marginTop: 6,
    letterSpacing: 1,
  },
  statusBox: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  statusText: {
    fontSize: 12,
    color: '#64748b',
  },
  statusValue: {
    fontSize: 12,
    color: '#10b981',
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
});
