import { supabase } from "@/lib/supabase";

export type Audience = "todos" | "casas" | "clientes" | "selecionados";
export interface Recipient { id: string; display_name: string; account_type: "casa" | "cliente"; house_name: string | null }
export interface AnnounceRow { id: string; text: string; href: string | null; audience: Audience; recipients: number; created_at: string }

export const ANNOUNCE_MAX = 400;
export const ANNOUNCE_MIN = 10;
export const HREF_PATTERN = /^\/([A-Za-z0-9_?=&#.-][A-Za-z0-9/_?=&#.-]{0,199})?$/;
export const AUDIENCE_LABEL: Record<Audience, string> = { todos: "Todos (casas e clientes)", casas: "Só casas", clientes: "Só clientes", selecionados: "Pessoas escolhidas" };
export const LINK_OPTIONS: { label: string; href: string }[] = [
  { label: "Sem link", href: "" },
  { label: "Novidades de segurança e transparência", href: "/sobre/novidades-seguranca" },
  { label: "Termos e privacidade", href: "/termos" },
  { label: "Planos", href: "/planos" },
  { label: "Suporte", href: "/suporte" },
  { label: "Avisos de moderação (casas)", href: "/moderacao" },
];

const fail = (e: { message?: string } | null, fb: string) => new Error(e?.message && !/^(Failed|TypeError)/.test(e.message) ? e.message : fb);

/** Valida o aviso antes de enviar (o banco confere de novo). Devolve a mensagem de erro, ou null. */
export function announceProblem(text: string, href: string, audience: Audience, picked: number): string | null {
  const t = text.trim();
  if (t.length < ANNOUNCE_MIN) return `Escreva pelo menos ${ANNOUNCE_MIN} caracteres.`;
  if (t.length > ANNOUNCE_MAX) return `O aviso pode ter no máximo ${ANNOUNCE_MAX} caracteres.`;
  if (href && !HREF_PATTERN.test(href)) return "Endereço do link inválido.";
  if (audience === "selecionados" && (picked < 1 || picked > 200)) return "Escolha de 1 a 200 pessoas.";
  return null;
}

export async function announceCount(audience: Exclude<Audience, "selecionados">): Promise<number> {
  if (!supabase) return 0;
  const { data, error } = await supabase.rpc("admin_announce_count", { p_audience: audience });
  if (error) throw fail(error, "Não foi possível contar os destinatários.");
  return Number(data ?? 0);
}
export async function searchRecipients(q: string): Promise<Recipient[]> {
  if (!supabase || q.trim().length < 2) return [];
  const { data, error } = await supabase.rpc("admin_search_recipients", { p_q: q });
  if (error) throw fail(error, "Não foi possível buscar.");
  return (data as Recipient[]) ?? [];
}
export async function sendAnnouncement(text: string, href: string, audience: Audience, userIds: string[]): Promise<number> {
  if (!supabase) throw new Error("Sem conexão.");
  const { data, error } = await supabase.rpc("admin_announce", { p_text: text, p_href: href || null, p_audience: audience, p_user_ids: audience === "selecionados" ? userIds : null });
  if (error) throw fail(error, "Não foi possível enviar o aviso.");
  return Number(data ?? 0);
}
export async function announcementHistory(): Promise<AnnounceRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("admin_announcements_list");
  if (error) throw fail(error, "Não foi possível carregar o histórico.");
  return (data as AnnounceRow[]) ?? [];
}
