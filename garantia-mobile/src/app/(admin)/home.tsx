import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet, Text, View, ScrollView, TouchableOpacity,
  SafeAreaView, TextInput, Dimensions, Platform,
  ActivityIndicator, Animated, KeyboardAvoidingView
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  Shield, ArrowLeft, CheckCircle2, AlertTriangle, Bell,
  Trophy, LifeBuoy, Activity, Check, X, Lock, Sparkles,
  Zap, Send, ChevronRight, ChevronDown, User
} from 'lucide-react-native';

const { width: windowWidth } = Dimensions.get('window');
const isWeb = Platform.OS === 'web';

// ─── AI auto-response templates ───────────────────────────────────────────────
const AI_TEMPLATES: { keywords: string[]; reply: string }[] = [
  {
    keywords: ['rasgo', 'corte', 'dano', 'buraco', 'furo'],
    reply: 'Entendemos sua situação! Para iniciar a análise de dano, precisamos de fotos claras do pneu afetado. Envie imagens pelo app e nossa equipe técnica analisará em até 48h úteis. 📸',
  },
  {
    keywords: ['vistoria', 'revisão', 'revisar', 'inspecionar'],
    reply: 'A vistoria deve ser realizada em um posto parceiro GP credenciado, conforme o intervalo de 12.500 KM ou 12 meses. Acesse a seção "Postos Parceiros" no app para localizar o mais próximo. 📍',
  },
  {
    keywords: ['garantia', 'cobertura', 'cobre', 'coberto'],
    reply: 'A Garantia GP Premium cobre danos estruturais, defeitos de fabricação e separação de lonas nos pneus por até 50.000 KM. Danos por impacto (buracos, meio-fio) também podem ser cobertos mediante análise técnica. 🛡️',
  },
  {
    keywords: ['prazo', 'quando', 'tempo', 'demora'],
    reply: 'Nossa equipe técnica analisa os chamados em até 48h úteis após o envio de todas as informações necessárias. Você receberá uma notificação com a atualização! ⏱️',
  },
  {
    keywords: ['posto', 'parceiro', 'credenciado', 'onde'],
    reply: 'Temos mais de 200 postos parceiros credenciados em todo o Brasil! Acesse a aba "Postos Parceiros" no app para encontrar o mais próximo de você. 🗺️',
  },
];

function getAIReply(customerMessage: string): string {
  const lower = customerMessage.toLowerCase();
  for (const t of AI_TEMPLATES) {
    if (t.keywords.some(k => lower.includes(k))) return t.reply;
  }
  return 'Recebemos sua mensagem! Em breve um especialista GP irá analisá-la com atenção. Caso seja urgente, ligue para nossa central: 0800-GP-PREM. 😊';
}

