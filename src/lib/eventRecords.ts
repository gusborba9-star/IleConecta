import { supabase } from "@/lib/supabase";
import { prepareFile, uploadFile } from "@/lib/chatFiles";

export type RecordKind = "inicio" | "durante" | "fim";
export type RecordMedia = "image" | "video";
export const RECORD_KIND_LABEL: Record<RecordKind, string> = { inicio: "Início", durante: "Durante", fim: "Fim" };

/** Duração máxima e tamanho máximo do vídeo (iguais ao limite do banco: 8 MB). */
export const VIDEO_MAX_SECONDS = 30;
export const VIDEO_MAX_BYTES = 8 * 1024 * 1024;

export interface EventRecord {
  id: string;
  eventId: string;
  kind: RecordKind;
  media: RecordMedia;
  caption: string | null;
  path: string;
  secret: boolean;
  createdAt: string;
  expiresAt: string;
}

export async function fetchRecords(eventId: string): Promise<EventRecord[]> {
  if (!supabase) return [];
  const { data } = await supabase
    .from("event_records")
    .select("id, event_id, kind, media, caption, path, secret, created_at, expires_at")
    .eq("event_id", eventId)
    .order("created_at", { ascending: false });
  return (data ?? []).map((r) => ({
    id: String(r.id), eventId: String(r.event_id), kind: r.kind as RecordKind, media: (r.media === "video" ? "video" : "image") as RecordMedia,
    caption: r.caption ?? null, path: String(r.path), secret: Boolean(r.secret), createdAt: String(r.created_at), expiresAt: String(r.expires_at),
  }));
}

export type AddResult = { ok: true; notified: number } | { ok: false; message: string };

async function publish(eventId: string, kind: RecordKind, caption: string, secret: boolean, up: { path: string; size: number }, media: RecordMedia): Promise<AddResult> {
  if (!supabase) return { ok: false, message: "Indisponível." };
  const { data, error } = await supabase.rpc("add_ritual_record", {
    p_event: eventId, p_kind: kind, p_caption: caption, p_path: up.path, p_size: up.size, p_secret: secret, p_media: media,
  });
  if (error) {
    await supabase.storage.from("ritual-records").remove([up.path]);
    return { ok: false, message: error.message || "Não foi possível publicar." };
  }
  return { ok: true, notified: Number(data ?? 0) };
}

/** Reduz a foto, envia ao armazenamento privado e publica o registro (avisa os participantes). */
export async function addRecord(eventId: string, kind: RecordKind, caption: string, secret: boolean, file: File): Promise<AddResult> {
  if (!supabase) return { ok: false, message: "Indisponível." };
  if (!file.type.startsWith("image/")) return { ok: false, message: "Envie uma foto (JPG, PNG ou WebP)." };
  const prep = await prepareFile(file);
  if (!prep.ok) return { ok: false, message: prep.message };
  if (prep.file.size > 5 * 1024 * 1024) return { ok: false, message: "A foto passa de 5 MB." };
  const up = await uploadFile("ritual-records", eventId, prep.file);
  if (!up) return { ok: false, message: "Não foi possível enviar a foto. Tente novamente." };
  return publish(eventId, kind, caption, secret, up, "image");
}

/** Envia o vídeo gravado no app (até 30 s) e publica o registro. */
export async function addVideoRecord(eventId: string, kind: RecordKind, caption: string, secret: boolean, blob: Blob): Promise<AddResult> {
  if (!supabase) return { ok: false, message: "Indisponível." };
  const type = blob.type.startsWith("video/mp4") ? "video/mp4" : "video/webm";
  if (blob.size > VIDEO_MAX_BYTES) return { ok: false, message: "O vídeo passou de 8 MB. Grave novamente." };
  const up = await uploadFile("ritual-records", eventId, { blob, type, name: "video", size: blob.size });
  if (!up) return { ok: false, message: "Não foi possível enviar o vídeo. Tente novamente." };
  return publish(eventId, kind, caption, secret, up, "video");
}

/** A casa pode gravar vídeo neste ritual? (interruptor do admin + plano Premium, conferido no banco). */
export async function canRecordVideo(eventId: string): Promise<boolean> {
  if (!supabase) return false;
  const { data, error } = await supabase.rpc("can_record_video", { p_event: eventId });
  return !error && data === true;
}

export async function deleteRecord(id: string, path: string): Promise<boolean> {
  if (!supabase) return false;
  // O arquivo sai primeiro (a regra de leitura do armazenamento depende do registro existir); depois o registro.
  await supabase.storage.from("ritual-records").remove([path]);
  const { error } = await supabase.rpc("delete_event_record", { p_id: id });
  return !error;
}
