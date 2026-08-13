import React, { useState } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, Search, Wrench, AlertTriangle } from 'lucide-react-native';
import { api } from '../../lib/api';
import { FotoBotao } from '../../components/FotoBotao';
import { CampoData } from '../../components/CampoData';
import { Foto } from '../../lib/foto';

const ROTULO: Record<string, string> = {
  dianteiro_esquerdo: 'Pneu 1',
  dianteiro_direito: 'Pneu 2',
  traseiro_esquerdo: 'Pneu 3',
  traseiro_direito: 'Pneu 4',
  estepe: 'Estepe',
};

const OPCOES = Array.from({ length: 85 }, (_, i) => Number((1.6 + i * 0.1).toFixed(1)));

const NENHUM_PROBLEMA = 'nenhum';
const PROBLEMAS: { chave: string; rotulo: string }[] = [
  { chave: NENHUM_PROBLEMA, rotulo: 'Nenhum problema encontrado' },
  { chave: 'desgaste_irregular', rotulo: 'Desgaste irregular' },
  { chave: 'desalinhamento', rotulo: 'Desalinhamento' },
  { chave: 'desbalanceamento', rotulo: 'Desbalanceamento' },
  { chave: 'borracha_rasgada', rotulo: 'Borracha rasgada' },
  { chave: 'corte_lateral', rotulo: 'Corte lateral' },
  { chave: 'bolha', rotulo: 'Bolha / deformacao' },
  { chave: 'furo', rotulo: 'Furo / reparo' },
  { chave: 'pressao_incorreta', rotulo: 'Pressao incorreta' },
];

const ESTADOS: { chave: string; rotulo: string }[] = [
  { chave: 'excelente', rotulo: 'Excelente' },
  { chave: 'bom', rotulo: 'Bom' },
  { chave: 'regular', rotulo: 'Regular' },
  { chave: 'ruim', rotulo: 'Ruim' },
  { chave: 'trocar', rotulo: 'Trocar' },
];

type PneuRev = {
  posicao: string;
  jaRevisado: boolean;
  profundidadeSulco: number | '';
  estado: string;
  arrancamentoBorracha: boolean;
  dotLido: string;
  fotoEtiquetaInterna: Foto;
  fotoDot: Foto;
  fotoBandaDireita: Foto;
  fotoBandaEsquerda: Foto;
  problemas: string[];
  observacoes: string;
  recomendacao: string;
};

