import { supabase } from "@/lib/supabase";
import { reportClientError } from "@/lib/clientErrors";
import { rememberPlanGuard } from "@/lib/planGuard";
import { extFor, isVideoType, momentPath, normalizeFeed, normalizeStats, safeFilePath, MAX_VIDEO_SECONDS, type MomentGroup, type MomentStats } from "@/lib/momentsCore";

const BUCKET = "moments";

/** Endereço público de um arquivo de momento (só do bucket da plataforma, só com caminho no formato esperado). */
export function momentUrl(path: string): string | undefined {
  if (!supabase || !safeFilePath(path)) return undefined;
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

/** Momentos no ar, agrupados por casa. Sem conta real ou com erro: lista vazia (o carrossel só some, nada quebra). */
export async function fetchMomentGroups(): Promise<MomentGroup[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("moments_feed", { p_limit: 40 });
  if (error) return [];
  return normalizeFeed(data, momentUrl);
}

export interface MyMoment { id: string; kind: "image" | "video"; createdAt: string; expiresAt: string; hidden: boolean; mediaPath: string | null; posterPath: string | null }

/** Id da casa do dono (as regras do banco usam o id da casa, a tela usa o id do dono). */
export async function fetchHouseId(ownerId: string): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.from("houses").select("id").eq("owner_id", ownerId).maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

/** Momentos da própria casa das últimas 24 h (para contar o limite do dia e permitir apagar). */
export async function fetchMyMoments(houseId: string): Promise<MyMoment[]> {
  if (!supabase) return [];
  const since = new Date(Date.now() - 24 * 3600e3).toISOString();
  const { data, error } = await supabase.from("stories").select("id, media_kind, created_at, expires_at, hidden_at, media_path, poster_path").eq("house_id", houseId).gt("created_at", since).order("created_at", { ascending: false });
  if (error || !data) return [];
  return data.map((r) => ({ id: r.id as string, kind: r.media_kind === "video" ? "video" : "image", createdAt: r.created_at as string, expiresAt: r.expires_at as string, hidden: r.hidden_at != null, mediaPath: (r.media_path as string | null) ?? null, posterPath: (r.poster_path as string | null) ?? null }));
}

/** Quantos momentos a casa já publicou nas últimas 24 h (apagar não devolve a vaga). Nulo se não der para saber. */
export async function fetchPublishedToday(houseId: string): Promise<number | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("moments_published_today", { p_house: houseId });
  return error || typeof data !== "number" || !Number.isFinite(data) || data < 0 ? null : Math.floor(data);
}

export interface LinkChoice { kind: "service" | "event"; id: string; title: string }

/** Serviços ativos e rituais publicados da casa, para ligar ao momento. */
export async function fetchLinkChoices(houseId: string): Promise<LinkChoice[]> {
  if (!supabase) return [];
  const [s, e] = await Promise.all([
    supabase.from("services").select("id, title").eq("house_id", houseId).eq("active", true).order("created_at", { ascending: false }).limit(30),
    supabase.from("events").select("id, title").eq("house_id", houseId).eq("status", "publicado").gt("starts_at", new Date().toISOString()).order("starts_at").limit(30),
  ]);
  return [
    ...((s.data ?? []).map((r) => ({ kind: "service" as const, id: r.id as string, title: String(r.title) }))),
    ...((e.data ?? []).map((r) => ({ kind: "event" as const, id: r.id as string, title: String(r.title) }))),
  ];
}

async function upload(ownerId: string, blob: Blob, type: string): Promise<string | null> {
  if (!supabase) return null;
  const ext = extFor(type);
  const path = ext ? momentPath(ownerId, `${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`, ext) : null;
  if (!path) return null;
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: type, cacheControl: "86400", upsert: false });
  return error ? null : path;
}
async function removeFiles(paths: (string | null)[]) {
  const list = paths.filter((p): p is string => Boolean(p));
  if (supabase && list.length) await supabase.storage.from(BUCKET).remove(list).catch(() => undefined);
}

