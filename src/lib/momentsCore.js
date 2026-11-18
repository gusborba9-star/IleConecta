// Momentos das casas (Blueprint, decisão de 17/11/2026): regras puras e testáveis. O banco confere tudo de novo; aqui só se decide o que a tela mostra.
export const IMAGE_SECONDS = 6;
export const MAX_VIDEO_SECONDS = 30;
export const MAX_MOMENT_BYTES = 25 * 1024 * 1024;
export const CAPTION_MAX = 140;
export const SEEN_KEEP = 400;
export const REPORT_REASONS = [
  { id: "conteudo_improprio", label: "Conteúdo impróprio" },
  { id: "golpe", label: "Golpe ou fraude" },
  { id: "assedio", label: "Assédio ou desrespeito" },
  { id: "outro", label: "Outro motivo" },
];
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FILE = /^[0-9a-f-]{36}\/[A-Za-z0-9._-]{1,120}$/i;

const isRec = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v, max = 300) => (typeof v === "string" ? v.slice(0, max) : "");

/** A casa pode publicar momentos? (a matriz de planos manda; 0 por dia = não) */
export const canPostMoments = (caps) => Number(caps?.moments_per_day) > 0;
/** Vídeo nos momentos? (só onde a matriz liga) */
export const canPostVideo = (caps) => caps?.moment_video === true;
/** Quantos ainda cabem hoje, contando os momentos publicados nas últimas 24 h. */
export function remainingToday(caps, publishedLast24h) {
  const cap = Number(caps?.moments_per_day) || 0;
  return Math.max(0, cap - Math.max(0, Number(publishedLast24h) || 0));
}

/** Confere o arquivo escolhido antes de enviar. Devolve a mensagem de recusa, ou null se está certo. */
export function validateMomentFile(file, caps) {
  const type = String(file?.type ?? ""), size = Number(file?.size) || 0;
  const isVideo = VIDEO_TYPES.includes(type);
  if (!isVideo && !IMAGE_TYPES.includes(type)) return canPostVideo(caps) ? "Escolha uma foto (JPG, PNG ou WebP) ou um vídeo de até 30 segundos." : "Escolha uma foto JPG, PNG ou WebP.";
  if (isVideo && !canPostVideo(caps)) return "Momentos em vídeo estão disponíveis no plano Premium. Escolha uma foto.";
  if (size <= 0) return "Esse arquivo está vazio.";
  if (size > MAX_MOMENT_BYTES) return isVideo ? "O vídeo passa de 25 MB." : "A foto passa de 25 MB.";
  return null;
}
export const isVideoType = (type) => VIDEO_TYPES.includes(String(type));
export const extFor = (type) => EXT[String(type)] ?? null;
/** Caminho do arquivo dentro do bucket: pasta do dono + nome seguro. */
export function momentPath(ownerId, rand, ext) {
  if (!UUID.test(String(ownerId)) || !/^[a-z0-9]{4,12}$/i.test(String(rand)) || !/^(jpg|png|webp|mp4|webm|mov)$/.test(String(ext))) return null;
  return `${ownerId}/${rand}.${ext}`;
}
export const safeFilePath = (p) => (typeof p === "string" && FILE.test(p) ? p : null);

/** Segundos que o item fica na tela. */
export function itemSeconds(item) {
  if (item?.kind === "video") {
    const d = Number(item.duration);
    return Number.isFinite(d) && d > 0 ? Math.min(MAX_VIDEO_SECONDS, d) : MAX_VIDEO_SECONDS;
  }
  return IMAGE_SECONDS;
}

