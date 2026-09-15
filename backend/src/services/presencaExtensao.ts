interface SinalExtensao {
  ultimoSinal: number;
  versao?: string;
}

const sinalPorUsuario = new Map<string, SinalExtensao>();

// A extensão sincroniza dados em intervalos curtos. Uma janela maior evita que uma
// oscilação rápida de rede faça o painel piscar entre online e offline.
const JANELA_ONLINE_MS = 90_000;

// versao: numero da extensao (chrome.runtime.getManifest().version) que o navegador
// reportou no registro mais recente. Achado 15/09: sem isso, nao tinha como saber
// remotamente em qual versao cada loja estava travada — o auto-update nunca chegou a
// ser checado por nenhum cliente real (zero acessos a updates.xml em 14 dias de log).
export function marcarPresencaExtensao(usuarioId: unknown, versao?: unknown) {
  const uid = String(usuarioId || '').trim();
  if (!uid) return;
  const atual = sinalPorUsuario.get(uid);
  // So sobrescreve a versao se veio uma nova de verdade — assim uma chamada que nao
  // manda versao (ex.: um caminho antigo/nao atualizado) nao apaga a ultima versao
  // conhecida.
  const versaoNova = (typeof versao === 'string' && versao.trim()) ? versao.trim() : atual?.versao;
  const sinal: SinalExtensao = { ultimoSinal: Date.now() };
  if (versaoNova !== undefined) sinal.versao = versaoNova;
  sinalPorUsuario.set(uid, sinal);
}

export function extensaoEstaOnline(usuarioId: unknown) {
  const uid = String(usuarioId || '').trim();
  if (!uid) return false;

  const sinal = sinalPorUsuario.get(uid);
  if (!sinal) return false;

  const online = Date.now() - sinal.ultimoSinal <= JANELA_ONLINE_MS;
  if (!online) sinalPorUsuario.delete(uid);
  return online;
}

// Versao da extensao que este usuario reportou por ultimo (mesmo se ja ficou offline —
// util pra saber "a ultima vez que essa loja apareceu, estava em qual versao").
export function obterVersaoExtensao(usuarioId: unknown): string | null {
  const uid = String(usuarioId || '').trim();
  if (!uid) return null;
  return sinalPorUsuario.get(uid)?.versao || null;
}
