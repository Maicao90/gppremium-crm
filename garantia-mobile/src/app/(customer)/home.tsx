import React, { useState, useCallback, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, SafeAreaView, RefreshControl, ActivityIndicator, Image, Modal } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { LogOut, Bell, Wrench, CheckCircle2, ChevronRight, X } from 'lucide-react-native';
import { api, API_BASE } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { registrarPush, mostrarLocais } from '../../lib/push';

const ROTULO_PROB: Record<string, string> = { desgaste_irregular: 'Desgaste irregular', desalinhamento: 'Desalinhamento', desbalanceamento: 'Desbalanceamento', borracha_rasgada: 'Borracha rasgada', corte_lateral: 'Corte lateral', bolha: 'Bolha', furo: 'Furo', pressao_incorreta: 'Pressão incorreta' };
const ESTADO_LBL: Record<string, string> = { excelente: 'Excelente', bom: 'Bom', regular: 'Regular', ruim: 'Ruim', trocar: 'Precisa trocar' };
const fotoUrl = (u: any) => (u ? (String(u).startsWith('/') ? API_BASE + u : String(u)) : '');
const parseProblemas = (s: any) => { try { return JSON.parse(s || '[]'); } catch { return []; } };

const STATUS: Record<string, { label: string; cor: string }> = {
  pendente: { label: 'Aprovação pendente', cor: '#d9892a' },
  em_analise: { label: 'Em análise', cor: '#e11d48' },
  ativa: { label: 'Ativa', cor: '#16a34a' },
  atencao: { label: 'Em atenção', cor: '#d9892a' },
  reprovada: { label: 'Reprovada', cor: '#e11d48' },
  expirada: { label: 'Expirada', cor: '#64748b' },
  cancelada: { label: 'Cancelada', cor: '#64748b' },
};
const ROTULO_POS: Record<string, string> = { dianteiro_esquerdo: 'Dianteiro Esq.', dianteiro_direito: 'Dianteiro Dir.', traseiro_esquerdo: 'Traseiro Esq.', traseiro_direito: 'Traseiro Dir.', estepe: 'Estepe' };
const fmtKm = (n: any) => Number(n || 0).toLocaleString('pt-BR');
const fmtData = (s: any) => { const d = new Date(s); return isNaN(d.getTime()) ? '' : d.toLocaleDateString('pt-BR'); };

