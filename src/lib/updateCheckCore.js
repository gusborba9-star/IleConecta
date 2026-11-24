/** Há versão nova quando a publicação do servidor é diferente da que está rodando. Sem dado confiável, não avisa. */
export function hasNewVersion(current, remote) {
  if (typeof current !== "string" || typeof remote !== "string") return false;
  if (!current.trim() || !remote.trim()) return false;
  return current.trim() !== remote.trim();
}

/** Lê o corpo de /version.json; qualquer formato inesperado vira null (não avisa). */
export function readRemoteBuild(body) {
  const b = body && typeof body === "object" ? body.build : null;
  return typeof b === "string" && b.length > 0 && b.length <= 80 ? b : null;
}
