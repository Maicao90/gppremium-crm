import React, { useState } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, Search } from 'lucide-react-native';
import { api } from '../../lib/api';
import { FotoBotao } from '../../components/FotoBotao';
import { CampoData } from '../../components/CampoData';
import { Foto } from '../../lib/foto';

const soDigitos = (s: string) => s.replace(/\D/g, '');
const fmtCPF = (s: string) => soDigitos(s).slice(0, 11).replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');

// O cliente pode comprar de 1 a 5 pneus (nem todo mundo troca os 4) — o mecânico marca
// QUAIS posições foram compradas e só essas viram cartão pra preencher. Antes a tela
// exigia os 4 sempre, travando quem comprou 2.
const POSICOES = [
  { key: 'dianteiro_esquerdo', label: 'Dianteiro esquerdo' },
  { key: 'dianteiro_direito', label: 'Dianteiro direito' },
  { key: 'traseiro_esquerdo', label: 'Traseiro esquerdo' },
  { key: 'traseiro_direito', label: 'Traseiro direito' },
  { key: 'estepe', label: 'Estepe' },
];
const rotuloPosicao = (key: string) => POSICOES.find((p) => p.key === key)?.label || key;
type PneuForm = { posicao: string; marca: string; medida: string; dot: string; codigoSerie: string; foto: Foto; fotoEtiqueta: Foto };
const novoPneu = (posicao: string): PneuForm => ({ posicao, marca: 'GP Premium', medida: '', dot: '', codigoSerie: '', foto: null, fotoEtiqueta: null });

