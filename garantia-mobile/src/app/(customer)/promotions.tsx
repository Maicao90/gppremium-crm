import React from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, SafeAreaView, Dimensions, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Shield, ArrowLeft, Compass, Percent, Copy } from 'lucide-react-native';

const { width: windowWidth } = Dimensions.get('window');
const isWeb = Platform.OS === 'web';

export default function PromotionsScreen() {
  const router = useRouter();

  const mockPromos = [
    {
      id: '1',
      title: "Aniversário GP Premium 🎂",
      code: "PARABENS15GP",
      desc: "Ganhe 15% de desconto em pneus e serviços de alinhamento em qualquer posto credenciado GP.",
      validity: "Válido até o fim do mês do seu aniversário"
    },
    {
      id: '2',
      title: "Alinhamento Grátis 🛞",
      code: "ALINHA50K",
      desc: "Na compra de 4 pneus da linha GP Sport, ganhe montagem, balanceamento e alinhamento tridimensional de graça.",
      validity: "Campanha por tempo limitado"
    }
  ];

  return (
    <SafeAreaView style={styles.outerContainer}>
      <View style={styles.phoneContainer}>
        {/* Top Status Bar Sim */}
        <View style={styles.statusBarSim}>
          <Text style={styles.statusBarTime}>14:39</Text>
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
          <Text style={styles.navTitle}>Minhas Ofertas</Text>
        </View>

        <ScrollView style={styles.scroll} contentContainerStyle={styles.contentContainer}>
          <View style={styles.header}>
            <Compass size={32} color="#10b981" />
            <Text style={styles.title}>Campanhas Promocionais</Text>
            <Text style={styles.subtitle}>Cupons e vantagens exclusivas GP Premium</Text>
          </View>

          <View style={{ gap: 16 }}>
            {mockPromos.map(promo => (
              <View key={promo.id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Percent size={18} color="#10b981" />
                    <Text style={styles.promoTitle}>{promo.title}</Text>
                  </View>
                </View>
                
                <Text style={styles.promoDesc}>{promo.desc}</Text>

                {/* Cupom Box */}
                <TouchableOpacity 
                  style={styles.couponBox}
                  onPress={() => alert(`Cupom "${promo.code}" copiado para a área de transferência!`)}
                >
                  <Text style={styles.couponCode}>{promo.code}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Copy size={12} color="#10b981" />
                    <Text style={styles.copyText}>Copiar</Text>
                  </View>
                </TouchableOpacity>

                <Text style={styles.validityText}>{promo.validity}</Text>
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
  card: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#64748b',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  cardHeader: {
    marginBottom: 10,
  },
  promoTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0f172a',
  },
  promoDesc: {
    fontSize: 12,
    color: '#64748b',
    lineHeight: 17,
    marginBottom: 14,
  },
  couponBox: {
    backgroundColor: 'rgba(16, 185, 129, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.12)',
    borderRadius: 8,
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  couponCode: {
    fontSize: 15,
    fontWeight: '800',
    color: '#10b981',
    letterSpacing: 0.5,
  },
  copyText: {
    fontSize: 11,
    color: '#10b981',
    fontWeight: '700',
  },
  validityText: {
    fontSize: 10,
    color: '#94a3b8',
    fontWeight: '500',
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