export default function NewInspection() {
  const router = useRouter();
  const [placa, setPlaca] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [garantia, setGarantia] = useState<any>(null);
  const [km, setKm] = useState('');
  const [mecanico, setMecanico] = useState('');
  const [fOdo, setFOdo] = useState<Foto>(null);
  const [obsGeral, setObsGeral] = useState('');
  const [pneus, setPneus] = useState<PneuRev[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [semEtiquetaOleo, setSemEtiquetaOleo] = useState(false);
  const [oleoData, setOleoData] = useState('');
  const [oleoKm, setOleoKm] = useState('');
  const [fEtiq, setFEtiq] = useState<Foto>(null);

  const buscar = async () => {
    const alvo = placa.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (alvo.length !== 7) return Alert.alert('Ops', 'Digite a placa completa (7 caracteres).');
    setBuscando(true);
    setGarantia(null);
    try {
      const r = await api<any>(`/api/garantia/garantias/por-placa?placa=${alvo}`);
      if (!r.encontrada) {
        Alert.alert('Nada encontrado', 'Nenhuma garantia em andamento pra essa placa.');
      } else {
        setGarantia(r.garantia);
        setSemEtiquetaOleo(!!r.garantia.veiculo?.semEtiquetaOleo);
        setOleoData('');
        setOleoKm('');
        setFEtiq(null);
        setPneus((r.garantia.pneus || []).filter((p: any) => !p.cancelada).map((p: any) => ({
          posicao: p.posicao,
          jaRevisado: !!p.jaRevisado,
          profundidadeSulco: '',
          estado: 'bom',
          arrancamentoBorracha: false,
          dotLido: '',
          fotoEtiquetaInterna: null,
          fotoDot: null,
          fotoBandaDireita: null,
          fotoBandaEsquerda: null,
          problemas: [],
          observacoes: '',
          recomendacao: '',
        })));
        setKm('');
      }
    } catch (e: any) {
      Alert.alert('Erro', e?.message);
    }
    setBuscando(false);
  };

  const setPneu = (i: number, k: string, v: any) => setPneus((ps) => ps.map((p, j) => (j === i ? { ...p, [k]: v } : p)));

  const toggleProb = (i: number, chave: string) => setPneus((ps) => ps.map((p, j) => {
    if (j !== i) return p;
    if (chave === NENHUM_PROBLEMA) {
      return { ...p, problemas: p.problemas.includes(NENHUM_PROBLEMA) ? [] : [NENHUM_PROBLEMA] };
    }
    const semNenhum = p.problemas.filter((x) => x !== NENHUM_PROBLEMA);
    return { ...p, problemas: semNenhum.includes(chave) ? semNenhum.filter((x) => x !== chave) : [...semNenhum, chave] };
  }));

  const salvar = async () => {
    if (km === '') return Alert.alert('Ops', 'Informe o KM da revisao.');
    if (!mecanico.trim()) return Alert.alert('Ops', 'Informe o nome do mecanico responsavel (obrigatorio).');
    if (pneus.some((p) => p.profundidadeSulco === '')) return Alert.alert('Ops', 'Selecione a profundidade do sulco de todos os pneus.');
    if (!fOdo?.base64) return Alert.alert('Foto obrigatoria', 'Tire a foto do odometro.');
    if (!semEtiquetaOleo) {
      if (!oleoData) return Alert.alert('Ops', 'Informe a data da etiqueta de oleo.');
      if (!oleoKm) return Alert.alert('Ops', 'Informe o km da etiqueta de oleo.');
      if (!fEtiq?.base64) return Alert.alert('Foto obrigatoria', 'Tire a foto da etiqueta de oleo.');
    }

    for (let i = 0; i < pneus.length; i++) {
      const p = pneus[i];
      const nomePneu = ROTULO[p.posicao] || String(i + 1);
      if (p.problemas.length === 0) return Alert.alert('Checklist obrigatorio', `Marque o checklist de problemas do ${nomePneu} (use "Nenhum problema encontrado" se estiver tudo certo).`);
      if (p.dotLido.length !== 4) return Alert.alert('DOT obrigatorio', `Digite os 4 digitos do DOT do ${nomePneu} (alem da foto).`);
      if (!p.jaRevisado && !p.fotoEtiquetaInterna?.base64) return Alert.alert('Foto obrigatoria', `Tire a foto da etiqueta interna do ${nomePneu} - e a 1a revisao desse pneu.`);
      const falta = !p.fotoDot?.base64 ? 'DOT junto com o pneu' : !p.fotoBandaDireita?.base64 ? 'banda - ombro direito' : !p.fotoBandaEsquerda?.base64 ? 'banda - ombro esquerdo' : '';
      if (falta) return Alert.alert('Foto obrigatoria', `Tire a foto "${falta}" do ${nomePneu}.`);
    }

    setSalvando(true);
    try {
      const r = await api<any>('/api/garantia/revisoes', {
        method: 'POST',
        body: {
          garantiaId: garantia.id,
          km: Number(km),
          mecanico,
          observacoes: obsGeral,
          fotoOdometroBase64: fOdo?.base64 || null,
          oleoData,
          oleoKm,
          etiquetaOleoBase64: fEtiq?.base64 || null,
          pneus: pneus.map((p) => ({
            posicao: p.posicao,
            profundidadeSulco: Number(p.profundidadeSulco) || 0,
            estado: p.estado,
            arrancamentoBorracha: p.arrancamentoBorracha,
            dotLido: p.dotLido,
            problemas: p.problemas,
            observacoes: p.observacoes,
            recomendacao: p.recomendacao,
            fotoEtiquetaInternaBase64: p.fotoEtiquetaInterna?.base64 || null,
            fotoDotBase64: p.fotoDot?.base64 || null,
            fotoBandaDireitaBase64: p.fotoBandaDireita?.base64 || null,
            fotoBandaEsquerdaBase64: p.fotoBandaEsquerda?.base64 || null,
          })),
        },
      });

      let msg = 'Revisao registrada!';
      if (r.pneusCancelados?.length) msg += `\nGarantia cancelada (arrancamento) no(s) pneu(s): ${r.pneusCancelados.join(', ')}.`;
      if (r.odometroSuspeito) msg += '\nOdometro suspeito - foi pra analise.';
      Alert.alert('Pronto', msg, [{ text: 'OK', onPress: () => router.back() }]);
    } catch (e: any) {
      Alert.alert('Nao foi possivel salvar', e?.message);
    }
    setSalvando(false);
  };

  return (
    <SafeAreaView style={s.container}>
      <View style={s.top}>
        <TouchableOpacity onPress={() => router.back()}><ArrowLeft size={22} color="#0f172a" /></TouchableOpacity>
        <Text style={s.topTitle}>Nova Revisao</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets keyboardDismissMode="interactive">
        <View style={s.card}>
          <Text style={s.cardTitle}>Buscar veiculo</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput style={[s.input, { flex: 1 }]} placeholder="Placa" placeholderTextColor="#94a3b8" autoCapitalize="characters" value={placa} onChangeText={(v) => setPlaca(v.toUpperCase())} />
            <TouchableOpacity style={s.btnMini} onPress={buscar} disabled={buscando}>
              {buscando ? <ActivityIndicator color="#fff" size="small" /> : <Search size={16} color="#fff" />}
            </TouchableOpacity>
          </View>
          {garantia && <Text style={s.ok}>OK {garantia.cliente?.nome} - {garantia.veiculo?.marca} {garantia.veiculo?.modelo} (cobertura ate {garantia.kmMaximo} km)</Text>}
        </View>

        {garantia && (
          <>
            <View style={s.card}>
              <TextInput style={s.input} placeholder="KM da revisao" placeholderTextColor="#94a3b8" keyboardType="number-pad" value={km} onChangeText={setKm} />
              <TextInput style={s.input} placeholder="Mecanico responsavel" placeholderTextColor="#94a3b8" value={mecanico} onChangeText={setMecanico} />
              <TextInput style={[s.input, { minHeight: 60, textAlignVertical: 'top' }]} placeholder="Observacoes gerais da revisao (opcional)" placeholderTextColor="#94a3b8" multiline value={obsGeral} onChangeText={setObsGeral} />
              <FotoBotao label="Foto do odometro" valor={fOdo} onChange={setFOdo} />
            </View>

            <View style={s.card}>
              <Text style={s.cardTitle}>Etiqueta de oleo</Text>
              {semEtiquetaOleo ? (
                <Text style={s.ajuda}>Este veiculo foi cadastrado sem etiqueta de oleo. Nada a preencher aqui.</Text>
              ) : (
                <>
                  <Text style={s.ajuda}>Confira a etiqueta atual do carro. Se trocou o oleo desde a ultima vez, e essa data/km novos que valem daqui pra frente.</Text>
                  <CampoData label="Data da etiqueta" valor={oleoData} onChange={setOleoData} />
                  <TextInput style={s.input} placeholder="KM da etiqueta" placeholderTextColor="#94a3b8" keyboardType="number-pad" value={oleoKm} onChangeText={(v) => setOleoKm(v.replace(/\D/g, ''))} />
                  <FotoBotao label="Foto da etiqueta de oleo" valor={fEtiq} onChange={setFEtiq} />
                </>
              )}
            </View>

            {pneus.map((p, i) => (
              <View key={p.posicao} style={s.card}>
                <Text style={s.cardTitle}>{ROTULO[p.posicao] || p.posicao}</Text>
                <Text style={s.lbl}>Profundidade do sulco (mm)</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                  {OPCOES.map((v) => (
                    <TouchableOpacity key={v} style={[s.chip, p.profundidadeSulco === v && s.chipOn]} onPress={() => setPneu(i, 'profundidadeSulco', v)}>
                      <Text style={[s.chipT, p.profundidadeSulco === v && s.chipTOn]}>{v.toFixed(1).replace('.', ',')}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                <Text style={s.lbl}>Estado do pneu</Text>
                <View style={s.wrap}>
                  {ESTADOS.map((e) => (
                    <TouchableOpacity key={e.chave} style={[s.pill, p.estado === e.chave && s.pillOn]} onPress={() => setPneu(i, 'estado', e.chave)}>
                      <Text style={[s.pillT, p.estado === e.chave && s.pillTOn]}>{e.rotulo}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <TextInput style={s.input} placeholder="DOT lido (4 digitos, obrigatorio)" placeholderTextColor="#94a3b8" keyboardType="number-pad" value={p.dotLido} onChangeText={(v) => setPneu(i, 'dotLido', v.replace(/\D/g, '').slice(0, 4))} />

                <TouchableOpacity style={[s.arr, p.arrancamentoBorracha && s.arrOn]} onPress={() => setPneu(i, 'arrancamentoBorracha', !p.arrancamentoBorracha)}>
                  <AlertTriangle size={15} color={p.arrancamentoBorracha ? '#e11d48' : '#94a3b8'} />
                  <Text style={[s.arrT, p.arrancamentoBorracha && { color: '#e11d48' }]}>Arrancamento de borracha (cancela este pneu)</Text>
                </TouchableOpacity>

                <Text style={[s.lbl, { marginTop: 4 }]}>Problemas encontrados (obrigatorio marcar algo)</Text>
                <View style={s.wrap}>
                  {PROBLEMAS.map((pr) => {
                    const marcado = p.problemas.includes(pr.chave);
                    const ehNenhum = pr.chave === NENHUM_PROBLEMA;
                    return (
                      <TouchableOpacity key={pr.chave} style={[s.pill, marcado && (ehNenhum ? s.pillNenhumOn : s.pillProbOn)]} onPress={() => toggleProb(i, pr.chave)}>
                        <Text style={[s.pillT, marcado && s.pillTOn]}>{pr.rotulo}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <TextInput style={[s.input, { marginTop: 8 }]} placeholder="Observacoes deste pneu (opcional)" placeholderTextColor="#94a3b8" value={p.observacoes} onChangeText={(v) => setPneu(i, 'observacoes', v)} />
                <TextInput style={s.input} placeholder="Recomendacao (ex.: fazer alinhamento)" placeholderTextColor="#94a3b8" value={p.recomendacao} onChangeText={(v) => setPneu(i, 'recomendacao', v)} />

                <Text style={[s.lbl, { marginTop: 4 }]}>{p.jaRevisado ? '3 fotos obrigatorias (nitidas)' : '4 fotos obrigatorias (nitidas) - 1a revisao deste pneu'}</Text>
                {!p.jaRevisado && (
                  <FotoBotao label="Etiqueta interna do pneu" valor={p.fotoEtiquetaInterna} onChange={(f) => setPneu(i, 'fotoEtiquetaInterna', f)} />
                )}
                <FotoBotao label="DOT junto com o pneu" valor={p.fotoDot} onChange={(f) => setPneu(i, 'fotoDot', f)} />
                <FotoBotao label="Banda - ombro direito, com o profundimetro" valor={p.fotoBandaDireita} onChange={(f) => setPneu(i, 'fotoBandaDireita', f)} />
                <FotoBotao label="Banda - ombro esquerdo, com o profundimetro" valor={p.fotoBandaEsquerda} onChange={(f) => setPneu(i, 'fotoBandaEsquerda', f)} />
              </View>
            ))}

            <TouchableOpacity style={s.btn} onPress={salvar} disabled={salvando} activeOpacity={0.85}>
              {salvando ? <ActivityIndicator color="#fff" /> : <><Wrench size={18} color="#fff" /><Text style={s.btnText}>REGISTRAR REVISAO</Text></>}
            </TouchableOpacity>
            <View style={{ height: 30 }} />
          </>
        )}
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
  lbl: { fontSize: 12, color: '#475569', fontWeight: '700', marginBottom: 6 },
  ajuda: { fontSize: 12, color: '#64748b', marginBottom: 8 },
  input: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)', borderRadius: 9, paddingHorizontal: 11, paddingVertical: 10, fontSize: 13, color: '#0f172a', marginBottom: 8 },
  btnMini: { backgroundColor: '#0ea5e9', borderRadius: 9, width: 46, alignItems: 'center', justifyContent: 'center' },
  ok: { color: '#16a34a', fontSize: 12, marginTop: 8, fontWeight: '600' },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: '#cbd5e1', marginRight: 6 },
  chipOn: { backgroundColor: '#0ea5e9', borderColor: '#0ea5e9' },
  chipT: { fontSize: 13, color: '#475569', fontWeight: '600' },
  chipTOn: { color: '#fff' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  pill: { paddingHorizontal: 11, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: '#cbd5e1' },
  pillOn: { backgroundColor: '#0ea5e9', borderColor: '#0ea5e9' },
  pillProbOn: { backgroundColor: '#e11d48', borderColor: '#e11d48' },
  pillNenhumOn: { backgroundColor: '#16a34a', borderColor: '#16a34a' },
  pillT: { fontSize: 12, color: '#475569', fontWeight: '600' },
  pillTOn: { color: '#fff' },
  arr: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 9, borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 4 },
  arrOn: { backgroundColor: 'rgba(225,29,72,0.06)', borderColor: 'rgba(225,29,72,0.4)' },
  arrT: { fontSize: 12, color: '#64748b', flex: 1 },
  btn: { flexDirection: 'row', gap: 8, backgroundColor: '#0ea5e9', borderRadius: 12, padding: 16, alignItems: 'center', justifyContent: 'center' },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 15, letterSpacing: 0.5 },
});
