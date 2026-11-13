// Foto da assistente: o banco guarda só o caminho "<id da dona>/assistant-<número>.<webp|jpg>" no bucket avatars.
const RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/assistant-[0-9]{10,14}\.(webp|jpg)$/;

/** Mesmo formato que o banco exige; qualquer outra coisa não vira endereço de imagem. */
export function isAssistantPhotoPath(p) {
  return typeof p === "string" && RE.test(p);
}

/** A foto só vale se o caminho está na pasta da dona (defesa extra: o banco também confere). */
export function isOwnPhotoPath(p, ownerId) {
  return isAssistantPhotoPath(p) && typeof ownerId === "string" && p.split("/")[0] === ownerId.toLowerCase();
}
