import React, { useState, useCallback, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, RefreshControl, ActivityIndicator, Image, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { LogOut, Bell, CheckCircle2, XCircle, ChevronRight, X } from 'lucide-react-native';
import { api, API_BASE } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { registrarPush, mostrarLocais } from '../../lib/push';

const ROTULO_PROB: Record<string, string> = {
  desgaste_irregular: 'Desgaste irregular',
  desalinhamento: 'Desalinhamento',
  desbalanceamento: 'Desbalanceamento',
  borracha_rasgada: 'Borracha rasgada',
  corte_lateral: 'Corte lateral',
  bolha: 'Bolha',
  furo: 'Furo',
  pressao_incorreta: 'Pressão incorreta',
};

const ESTADO_LBL: Record<string, string> = {
  excelente: 'Excelente',
  bom: 'Bom',
  regular: 'Regular',
  ruim: 'Ruim',
  trocar: 'Precisa trocar',
};

const STATUS: Record<string, { label: string; cor: string }> = {
  pendente: { label: 'Aprovação pendente', cor: '#d9892a' },
  em_analise: { label: 'Em análise', cor: '#e11d48' },
  ativa: { label: 'Ativa', cor: '#16a34a' },
  atencao: { label: 'Em atenção', cor: '#d9892a' },
  reprovada: { label: 'Reprovada', cor: '#e11d48' },
  expirada: { label: 'Expirada', cor: '#64748b' },
  cancelada: { label: 'Cancelada', cor: '#64748b' },
};

const ROTULO_POS: Record<string, string> = {
  dianteiro_esquerdo: 'Dianteiro esquerdo',
  dianteiro_direito: 'Dianteiro direito',
  traseiro_esquerdo: 'Traseiro esquerdo',
  traseiro_direito: 'Traseiro direito',
  estepe: 'Estepe',
};

const fotoUrl = (u: any) => (u ? (String(u).startsWith('/') ? API_BASE + u : String(u)) : '');
const fmtKm = (n: any) => Number(n || 0).toLocaleString('pt-BR');
const fmtData = (s: any) => {
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('pt-BR');
};
const parseProblemas = (s: any) => {
  try { return JSON.parse(s || '[]'); } catch { return []; }
};

type GarantiaApp = any;

export default function CustomerHome() {
  const router = useRouter();
  const { identidade, sair } = useAuth();
  const [dados, setDados] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [aberta, setAberta] = useState<GarantiaApp | null>(null);
  const [pneuAberto, setPneuAberto] = useState<any>(null);
  const jaNotificou = useRef(false);

  const carregar = useCallback(async () => {
    try {
      const d: any = await api('/api/garantia-app/cliente/me');
      setDados(d);
      if (!jaNotificou.current) {
        const pendentes = (d.notificacoes || []).filter((n: any) => !n.lidaNoApp);
        if (pendentes.length) {
          mostrarLocais(pendentes);
          jaNotificou.current = true;
        }
      }
    } catch {
      // mantem o ultimo estado na tela
    }
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));
  useEffect(() => { registrarPush(); }, []);

  const naoLidas = (dados?.notificacoes || []).filter((n: any) => !n.lidaNoApp).length;
  const sairApp = async () => {
    await sair();
    router.replace('/');
  };

  if (loading) {
    return (
      <SafeAreaView style={[s.container, s.center]}>
        <ActivityIndicator color="#0ea5e9" size="large" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      <ScrollView
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await carregar(); setRefreshing(false); }} />}
      >
        <Image source={require('../../../assets/logo-premium.png')} style={s.logoTopo} resizeMode="contain" />

        <View style={s.header}>
          <View>
            <Text style={s.hi}>Olá,</Text>
            <Text style={s.nome}>{(identidade?.nome || '').split(' ')[0]}</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity onPress={() => router.push('/(customer)/notifications')} style={s.iconBtn}>
              <Bell size={18} color="#64748b" />
              {naoLidas > 0 && <View style={s.badge}><Text style={s.badgeT}>{naoLidas}</Text></View>}
            </TouchableOpacity>
            <TouchableOpacity onPress={sairApp} style={s.iconBtn}>
              <LogOut size={18} color="#64748b" />
            </TouchableOpacity>
          </View>
        </View>

        {(dados?.garantias || []).length === 0 && (
          <View style={s.vazio}>
            <Image source={require('../../../assets/logo-gp.png')} style={{ width: 90, height: 56, opacity: 0.55 }} resizeMode="contain" />
            <Text style={s.vazioT}>Você ainda não tem garantia cadastrada.</Text>
            <Text style={s.vazioS}>Quando a loja ativar a garantia dos seus pneus GP Premium, ela aparece aqui.</Text>
          </View>
        )}

        {(dados?.garantias || []).map((g: any) => {
          const st = STATUS[g.status] || STATUS.pendente;
          const km = g.veiculo?.kmAtual || g.kmInicial;
          const prog = Math.min(100, Math.max(0, ((km - g.kmInicial) / (g.kmMaximo - g.kmInicial)) * 100));
          return (
            <TouchableOpacity key={g.id} style={s.card} activeOpacity={0.85} onPress={() => setAberta(g)}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={s.placa}>{g.veiculo?.placa}</Text>
                <View style={[s.chip, { backgroundColor: `${st.cor}22` }]}>
                  <Text style={[s.chipT, { color: st.cor }]}>{st.label}</Text>
                </View>
              </View>
              <Text style={s.carro}>{[g.veiculo?.marca, g.veiculo?.modelo].filter(Boolean).join(' ')}</Text>
              <Text style={s.km}>{fmtKm(km)} de {fmtKm(g.kmMaximo)} km</Text>
              <View style={s.barra}><View style={[s.barraFill, { width: `${prog}%` }]} /></View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={s.pneusInfo}>{(g.pneus || []).length} pneu(s) • 1 cadastro + {(g.revisoes || []).length} revisão(ões)</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={s.verMais}>ver detalhes</Text>
                  <ChevronRight size={16} color="#0ea5e9" />
                </View>
              </View>
            </TouchableOpacity>
          );
        })}

        <TouchableOpacity style={s.oficinas} onPress={() => router.push('/(customer)/workshops')}>
          <Text style={s.oficinasT}>Encontrar oficinas autorizadas</Text>
        </TouchableOpacity>
      </ScrollView>

      <Modal visible={!!aberta} animationType="slide" onRequestClose={() => setAberta(null)}>
        <SafeAreaView style={s.container}>
          <View style={s.modalTop}>
            <Text style={s.modalTitle}>Minha garantia</Text>
            <TouchableOpacity onPress={() => setAberta(null)}><X size={24} color="#0f172a" /></TouchableOpacity>
          </View>
          {aberta && (
            <GarantiaDetalhe aberta={aberta} onAbrirPneu={setPneuAberto} />
          )}

          <Modal visible={!!pneuAberto} animationType="slide" onRequestClose={() => setPneuAberto(null)}>
            <SafeAreaView style={s.container}>
              <View style={s.modalTop}>
                <Text style={s.modalTitle}>{pneuAberto ? `Pneu ${pneuAberto.numeroPneu}` : 'Pneu'}</Text>
                <TouchableOpacity onPress={() => setPneuAberto(null)}><X size={24} color="#0f172a" /></TouchableOpacity>
              </View>
              {pneuAberto && (
                <PneuDetalhe pneu={pneuAberto} />
              )}
            </SafeAreaView>
          </Modal>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

function GarantiaDetalhe({ aberta, onAbrirPneu }: { aberta: any; onAbrirPneu: (p: any) => void }) {
  const revisoes = Array.isArray(aberta.revisoes)
    ? [...aberta.revisoes].sort((a, b) => new Date(b.criadoEm).getTime() - new Date(a.criadoEm).getTime())
    : [];
  const dadosCadastro = [
    aberta.lojaCadastro?.nome ? `Loja: ${aberta.lojaCadastro.nome}` : null,
    aberta.mecanicoCadastro ? `Mecânico: ${aberta.mecanicoCadastro}` : null,
  ].filter(Boolean).join(' • ');
  const fotoCadastro = aberta.cadastroFotoVeiculoUrl || aberta.veiculo?.fotoUrl;

  return (
    <ScrollView contentContainerStyle={{ padding: 18 }}>
      <View style={s.card}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={s.placa}>{aberta.veiculo?.placa}</Text>
          <View style={[s.chip, { backgroundColor: `${(STATUS[aberta.status] || STATUS.pendente).cor}22` }]}>
            <Text style={[s.chipT, { color: (STATUS[aberta.status] || STATUS.pendente).cor }]}>{(STATUS[aberta.status] || STATUS.pendente).label}</Text>
          </View>
        </View>
        <Text style={s.carro}>{[aberta.veiculo?.marca, aberta.veiculo?.modelo, aberta.veiculo?.ano].filter(Boolean).join(' ')}</Text>
        <Text style={s.detLinha}>Cobertura: {fmtKm(aberta.kmInicial)} até {fmtKm(aberta.kmMaximo)} km</Text>
        <Text style={s.detLinha}>Válida de {fmtData(aberta.dataInicio)} até {fmtData(aberta.dataExpiracao)}</Text>
        <Text style={s.detLinha}>KM atual do carro: {fmtKm(aberta.veiculo?.kmAtual)}</Text>
      </View>

      <Text style={s.secao}>1º cadastro / ativação</Text>
      <View style={s.card}>
        <Text style={s.pneuPos}>Dados do primeiro cadastro</Text>
        <Text style={s.detLinha}>Cadastro feito em {fmtData(aberta.criadoEm || aberta.dataInicio) || fmtData(aberta.dataInicio)}</Text>
        {dadosCadastro ? <Text style={s.detMuted}>{dadosCadastro}</Text> : null}
        <Text style={s.detLinha}>KM do cadastro: {fmtKm(aberta.kmInicial)} km</Text>
        {fotoCadastro ? <Image source={{ uri: fotoUrl(fotoCadastro) }} style={[s.foto, { marginTop: 10 }]} resizeMode="cover" /> : null}
      </View>

      <Text style={s.secao}>Pneus do primeiro cadastro</Text>
      <Text style={s.detMutedBloco}>Estes são os pneus cadastrados na ativação da garantia.</Text>
      {(aberta.pneus || []).map((p: any, pIndex: number) => (
        <TouchableOpacity
          key={p.id}
          style={[s.card, p.cancelada && { borderColor: '#e11d48', borderWidth: 1 }]}
          activeOpacity={0.85}
          onPress={() => onAbrirPneu({ ...p, numeroPneu: pIndex + 1, revisoes })}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={s.pneuPos}>Pneu {pIndex + 1}</Text>
            {p.cancelada ? <Text style={s.canc}>garantia cancelada</Text> : <ChevronRight size={16} color="#0ea5e9" />}
          </View>
          <Text style={s.detMuted}>Posicao no carro: {ROTULO_POS[p.posicao] || p.posicao}</Text>
          <Text style={s.detLinha}>{[p.marca, p.modelo, p.medida].filter(Boolean).join(' ') || '-'}</Text>
          <Text style={s.detMuted}>DOT {p.dot || '-'} • Série {p.codigoSerie || '-'} • toque para ver detalhes</Text>
        </TouchableOpacity>
      ))}

      <Text style={s.secao}>Revisões técnicas após a ativação ({revisoes.length})</Text>
      {revisoes.length === 0 && <Text style={s.detMuted}>Nenhuma revisão registrada ainda.</Text>}
      {revisoes.map((r: any, idx: number) => {
        const numeroRevisao = revisoes.length - idx;
        const historicoAnterior = idx > 0;
        return (
          <View key={r.id} style={[s.card, r.status === 'reprovada' && { borderColor: '#e11d48', borderWidth: 1 }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View>
                <Text style={s.pneuPos}>{numeroRevisao}ª revisão{historicoAnterior ? ' • Histórico anterior' : ''}</Text>
                <Text style={s.detMuted}>{fmtData(r.criadoEm)} • {fmtKm(r.km)} km</Text>
              </View>
              {r.status === 'aprovada' ? (
                <CheckCircle2 size={16} color="#16a34a" />
              ) : r.status === 'reprovada' ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <XCircle size={16} color="#e11d48" />
                  <Text style={[s.detMuted, { color: '#e11d48', fontWeight: '700' }]}>Reprovada</Text>
                </View>
              ) : (
                <Text style={s.detMuted}>Pendente</Text>
              )}
            </View>
            <Text style={s.detMuted}>
              {[r.loja?.nome ? `Loja: ${r.loja.nome}` : null, r.mecanico ? `Mecânico: ${r.mecanico}` : null].filter(Boolean).join(' • ') || 'Loja e mecânico não informados'}
            </Text>
            {r.fotoOdometroUrl && (
              <View style={s.dadosRevisao}>
                <Text style={s.revPneuPos}>Dados do veículo na revisão</Text>
                <Image source={{ uri: fotoUrl(r.fotoOdometroUrl) }} style={[s.foto, { marginTop: 8 }]} resizeMode="cover" />
              </View>
            )}
            {(r.pneus || []).map((rp: any) => {
              const pneuIndex = (aberta.pneus || []).findIndex((p: any) => (rp.pneuId && p.id === rp.pneuId) || p.posicao === rp.posicao);
              return (
                <View key={rp.id} style={s.revPneu}>
                  <View>
                    <Text style={s.revPneuPos}>Pneu {pneuIndex >= 0 ? pneuIndex + 1 : '-'}</Text>
                    <Text style={s.detMuted}>DOT lido {rp.dotLido || '-'}</Text>
                  </View>
                  <Text style={s.revPneuSulco}>sulco {String(rp.profundidadeSulco).replace('.', ',')} mm</Text>
                </View>
              );
            })}
          </View>
        );
      })}
      <View style={{ height: 20 }} />
    </ScrollView>
  );
}

function PneuDetalhe({ pneu }: { pneu: any }) {
  const historico = (pneu.revisoes || [])
    .map((r: any) => ({ r, rp: (r.pneus || []).find((x: any) => (x.pneuId && x.pneuId === pneu.id) || x.posicao === pneu.posicao) }))
    .filter((item: any) => item.rp);

  return (
    <ScrollView contentContainerStyle={{ padding: 18 }}>
      <Text style={s.secao}>Dados do primeiro cadastro</Text>
      <View style={s.card}>
        <Text style={s.detLinha}>{[pneu.marca, pneu.modelo, pneu.medida].filter(Boolean).join(' ') || '-'}</Text>
        <Text style={s.detMuted}>DOT {pneu.dot || '-'} • Série {pneu.codigoSerie || '-'}</Text>
        {pneu.cancelada ? <Text style={[s.canc, { marginTop: 8 }]}>Garantia deste pneu cancelada{pneu.canceladaMotivo ? `: ${pneu.canceladaMotivo}` : ''}</Text> : null}
      </View>

      {[pneu.fotoUrl, pneu.fotoLateralUrl, pneu.fotoBandaUrl].some(Boolean) && (
        <>
          <Text style={s.secao}>Fotos do primeiro cadastro</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {[pneu.fotoUrl, pneu.fotoLateralUrl, pneu.fotoBandaUrl].filter(Boolean).map((u: any, i: number) => (
              <Image key={i} source={{ uri: fotoUrl(u) }} style={s.foto} resizeMode="cover" />
            ))}
          </ScrollView>
        </>
      )}

      <Text style={s.secao}>Histórico das revisões</Text>
      {historico.length === 0 && <Text style={s.detMuted}>Este pneu ainda não passou por revisão.</Text>}
      {historico.map(({ r, rp }: any, idx: number) => {
        const probs = parseProblemas(rp.problemas).map((k: string) => ROTULO_PROB[k] || k);
        const numeroRevisao = historico.length - idx;
        return (
          <View key={rp.id} style={s.card}>
            <Text style={s.pneuPos}>{numeroRevisao}ª revisão{idx > 0 ? ' • Histórico anterior' : ''}</Text>
            <Text style={s.detMuted}>{fmtData(r.criadoEm)} • {fmtKm(r.km)} km</Text>
            <Text style={s.detMuted}>
              {[r.loja?.nome ? `Loja: ${r.loja.nome}` : null, r.mecanico ? `Mecânico: ${r.mecanico}` : null].filter(Boolean).join(' • ')}
            </Text>
            <Text style={s.detLinha}>
              Sulco: {String(rp.profundidadeSulco).replace('.', ',')} mm • Estado: {ESTADO_LBL[rp.estado] || rp.estado}
            </Text>
            <Text style={s.detLinha}>DOT lido: {rp.dotLido || '-'}</Text>
            {rp.arrancamentoBorracha ? <Text style={s.canc}>Arrancamento de borracha detectado</Text> : null}
            {probs.length > 0 ? <Text style={s.detMuted}>Problemas: {probs.join(', ')}</Text> : null}
            {rp.recomendacao ? <Text style={s.detMuted}>Recomendação: {rp.recomendacao}</Text> : null}
          </View>
        );
      })}
      <View style={{ height: 20 }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  center: { alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 18, paddingTop: 40 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  logoTopo: { width: '78%', height: 46, alignSelf: 'center', marginBottom: 18 },
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
  verMais: { fontSize: 12, color: '#0ea5e9', fontWeight: '700', marginTop: 8 },
  oficinas: { backgroundColor: '#fff', borderRadius: 14, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: '#e2e8f0' },
  oficinasT: { fontSize: 14, fontWeight: '700', color: '#0ea5e9' },
  modalTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#e2e8f0', backgroundColor: '#fff' },
  modalTitle: { fontSize: 17, fontWeight: '800', color: '#0f172a' },
  detLinha: { fontSize: 13, color: '#334155', marginTop: 6 },
  detMuted: { fontSize: 12, color: '#64748b', marginTop: 4 },
  detMutedBloco: { fontSize: 12, color: '#64748b', marginBottom: 8 },
  secao: { fontSize: 14, fontWeight: '800', color: '#0f172a', marginTop: 8, marginBottom: 8 },
  pneuPos: { fontSize: 14, fontWeight: '700', color: '#0f172a' },
  canc: { fontSize: 11, fontWeight: '800', color: '#e11d48' },
  revPneu: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  revPneuPos: { fontSize: 12, color: '#475569', fontWeight: '700' },
  revPneuSulco: { fontSize: 12, color: '#0f172a', fontWeight: '700' },
  dadosRevisao: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#e2e8f0' },
  foto: { width: 130, height: 130, borderRadius: 10, marginRight: 10, backgroundColor: '#e2e8f0' },
});
