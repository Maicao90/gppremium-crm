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
  Linking
} from 'react-native';
import { useRouter } from 'expo-router';
import { 
  ArrowLeft, 
  MapPin, 
  Phone, 
  Search, 
  Wrench, 
  Map,
  CheckCircle2,
  ExternalLink
} from 'lucide-react-native';

const { width: windowWidth } = Dimensions.get('window');
const isWeb = Platform.OS === 'web';

interface WorkshopItem {
  id: string;
  name: string;
  city: string;
  neighborhood: string;
  address: string;
  phone: string;
  services: string[];
  distance: string;
}

const AUTHORIZED_WORKSHOPS: WorkshopItem[] = [
  {
    id: "WS-1",
    name: "Auto Center Premium SP",
    city: "São Paulo",
    neighborhood: "Bela Vista",
    address: "Av. Paulista, 1500 - São Paulo, SP",
    phone: "(11) 3211-9000",
    services: ["Alinhamento 3D", "Balanceamento Laser", "Vistoria Homologada GP Premium"],
    distance: "1.2 km de você"
  },
  {
    id: "WS-2",
    name: "Rodas & Cia Campinas",
    city: "Campinas",
    neighborhood: "Cambuí",
    address: "Rua Emílio Ribas, 450 - Campinas, SP",
    phone: "(19) 3251-4000",
    services: ["Alinhamento Computadorizado", "Balanceamento", "Vistoria Homologada GP Premium"],
    distance: "82 km de você"
  },
  {
    id: "WS-3",
    name: "GP Express Guarulhos",
    city: "Guarulhos",
    neighborhood: "Porto da Igreja",
    address: "Rod. Presidente Dutra, Km 222 - Guarulhos, SP",
    phone: "(11) 2461-8000",
    services: ["Montagem Técnica", "Alinhamento 3D", "Vistoria Homologada GP Premium"],
    distance: "14.5 km de você"
  },
  {
    id: "WS-4",
    name: "ABC Pneus Santo André",
    city: "Santo André",
    neighborhood: "Jardim",
    address: "Av. Dom Pedro II, 850 - Santo André, SP",
    phone: "(11) 4433-2000",
    services: ["Alinhamento 3D", "Balanceamento", "Vistoria Homologada GP Premium"],
    distance: "18.1 km de você"
  }
];

