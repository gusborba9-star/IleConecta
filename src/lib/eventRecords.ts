import { supabase } from "@/lib/supabase";
import { prepareFile, uploadFile } from "@/lib/chatFiles";

export type RecordKind = "inicio" | "durante" | "fim";
export const RECORD_KIND_LABEL: Record<RecordKind, string> = { inicio: "Início", durante: "Durante", fim: "Fim" };

export interface EventRecord {
  id: string;
  eventId: string;
  kind: RecordKind;
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
    .select("id, event_id, kind, caption, path, secret, created_at, expires_at")
    .eq("event_id", eventId)
    .order("created_at", { ascending: false });
  return (data ?? []).map((r) => ({
    id: String(r.id), eventId: String(r.event_id), kind: r.kind as RecordKind, caption: r.caption ?? null,
    path: String(r.path), secret: Boolean(r.secret), createdAt: String(r.created_at), expiresAt: String(r.expires_at),
  }));
}

export type AddResult = { ok: true; notified: number } | { ok: false; message: string };

/** Reduz a foto, envia ao armazenamento privado e publica o registro (avisa os participantes). */
export async function addRecord(eventId: string, kind: RecordKind, caption: string, secret: boolean, file: File): Promise<AddResult> {
  if (!supabase) return { ok: false, message: "Indisponível." };
  if (!file.type.startsWith("image/")) return { ok: false, message: "Envie uma foto (JPG, PNG ou WebP)." };
  const prep = await prepareFile(file);
  if (!prep.ok) return { ok: false, message: prep.message };
  if (prep.file.size > 5 * 1024 * 1024) return { ok: false, message: "A foto passa de 5 MB." };
  const up = await uploadFile("ritual-records", eventId, prep.file);
  if (!up) return { ok: false, message: "Não foi possível enviar a foto. Tente novamente." };
  const { data, error } = await supabase.rpc("add_event_record", {
    p_event: eventId, p_kind: kind, p_caption: caption, p_path: up.path, p_size: up.size, p_secret: secret,
  });
  if (error) {
    await supabase.storage.from("ritual-records").remove([up.path]);
    return { ok: false, message: error.message || "Não foi possível publicar." };
  }
  return { ok: true, notified: Number(data ?? 0) };
}

export async function deleteRecord(id: string): Promise<boolean> {
  if (!supabase) return false;
  const { data, error } = await supabase.rpc("delete_event_record", { p_id: id });
  if (error) return false;
  if (typeof data === "string") await supabase.storage.from("ritual-records").remove([data]);
  return true;
}