/** ok = deu certo; senão `error` traz o motivo em português. */
export interface MomentResult { ok: boolean; error?: string }
export interface PublishInput {
  ownerId: string; houseId: string; blob: Blob; type: string; poster?: Blob | null; duration?: number | null;
  caption?: string; link?: { kind: "service" | "event"; id: string } | null;
}
/** Envia o arquivo e cria o momento. Se o banco recusar (plano, limite do dia), apaga o que enviou e devolve o motivo. */
export async function publishMoment(i: PublishInput): Promise<MomentResult> {
  if (!supabase) return { ok: false, error: "Publicar momentos exige a conta real." };
  const video = isVideoType(i.type);
  const mediaPath = await upload(i.ownerId, i.blob, i.type);
  if (!mediaPath) return { ok: false, error: "Não foi possível enviar o arquivo agora. Tente novamente." };
  let posterPath: string | null = null;
  if (video) {
    posterPath = i.poster ? await upload(i.ownerId, i.poster, i.poster.type === "image/jpeg" ? "image/jpeg" : "image/webp") : null;
    if (!posterPath) { await removeFiles([mediaPath]); return { ok: false, error: "Não foi possível preparar a capa do vídeo. Tente novamente." }; }
  }
  const { error } = await supabase.from("stories").insert({
    house_id: i.houseId, media_path: mediaPath, poster_path: posterPath,
    duration_s: video ? Math.max(1, Math.min(MAX_VIDEO_SECONDS + 1, Math.ceil(i.duration ?? 0))) : null,
    caption: i.caption?.trim() || null, link_kind: i.link?.kind ?? null, link_id: i.link?.id ?? null,
  });
  if (error) {
    await removeFiles([mediaPath, posterPath]);
    const guarded = rememberPlanGuard(error);
    if (!guarded) reportClientError(error);
    return { ok: false, error: guarded ? error.message : "Não foi possível publicar agora. Tente novamente." };
  }
  return { ok: true };
}

/** Apaga o momento (a casa) e os arquivos dele. */
export async function deleteMoment(m: Pick<MyMoment, "id" | "mediaPath" | "posterPath">): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from("stories").delete().eq("id", m.id);
  if (error) return false;
  await removeFiles([m.mediaPath, m.posterPath]);
  return true;
}

export async function reportMoment(id: string, reason: string): Promise<MomentResult> {
  if (!supabase) return { ok: false, error: "Denunciar exige a conta real." };
  const { error } = await supabase.rpc("report_moment", { p_story: id, p_reason: reason });
  if (!error) return { ok: true };
  const m = error.message ?? "";
  return { ok: false, error: /^(Muitas denúncias|Momento indisponível|Você não pode denunciar)/.test(m) ? m : "Não foi possível enviar a denúncia agora." };
}

/** Conta uma visualização (cada pessoa uma vez; a própria casa não conta). Silencioso: nunca atrapalha quem assiste. */
export function recordMomentView(id: string) {
  if (!supabase) return;
  void supabase.rpc("moment_view", { p_story: id }).then(() => undefined, () => undefined);
}

const FRIENDLY = /^(Entre na sua conta|Você não pode curtir|Não foi possível curtir|Não foi possível comentar|Sua conta está suspensa|Momento indisponível|Escreva o comentário|O comentário pode|Muitos comentários|Você já comentou|Use o chat)/;
const msgOf = (m: string | undefined, fallback: string) => (m && FRIENDLY.test(m) ? m : fallback);

export async function setMomentLike(id: string, on: boolean): Promise<MomentResult> {
  if (!supabase) return { ok: false, error: "Curtir exige a conta real." };
  const { error } = await supabase.rpc("moment_like", { p_story: id, p_on: on });
  return error ? { ok: false, error: msgOf(error.message, "Não foi possível curtir agora.") } : { ok: true };
}

export async function sendMomentComment(id: string, body: string): Promise<MomentResult> {
  if (!supabase) return { ok: false, error: "Comentar exige a conta real." };
  const { error } = await supabase.rpc("moment_comment", { p_story: id, p_body: body });
  return error ? { ok: false, error: msgOf(error.message, "Não foi possível comentar agora.") } : { ok: true };
}

/** Só a casa dona: visualizações, curtidas e comentários com o nome de quem fez. */
export async function fetchMomentStats(id: string): Promise<MomentStats | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("moment_stats", { p_story: id });
  return error ? null : normalizeStats(data);
}

export async function deleteMomentComment(id: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.rpc("moment_comment_delete", { p_comment: id });
  return !error;
}
