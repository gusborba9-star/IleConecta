import { supabase } from "@/lib/supabase";

export type ImageKind = "avatar" | "cover";

const BUCKET: Record<ImageKind, string> = { avatar: "avatars", cover: "covers" };
// Lado maior depois da redução: mantém o site rápido e o armazenamento barato.
const MAX_SIDE: Record<ImageKind, number> = { avatar: 512, cover: 1600 };
const ALLOWED = ["image/jpeg", "image/png", "image/webp"];
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export function validateImageFile(file: File): string | null {
  if (!ALLOWED.includes(file.type)) return "Use uma imagem JPG, PNG ou WebP.";
  if (file.size > MAX_UPLOAD_BYTES) return "A imagem passa de 5 MB. Escolha uma menor.";
  return null;
}

/** Reduz a imagem no navegador e converte para WebP (JPEG se o navegador não suportar). */
async function shrink(file: File, maxSide: number): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas indisponível");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.85));
  if (blob && blob.type === "image/webp") return blob;
  const jpeg = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
  if (!jpeg) throw new Error("falha ao converter imagem");
  return jpeg;
}

export interface UploadResult {
  url?: string;
  error?: string;
}

/** Envia a imagem para o Supabase Storage na pasta do próprio usuário e devolve a URL pública. */
export async function uploadProfileImage(userId: string, kind: ImageKind, file: File): Promise<UploadResult> {
  if (!supabase) return { error: "Envio de imagens exige a conta real." };
  const invalid = validateImageFile(file);
  if (invalid) return { error: invalid };

  let blob: Blob;
  try {
    blob = await shrink(file, MAX_SIDE[kind]);
  } catch {
    return { error: "Não foi possível ler essa imagem. Tente outra." };
  }

  const ext = blob.type === "image/webp" ? "webp" : "jpg";
  const path = `${userId}/${kind}-${Date.now()}.${ext}`;
  const bucket = BUCKET[kind];
  const { error } = await supabase.storage.from(bucket).upload(path, blob, {
    contentType: blob.type,
    cacheControl: "31536000",
    upsert: false,
  });
  if (error) return { error: "Não foi possível enviar a imagem agora. Tente novamente." };
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return { url: data.publicUrl };
}