export default function WorkshopsScreen() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');

  const filteredWorkshops = AUTHORIZED_WORKSHOPS.filter(ws => 
    ws.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    ws.city.toLowerCase().includes(searchQuery.toLowerCase()) ||
    ws.neighborhood.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleCall = (phone: string) => {
    const cleanPhone = phone.replace(/[^\d]/g, '');
    Linking.openURL(`tel:${cleanPhone}`).catch(() => {
      alert(`Ligando para: ${phone}`);
    });
  };

  const handleDirections = (address: string) => {
    const url = Platform.select({
      ios: `maps:0,0?q=${encodeURIComponent(address)}`,
      android: `geo:0,0?q=${encodeURIComponent(address)}`,
      default: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
    });
    
    Linking.openURL(url).catch(() => {
      alert(`Abrindo rotas para: ${address}`);
    });
  };

  return (
    <SafeAreaView style={styles.outerContainer}>
      <View style={styles.phoneContainer}>
        {/* Status Bar Simulator */}
        <View style={styles.statusBarSim}>
          <Text style={styles.statusBarTime}>14:48</Text>
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
          <Text style={styles.navTitle}>Oficinas Credenciadas</Text>
        </View>

        <ScrollView style={styles.scroll} contentContainerStyle={styles.contentContainer}>
          {/* Header */}
          <View style={styles.header}>
            <MapPin size={32} color="#0EA5E9" style={styles.headerIcon} />
            <Text style={styles.title}>Rede Autorizada</Text>
            <Text style={styles.subtitle}>Encontre uma oficina parceira para fazer sua vistoria</Text>
          </View>

          {/* Search Box */}
          <View style={styles.searchContainer}>
            <Search size={18} color="#64748b" style={styles.searchIcon} />
            <TextInput 
              style={styles.searchInput}
              placeholder="Buscar por cidade, bairro ou nome..."
              placeholderTextColor="#94a3b8"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </View>

          {/* List Section */}
          <Text style={styles.sectionTitle}>Oficinas Credenciadas ({filteredWorkshops.length})</Text>
          
          <View style={{ gap: 14 }}>
            {filteredWorkshops.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>Nenhuma oficina encontrada nesta localidade.</Text>
              </View>
            ) : (
              filteredWorkshops.map(ws => (
                <View key={ws.id} style={styles.workshopCard}>
                  <View style={styles.cardHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.wsName}>{ws.name}</Text>
                      <Text style={styles.wsDistance}>{ws.distance}</Text>
                    </View>
                    <View style={styles.badgeActive}>
                      <Text style={styles.badgeActiveText}>Parceiro Oficial</Text>
                    </View>
                  </View>

                  <View style={styles.divider} />

                  {/* Endereço */}
                  <View style={styles.infoRow}>
                    <MapPin size={14} color="#64748b" style={{ marginTop: 1 }} />
                    <Text style={styles.infoText}>{ws.address}</Text>
                  </View>

                  {/* Telefone */}
                  <TouchableOpacity style={styles.infoRow} onPress={() => handleCall(ws.phone)}>
                    <Phone size={14} color="#0EA5E9" />
                    <Text style={[styles.infoText, styles.linkText]}>{ws.phone}</Text>
                  </TouchableOpacity>

                  {/* Serviços */}
                  <View style={styles.servicesContainer}>
                    <Text style={styles.servicesTitle}>Serviços Disponíveis:</Text>
                    <View style={styles.servicesList}>
                      {ws.services.map((srv, idx) => (
                        <View key={idx} style={styles.serviceItem}>
                          <CheckCircle2 size={10} color="#10b981" />
                          <Text style={styles.serviceText}>{srv}</Text>
                        </View>
                      ))}
                    </View>
                  </View>

                  {/* Actions Buttons */}
                  <View style={styles.actionRow}>
                    <TouchableOpacity 
                      style={styles.btnCall} 
                      onPress={() => handleCall(ws.phone)}
                      activeOpacity={0.8}
                    >
                      <Phone size={14} color="#0ea5e9" style={{ marginRight: 6 }} />
                      <Text style={styles.btnCallText}>Ligar</Text>
                    </TouchableOpacity>

                    <TouchableOpacity 
                      style={styles.btnRoute} 
                      onPress={() => handleDirections(ws.address)}
                      activeOpacity={0.8}
                    >
                      <Map size={14} color="#ffffff" style={{ marginRight: 6 }} />
                      <Text style={styles.btnRouteText}>Como Chegar</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
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
    textAlign: 'center',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
    borderRadius: 10,
    paddingHorizontal: 12,
    marginVertical: 14,
    shadowColor: '#64748b',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 13,
    color: '#0f172a',
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '850',
    color: '#0f172a',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  workshopCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#64748b',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  wsName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0f172a',
  },
  wsDistance: {
    fontSize: 10,
    color: '#0ea5e9',
    fontWeight: '700',
    marginTop: 2,
  },
  badgeActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeActiveText: {
    color: '#10b981',
    fontSize: 9,
    fontWeight: '800',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.05)',
    marginVertical: 12,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginVertical: 4,
  },
  infoText: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '500',
    flex: 1,
  },
  linkText: {
    color: '#0ea5e9',
    fontWeight: '600',
  },
  servicesContainer: {
    marginTop: 12,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    padding: 10,
  },
  servicesTitle: {
    fontSize: 9,
    fontWeight: '800',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  servicesList: {
    gap: 4,
  },
  serviceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  serviceText: {
    fontSize: 10,
    color: '#475569',
    fontWeight: '500',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  btnCall: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(14, 165, 233, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(14, 165, 233, 0.12)',
    borderRadius: 8,
    paddingVertical: 10,
  },
  btnCallText: {
    color: '#0ea5e9',
    fontSize: 11,
    fontWeight: '800',
  },
  btnRoute: {
    flex: 1.2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0ea5e9',
    borderRadius: 8,
    paddingVertical: 10,
    shadowColor: '#0ea5e9',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 2,
  },
  btnRouteText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800',
  },
  emptyContainer: {
    padding: 30,
    alignItems: 'center',
  },
  emptyText: {
    color: '#64748b',
    fontSize: 12,
    textAlign: 'center',
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
