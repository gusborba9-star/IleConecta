import { supabase } from "@/lib/supabase";
import { validateImageFile } from "@/lib/imageUpload";
import { sampleBrightness, scrimAlpha } from "@/lib/postCardCore";

const MAX_SIDE = 1280;

export interface PreparedCardImage {
  blob: Blob;
  /** Endereço temporário só para a prévia; solte com URL.revokeObjectURL quando não precisar mais. */
  previewUrl: string;
  /** Força do fundo escuro atrás do texto branco, em %, de 35 a 85. */
  scrimPct: number;
  /** Brilho do ponto mais claro da foto (0 a 255): com ele o véu é recalculado quando a casa escolhe outra cor de letra. */
  brightness: number;
}

/** Lê a foto escolhida, reduz, mede o brilho e prepara o envio. Nada vai para o servidor aqui. */
export async function prepareCardImage(file: File): Promise<{ ok: true; image: PreparedCardImage } | { ok: false; error: string }> {
  const invalid = validateImageFile(file);
  if (invalid) return { ok: false, error: invalid };
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale)), h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return { ok: false, error: "Não foi possível ler essa imagem. Tente outra." };
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    // brilho medido numa miniatura (rápido): o texto precisa ler bem até nas partes mais claras
    const t = document.createElement("canvas"); t.width = 48; t.height = 48;
    const tctx = t.getContext("2d", { willReadFrequently: true });
    let brightness = 255;
    if (tctx) { tctx.drawImage(canvas, 0, 0, 48, 48); brightness = sampleBrightness(tctx.getImageData(0, 0, 48, 48).data); }
    const blob = (await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/webp", 0.8)))
      ?? (await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85)));
    if (!blob) return { ok: false, error: "Não foi possível ler essa imagem. Tente outra." };
    return { ok: true, image: { blob, previewUrl: URL.createObjectURL(blob), scrimPct: Math.round(scrimAlpha(brightness) * 100), brightness } };
  } catch {
    return { ok: false, error: "Não foi possível ler essa imagem. Tente outra." };
  }
}

/** Envia o card para a pasta da própria casa. Devolve o caminho dentro do bucket (é isso que o post guarda). */
export async function uploadCardImage(userId: string, blob: Blob): Promise<string | null> {
  if (!supabase) return null;
  const ext = blob.type === "image/webp" ? "webp" : "jpg";
  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from("post-images").upload(path, blob, { contentType: blob.type, cacheControl: "31536000", upsert: false });
  return error ? null : path;
}

export async function removeCardImage(path: string): Promise<void> {
  if (!supabase) return;
  await supabase.storage.from("post-images").remove([path]).catch(() => undefined);
}

/** Endereço público de uma imagem de post (só do bucket da plataforma). */
export function cardImageUrl(path: string): string | undefined {
  if (!supabase || !/^[0-9a-f-]{36}\/[A-Za-z0-9._-]+$/i.test(path)) return undefined;
  return supabase.storage.from("post-images").getPublicUrl(path).data.publicUrl;
}
