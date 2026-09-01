const ultimoSinalPorUsuario = new Map<string, number>();

// A extensão sincroniza dados em intervalos curtos. Uma janela maior evita que uma
// oscilação rápida de rede faça o painel piscar entre online e offline.
const JANELA_ONLINE_MS = 90_000;

export function marcarPresencaExtensao(usuarioId: unknown) {
  const uid = String(usuarioId || '').trim();
  if (uid) ultimoSinalPorUsuario.set(uid, Date.now());
}

export function extensaoEstaOnline(usuarioId: unknown) {
  const uid = String(usuarioId || '').trim();
  if (!uid) return false;

  const ultimoSinal = ultimoSinalPorUsuario.get(uid);
  if (!ultimoSinal) return false;

  const online = Date.now() - ultimoSinal <= JANELA_ONLINE_MS;
  if (!online) ultimoSinalPorUsuario.delete(uid);
  return online;
}