export default function CustomerHome() {
  const router = useRouter();
  const { identidade, sair } = useAuth();
  const [dados, setDados] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [aberta, setAberta] = useState<any>(null); // garantia aberta no detalhe
  const [pneuAberto, setPneuAberto] = useState<any>(null); // pneu aberto (fotos + histórico)

  const jaNotificou = useRef(false);
  const carregar = useCallback(async () => {
    try {
      const d: any = await api('/api/garantia-app/cliente/me');
      setDados(d);
      // Ao abrir o app, mostra na tela do celular os avisos pendentes (notificação local).
      if (!jaNotificou.current) {
        const pend = (d.notificacoes || []).filter((n: any) => !n.enviada);
        if (pend.length) { mostrarLocais(pend); jaNotificou.current = true; }
      }
    } catch { /* mantém */ }
    setLoading(false);
  }, []);
  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));
  useEffect(() => { registrarPush(); }, []);

  const naoLidas = (dados?.notificacoes || []).filter((n: any) => !n.enviada).length;
  const sairApp = async () => { await sair(); router.replace('/'); };

  if (loading) return <SafeAreaView style={[s.container, s.center]}><ActivityIndicator color="#0ea5e9" size="large" /></SafeAreaView>;

  return (
    <SafeAreaView style={s.container}>
      <ScrollView contentContainerStyle={s.scroll} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await carregar(); setRefreshing(false); }} />}>
        <View style={s.header}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Image source={require('../../../assets/logo-gp.png')} style={s.logoImg} resizeMode="contain" />
            <View><Text style={s.hi}>Olá,</Text><Text style={s.nome}>{(identidade?.nome || '').split(' ')[0]}</Text></View>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity onPress={() => router.push('/(customer)/notifications')} style={s.iconBtn}>
              <Bell size={18} color="#64748b" />{naoLidas > 0 && <View style={s.badge}><Text style={s.badgeT}>{naoLidas}</Text></View>}
            </TouchableOpacity>
            <TouchableOpacity onPress={sairApp} style={s.iconBtn}><LogOut size={18} color="#64748b" /></TouchableOpacity>
          </View>
        </View>

        {(dados?.garantias || []).length === 0 && (
          <View style={s.vazio}><Image source={require('../../../assets/logo-gp.png')} style={{ width: 90, height: 56, opacity: 0.55 }} resizeMode="contain" /><Text style={s.vazioT}>Você ainda não tem garantia cadastrada.</Text><Text style={s.vazioS}>Quando a loja ativar a garantia dos seus pneus GP Premium, ela aparece aqui.</Text></View>
        )}

        {(dados?.garantias || []).map((g: any) => {
          const st = STATUS[g.status] || STATUS.pendente;
          const km = g.veiculo?.kmAtual || g.kmInicial;
          const prog = Math.min(100, Math.max(0, ((km - g.kmInicial) / (g.kmMaximo - g.kmInicial)) * 100));
          return (
            <TouchableOpacity key={g.id} style={s.card} activeOpacity={0.85} onPress={() => setAberta(g)}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={s.placa}>{g.veiculo?.placa}</Text>
                <View style={[s.chip, { backgroundColor: st.cor + '22' }]}><Text style={[s.chipT, { color: st.cor }]}>{st.label}</Text></View>
              </View>
              <Text style={s.carro}>{[g.veiculo?.marca, g.veiculo?.modelo].filter(Boolean).join(' ')}</Text>
              <Text style={s.km}>{fmtKm(km)} de {fmtKm(g.kmMaximo)} km</Text>
              <View style={s.barra}><View style={[s.barraFill, { width: `${prog}%` }]} /></View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={s.pneusInfo}>{(g.pneus || []).length} pneu(s) • {(g.revisoes || []).length} revisão(ões)</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}><Text style={s.verMais}>ver detalhes</Text><ChevronRight size={16} color="#0ea5e9" /></View>
              </View>
            </TouchableOpacity>
          );
        })}

        <TouchableOpacity style={s.oficinas} onPress={() => router.push('/(customer)/workshops')}>
          <Text style={s.oficinasT}>📍 Encontrar oficinas autorizadas</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Detalhe da garantia (abre ao tocar no cartão) */}
      <Modal visible={!!aberta} animationType="slide" onRequestClose={() => setAberta(null)}>
        <SafeAreaView style={s.container}>
          <View style={s.modalTop}>
            <Text style={s.modalTitle}>Minha garantia</Text>
            <TouchableOpacity onPress={() => setAberta(null)}><X size={24} color="#0f172a" /></TouchableOpacity>
          </View>
          {aberta && (
            <ScrollView contentContainerStyle={{ padding: 18 }}>
              {/* Veículo + status */}
              <View style={s.card}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={s.placa}>{aberta.veiculo?.placa}</Text>
                  <View style={[s.chip, { backgroundColor: (STATUS[aberta.status] || STATUS.pendente).cor + '22' }]}>
                    <Text style={[s.chipT, { color: (STATUS[aberta.status] || STATUS.pendente).cor }]}>{(STATUS[aberta.status] || STATUS.pendente).label}</Text>
                  </View>
                </View>
                <Text style={s.carro}>{[aberta.veiculo?.marca, aberta.veiculo?.modelo, aberta.veiculo?.ano].filter(Boolean).join(' ')}</Text>
                <Text style={s.detLinha}>Cobertura: {fmtKm(aberta.kmInicial)} → {fmtKm(aberta.kmMaximo)} km</Text>
                <Text style={s.detLinha}>Válida de {fmtData(aberta.dataInicio)} até {fmtData(aberta.dataExpiracao)}</Text>
                <Text style={s.detLinha}>KM atual do carro: {fmtKm(aberta.veiculo?.kmAtual)}</Text>
              </View>

              {/* Pneus (toca pra ver fotos + histórico) */}
              <Text style={s.secao}>Pneus ({(aberta.pneus || []).length})</Text>
              {(aberta.pneus || []).map((p: any) => (
                <TouchableOpacity key={p.id} style={[s.card, p.cancelada && { borderColor: '#e11d48', borderWidth: 1 }]} activeOpacity={0.85}
                  onPress={() => setPneuAberto({ ...p, revisoes: aberta.revisoes || [] })}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={s.pneuPos}>{ROTULO_POS[p.posicao] || p.posicao}</Text>
                    {p.cancelada ? <Text style={s.canc}>garantia cancelada</Text> : <ChevronRight size={16} color="#0ea5e9" />}
                  </View>
                  <Text style={s.detLinha}>{[p.marca, p.modelo, p.medida].filter(Boolean).join(' ')}</Text>
                  <Text style={s.detMuted}>DOT {p.dot || '—'} • Série {p.codigoSerie || '—'} • toque pra ver fotos</Text>
                </TouchableOpacity>
              ))}

              {/* Revisões */}
              <Text style={s.secao}>Revisões ({(aberta.revisoes || []).length})</Text>
              {(aberta.revisoes || []).length === 0 && <Text style={s.detMuted}>Nenhuma revisão registrada ainda.</Text>}
              {(aberta.revisoes || []).map((r: any) => (
                <View key={r.id} style={s.card}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={s.pneuPos}>{fmtData(r.criadoEm)} • {fmtKm(r.km)} km</Text>
                    {r.status === 'aprovada' ? <CheckCircle2 size={16} color="#16a34a" /> : <Text style={s.detMuted}>{r.status}</Text>}
                  </View>
                  {(r.pneus || []).map((rp: any) => (
                    <View key={rp.id} style={s.revPneu}>
                      <Text style={s.revPneuPos}>{ROTULO_POS[rp.posicao] || rp.posicao}</Text>
                      <Text style={s.revPneuSulco}>sulco {String(rp.profundidadeSulco).replace('.', ',')} mm</Text>
                    </View>
                  ))}
                  {r.mecanico ? <Text style={s.detMuted}>Mecânico: {r.mecanico}</Text> : null}
                </View>
              ))}
              <View style={{ height: 20 }} />
            </ScrollView>
          )}

          {/* Detalhe do PNEU (fotos + histórico de sulcos por revisão) */}
          <Modal visible={!!pneuAberto} animationType="slide" onRequestClose={() => setPneuAberto(null)}>
            <SafeAreaView style={s.container}>
              <View style={s.modalTop}>
                <Text style={s.modalTitle}>{pneuAberto ? (ROTULO_POS[pneuAberto.posicao] || pneuAberto.posicao) : 'Pneu'}</Text>
                <TouchableOpacity onPress={() => setPneuAberto(null)}><X size={24} color="#0f172a" /></TouchableOpacity>
              </View>
              {pneuAberto && (
                <ScrollView contentContainerStyle={{ padding: 18 }}>
                  <View style={s.card}>
                    <Text style={s.detLinha}>{[pneuAberto.marca, pneuAberto.modelo, pneuAberto.medida].filter(Boolean).join(' ') || '—'}</Text>
                    <Text style={s.detMuted}>DOT {pneuAberto.dot || '—'} • Série {pneuAberto.codigoSerie || '—'}</Text>
                    {pneuAberto.cancelada ? <Text style={[s.canc, { marginTop: 8 }]}>⛔ Garantia deste pneu cancelada{pneuAberto.canceladaMotivo ? `: ${pneuAberto.canceladaMotivo}` : ''}</Text> : null}
                  </View>

                  {/* Fotos do cadastro */}
                  {[pneuAberto.fotoUrl, pneuAberto.fotoLateralUrl, pneuAberto.fotoBandaUrl].some(Boolean) && (
                    <>
                      <Text style={s.secao}>Fotos do cadastro</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                        {[pneuAberto.fotoUrl, pneuAberto.fotoLateralUrl, pneuAberto.fotoBandaUrl].filter(Boolean).map((u: any, i: number) => (
                          <Image key={i} source={{ uri: fotoUrl(u) }} style={s.foto} resizeMode="cover" />
                        ))}
                      </ScrollView>
                    </>
                  )}

                  {/* Histórico nas revisões */}
                  <Text style={s.secao}>Histórico nas revisões</Text>
                  {(() => {
                    const hist = (pneuAberto.revisoes || [])
                      .map((r: any) => ({ r, rp: (r.pneus || []).find((x: any) => x.posicao === pneuAberto.posicao) }))
                      .filter((h: any) => h.rp);
                    if (hist.length === 0) return <Text style={s.detMuted}>Este pneu ainda não passou por revisão.</Text>;
                    return hist.map(({ r, rp }: any) => {
                      const probs = parseProblemas(rp.problemas).map((k: string) => ROTULO_PROB[k] || k);
                      return (
                        <View key={rp.id} style={s.card}>
                          <Text style={s.pneuPos}>{fmtData(r.criadoEm)} • {fmtKm(r.km)} km</Text>
                          <Text style={s.detLinha}>Sulco: {String(rp.profundidadeSulco).replace('.', ',')} mm • Estado: {ESTADO_LBL[rp.estado] || rp.estado}</Text>
                          {rp.arrancamentoBorracha ? <Text style={s.canc}>⚠ Arrancamento de borracha detectado</Text> : null}
                          {probs.length > 0 ? <Text style={s.detMuted}>Problemas: {probs.join(', ')}</Text> : null}
                          {rp.recomendacao ? <Text style={s.detMuted}>Recomendação: {rp.recomendacao}</Text> : null}
                        </View>
                      );
                    });
                  })()}
                  <View style={{ height: 20 }} />
                </ScrollView>
              )}
            </SafeAreaView>
          </Modal>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  center: { alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 18, paddingTop: 40 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  logoImg: { width: 60, height: 40 },
  hi: { fontSize: 13, color: '#64748b' },
  nome: { fontSize: 18, fontWeight: '900', color: '#0f172a' },
  iconBtn: { padding: 10, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0' },
  badge: { position: 'absolute', top: 2, right: 2, backgroundColor: '#e11d48', minWidth: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  badgeT: { color: '#fff', fontSize: 9, fontWeight: '800' },
  vazio: { alignItems: 'center', padding: 30, backgroundColor: '#fff', borderRadius: 16, marginTop: 10 },
  vazioT: { fontSize: 15, fontWeight: '800', color: '#0f172a', marginTop: 12, textAlign: 'center' },
  vazioS: { fontSize: 13, color: '#64748b', marginTop: 6, textAlign: 'center', lineHeight: 18 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 18, marginBottom: 14, borderWidth: 1, borderColor: 'rgba(0,0,0,0.04)' },
  placa: { fontSize: 18, fontWeight: '900', color: '#0f172a', letterSpacing: 1 },
  chip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  chipT: { fontSize: 11, fontWeight: '800' },
  carro: { fontSize: 13, color: '#64748b', marginTop: 2 },
  km: { fontSize: 13, color: '#0f172a', fontWeight: '700', marginTop: 12 },
  barra: { height: 8, backgroundColor: '#e2e8f0', borderRadius: 4, marginTop: 6, overflow: 'hidden' },
  barraFill: { height: 8, backgroundColor: '#0ea5e9', borderRadius: 4 },
  pneusInfo: { fontSize: 12, color: '#94a3b8', marginTop: 8 },
  rev: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  revT: { flex: 1, fontSize: 12, color: '#475569' },
  verMais: { fontSize: 12, color: '#0ea5e9', fontWeight: '700', marginTop: 8 },
  oficinas: { backgroundColor: '#fff', borderRadius: 14, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: '#e2e8f0' },
  oficinasT: { fontSize: 14, fontWeight: '700', color: '#0ea5e9' },
  modalTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#e2e8f0', backgroundColor: '#fff' },
  modalTitle: { fontSize: 17, fontWeight: '800', color: '#0f172a' },
  detLinha: { fontSize: 13, color: '#334155', marginTop: 6 },
  detMuted: { fontSize: 12, color: '#94a3b8', marginTop: 4 },
  secao: { fontSize: 14, fontWeight: '800', color: '#0f172a', marginTop: 8, marginBottom: 8 },
  pneuPos: { fontSize: 14, fontWeight: '700', color: '#0f172a' },
  canc: { fontSize: 11, fontWeight: '800', color: '#e11d48' },
  revPneu: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  revPneuPos: { fontSize: 12, color: '#475569' },
  revPneuSulco: { fontSize: 12, color: '#0f172a', fontWeight: '700' },
  foto: { width: 130, height: 130, borderRadius: 10, marginRight: 10, backgroundColor: '#e2e8f0' },
});
