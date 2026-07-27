import React, { useState } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  TextInput, 
  TouchableOpacity, 
  FlatList, 
  KeyboardAvoidingView, 
  Platform,
  Dimensions
} from 'react-native';
import { useRouter } from 'expo-router';
import { Send, AlertCircle, ArrowLeft } from 'lucide-react-native';

const { width: windowWidth } = Dimensions.get('window');
const isWeb = Platform.OS === 'web';

const INITIAL_MESSAGES = [
  { id: '1', sender: 'system', text: 'Ticket de suporte criado sob ID #GP-4902. Categoria: Garantia de Pneus.', time: '13:50' },
  { id: '2', sender: 'customer', text: 'Boa tarde, o pneu traseiro esquerdo apresentou uma pequena bolha lateral. Posso rodar assim até o posto de revisão parceiro?', time: '13:52' },
  { id: '3', sender: 'admin', text: 'Boa tarde, Sr. Bruno. Não é aconselhável rodar com bolhas laterais pois há risco de estouro. O posto parceiro mais próximo está a 4km. Deseja que solicitemos o reboque de garantia?', time: '13:55' }
];

export default function TicketsScreen() {
  const router = useRouter();

  const [messages, setMessages] = useState(INITIAL_MESSAGES);
  const [inputText, setInputText] = useState('');

  const sendMessage = () => {
    if (!inputText.trim()) return;
    
    const newMsg = {
      id: Date.now().toString(),
      sender: 'customer',
      text: inputText,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, newMsg]);
    setInputText('');

    setTimeout(() => {
      const autoReply = {
        id: (Date.now() + 1).toString(),
        sender: 'admin',
        text: 'Sua mensagem foi entregue à auditoria técnica. Um especialista entrará em contato em breve.',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages(prev => [...prev, autoReply]);
    }, 1500);
  };

  return (
    <KeyboardAvoidingView 
      style={styles.outerContainer} 
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.phoneContainer}>
        {/* Top Status Bar Sim */}
        <View style={styles.statusBarSim}>
          <Text style={styles.statusBarTime}>14:34</Text>
          <View style={styles.statusBarIcons}>
            <View style={styles.batteryIcon} />
          </View>
        </View>

        {/* Header Voltar */}
        <View style={styles.navigationBar}>
          <TouchableOpacity onPress={() => router.push('/(customer)/home')} style={styles.backButton}>
            <ArrowLeft size={18} color="#0EA5E9" />
            <Text style={styles.backText}>Painel</Text>
          </TouchableOpacity>
          <Text style={styles.navTitle}>Suporte Técnico</Text>
        </View>

        {/* Ticket Metadata Bar */}
        <View style={styles.ticketMetaHeader}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={styles.categoryIconBadge}>
              <AlertCircle size={16} color="#f43f5e" />
            </View>
            <View>
              <Text style={styles.ticketCode}>TICKET #GP-4902</Text>
              <Text style={styles.ticketSubject}>Bolha Lateral Detectada</Text>
            </View>
          </View>
          <View style={styles.statusBadgeOpen}>
            <Text style={styles.statusBadgeText}>Ativo</Text>
          </View>
        </View>

        {/* Chat Feed */}
        <FlatList
          data={messages}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.chatScroll}
          renderItem={({ item }) => {
            if (item.sender === 'system') {
              return (
                <View style={styles.systemMessageContainer}>
                  <Text style={styles.systemMessageText}>{item.text}</Text>
                </View>
              );
            }

            const isMe = item.sender === 'customer';
            return (
              <View style={[styles.messageWrapper, isMe ? styles.messageMe : styles.messageOther]}>
                <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleOther]}>
                  <Text style={[styles.messageText, isMe ? styles.textMe : styles.textOther]}>{item.text}</Text>
                  <Text style={styles.messageTime}>{item.time}</Text>
                </View>
              </View>
            );
          }}
        />

        {/* Input box */}
        <View style={styles.inputArea}>
          <TextInput
            style={styles.chatInput}
            placeholder="Escreva sua dúvida técnica..."
            placeholderTextColor="#64748b"
            value={inputText}
            onChangeText={setInputText}
            multiline
          />
          <TouchableOpacity style={styles.sendButton} onPress={sendMessage}>
            <Send size={16} color="#ffffff" />
          </TouchableOpacity>
        </View>

        <View style={styles.homeIndicatorSim} />
      </View>
    </KeyboardAvoidingView>
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
    display: 'flex',
    flexDirection: 'column',
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
  ticketMetaHeader: {
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#64748b',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  categoryIconBadge: {
    backgroundColor: 'rgba(244, 63, 94, 0.08)',
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ticketCode: {
    fontSize: 10,
    fontWeight: '800',
    color: '#f43f5e',
    letterSpacing: 0.5,
  },
  ticketSubject: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
    marginTop: 2,
  },
  statusBadgeOpen: {
    backgroundColor: 'rgba(14, 165, 233, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(14, 165, 233, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusBadgeText: {
    color: '#0ea5e9',
    fontSize: 9,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  chatScroll: {
    padding: 16,
    paddingBottom: 24,
    flexGrow: 1,
  },
  systemMessageContainer: {
    alignItems: 'center',
    marginVertical: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.01)',
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.02)',
  },
  systemMessageText: {
    fontSize: 10,
    color: '#64748b',
    textAlign: 'center',
    fontWeight: '500',
  },
  messageWrapper: {
    flexDirection: 'row',
    marginVertical: 6,
    width: '100%',
  },
  messageMe: {
    justifyContent: 'flex-end',
  },
  messageText: {
    fontSize: 13,
    lineHeight: 17,
  },
  messageWrapper: {
    flexDirection: 'row',
    marginVertical: 6,
    width: '100%',
  },
  messageMe: {
    justifyContent: 'flex-end',
  },
  messageOther: {
    justifyContent: 'flex-start',
  },
  bubble: {
    maxWidth: '80%',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
  },
  bubbleMe: {
    backgroundColor: '#0EA5E9',
    borderBottomRightRadius: 2,
  },
  bubbleOther: {
    backgroundColor: '#e2e8f0',
    borderBottomLeftRadius: 2,
  },
  textMe: {
    color: '#ffffff',
    fontWeight: '500',
  },
  textOther: {
    color: '#0f172a',
  },
  messageTime: {
    fontSize: 8,
    color: 'rgba(0, 0, 0, 0.3)',
    textAlign: 'right',
    marginTop: 4,
  },
  inputArea: {
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.05)',
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  chatInput: {
    flex: 1,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.05)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: '#0f172a',
    fontSize: 13,
    maxHeight: 80,
  },
  sendButton: {
    backgroundColor: '#0EA5E9',
    width: 38,
    height: 38,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
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
