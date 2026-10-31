import { supabase } from "@/lib/supabase";

export interface ReviewItem {
  id: string;
  rating: number;
  comment: string | null;
  author: string;
  createdAt: string;
  reply: string | null;
  repliedAt: string | null;
  mine: boolean;
  reported: boolean;
  source: "servico" | "ritual";
}
export interface HouseReviews {
  enabled: boolean;
  count: number;
  avg: number;
  dist: Record<"1" | "2" | "3" | "4" | "5", number>;
  items: ReviewItem[];
}
export interface Reviewable {
  kind: "servico" | "ritual";
  ref: string;
  houseOwnerId: string;
  houseName: string;
  title: string;
  doneAt: string;
}

const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const EMPTY: HouseReviews = { enabled: false, count: 0, avg: 0, dist: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 }, items: [] };

export async function fetchHouseReviews(ownerId: string): Promise<HouseReviews> {
  if (!supabase) return EMPTY;
  const { data, error } = await supabase.rpc("house_reviews", { p_owner: ownerId, p_limit: 50 });
  if (error || !data) return EMPTY;
  const d = data as Record<string, unknown>;
  if (d.enabled !== true) return EMPTY;
  const dist = (d.dist ?? {}) as Record<string, unknown>;
  const items = Array.isArray(d.items) ? (d.items as Record<string, unknown>[]) : [];
  return {
    enabled: true,
    count: n(d.count),
    avg: n(d.avg),
    dist: { "1": n(dist["1"]), "2": n(dist["2"]), "3": n(dist["3"]), "4": n(dist["4"]), "5": n(dist["5"]) },
    items: items.map((i) => ({
      id: String(i.id),
      rating: n(i.rating),
      comment: typeof i.comment === "string" ? i.comment : null,
      author: String(i.author ?? "Cliente"),
      createdAt: String(i.created_at),
      reply: typeof i.reply === "string" ? i.reply : null,
      repliedAt: typeof i.replied_at === "string" ? i.replied_at : null,
      mine: i.mine === true,
      reported: i.reported === true,
      source: i.source === "ritual" ? "ritual" : "servico",
    })),
  };
}

/** Compras concluídas da pessoa logada que ainda não foram avaliadas (vazio com o recurso desligado). */
export async function fetchReviewable(): Promise<Reviewable[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("my_reviewable");
  if (error || !Array.isArray(data)) return [];
  return (data as Record<string, unknown>[]).map((r) => ({
    kind: r.kind === "ritual" ? "ritual" : "servico",
    ref: String(r.ref),
    houseOwnerId: String(r.house_owner_id),
    houseName: String(r.house_name),
    title: String(r.title ?? ""),
    doneAt: String(r.done_at),
  }));
}

/** Média e total por casa (chave = id do dono). */
export async function fetchReviewSummary(): Promise<Record<string, { avg: number; count: number }>> {
  if (!supabase) return {};
  const { data, error } = await supabase.rpc("review_summary");
  if (error || !data || typeof data !== "object") return {};
  const out: Record<string, { avg: number; count: number }> = {};
  for (const [k, v] of Object.entries(data as Record<string, { avg?: unknown; count?: unknown }>)) out[k] = { avg: n(v.avg), count: n(v.count) };
  return out;
}

const run = async (fn: string, args: Record<string, unknown>): Promise<string | null> => {
  if (!supabase) return "Disponível só com conta real.";
  const { error } = await supabase.rpc(fn, args);
  return error ? error.message || "Não foi possível concluir. Tente de novo." : null;
};

export const submitReview = (kind: "servico" | "ritual", ref: string, rating: number, comment: string, anonymous: boolean) =>
  run("submit_review", { p_kind: kind, p_ref: ref, p_rating: rating, p_comment: comment, p_anonymous: anonymous });
export const replyReview = (id: string, text: string) => run("reply_review", { p_review: id, p_text: text });
export const reportReview = (id: string, reason: string) => run("report_review", { p_review: id, p_reason: reason });

export interface ReportedReview {
  id: string;
  house: string;
  rating: number;
  comment: string | null;
  reason: string;
  reportedAt: string;
  hidden: boolean;
}
export async function fetchReportedReviews(): Promise<ReportedReview[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("admin_reported_reviews");
  if (error || !Array.isArray(data)) return [];
  return (data as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    house: String(r.house),
    rating: n(r.rating),
    comment: typeof r.comment === "string" ? r.comment : null,
    reason: String(r.report_reason ?? ""),
    reportedAt: String(r.reported_at),
    hidden: r.hidden === true,
  }));
}
export const setReviewHidden = (id: string, hidden: boolean) => run("admin_set_review_hidden", { p_review: id, p_hidden: hidden });
