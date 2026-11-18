// Biblioteca de músicas (painel do proprietário). Nenhuma regra mora aqui: o banco confere tudo; isto só envia o arquivo e chama as funções.
import { supabase } from "@/lib/supabase";
import { reportClientError } from "@/lib/clientErrors";
import { musicExt, validateMusicFile } from "@/lib/momentsCore";

export interface MusicRow { id: string; title: string; author: string; source_url: string | null; license_note: string | null; license_date: string | null; path: string; size_bytes: number; active: boolean; created_at: string; uses: number; style: string | null; occasions: string[]; vocal: boolean; license_kind: string | null; license_url: string | null }
export interface MusicAdminState { enabled: boolean; max_total_bytes: number; total_bytes: number; max_count: number; tracks: MusicRow[] }
export interface MusicFields { title: string; author: string; source: string; license: string; licenseDate: string; style: string; occasions: string[]; vocal: boolean; licenseKind: string; licenseUrl: string }
export const EMPTY_FIELDS: MusicFields = { title: "", author: "", source: "", license: "", licenseDate: "", style: "", occasions: [], vocal: false, licenseKind: "", licenseUrl: "" };
const httpsOk = (u: string) => !u.trim() || /^https:\/\/\S+$/.test(u.trim());
const saveMeta = (id: string, f: MusicFields) => supabase!.rpc("admin_music_meta", { p_id: id, p_style: f.style || null, p_occasions: f.occasions, p_vocal: f.vocal, p_license_kind: f.licenseKind || null, p_license_url: f.licenseUrl.trim() || null });

export async function fetchMusicAdmin(): Promise<MusicAdminState | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("admin_music_list");
  if (error || !data) return null;
  const d = data as MusicAdminState;
  return { enabled: d.enabled === true, max_total_bytes: Number(d.max_total_bytes) || 0, total_bytes: Number(d.total_bytes) || 0, max_count: Number(d.max_count) || 300, tracks: Array.isArray(d.tracks) ? d.tracks : [] };
}

const msg = (e: { message?: string } | null, fallback: string) => (e?.message && /[a-zçãéíóú]/i.test(e.message) && !/not_admin|violates|duplicate/i.test(e.message) ? e.message : fallback);

export async function addTrack(file: File, f: MusicFields): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: "Exige a conta real." };
  const bad = validateMusicFile(file); if (bad) return { ok: false, error: bad };
  if (!f.title.trim() || !f.author.trim()) return { ok: false, error: "Informe o título e o autor da música." };
  if (f.source.trim() && !/^https:\/\/\S+$/.test(f.source.trim())) return { ok: false, error: "O link da fonte precisa começar com https://" };
  if (!httpsOk(f.licenseUrl)) return { ok: false, error: "O link da licença precisa começar com https://" };
  const ext = musicExt(file); if (!ext) return { ok: false, error: "Use um arquivo MP3, M4A ou OGG." };
  const name = `${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}.${ext}`;
  const type = ext === "mp3" ? "audio/mpeg" : ext === "m4a" ? "audio/mp4" : "audio/ogg";
  const up = await supabase.storage.from("music").upload(name, file, { contentType: type, cacheControl: "31536000", upsert: false });
  if (up.error) { reportClientError(new Error(`envio de música falhou: ${up.error.message}`)); return { ok: false, error: "Não foi possível enviar o arquivo agora." }; }
  const { data: newId, error } = await supabase.rpc("admin_music_add", { p_path: name, p_title: f.title.trim(), p_author: f.author.trim(), p_source: f.source.trim() || null, p_license: f.license.trim() || null, p_license_date: f.licenseDate || null, p_size: file.size });
  if (error) { await supabase.storage.from("music").remove([name]).catch(() => undefined); return { ok: false, error: msg(error, "Não foi possível cadastrar a música.") }; }
  if (typeof newId === "string") {
    const m = await saveMeta(newId, f);
    if (m.error) return { ok: true, error: "Música cadastrada, mas estilo e ocasião não foram salvos. Edite a faixa para tentar de novo." };
  }
  return { ok: true };
}
export async function updateTrack(id: string, f: MusicFields): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false };
  if (f.source.trim() && !/^https:\/\/\S+$/.test(f.source.trim())) return { ok: false, error: "O link da fonte precisa começar com https://" };
  if (!httpsOk(f.licenseUrl)) return { ok: false, error: "O link da licença precisa começar com https://" };
  const { error } = await supabase.rpc("admin_music_update", { p_id: id, p_title: f.title, p_author: f.author, p_source: f.source || null, p_license: f.license || null, p_license_date: f.licenseDate || null });
  if (error) return { ok: false, error: msg(error, "Não foi possível salvar.") };
  const m = await saveMeta(id, f);
  return m.error ? { ok: false, error: msg(m.error, "Não foi possível salvar estilo e ocasião.") } : { ok: true };
}
export async function setTrackActive(id: string, on: boolean): Promise<boolean> {
  if (!supabase) return false;
  return !(await supabase.rpc("admin_music_set_active", { p_id: id, p_on: on })).error;
}
export async function setMusicEnabled(on: boolean): Promise<boolean> {
  if (!supabase) return false;
  return !(await supabase.rpc("admin_music_set_enabled", { p_on: on })).error;
}
export async function deleteTrack(id: string): Promise<boolean> {
  if (!supabase) return false;
  const { data, error } = await supabase.rpc("admin_music_delete", { p_id: id });
  if (error) return false;
  if (typeof data === "string") await supabase.storage.from("music").remove([data]).catch(() => undefined); // se falhar, a limpeza diária recolhe
  return true;
}