export default function NewWarranty() {
  const router = useRouter();
  const [cpf, setCpf] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [cli, setCli] = useState({ nome: '', telefone: '', email: '' });
  const [vei, setVei] = useState({ placa: '', marca: '', modelo: '', ano: '', km: '' });
  const [oleo, setOleo] = useState({ data: '', km: '', sem: false });
  const [fVeic, setFVeic] = useState<Foto>(null);
  const [fOdo, setFOdo] = useState<Foto>(null);
  const [fEtiq, setFEtiq] = useState<Foto>(null);
  const [pneus, setPneus] = useState<PneuForm[]>([]);
  const [salvando, setSalvando] = useState(false);

  // Liga/desliga uma posição. Ao ligar cria o cartão daquele pneu; ao desligar joga fora
  // o que já tinha sido preenchido nele (inclusive as fotos) — é o que o mecânico espera
  // ao dizer "esse aqui o cliente não comprou".
  const togglePosicao = (key: string) => setPneus((ps) => {
    if (ps.some((p) => p.posicao === key)) return ps.filter((p) => p.posicao !== key);
    // Mantém sempre na ordem das POSICOES, não na ordem em que foi clicado.
    const comNovo = [...ps, novoPneu(key)];
    return POSICOES.map((pos) => comNovo.find((p) => p.posicao === pos.key)).filter(Boolean) as PneuForm[];
  });

  const buscar = async () => {
    if (soDigitos(cpf).length !== 11) return Alert.alert('Ops', 'Digite o CPF completo.');
    setBuscando(true);
    try {
      const r = await api<any>(`/api/garantia/clientes/busca?cpf=${soDigitos(cpf)}`);
      if (r.encontrado) {
        setCli({ nome: r.cliente.nome, telefone: r.cliente.telefone, email: r.cliente.email });
        if (r.veiculo) setVei((v) => ({ ...v, placa: r.veiculo.placa, marca: r.veiculo.marca, modelo: r.veiculo.modelo, ano: String(r.veiculo.ano || '') }));
        Alert.alert('Cliente encontrado', 'Dados preenchidos. Confira e informe o KM atual.');
      } else {
        Alert.alert('Cliente novo', 'CPF ainda não cadastrado — preencha os dados.');
      }
    } catch (e: any) { Alert.alert('Erro', e?.message); }
    setBuscando(false);
  };

  const setPneu = (i: number, k: string, v: any) => setPneus((ps) => ps.map((p, j) => (j === i ? { ...p, [k]: v } : p)));

  const salvar = async () => {
    if (!cli.nome.trim()) return Alert.alert('Ops', 'Informe o nome do cliente.');
    if (soDigitos(vei.placa).length + vei.placa.replace(/[^A-Za-z]/g, '').length < 7) { /* validação leve */ }
    if (!vei.placa.trim() || vei.km === '') return Alert.alert('Ops', 'Informe placa e KM atual.');
    if (pneus.length === 0) return Alert.alert('Ops', 'Marque quais pneus o cliente comprou.');
    for (const p of pneus) {
      const nome = rotuloPosicao(p.posicao);
      if (!p.foto?.base64) return Alert.alert('Foto obrigatória', `Tire a foto do pneu ${nome}.`);
      if (!p.fotoEtiqueta?.base64) return Alert.alert('Foto obrigatória', `Tire a foto da etiqueta do pneu ${nome}.`);
    }
    setSalvando(true);
    try {
      const r = await api<any>('/api/garantia/garantias', {
        method: 'POST',
        body: {
          cliente: { ...cli, cpf: soDigitos(cpf) },
          veiculo: {
            placa: vei.placa, marca: vei.marca, modelo: vei.modelo, ano: vei.ano, km: vei.km,
            semEtiquetaOleo: oleo.sem, oleoData: oleo.data, oleoKm: oleo.km,
            fotoBase64: fVeic?.base64 || null, fotoOdometroBase64: fOdo?.base64 || null, etiquetaOleoBase64: fEtiq?.base64 || null,
          },
          pneus: pneus.map((p) => ({
            posicao: p.posicao, marca: p.marca, medida: p.medida, dot: p.dot, codigoSerie: p.codigoSerie,
            fotoBase64: p.fotoEtiqueta?.base64 || null, fotoLateralBase64: p.foto?.base64 || null,
          })),
        },
      });
      Alert.alert('Garantia ativada!', `Nasce como pendente pra auditoria.${r.proximaRevisaoEm ? `\nPróxima revisão prevista: ${r.proximaRevisaoEm}.` : ''}`, [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (e: any) { Alert.alert('Não foi possível ativar', e?.message || 'Tente novamente.'); }
    setSalvando(false);
  };

  return (
    <SafeAreaView style={s.container}>
      <View style={s.top}>
        <TouchableOpacity onPress={() => router.back()}><ArrowLeft size={22} color="#0f172a" /></TouchableOpacity>
        <Text style={s.topTitle}>Ativar Garantia</Text>
        <View style={{ width: 22 }} />
      </View>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets keyboardDismissMode="interactive">
        {/* CPF */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Cliente</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput style={[s.input, { flex: 1 }]} placeholder="CPF" placeholderTextColor="#94a3b8" keyboardType="number-pad" value={fmtCPF(cpf)} onChangeText={setCpf} />
            <TouchableOpacity style={s.btnMini} onPress={buscar} disabled={buscando}>{buscando ? <ActivityIndicator color="#fff" size="small" /> : <Search size={16} color="#fff" />}</TouchableOpacity>
          </View>
          <TextInput style={s.input} placeholder="Nome completo" placeholderTextColor="#94a3b8" value={cli.nome} onChangeText={(v) => setCli({ ...cli, nome: v })} />
          <TextInput style={s.input} placeholder="Telefone (WhatsApp)" placeholderTextColor="#94a3b8" keyboardType="phone-pad" value={cli.telefone} onChangeText={(v) => setCli({ ...cli, telefone: v })} />
        </View>

        {/* Veículo */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Veículo</Text>
          <TextInput style={s.input} placeholder="Placa" placeholderTextColor="#94a3b8" autoCapitalize="characters" value={vei.placa} onChangeText={(v) => setVei({ ...vei, placa: v.toUpperCase() })} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput style={[s.input, { flex: 1 }]} placeholder="Marca" placeholderTextColor="#94a3b8" value={vei.marca} onChangeText={(v) => setVei({ ...vei, marca: v })} />
            <TextInput style={[s.input, { flex: 1 }]} placeholder="Modelo" placeholderTextColor="#94a3b8" value={vei.modelo} onChangeText={(v) => setVei({ ...vei, modelo: v })} />
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput style={[s.input, { flex: 1 }]} placeholder="Ano" placeholderTextColor="#94a3b8" keyboardType="number-pad" value={vei.ano} onChangeText={(v) => setVei({ ...vei, ano: v })} />
            <TextInput style={[s.input, { flex: 1 }]} placeholder="KM atual" placeholderTextColor="#94a3b8" keyboardType="number-pad" value={vei.km} onChangeText={(v) => setVei({ ...vei, km: v })} />
          </View>
          <FotoBotao label="Foto do veículo" valor={fVeic} onChange={setFVeic} />
          <FotoBotao label="Foto do odômetro" valor={fOdo} onChange={setFOdo} />
        </View>

        {/* Etiqueta de óleo */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Etiqueta de óleo</Text>
          <TouchableOpacity style={s.checkRow} onPress={() => setOleo({ ...oleo, sem: !oleo.sem })}>
            <View style={[s.check, oleo.sem && s.checkOn]} />
            <Text style={s.checkTxt}>Veículo não tem etiqueta de óleo</Text>
          </TouchableOpacity>
          {!oleo.sem && (
            <>
              <CampoData label="Data da última troca" valor={oleo.data} onChange={(v) => setOleo({ ...oleo, data: v })} />
              <TextInput style={s.input} placeholder="KM na última troca" placeholderTextColor="#94a3b8" keyboardType="number-pad" value={oleo.km} onChangeText={(v) => setOleo({ ...oleo, km: v })} />
              <FotoBotao label="Foto da etiqueta de óleo" valor={fEtiq} onChange={setFEtiq} />
            </>
          )}
        </View>

        {/* Quais pneus o cliente comprou (nem sempre são os 4) */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Pneus comprados</Text>
          <Text style={s.ajuda}>Marque só as posições que receberam pneu novo.</Text>
          <View style={s.wrap}>
            {POSICOES.map((pos) => {
              const marcado = pneus.some((p) => p.posicao === pos.key);
              return (
                <TouchableOpacity key={pos.key} style={[s.pill, marcado && s.pillOn]} onPress={() => togglePosicao(pos.key)} activeOpacity={0.8}>
                  <Text style={[s.pillT, marcado && s.pillTOn]}>{pos.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={s.ajuda}>{pneus.length === 0 ? 'Nenhum pneu marcado ainda.' : `${pneus.length} pneu(s) selecionado(s).`}</Text>
        </View>

        {/* Pneus */}
        {pneus.map((p, i) => (
          <View key={p.posicao} style={s.card}>
            <Text style={s.cardTitle}>{rotuloPosicao(p.posicao)}</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TextInput style={[s.input, { flex: 1 }]} placeholder="Medida (205/55 R16)" placeholderTextColor="#94a3b8" value={p.medida} onChangeText={(v) => setPneu(i, 'medida', v)} />
              <TextInput style={[s.input, { width: 90 }]} placeholder="DOT" placeholderTextColor="#94a3b8" keyboardType="number-pad" value={p.dot} onChangeText={(v) => setPneu(i, 'dot', soDigitos(v).slice(0, 4))} />
            </View>
            <TextInput style={s.input} placeholder="Nº de série" placeholderTextColor="#94a3b8" value={p.codigoSerie} onChangeText={(v) => setPneu(i, 'codigoSerie', v)} />
            <FotoBotao label="Foto do pneu" valor={p.foto} onChange={(f) => setPneu(i, 'foto', f)} />
            <FotoBotao label="Foto da etiqueta do pneu" valor={p.fotoEtiqueta} onChange={(f) => setPneu(i, 'fotoEtiqueta', f)} />
          </View>
        ))}

        <TouchableOpacity style={s.btn} onPress={salvar} disabled={salvando} activeOpacity={0.85}>
          {salvando ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>ATIVAR GARANTIA</Text>}
        </TouchableOpacity>
        <View style={{ height: 30 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  topTitle: { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  scroll: { padding: 16 },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(0,0,0,0.04)' },
  cardTitle: { fontSize: 14, fontWeight: '800', color: '#0f172a', marginBottom: 10 },
  input: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)', borderRadius: 9, paddingHorizontal: 11, paddingVertical: 10, fontSize: 13, color: '#0f172a', marginBottom: 8 },
  btnMini: { backgroundColor: '#0ea5e9', borderRadius: 9, width: 46, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  check: { width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, borderColor: '#cbd5e1' },
  checkOn: { backgroundColor: '#0ea5e9', borderColor: '#0ea5e9' },
  checkTxt: { fontSize: 13, color: '#475569' },
  ajuda: { fontSize: 12, color: '#64748b', marginBottom: 8 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 4 },
  pill: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: '#cbd5e1' },
  pillOn: { backgroundColor: '#0ea5e9', borderColor: '#0ea5e9' },
  pillT: { fontSize: 12.5, color: '#475569', fontWeight: '600' },
  pillTOn: { color: '#fff' },
  btn: { flexDirection: 'row', gap: 8, backgroundColor: '#0ea5e9', borderRadius: 12, padding: 16, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 15, letterSpacing: 0.5 },
});
