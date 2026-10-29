import { supabase } from "@/lib/supabase";

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" };

export interface PreparedFile { blob: Blob; type: string; name: string; size: number }
export interface UploadedFile { path: string; type: string; name: string; size: number }
export type Prepared = { ok: true; file: PreparedFile } | { ok: false; message: string };

/** Foto: reduz para até 1600 px (JPEG) e remove metadados como a localização. PDF: segue como está. */
export async function prepareFile(file: File): Promise<Prepared> {
  const type = file.type;
  if (!(ALLOWED_TYPES as readonly string[]).includes(type)) return { ok: false, message: "Envie foto (JPG, PNG, WebP) ou PDF." };
  if (type === "application/pdf") {
    if (file.size > MAX_FILE_BYTES) return { ok: false, message: "O PDF passa de 10 MB." };
    return { ok: true, file: { blob: file, type, name: file.name.slice(0, 120), size: file.size } };
  }
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bmp.width * scale));
    canvas.height = Math.max(1, Math.round(bmp.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.82));
    if (!blob) throw new Error("blob");
    if (blob.size > MAX_FILE_BYTES) return { ok: false, message: "A foto é grande demais." };
    return { ok: true, file: { blob, type: "image/jpeg", name: (file.name.replace(/\.[^.]+$/, "") || "foto").slice(0, 100) + ".jpg", size: blob.size } };
  } catch {
    // Não deu para reduzir: envia o original se couber.
    if (file.size > MAX_FILE_BYTES) return { ok: false, message: "A foto é grande demais." };
    return { ok: true, file: { blob: file, type, name: file.name.slice(0, 120), size: file.size } };
  }
}

export async function uploadFile(bucket: "chat-files" | "report-evidence", folder: string, f: PreparedFile): Promise<UploadedFile | null> {
  if (!supabase) return null;
  const path = `${folder}/${crypto.randomUUID()}.${EXT[f.type] ?? "bin"}`;
  const { error } = await supabase.storage.from(bucket).upload(path, f.blob, { contentType: f.type, upsert: false });
  return error ? null : { path, type: f.type, name: f.name, size: f.size };
}

/** Anexa o arquivo já enviado a uma mensagem. */
export async function sendAttachment(conversationId: string, senderId: string, f: UploadedFile, caption: string): Promise<"ok" | "blocked" | "error"> {
  if (!supabase) return "error";
  const text = caption.trim() || (f.type === "application/pdf" ? "📄 Documento" : "📷 Foto");
  const { error } = await supabase.from("messages").insert({
    conversation_id: conversationId, sender_id: senderId, text: text.slice(0, 2000), from_assistant: false,
    attachment_path: f.path, attachment_type: f.type, attachment_name: f.name, attachment_size: f.size,
  });
  if (!error) return "ok";
  return error.message?.includes("blocked") ? "blocked" : "error";
}

const cache = new Map<string, { url: string; exp: number }>();
/** Link temporário (1 hora) para ver o arquivo. */
export async function signedUrl(bucket: string, path: string): Promise<string | null> {
  if (!supabase) return null;
  const key = `${bucket}/${path}`;
  const hit = cache.get(key);
  if (hit && hit.exp > Date.now()) return hit.url;
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
  if (error || !data?.signedUrl) return null;
  cache.set(key, { url: data.signedUrl, exp: Date.now() + 50 * 60_000 });
  return data.signedUrl;
}

export const isPlaceholderText = (t: string) => t === "📷 Foto" || t === "📄 Documento";
export const formatSize = (b: number) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