// ─── Warranty rule engine ──────────────────────────────────────────────────────
function checkWarrantyRules(warranty: any, rules: any): { passed: boolean; failReasons: string[] } {
  const failReasons: string[] = [];
  if (rules.dotMustMatch && warranty.dotRegistered && warranty.dotScanned) {
    if (warranty.dotRegistered !== warranty.dotScanned) {
      failReasons.push(`DOT não coincide (cadastrado: ${warranty.dotRegistered} / escaneado: ${warranty.dotScanned})`);
    }
  }
  if (rules.maxMileageAtRegistration && warranty.mileage > rules.maxMileageAtRegistration) {
    failReasons.push(`KM acima do limite (${warranty.mileage.toLocaleString()} KM > ${rules.maxMileageAtRegistration.toLocaleString()} KM)`);
  }
  if (rules.minGrooveDepth && warranty.tires) {
    for (const tire of warranty.tires) {
      const depth = parseFloat(tire.grooveDepth);
      if (!isNaN(depth) && depth < rules.minGrooveDepth) {
        failReasons.push(`Sulco abaixo do mínimo em ${tire.position || tire.id}: ${tire.grooveDepth} < ${rules.minGrooveDepth}mm`);
      }
    }
  }
  if (rules.requireIntegrity && warranty.tires) {
    for (const tire of warranty.tires) {
      if (tire.state === 'damaged' || tire.state === 'bad') {
        failReasons.push(`Pneu com dano visual: ${tire.position || tire.id}`);
      }
    }
  }
  return { passed: failReasons.length === 0, failReasons };
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function AdminHomeScreen() {
  const router = useRouter();

  const [db, setDb] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  // Push notification
  const [pushTitle, setPushTitle] = useState('');
  const [pushMessage, setPushMessage] = useState('');

  // Notification history filter
  const [notifFilter, setNotifFilter] = useState<'all' | 'push' | 'system'>('all');

  // Raffle
  const [raffleModalVisible, setRaffleModalVisible] = useState(false);
  const [raffleWinner, setRaffleWinner] = useState<any>(null);
  const [rafflePhase, setRafflePhase] = useState<'idle' | 'spinning' | 'revealing' | 'done'>('idle');
  const [spinDisplay, setSpinDisplay] = useState('');
  const winnerScale = useRef(new Animated.Value(0)).current;
  const winnerOpacity = useRef(new Animated.Value(0)).current;

  // Support chat
  const [openTicketId, setOpenTicketId] = useState<string | null>(null);
  const [adminReplyText, setAdminReplyText] = useState('');
  const chatScrollRef = useRef<ScrollView>(null);

  // Rule engine edit
  const [editingRules, setEditingRules] = useState(false);
  const [ruleGroove, setRuleGroove] = useState('4.0');
  const [ruleDot, setRuleDot] = useState(true);
  const [ruleMaxKm, setRuleMaxKm] = useState('50000');
  const [ruleIntegrity, setRuleIntegrity] = useState(true);

  // Custom rules
  const [showNewRuleForm, setShowNewRuleForm] = useState(false);
  const [newRuleName, setNewRuleName] = useState('');
  const [newRuleField, setNewRuleField] = useState('mileage');
  const [newRuleOperator, setNewRuleOperator] = useState<'gt' | 'lt' | 'gte' | 'lte' | 'eq'>('lte');
  const [newRuleValue, setNewRuleValue] = useState('');

  // Alert
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertTitle, setAlertTitle] = useState('');
  const [alertMessage, setAlertMessage] = useState('');
  const showAlert = (t: string, m: string) => { setAlertTitle(t); setAlertMessage(m); setAlertVisible(true); };

  // Birthday engine
  const [birthdayChecked, setBirthdayChecked] = useState(false);
  const [todayBirthdays, setTodayBirthdays] = useState<any[]>([]);

  const fetchDatabase = async () => {
    try {
      const r = await fetch('http://localhost:3000/api/database');
      if (r.ok) {
        const data = await r.json();
        setDb(data);
        if (data.warrantyRules) {
          setRuleGroove(String(data.warrantyRules.minGrooveDepth ?? 4.0));
          setRuleDot(data.warrantyRules.dotMustMatch ?? true);
          setRuleMaxKm(String(data.warrantyRules.maxMileageAtRegistration ?? 50000));
          setRuleIntegrity(data.warrantyRules.requireIntegrity ?? true);
        }
        // Auto-check birthdays once per session
        if (!birthdayChecked) {
          setBirthdayChecked(true);
          runBirthdayCheck(data);
        }
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    fetchDatabase();
    const iv = setInterval(fetchDatabase, 4000);
    return () => clearInterval(iv);
  }, []);

  // ── Birthday Engine ───────────────────────────────────────────────────────────
  const runBirthdayCheck = async (data: any) => {
    if (!data?.warranties) return;
    const today = new Date();
    const todayStr = `${String(today.getDate()).padStart(2,'0')}/${String(today.getMonth()+1).padStart(2,'0')}`;
    const alreadySent = new Set<string>(
      (data.notifications || []).filter((n: any) => n.type === 'birthday').map((n: any) => n.customerId)
    );
    const birthdayWarranties = data.warranties.filter((w: any) => {
      if (!w.birthDate) return false;
      // dd/MM/YYYY → check dd/MM
      const bdStr = w.birthDate.substring(0, 5);
      return bdStr === todayStr && !alreadySent.has(w.id);
    });
    setTodayBirthdays(birthdayWarranties);
    if (birthdayWarranties.length === 0) return;
    // Auto-dispatch birthday notifications
    const newNotifs = birthdayWarranties.map((w: any) => ({
      id: `bday-${w.id}-${Date.now()}`,
      type: 'birthday',
      sender: 'system',
      customerId: w.id,
      title: `🎂 Feliz Aniversário, ${w.customer.split(' ')[0]}!`,
      desc: `Parabéns pelo seu aniversário! 🎉 Sua Garantia GP Premium (${w.plate}) está ativa. Lembre-se: sua próxima vistoria é 100% gratuita e inclusa no contrato — sem nenhum custo para você!`,
      time: 'Hoje — enviada automaticamente',
    }));
    const updatedDb = { ...data, notifications: [...newNotifs, ...(data.notifications || [])] };
    const r = await fetch('http://localhost:3000/api/database', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedDb),
    });
    if (r.ok) setDb(updatedDb);
  };

  const handleManualBirthdayCheck = () => {
    if (!db) return;
    setBirthdayChecked(false);
    runBirthdayCheck(db);
    showAlert('Verificando...', 'O sistema está verificando aniversários de hoje e disparando as notificações automáticas.');
  };

  // ── Persist DB ──────────────────────────────────────────────────────────────
  const saveDb = async (updated: any): Promise<boolean> => {
    try {
      const r = await fetch('http://localhost:3000/api/database', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      });
      if (r.ok) { setDb(updated); return true; }
      return false;
    } catch { return false; }
  };

  // ── Rule Engine ─────────────────────────────────────────────────────────────
  const handleSaveRules = async () => {
    if (!db) return;
    const updatedDb = {
      ...db,
      warrantyRules: {
        minGrooveDepth: parseFloat(ruleGroove) || 4.0,
        dotMustMatch: ruleDot,
        maxMileageAtRegistration: parseInt(ruleMaxKm) || 50000,
        requireIntegrity: ruleIntegrity,
      },
    };
    const ok = await saveDb(updatedDb);
    if (ok) { setEditingRules(false); showAlert('Regras Salvas', 'As regras foram atualizadas com sucesso!'); }
  };

  const handleApplyRules = async () => {
    if (!db) return;
    setActionLoading(true);
    const rules = db.warrantyRules || { minGrooveDepth: 4.0, dotMustMatch: true, maxMileageAtRegistration: 50000, requireIntegrity: true };
    const customRules: any[] = db.warrantyRules?.customRules || [];
    const updatedDb = { ...db, warranties: [...db.warranties], notifications: [...db.notifications] };
    let processed = 0;
    for (let i = 0; i < updatedDb.warranties.length; i++) {
      const w = updatedDb.warranties[i];
      if (w.status !== 'pending' && w.status !== 'under_analysis') continue;
      const { passed, failReasons } = checkWarrantyRules(w, rules);
      // Apply custom rules
      for (const cr of customRules) {
        const val = parseFloat(w[cr.field]);
        const threshold = parseFloat(cr.value);
        if (!isNaN(val) && !isNaN(threshold)) {
          let ok = true;
          if (cr.operator === 'gt') ok = val > threshold;
          else if (cr.operator === 'gte') ok = val >= threshold;
          else if (cr.operator === 'lt') ok = val < threshold;
          else if (cr.operator === 'lte') ok = val <= threshold;
          else if (cr.operator === 'eq') ok = val === threshold;
          if (!ok) { failReasons.push(`${cr.name}: valor ${val} não atende ${cr.operator} ${threshold}`); }
        }
      }
      const finalPassed = failReasons.length === 0;
      updatedDb.warranties[i] = { ...w, status: finalPassed ? 'active' : 'rejected', ruleResult: { passed: finalPassed, failReasons, checkedAt: new Date().toLocaleString('pt-BR') } };
      updatedDb.notifications.unshift({
        id: String(Date.now() + i),
        type: finalPassed ? 'shield' : 'gift',
        sender: 'system',
        title: finalPassed ? `Garantia ${w.id} Aprovada ✅` : `Garantia ${w.id} Reprovada ❌`,
        desc: finalPassed
          ? `Garantia de ${w.customer} (${w.plate}) aprovada automaticamente pelo motor de regras.`
          : `Garantia de ${w.customer} reprovada. Motivo: ${failReasons[0]}`,
        time: 'Agora mesmo',
      });
      processed++;
    }
    const ok = await saveDb(updatedDb);
    setActionLoading(false);
    if (ok) showAlert('Processamento Concluído', `${processed} garantia(s) processada(s) pelas regras automáticas.`);
  };

  // ── Custom Rules ─────────────────────────────────────────────────────────────
  const handleAddCustomRule = async () => {
    if (!newRuleName.trim() || !newRuleValue.trim()) {
      showAlert('Aviso', 'Preencha o nome e o valor da regra.');
      return;
    }
    if (!db) return;
    const newRule = {
      id: `cr-${Date.now()}`,
      name: newRuleName.trim(),
      field: newRuleField,
      operator: newRuleOperator,
      value: newRuleValue.trim(),
    };
    const existingCustomRules = db.warrantyRules?.customRules || [];
    const updatedDb = {
      ...db,
      warrantyRules: {
        ...db.warrantyRules,
        customRules: [...existingCustomRules, newRule],
      },
    };
    const ok = await saveDb(updatedDb);
    if (ok) {
      setNewRuleName('');
      setNewRuleValue('');
      setNewRuleField('mileage');
      setNewRuleOperator('lte');
      setShowNewRuleForm(false);
      showAlert('Regra Criada!', `A regra "${newRule.name}" foi adicionada ao motor.`);
    }
  };

  const handleDeleteCustomRule = async (ruleId: string) => {
    if (!db) return;
    const updatedDb = {
      ...db,
      warrantyRules: {
        ...db.warrantyRules,
        customRules: (db.warrantyRules?.customRules || []).filter((r: any) => r.id !== ruleId),
      },
    };
    await saveDb(updatedDb);
  };

  // ── Push Notification ────────────────────────────────────────────────────────
  const handleSendPush = async () => {
    if (!pushTitle.trim() || !pushMessage.trim()) { showAlert('Aviso', 'Preencha título e mensagem.'); return; }
    if (!db) return;
    setActionLoading(true);
    const updatedDb = {
      ...db,
      notifications: [
        { id: String(Date.now()), type: 'gift', sender: 'admin', title: pushTitle, desc: pushMessage, time: 'Hoje, às ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) },
        ...db.notifications,
      ],
    };
    const ok = await saveDb(updatedDb);
    setActionLoading(false);
    if (ok) { setPushTitle(''); setPushMessage(''); showAlert('Sucesso', 'Notificação enviada!'); }
  };

  // ── Raffle ───────────────────────────────────────────────────────────────────
  const handleRunRaffle = () => {
    if (!db || rafflePhase !== 'idle') return;
    const active = db.warranties.filter((w: any) => w.status === 'active');
    if (active.length === 0) { showAlert('Aviso', 'Nenhuma garantia ativa qualificada. Processe as regras primeiro.'); return; }
    const winner = active[Math.floor(Math.random() * active.length)];
    const names = active.map((w: any) => w.customer);
    setRafflePhase('spinning');
    setRaffleModalVisible(true);
    winnerScale.setValue(0);
    winnerOpacity.setValue(0);

    let idx = 0;
    const all = [...names, ...names, ...names, winner.customer];
    const runSpin = (rem: number, delay: number) => {
      if (rem <= 0) {
        const slowDown = (steps: number, d: number) => {
          if (steps <= 0) {
            setSpinDisplay(winner.customer);
            setRafflePhase('revealing');
            Animated.parallel([
              Animated.spring(winnerScale, { toValue: 1, friction: 5, tension: 80, useNativeDriver: true }),
              Animated.timing(winnerOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
            ]).start(async () => {
              setRafflePhase('done');
              setRaffleWinner(winner);
              const updatedDb = { ...db, notifications: [{ id: String(Date.now()), type: 'gift', sender: 'system', title: '🏆 Sorteio Realizado! ➔', desc: `Parabéns ao cliente ${winner.customer} (Placa: ${winner.plate}) — sorteado no mês!`, time: 'Agora mesmo' }, ...(db.notifications || [])] };
              await saveDb(updatedDb);
            });
            return;
          }
          setSpinDisplay(winner.customer);
          setTimeout(() => slowDown(steps - 1, d + 80), d);
        };
        slowDown(5, 150);
        return;
      }
      setSpinDisplay(all[idx++ % all.length]);
      setTimeout(() => runSpin(rem - 1, rem < 8 ? delay + 30 : delay), delay);
    };
    runSpin(28, 60);
  };

  const handleCloseRaffle = () => { setRaffleModalVisible(false); setRafflePhase('idle'); setRaffleWinner(null); setSpinDisplay(''); };

  // ── Support Chat ─────────────────────────────────────────────────────────────
  const toggleTicket = (id: string) => {
    setOpenTicketId(prev => prev === id ? null : id);
    setAdminReplyText('');
    setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 200);
  };

  const handleTakeover = async (ticketId: string) => {
    if (!db) return;
    const updatedDb = {
      ...db,
      supportTickets: db.supportTickets.map((t: any) =>
        t.id === ticketId ? { ...t, aiActive: false, adminTookOver: true, status: 'admin_active' } : t
      ),
    };
    await saveDb(updatedDb);
  };

  const handleAdminReply = async (ticketId: string) => {
    if (!adminReplyText.trim() || !db) return;
    const ticket = db.supportTickets.find((t: any) => t.id === ticketId);
    if (!ticket) return;
    const newMsg = { id: `m${Date.now()}`, sender: 'admin', text: adminReplyText.trim(), time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) };
    const updatedTicket = { ...ticket, aiActive: false, adminTookOver: true, messages: [...ticket.messages, newMsg], updatedAt: new Date().toLocaleDateString('pt-BR') };
    const updatedDb = { ...db, supportTickets: db.supportTickets.map((t: any) => t.id === ticketId ? updatedTicket : t) };
    setAdminReplyText('');
    await saveDb(updatedDb);
    setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 200);
  };

  const handleResolveTicket = async (ticketId: string) => {
    if (!db) return;
    const updatedDb = { ...db, supportTickets: db.supportTickets.map((t: any) => t.id === ticketId ? { ...t, status: 'resolved', aiActive: false } : t) };
    await saveDb(updatedDb);
    setOpenTicketId(null);
  };

  // ── Computed ─────────────────────────────────────────────────────────────────
  const countWarranties = db?.warranties?.length ?? 0;
  const countInspections = db?.inspections?.length ?? 0;
  const countPending = db?.warranties?.filter((w: any) => w.status === 'pending' || w.status === 'under_analysis').length ?? 0;
  const pendingWarranties = db?.warranties?.filter((w: any) => w.status === 'pending' || w.status === 'under_analysis') ?? [];
  const openTickets = db?.supportTickets?.filter((t: any) => t.status !== 'resolved').length ?? 0;

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.outerContainer}>
      <View style={styles.phoneContainer}>
        {/* Status Bar */}
        <View style={styles.statusBarSim}>
          <Text style={styles.statusBarTime}>{new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</Text>
          <View style={styles.batteryIcon} />
        </View>

        {/* Nav */}
        <View style={styles.navigationBar}>
          <TouchableOpacity onPress={() => router.push('/')} style={styles.backButton}>
            <ArrowLeft size={18} color="#0ea5e9" />
            <Text style={styles.backText}>Sair</Text>
          </TouchableOpacity>
          <Text style={styles.navTitle}>Painel Admin</Text>
        </View>

        <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer} keyboardShouldPersistTaps="handled">

          {/* Header */}
          <View style={styles.adminHeader}>
            <View>
              <Text style={styles.adminWelcome}>Olá, Administrador 👋</Text>
              <Text style={styles.adminSub}>Gestão e Homologação de Contratos</Text>
            </View>
            <View style={styles.adminBadge}><Lock size={18} color="#0ea5e9" /></View>
          </View>

          {/* KPIs */}
          {loading ? <ActivityIndicator size="small" color="#0ea5e9" style={{ marginVertical: 20 }} /> : (
            <View style={styles.metricsRow}>
              <View style={styles.metricCard}>
                <View style={styles.metricHeaderRow}><Shield size={14} color="#0ea5e9" /><Text style={styles.metricTitle}>GARANTIAS</Text></View>
                <Text style={styles.metricValue}>{countWarranties}</Text>
                <Text style={styles.metricSub}>Contratos Totais</Text>
              </View>
              <View style={styles.metricCard}>
                <View style={styles.metricHeaderRow}><Activity size={14} color="#10b981" /><Text style={styles.metricTitle}>VISTORIAS</Text></View>
                <Text style={styles.metricValue}>{countInspections}</Text>
                <Text style={styles.metricSub}>Aferições</Text>
              </View>
              <View style={styles.metricCard}>
                <View style={styles.metricHeaderRow}><AlertTriangle size={14} color="#f59e0b" /><Text style={styles.metricTitle}>PENDENTES</Text></View>
                <Text style={[styles.metricValue, { color: countPending > 0 ? '#f59e0b' : '#0f172a' }]}>{countPending}</Text>
                <Text style={styles.metricSub}>Fila de regras</Text>
              </View>
            </View>
          )}

          {/* ── MÓDULO 1: Motor de Regras ──────────────────────────────────── */}
          <View style={styles.moduleCard}>
            <View style={styles.moduleHeader}>
              <Shield size={18} color="#0ea5e9" />
              <Text style={styles.moduleTitle}>Motor de Regras de Garantia</Text>
            </View>

            <View style={styles.ruleInfoBox}>
              <Text style={styles.ruleInfoText}>
                As garantias são aprovadas ou negadas <Text style={{ fontWeight: '800', color: '#0f172a' }}>automaticamente</Text> com base nas regras abaixo. Nenhuma aprovação manual é necessária.
              </Text>
            </View>

            {/* Rules display */}
            <View style={styles.rulesList}>
              <View style={styles.ruleItem}>
                <CheckCircle2 size={13} color="#10b981" />
                <Text style={styles.ruleLabel}>Sulco mínimo</Text>
                {editingRules ? (
                  <TextInput style={styles.ruleInput} value={ruleGroove} onChangeText={setRuleGroove} keyboardType="decimal-pad" />
                ) : (
                  <Text style={styles.ruleValue}>≥ {ruleGroove} mm</Text>
                )}
              </View>
              <View style={styles.ruleItem}>
                <CheckCircle2 size={13} color="#10b981" />
                <Text style={styles.ruleLabel}>DOT deve coincidir</Text>
                {editingRules ? (
                  <TouchableOpacity onPress={() => setRuleDot(p => !p)} style={[styles.toggleBtn, { backgroundColor: ruleDot ? '#10b981' : '#e2e8f0' }]}>
                    <Text style={[styles.toggleBtnText, { color: ruleDot ? '#fff' : '#64748b' }]}>{ruleDot ? 'SIM' : 'NÃO'}</Text>
                  </TouchableOpacity>
                ) : (
                  <Text style={styles.ruleValue}>{ruleDot ? 'Obrigatório' : 'Opcional'}</Text>
                )}
              </View>
              <View style={styles.ruleItem}>
                <CheckCircle2 size={13} color="#10b981" />
                <Text style={styles.ruleLabel}>KM máximo no cadastro</Text>
                {editingRules ? (
                  <TextInput style={styles.ruleInput} value={ruleMaxKm} onChangeText={setRuleMaxKm} keyboardType="number-pad" />
                ) : (
                  <Text style={styles.ruleValue}>≤ {parseInt(ruleMaxKm).toLocaleString()} KM</Text>
                )}
              </View>
              <View style={[styles.ruleItem, { borderBottomWidth: 0 }]}>
                <CheckCircle2 size={13} color="#10b981" />
                <Text style={styles.ruleLabel}>Integridade visual obrigatória</Text>
                {editingRules ? (
                  <TouchableOpacity onPress={() => setRuleIntegrity(p => !p)} style={[styles.toggleBtn, { backgroundColor: ruleIntegrity ? '#10b981' : '#e2e8f0' }]}>
                    <Text style={[styles.toggleBtnText, { color: ruleIntegrity ? '#fff' : '#64748b' }]}>{ruleIntegrity ? 'SIM' : 'NÃO'}</Text>
                  </TouchableOpacity>
                ) : (
                  <Text style={styles.ruleValue}>{ruleIntegrity ? 'Exigida' : 'Ignorada'}</Text>
                )}
              </View>
            </View>

            {/* Custom Rules Section */}
            <View style={{ marginTop: 14 }}>
              <View style={styles.customRulesHeader}>
                <Text style={styles.sectionMiniTitle}>Regras Personalizadas</Text>
                <TouchableOpacity
                  style={styles.addRuleBtn}
                  onPress={() => setShowNewRuleForm(p => !p)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.addRuleBtnText}>{showNewRuleForm ? '✕ Cancelar' : '+ Nova Regra'}</Text>
                </TouchableOpacity>
              </View>

              {/* Existing custom rules list */}
              {(db?.warrantyRules?.customRules || []).length === 0 && !showNewRuleForm && (
                <Text style={styles.emptyCustomRules}>Nenhuma regra personalizada criada ainda.</Text>
              )}
              {(db?.warrantyRules?.customRules || []).map((cr: any) => (
                <View key={cr.id} style={styles.customRuleChip}>
                  <CheckCircle2 size={12} color="#0ea5e9" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.customRuleChipName}>{cr.name}</Text>
                    <Text style={styles.customRuleChipDetail}>
                      campo: <Text style={{ color: '#0ea5e9', fontWeight: '700' }}>{cr.field}</Text>
                      {'  '}{cr.operator === 'lte' ? '≤' : cr.operator === 'gte' ? '≥' : cr.operator === 'lt' ? '<' : cr.operator === 'gt' ? '>' : '='}
                      {'  '}<Text style={{ color: '#0f172a', fontWeight: '700' }}>{cr.value}</Text>
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => handleDeleteCustomRule(cr.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <X size={14} color="#ef4444" />
                  </TouchableOpacity>
                </View>
              ))}

              {/* New Rule Form */}
              {showNewRuleForm && (
                <View style={styles.newRuleForm}>
                  <Text style={styles.newRuleFormTitle}>🔧 Criar Nova Regra</Text>

                  <Text style={styles.newRuleLabel}>Nome da Regra *</Text>
                  <TextInput
                    style={styles.newRuleInput}
                    placeholder="Ex: Ano mínimo do veículo"
                    placeholderTextColor="#94a3b8"
                    value={newRuleName}
                    onChangeText={setNewRuleName}
                  />

                  <Text style={styles.newRuleLabel}>Campo da Garantia *</Text>
                  <View style={styles.fieldSelectorRow}>
                    {[
                      { key: 'mileage', label: 'KM Atual' },
                      { key: 'year', label: 'Ano' },
                      { key: 'tiresCount', label: 'Qtd. Pneus' },
                    ].map(f => (
                      <TouchableOpacity
                        key={f.key}
                        style={[styles.fieldChip, newRuleField === f.key && styles.fieldChipActive]}
                        onPress={() => setNewRuleField(f.key)}
                        activeOpacity={0.8}
                      >
                        <Text style={[styles.fieldChipText, newRuleField === f.key && styles.fieldChipTextActive]}>{f.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={styles.newRuleLabel}>Operador *</Text>
                  <View style={styles.fieldSelectorRow}>
                    {[
                      { key: 'lte', label: '≤ Máximo' },
                      { key: 'gte', label: '≥ Mínimo' },
                      { key: 'eq', label: '= Igual' },
                    ].map(op => (
                      <TouchableOpacity
                        key={op.key}
                        style={[styles.fieldChip, newRuleOperator === op.key && styles.fieldChipActive]}
                        onPress={() => setNewRuleOperator(op.key as any)}
                        activeOpacity={0.8}
                      >
                        <Text style={[styles.fieldChipText, newRuleOperator === op.key && styles.fieldChipTextActive]}>{op.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={styles.newRuleLabel}>Valor *</Text>
                  <TextInput
                    style={styles.newRuleInput}
                    placeholder="Ex: 2020"
                    placeholderTextColor="#94a3b8"
                    keyboardType="numeric"
                    value={newRuleValue}
                    onChangeText={setNewRuleValue}
                  />

                  <TouchableOpacity style={styles.saveNewRuleBtn} onPress={handleAddCustomRule} activeOpacity={0.8}>
                    <CheckCircle2 size={14} color="#fff" style={{ marginRight: 6 }} />
                    <Text style={styles.saveNewRuleBtnText}>Adicionar Regra ao Motor</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
            {pendingWarranties.length > 0 && (
              <View style={{ marginTop: 12 }}>
                <Text style={styles.sectionMiniTitle}>Aguardando Processamento</Text>
                {pendingWarranties.map((w: any) => (
                  <View key={w.id} style={styles.pendingChip}>
                    <Text style={styles.pendingChipId}>{w.id}</Text>
                    <Text style={styles.pendingChipName}>{w.customer}</Text>
                    <Text style={[styles.pendingChipStatus, { color: w.status === 'pending' ? '#f59e0b' : '#0ea5e9' }]}>
                      {w.status === 'pending' ? 'Novo' : 'Em análise'}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            <View style={styles.ruleActionsRow}>
              <TouchableOpacity
                style={[styles.ruleBtn, { backgroundColor: editingRules ? '#10b981' : 'transparent', borderColor: editingRules ? '#10b981' : '#cbd5e1' }]}
                onPress={() => editingRules ? handleSaveRules() : setEditingRules(true)}
                activeOpacity={0.8}
              >
                <Text style={[styles.ruleBtnText, { color: editingRules ? '#fff' : '#475569' }]}>
                  {editingRules ? '✓ Salvar Regras' : 'Editar Regras'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.ruleBtn, { backgroundColor: '#0ea5e9', borderColor: '#0ea5e9', flex: 1.5 }]}
                onPress={handleApplyRules}
                disabled={actionLoading || pendingWarranties.length === 0}
                activeOpacity={0.8}
              >
                {actionLoading ? <ActivityIndicator size="small" color="#fff" /> : (
                  <>
                    <ChevronRight size={12} color="#fff" style={{ marginRight: 4 }} />
                    <Text style={[styles.ruleBtnText, { color: '#fff' }]}>Aplicar Regras ({pendingWarranties.length})</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* ── MÓDULO 2: Push Notification ───────────────────────────────── */}
          <View style={styles.moduleCard}>
            <View style={styles.moduleHeader}>
              <Bell size={18} color="#f59e0b" />
              <Text style={styles.moduleTitle}>Enviar Notificação Push</Text>
            </View>
            <Text style={styles.inputLabel}>Título do Alerta:</Text>
            <TextInput style={styles.textInput} placeholder="Ex: Sorteio de Junho ativo!" placeholderTextColor="#94a3b8" value={pushTitle} onChangeText={setPushTitle} />
            <Text style={[styles.inputLabel, { marginTop: 10 }]}>Mensagem / Descrição:</Text>
            <TextInput style={[styles.textInput, styles.textArea]} placeholder="Digite a mensagem que o cliente visualizará..." placeholderTextColor="#94a3b8" multiline numberOfLines={3} value={pushMessage} onChangeText={setPushMessage} />
            <TouchableOpacity style={styles.submitButton} onPress={handleSendPush} disabled={actionLoading} activeOpacity={0.8}>
              <CheckCircle2 size={16} color="#fff" style={{ marginRight: 6 }} />
              <Text style={styles.submitBtnText}>Disparar Push</Text>
            </TouchableOpacity>
          </View>

          {/* ── MÓDULO 3: Central de Notificações ────────────────────────── */}
          <View style={styles.moduleCard}>
            <View style={styles.moduleHeader}>
              <Bell size={18} color="#0ea5e9" />
              <Text style={styles.moduleTitle}>Central de Notificações</Text>
              <View style={styles.countBadge}>
                <Text style={styles.countBadgeText}>{db?.notifications?.length ?? 0}</Text>
              </View>
            </View>

            {/* Filter Tabs */}
            <View style={styles.filterRow}>
              {(['all', 'push', 'system'] as const).map(f => (
                <TouchableOpacity key={f} style={[styles.filterTab, notifFilter === f && styles.filterTabActive]} onPress={() => setNotifFilter(f)} activeOpacity={0.8}>
                  <Text style={[styles.filterTabText, notifFilter === f && styles.filterTabTextActive]}>
                    {f === 'all' ? 'Todas' : f === 'push' ? 'Push' : 'Sistema'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {loading ? <ActivityIndicator color="#0ea5e9" /> : !db?.notifications?.length ? (
              <Text style={styles.emptyText}>Nenhuma notificação registrada ainda.</Text>
            ) : (
              <View>
                {db.notifications
                  .filter((n: any) => {
                    if (notifFilter === 'push') return n.sender === 'admin' || !n.sender;
                    if (notifFilter === 'system') return n.sender === 'system' || n.type === 'shield' || n.type === 'check';
                    return true;
                  })
                  .map((notif: any, idx: number, arr: any[]) => {
                    const isLast = idx === arr.length - 1;
                    const iconColor = notif.type === 'check' ? '#10b981' : notif.type === 'shield' ? '#0ea5e9' : '#f59e0b';
                    const senderLabel = notif.sender === 'system' ? 'Sistema' : notif.sender === 'admin' ? 'Admin GP' : 'Push';
                    const senderColor = notif.sender === 'system' ? '#64748b' : '#0ea5e9';
                    return (
                      <View key={notif.id} style={[styles.notifItem, isLast && { borderBottomWidth: 0 }]}>
                        <View style={[styles.notifIcon, { backgroundColor: `${iconColor}15`, borderColor: `${iconColor}25` }]}>
                          {notif.type === 'check' ? <CheckCircle2 size={13} color={iconColor} /> : notif.type === 'shield' ? <Shield size={13} color={iconColor} /> : <Bell size={13} color={iconColor} />}
                        </View>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Text style={styles.notifTitle} numberOfLines={1}>{notif.title}</Text>
                            <View style={[styles.senderBadge, { backgroundColor: notif.sender === 'admin' ? 'rgba(14,165,233,0.08)' : '#f1f5f9' }]}>
                              <Text style={[styles.senderBadgeText, { color: senderColor }]}>{senderLabel}</Text>
                            </View>
                          </View>
                          <Text style={styles.notifDesc} numberOfLines={2}>{notif.desc}</Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 }}>
                            <Send size={9} color="#10b981" />
                            <Text style={styles.notifTime}>Enviada · {notif.time}</Text>
                          </View>
                        </View>
                      </View>
                    );
                  })}
              </View>
            )}
          </View>

          {/* ── MÓDULO 4: Sorteio ─────────────────────────────────────────── */}
          <View style={styles.moduleCard}>
            <View style={styles.moduleHeader}>
              <Trophy size={18} color="#10b981" />
              <Text style={styles.moduleTitle}>Sorteio Mensal de Prêmios</Text>
            </View>
            <Text style={styles.raffleDesc}>
              Escolha aleatória do cliente contemplado na campanha de Garantia Premiada. Apenas garantias com status{' '}
              <Text style={{ fontWeight: '800', color: '#0f172a' }}>Ativa</Text> são qualificadas.
            </Text>
            <View style={styles.raffleStats}>
              <View style={styles.raffleStatChip}>
                <Trophy size={12} color="#10b981" />
                <Text style={styles.raffleStatText}>{db?.warranties?.filter((w: any) => w.status === 'active').length ?? 0} participantes</Text>
              </View>
            </View>
            <TouchableOpacity
              style={[styles.submitButton, { backgroundColor: rafflePhase !== 'idle' ? '#64748b' : '#10b981' }]}
              onPress={handleRunRaffle}
              disabled={rafflePhase !== 'idle'}
              activeOpacity={0.8}
            >
              <Sparkles size={16} color="#fff" style={{ marginRight: 6 }} />
              <Text style={styles.submitBtnText}>{rafflePhase !== 'idle' ? 'Sorteando...' : 'Realizar Sorteio Digital'}</Text>
            </TouchableOpacity>
          </View>

          {/* ── MÓDULO 5: Chamados de Suporte ─────────────────────────────── */}
          <View style={styles.moduleCard}>
            <View style={styles.moduleHeader}>
              <LifeBuoy size={18} color="#8b5cf6" />
              <Text style={styles.moduleTitle}>Chamados de Suporte</Text>
              {openTickets > 0 && (
                <View style={[styles.countBadge, { backgroundColor: 'rgba(139,92,246,0.1)' }]}>
                  <Text style={[styles.countBadgeText, { color: '#8b5cf6' }]}>{openTickets} aberto(s)</Text>
                </View>
              )}
            </View>

            {loading ? <ActivityIndicator color="#8b5cf6" /> : !db?.supportTickets?.length ? (
              <Text style={styles.emptyText}>Nenhum chamado registrado.</Text>
            ) : (
              <View style={{ gap: 10 }}>
                {db.supportTickets.map((ticket: any, idx: number) => {
                  const isOpen = openTicketId === ticket.id;
                  const statusColor = ticket.status === 'open' ? '#8b5cf6' : ticket.status === 'admin_active' ? '#0ea5e9' : ticket.status === 'resolved' ? '#10b981' : '#64748b';
                  const statusLabel = ticket.status === 'open' ? 'Em Aberto' : ticket.status === 'admin_active' ? 'Admin Ativo' : 'Resolvido';
                  const isLast = idx === db.supportTickets.length - 1;

                  return (
                    <View key={ticket.id} style={[styles.ticketCard, isLast && { marginBottom: 0 }]}>
                      {/* Ticket Header — clicável */}
                      <TouchableOpacity style={styles.ticketHeader} onPress={() => toggleTicket(ticket.id)} activeOpacity={0.8}>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Text style={styles.ticketCustomer}>{ticket.customer}</Text>
                            <View style={[styles.statusBadge, { backgroundColor: `${statusColor}12` }]}>
                              <Text style={[styles.statusBadgeText, { color: statusColor }]}>{statusLabel}</Text>
                            </View>
                          </View>
                          <Text style={styles.ticketSubject} numberOfLines={1}>{ticket.subject}</Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 }}>
                            {ticket.aiActive ? (
                              <View style={styles.aiBadge}><Zap size={9} color="#10b981" /><Text style={styles.aiBadgeText}>IA Respondendo</Text></View>
                            ) : (
                              <View style={[styles.aiBadge, { backgroundColor: 'rgba(14,165,233,0.07)', borderColor: 'rgba(14,165,233,0.15)' }]}>
                                <Shield size={9} color="#0ea5e9" />
                                <Text style={[styles.aiBadgeText, { color: '#0ea5e9' }]}>Admin Atendeu</Text>
                              </View>
                            )}
                            <Text style={styles.ticketTime}>{ticket.updatedAt}</Text>
                          </View>
                        </View>
                        <ChevronDown size={16} color="#94a3b8" style={{ transform: [{ rotate: isOpen ? '180deg' : '0deg' }] }} />
                      </TouchableOpacity>

                      {/* Expanded Chat View */}
                      {isOpen && (
                        <View style={styles.chatContainer}>
                          {/* Messages */}
                          <ScrollView
                            ref={chatScrollRef}
                            style={styles.chatMessages}
                            onContentSizeChange={() => chatScrollRef.current?.scrollToEnd({ animated: true })}
                          >
                            {ticket.messages.map((msg: any) => {
                              const isCustomer = msg.sender === 'customer';
                              const isAdmin = msg.sender === 'admin';
                              const isAI = msg.sender === 'ai';
                              return (
                                <View key={msg.id} style={[styles.msgRow, isCustomer && styles.msgRowCustomer]}>
                                  {!isCustomer && (
                                    <View style={[styles.msgAvatar, { backgroundColor: isAdmin ? '#0ea5e9' : '#10b981' }]}>
                                      {isAdmin ? <User size={10} color="#fff" /> : <Zap size={10} color="#fff" />}
                                    </View>
                                  )}
                                  <View style={{ maxWidth: '75%' }}>
                                    {!isCustomer && (
                                      <Text style={styles.msgSenderLabel}>{isAdmin ? 'Admin GP' : 'IA Assistente'}</Text>
                                    )}
                                    <View style={[styles.msgBubble, isCustomer ? styles.msgBubbleCustomer : isAdmin ? styles.msgBubbleAdmin : styles.msgBubbleAI]}>
                                      <Text style={[styles.msgText, isCustomer && styles.msgTextCustomer]}>{msg.text}</Text>
                                    </View>
                                    <Text style={[styles.msgTime, isCustomer && { textAlign: 'right' }]}>{msg.time}</Text>
                                  </View>
                                  {isCustomer && (
                                    <View style={[styles.msgAvatar, { backgroundColor: '#e2e8f0' }]}>
                                      <Text style={{ fontSize: 9, color: '#475569', fontWeight: '700' }}>{ticket.customer.charAt(0)}</Text>
                                    </View>
                                  )}
                                </View>
                              );
                            })}
                          </ScrollView>

                          {/* Action Bar */}
                          {ticket.status !== 'resolved' && (
                            <View style={styles.chatActions}>
                              {ticket.aiActive && (
                                <TouchableOpacity style={styles.takeoverBtn} onPress={() => handleTakeover(ticket.id)} activeOpacity={0.8}>
                                  <User size={13} color="#fff" />
                                  <Text style={styles.takeoverBtnText}>Assumir Atendimento</Text>
                                </TouchableOpacity>
                              )}
                              <View style={styles.replyRow}>
                                <TextInput
                                  style={styles.replyInput}
                                  placeholder="Digite uma resposta..."
                                  placeholderTextColor="#94a3b8"
                                  value={adminReplyText}
                                  onChangeText={setAdminReplyText}
                                  multiline
                                />
                                <TouchableOpacity style={styles.sendBtn} onPress={() => handleAdminReply(ticket.id)} activeOpacity={0.8}>
                                  <Send size={15} color="#fff" />
                                </TouchableOpacity>
                              </View>
                              <TouchableOpacity style={styles.resolveBtn} onPress={() => handleResolveTicket(ticket.id)} activeOpacity={0.8}>
                                <CheckCircle2 size={13} color="#10b981" />
                                <Text style={styles.resolveBtnText}>Marcar como Resolvido</Text>
                              </TouchableOpacity>
                            </View>
                          )}
                          {ticket.status === 'resolved' && (
                            <View style={styles.resolvedBanner}>
                              <CheckCircle2 size={13} color="#10b981" />
                              <Text style={styles.resolvedBannerText}>Chamado encerrado com sucesso</Text>
                            </View>
                          )}
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            )}
          </View>

        </ScrollView>

        {/* ── Raffle Modal ──────────────────────────────────────────────────── */}
        {raffleModalVisible && (
          <View style={styles.modalOverlay}>
            <View style={styles.winnerCard}>
              {rafflePhase === 'spinning' && (
                <>
                  <View style={styles.drumWrapper}><Zap size={32} color="#10b981" /></View>
                  <Text style={styles.winnerCongrats}>🎰 SORTEANDO...</Text>
                  <Text style={styles.winnerSubtitle}>Escolhendo o contemplado</Text>
                  <View style={styles.spinBox}><Text style={styles.spinName} numberOfLines={1}>{spinDisplay}</Text></View>
                  <Text style={styles.spinHint}>Aguarde o resultado do sorteio digital</Text>
                </>
              )}
              {(rafflePhase === 'revealing' || rafflePhase === 'done') && (
                <>
                  <Animated.View style={[styles.trophyWrapper, { transform: [{ scale: winnerScale }], opacity: winnerOpacity }]}>
                    <Trophy size={48} color="#eab308" />
                  </Animated.View>
                  <Animated.Text style={[styles.winnerCongrats, { opacity: winnerOpacity }]}>PARABÉNS! 🎉</Animated.Text>
                  <Animated.Text style={[styles.winnerSubtitle, { opacity: winnerOpacity }]}>Cliente Contemplado no Sorteio</Animated.Text>
                  <Animated.View style={[styles.winnerDetails, { transform: [{ scale: winnerScale }], opacity: winnerOpacity }]}>
                    <Text style={styles.winnerName}>{spinDisplay}</Text>
                    {raffleWinner && (
                      <>
                        <Text style={styles.winnerPlate}>Placa: {raffleWinner.plate}</Text>
                        <Text style={styles.winnerVehicle}>{raffleWinner.model}</Text>
                        <Text style={styles.winnerContract}>Contrato: {raffleWinner.id}</Text>
                      </>
                    )}
                  </Animated.View>
                  <Text style={styles.winnerNote}>🔔 Notificação enviada aos clientes em tempo real.</Text>
                  {rafflePhase === 'done' && (
                    <TouchableOpacity style={styles.winnerCloseBtn} onPress={handleCloseRaffle} activeOpacity={0.8}>
                      <Text style={styles.winnerCloseBtnText}>Concluir e Fechar</Text>
                    </TouchableOpacity>
                  )}
                </>
              )}
            </View>
          </View>
        )}

        {/* ── Alert ────────────────────────────────────────────────────────── */}
        {alertVisible && (
          <View style={styles.alertOverlay}>
            <View style={styles.alertCard}>
              <Text style={styles.alertCardTitle}>{alertTitle}</Text>
              <Text style={styles.alertCardMessage}>{alertMessage}</Text>
              <TouchableOpacity style={styles.alertCardBtn} onPress={() => setAlertVisible(false)} activeOpacity={0.8}>
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

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  outerContainer: { flex: 1, backgroundColor: '#e2e8f0', alignItems: 'center', justifyContent: 'center' },
  phoneContainer: { width: isWeb && windowWidth > 480 ? 430 : '100%', height: isWeb && windowWidth > 480 ? 900 : '100%', backgroundColor: '#f8fafc', borderRadius: isWeb && windowWidth > 480 ? 44 : 0, borderWidth: isWeb && windowWidth > 480 ? 12 : 0, borderColor: '#cbd5e1', overflow: 'hidden', position: 'relative' },
  statusBarSim: { height: 38, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 28, backgroundColor: '#cbd5e1' },
  statusBarTime: { color: '#334155', fontSize: 12, fontWeight: '600' },
  batteryIcon: { width: 20, height: 10, borderRadius: 2, borderWidth: 1, borderColor: '#334155', backgroundColor: '#334155' },
  navigationBar: { height: 48, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.05)', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, justifyContent: 'space-between', backgroundColor: '#cbd5e1' },
  backButton: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  backText: { color: '#334155', fontSize: 14, fontWeight: '600' },
  navTitle: { color: '#334155', fontSize: 15, fontWeight: '800', marginRight: 40 },
  container: { flex: 1 },
  contentContainer: { padding: 16, paddingBottom: 40 },
  adminHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 10, marginBottom: 14 },
  adminWelcome: { fontSize: 17, fontWeight: '800', color: '#0f172a' },
  adminSub: { fontSize: 11, color: '#64748b', marginTop: 2 },
  adminBadge: { backgroundColor: 'rgba(14,165,233,0.08)', width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(14,165,233,0.12)' },
  metricsRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  metricCard: { flex: 1, backgroundColor: '#fff', borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)', borderRadius: 14, padding: 10 },
  metricHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metricTitle: { fontSize: 8, fontWeight: '800', color: '#64748b', letterSpacing: 0.5 },
  metricValue: { fontSize: 22, fontWeight: '900', color: '#0f172a', marginVertical: 4 },
  metricSub: { fontSize: 8, color: '#94a3b8', fontWeight: '500' },
  moduleCard: { backgroundColor: '#fff', borderRadius: 18, borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)', padding: 16, marginBottom: 14, shadowColor: '#64748b', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.04, shadowRadius: 10, elevation: 2 },
  moduleHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', paddingBottom: 12, marginBottom: 12 },
  moduleTitle: { fontSize: 13.5, fontWeight: '800', color: '#0f172a', flex: 1 },
  emptyText: { fontSize: 12, color: '#94a3b8', textAlign: 'center', paddingVertical: 12 },
  countBadge: { backgroundColor: 'rgba(14,165,233,0.1)', borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 },
  countBadgeText: { fontSize: 10, fontWeight: '800', color: '#0ea5e9' },
  // Rule engine
  ruleInfoBox: { backgroundColor: 'rgba(16,185,129,0.06)', borderRadius: 10, padding: 10, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(16,185,129,0.12)' },
  ruleInfoText: { fontSize: 10.5, color: '#475569', lineHeight: 15 },
  rulesList: { borderWidth: 1, borderColor: '#f1f5f9', borderRadius: 12, overflow: 'hidden' },
  ruleItem: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  ruleLabel: { fontSize: 11, color: '#475569', flex: 1 },
  ruleValue: { fontSize: 11, fontWeight: '700', color: '#0f172a' },
  ruleInput: { fontSize: 11, fontWeight: '700', color: '#0ea5e9', borderBottomWidth: 1, borderBottomColor: '#0ea5e9', minWidth: 50, textAlign: 'right', paddingVertical: 2 },
  toggleBtn: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  toggleBtnText: { fontSize: 10, fontWeight: '800' },
  sectionMiniTitle: { fontSize: 10, fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  pendingChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#f8fafc', borderRadius: 8, padding: 8, marginBottom: 4, borderWidth: 1, borderColor: '#e2e8f0' },
  pendingChipId: { fontSize: 9, fontWeight: '700', color: '#475569', backgroundColor: '#e2e8f0', paddingHorizontal: 4, paddingVertical: 1, borderRadius: 4 },
  pendingChipName: { flex: 1, fontSize: 11, color: '#0f172a', fontWeight: '600' },
  pendingChipStatus: { fontSize: 9, fontWeight: '700' },
  ruleActionsRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  ruleBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 10, borderWidth: 1 },
  ruleBtnText: { fontSize: 11, fontWeight: '700' },
  // Notifications
  filterRow: { flexDirection: 'row', gap: 6, marginBottom: 12 },
  filterTab: { paddingVertical: 5, paddingHorizontal: 12, borderRadius: 20, backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: 'transparent' },
  filterTabActive: { backgroundColor: 'rgba(14,165,233,0.08)', borderColor: 'rgba(14,165,233,0.2)' },
  filterTabText: { fontSize: 11, fontWeight: '600', color: '#64748b' },
  filterTabTextActive: { color: '#0ea5e9', fontWeight: '700' },
  notifItem: { flexDirection: 'row', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f8fafc', alignItems: 'flex-start' },
  notifIcon: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', borderWidth: 1, flexShrink: 0 },
  notifTitle: { fontSize: 11.5, fontWeight: '750', color: '#0f172a', flex: 1 },
  notifDesc: { fontSize: 10, color: '#64748b', marginTop: 2, lineHeight: 14 },
  notifTime: { fontSize: 9, color: '#94a3b8', fontWeight: '500' },
  senderBadge: { borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2 },
  senderBadgeText: { fontSize: 9, fontWeight: '700' },
  // Push
  inputLabel: { fontSize: 11, fontWeight: '700', color: '#475569', marginBottom: 5 },
  textInput: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, padding: 10, fontSize: 12, color: '#0f172a' },
  textArea: { height: 60, textAlignVertical: 'top' },
  submitButton: { backgroundColor: '#0ea5e9', borderRadius: 10, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 12, shadowColor: '#0ea5e9', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 6, elevation: 2 },
  submitBtnText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  // Raffle
  raffleDesc: { fontSize: 11, color: '#64748b', lineHeight: 16, marginBottom: 10 },
  raffleStats: { flexDirection: 'row', marginBottom: 6 },
  raffleStatChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(16,185,129,0.08)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  raffleStatText: { fontSize: 10, color: '#10b981', fontWeight: '700' },
  // Support tickets
  ticketCard: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 14, overflow: 'hidden', backgroundColor: '#fff' },
  ticketHeader: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8 },
  ticketCustomer: { fontSize: 12.5, fontWeight: '800', color: '#0f172a' },
  ticketSubject: { fontSize: 10.5, color: '#64748b', marginTop: 2 },
  ticketTime: { fontSize: 8.5, color: '#94a3b8' },
  statusBadge: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  statusBadgeText: { fontSize: 9, fontWeight: '750' },
  aiBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(16,185,129,0.08)', borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2, borderWidth: 1, borderColor: 'rgba(16,185,129,0.15)' },
  aiBadgeText: { fontSize: 8.5, fontWeight: '700', color: '#10b981' },
  chatContainer: { borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  chatMessages: { maxHeight: 220, padding: 10, backgroundColor: '#f8fafc' },
  msgRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, marginBottom: 10 },
  msgRowCustomer: { flexDirection: 'row-reverse' },
  msgAvatar: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  msgSenderLabel: { fontSize: 8.5, fontWeight: '700', color: '#64748b', marginBottom: 3 },
  msgBubble: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8 },
  msgBubbleCustomer: { backgroundColor: '#0ea5e9', borderBottomRightRadius: 4 },
  msgBubbleAdmin: { backgroundColor: '#dbeafe', borderBottomLeftRadius: 4 },
  msgBubbleAI: { backgroundColor: '#d1fae5', borderBottomLeftRadius: 4 },
  msgText: { fontSize: 11, color: '#0f172a', lineHeight: 15 },
  msgTextCustomer: { color: '#fff' },
  msgTime: { fontSize: 8, color: '#94a3b8', marginTop: 2 },
  chatActions: { padding: 10, backgroundColor: '#fff', gap: 8 },
  takeoverBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: '#8b5cf6', borderRadius: 8, paddingVertical: 8 },
  takeoverBtnText: { fontSize: 11, fontWeight: '800', color: '#fff' },
  replyRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-end' },
  replyInput: { flex: 1, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, padding: 8, fontSize: 11, color: '#0f172a', maxHeight: 60 },
  sendBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#0ea5e9', alignItems: 'center', justifyContent: 'center' },
  resolveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 6, borderWidth: 1, borderColor: 'rgba(16,185,129,0.3)', borderRadius: 8, backgroundColor: 'rgba(16,185,129,0.06)' },
  resolveBtnText: { fontSize: 11, fontWeight: '700', color: '#10b981' },
  resolvedBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, padding: 10, backgroundColor: 'rgba(16,185,129,0.06)' },
  resolvedBannerText: { fontSize: 11, color: '#10b981', fontWeight: '700' },
  // Raffle modal
  modalOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15,23,42,0.82)', justifyContent: 'center', alignItems: 'center', padding: 24, zIndex: 999999 },
  winnerCard: { backgroundColor: '#fff', borderRadius: 24, padding: 24, width: '90%', maxWidth: 360, alignItems: 'center', minHeight: 280, justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.2, shadowRadius: 24, elevation: 5 },
  drumWrapper: { width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(16,185,129,0.1)', alignItems: 'center', justifyContent: 'center', marginBottom: 16, borderWidth: 2, borderColor: 'rgba(16,185,129,0.3)' },
  spinBox: { backgroundColor: '#0f172a', borderRadius: 14, paddingHorizontal: 20, paddingVertical: 18, marginVertical: 16, width: '100%', alignItems: 'center', minHeight: 64, justifyContent: 'center', borderWidth: 2, borderColor: '#10b981' },
  spinName: { fontSize: 15, fontWeight: '900', color: '#10b981', textAlign: 'center', letterSpacing: 0.5 },
  spinHint: { fontSize: 10, color: '#94a3b8', textAlign: 'center' },
  trophyWrapper: { width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(234,179,8,0.08)', alignItems: 'center', justifyContent: 'center', marginBottom: 16, borderWidth: 1, borderColor: 'rgba(234,179,8,0.15)' },
  winnerCongrats: { fontSize: 22, fontWeight: '900', color: '#eab308', letterSpacing: 1 },
  winnerSubtitle: { fontSize: 12, color: '#64748b', fontWeight: '600', marginTop: 2, marginBottom: 20 },
  winnerDetails: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 16, padding: 16, width: '100%', alignItems: 'center', marginBottom: 16 },
  winnerName: { fontSize: 16, fontWeight: '850', color: '#0f172a', textAlign: 'center' },
  winnerPlate: { fontSize: 12, color: '#0ea5e9', fontWeight: '750', marginTop: 6 },
  winnerVehicle: { fontSize: 11, color: '#64748b', marginTop: 2, textAlign: 'center' },
  winnerContract: { fontSize: 10, color: '#94a3b8', marginTop: 8, fontWeight: '600' },
  winnerNote: { fontSize: 10.5, color: '#94a3b8', textAlign: 'center', lineHeight: 14, marginBottom: 16 },
  winnerCloseBtn: { backgroundColor: '#0ea5e9', borderRadius: 10, paddingVertical: 12, width: '100%', alignItems: 'center' },
  winnerCloseBtnText: { color: '#fff', fontSize: 12.5, fontWeight: '800' },
  // Alert
  alertOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15,23,42,0.65)', alignItems: 'center', justifyContent: 'center', padding: 24, zIndex: 99999 },
  alertCard: { backgroundColor: '#fff', borderRadius: 18, borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)', padding: 22, width: '85%', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 20, elevation: 5 },
  alertCardTitle: { fontSize: 16, fontWeight: '800', color: '#0f172a', marginBottom: 8, textAlign: 'center' },
  alertCardMessage: { fontSize: 12, color: '#64748b', textAlign: 'center', marginBottom: 20, lineHeight: 16 },
  alertCardBtn: { backgroundColor: '#0ea5e9', borderRadius: 10, paddingVertical: 12, width: '100%', alignItems: 'center' },
  alertCardBtnText: { color: '#fff', fontWeight: '800', fontSize: 13, letterSpacing: 0.5 },
  homeIndicatorSim: { height: 20, width: 140, backgroundColor: 'rgba(0,0,0,0.05)', alignSelf: 'center', borderRadius: 10, marginBottom: 8 },
  // Custom rules
  customRulesHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  addRuleBtn: { backgroundColor: 'rgba(14,165,233,0.08)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: 'rgba(14,165,233,0.2)' },
  addRuleBtnText: { fontSize: 11, fontWeight: '800', color: '#0ea5e9' },
  emptyCustomRules: { fontSize: 11, color: '#94a3b8', textAlign: 'center', paddingVertical: 8, fontStyle: 'italic' },
  customRuleChip: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(14,165,233,0.04)', borderRadius: 10, padding: 10, marginBottom: 6, borderWidth: 1, borderColor: 'rgba(14,165,233,0.12)' },
  customRuleChipName: { fontSize: 11.5, fontWeight: '750', color: '#0f172a' },
  customRuleChipDetail: { fontSize: 10, color: '#64748b', marginTop: 2 },
  newRuleForm: { backgroundColor: '#f8fafc', borderRadius: 14, padding: 14, marginTop: 10, borderWidth: 1, borderColor: '#e2e8f0', gap: 6 },
  newRuleFormTitle: { fontSize: 13, fontWeight: '800', color: '#0f172a', marginBottom: 4 },
  newRuleLabel: { fontSize: 10.5, fontWeight: '700', color: '#475569', marginTop: 4 },
  newRuleInput: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 12, color: '#0f172a', marginTop: 4 },
  fieldSelectorRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 4 },
  fieldChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: '#e2e8f0', borderWidth: 1, borderColor: 'transparent' },
  fieldChipActive: { backgroundColor: 'rgba(14,165,233,0.1)', borderColor: '#0ea5e9' },
  fieldChipText: { fontSize: 10.5, fontWeight: '600', color: '#64748b' },
  fieldChipTextActive: { color: '#0ea5e9', fontWeight: '800' },
  saveNewRuleBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0ea5e9', borderRadius: 10, paddingVertical: 10, marginTop: 8 },
  saveNewRuleBtnText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  // Birthday module
  birthdayInfoBox: { backgroundColor: 'rgba(236,72,153,0.05)', borderRadius: 10, padding: 10, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(236,72,153,0.12)' },
  birthdayInfoText: { fontSize: 10.5, color: '#475569', lineHeight: 15 },
  noBirthdayBox: { alignItems: 'center', paddingVertical: 16 },
  noBirthdayEmoji: { fontSize: 28, marginBottom: 6 },
  noBirthdayText: { fontSize: 12, fontWeight: '700', color: '#475569' },
  noBirthdayHint: { fontSize: 10, color: '#94a3b8', marginTop: 3, textAlign: 'center' },
  birthdayCard: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(236,72,153,0.04)', borderRadius: 12, padding: 10, borderWidth: 1, borderColor: 'rgba(236,72,153,0.12)' },
  birthdayAvatarCircle: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#ec4899', alignItems: 'center', justifyContent: 'center' },
  birthdayAvatarText: { fontSize: 15, fontWeight: '900', color: '#fff' },
  birthdayName: { fontSize: 12, fontWeight: '800', color: '#0f172a' },
  birthdayDetail: { fontSize: 10, color: '#64748b', marginTop: 1 },
  birthdayDate: { fontSize: 10, color: '#ec4899', fontWeight: '700', marginTop: 2 },
  birthdaySentBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(16,185,129,0.08)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3 },
  birthdaySentText: { fontSize: 9, fontWeight: '700', color: '#10b981' },
});