/** Aceita qualquer coisa vinda do banco e devolve grupos válidos (item ou casa estranha some; nunca quebra a tela). */
export function normalizeFeed(raw, urlFor = (p) => p) {
  const out = [];
  for (const g of Array.isArray(raw) ? raw : []) {
    if (!isRec(g) || !UUID.test(String(g.owner_id)) || !Array.isArray(g.items)) continue;
    const items = [];
    for (const i of g.items) {
      if (!isRec(i) || !UUID.test(String(i.id))) continue;
      const kind = i.kind === "video" ? "video" : "image";
      const path = safeFilePath(i.path);
      const url = path ? urlFor(path) : null;
      if (!url) continue;
      const poster = kind === "video" ? (safeFilePath(i.poster) ? urlFor(i.poster) ?? null : null) : null;
      const linkOk = (i.link_kind === "service" || i.link_kind === "event") && UUID.test(String(i.link_id));
      items.push({
        id: String(i.id), kind, url, poster,
        caption: str(i.caption, CAPTION_MAX) || null,
        createdAt: str(i.created_at, 40), expiresAt: str(i.expires_at, 40),
        duration: Number.isFinite(Number(i.duration)) ? Number(i.duration) : null,
        link: linkOk ? { kind: i.link_kind, id: String(i.link_id), title: str(i.link_title, 100) } : null,
      });
    }
    if (items.length === 0) continue;
    out.push({ ownerId: String(g.owner_id), houseId: UUID.test(String(g.house_id)) ? String(g.house_id) : "", name: str(g.name, 100) || "Casa", slug: str(g.slug, 60), avatar: typeof g.avatar === "string" && /^https:\/\//.test(g.avatar) ? g.avatar : undefined, followed: g.followed === true, items });
  }
  return out;
}

export const isGroupSeen = (group, seen) => group.items.every((i) => seen.has(i.id));
/** Primeiro item ainda não visto (ou o primeiro, se já viu tudo). */
export function startIndex(group, seen) {
  const k = group.items.findIndex((i) => !seen.has(i.id));
  return k < 0 ? 0 : k;
}
const latest = (g) => Math.max(0, ...g.items.map((i) => Date.parse(i.createdAt) || 0));

/** Ordem do carrossel: casas que a pessoa segue, depois casas em destaque, depois as outras; dentro de cada faixa, as não vistas primeiro e as mais recentes antes. */
export function sortGroups(groups, { highlightOwners = [], seen = new Set() } = {}) {
  const hl = new Set(highlightOwners);
  const rank = (g) => (g.followed ? 0 : hl.has(g.ownerId) ? 1 : 2);
  return [...groups].sort((a, b) => rank(a) - rank(b) || Number(isGroupSeen(a, seen)) - Number(isGroupSeen(b, seen)) || latest(b) - latest(a));
}

/** Próxima posição ao avançar (item seguinte; senão primeiro da próxima casa). null = acabou. */
export function nextPosition(groups, gi, ii) {
  const g = groups[gi];
  if (!g) return null;
  if (ii + 1 < g.items.length) return { gi, ii: ii + 1 };
  if (gi + 1 < groups.length) return { gi: gi + 1, ii: 0 };
  return null;
}
/** Posição ao voltar (item anterior; senão último da casa anterior). No começo de tudo, fica onde está. */
export function prevPosition(groups, gi, ii) {
  if (ii > 0) return { gi, ii: ii - 1 };
  if (gi > 0) return { gi: gi - 1, ii: Math.max(0, groups[gi - 1].items.length - 1) };
  return { gi, ii: 0 };
}
/** Pular para outra casa (deslizar para o lado): null se não houver. */
export function jumpGroup(groups, gi, dir) {
  const n = gi + (dir < 0 ? -1 : 1);
  return n >= 0 && n < groups.length ? { gi: n, ii: 0 } : null;
}

/** Lê os "vistos" guardados no aparelho; qualquer lixo vira conjunto vazio. */
export function parseSeen(raw) {
  try {
    const a = JSON.parse(String(raw ?? "[]"));
    return new Set(Array.isArray(a) ? a.filter((x) => typeof x === "string" && UUID.test(x)).slice(-SEEN_KEEP) : []);
  } catch { return new Set(); }
}
/** Guarda só os vistos que ainda existem no carrossel (mais um resto recente), para a lista não crescer para sempre. */
export function serializeSeen(seen, liveIds = []) {
  const live = new Set(liveIds);
  const keep = [...seen].filter((id) => live.has(id));
  return JSON.stringify(keep.slice(-SEEN_KEEP));
}

/** "agora", "há 5 min", "há 3 h". */
export function timeAgoPt(iso, now = Date.now()) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const m = Math.max(0, Math.floor((now - t) / 60000));
  if (m < 1) return "agora";
  if (m < 60) return `há ${m} min`;
  return `há ${Math.floor(m / 60)} h`;
}
/** Tempo que falta para sumir. */
export function expiresInPt(iso, now = Date.now()) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const m = Math.max(0, Math.ceil((t - now) / 60000));
  if (m < 60) return `${m} min`;
  return `${Math.ceil(m / 60)} h`;
}
