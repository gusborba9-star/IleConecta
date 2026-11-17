import type { HouseUser, PersonalUser, Post, User } from "@/types";
import { rememberPlanGuard } from "@/lib/planGuard";
import { supabase } from "@/lib/supabase";
import { fetchFollowSummary } from "@/lib/follows";
import { fetchReviewSummary } from "@/lib/reviews";
import { fromColumn } from "@/lib/postCardCore";
import { fitToMode, lettersFromRow, lettersToColumns, type Letters } from "@/lib/postLettersCore";
import { cardImageUrl, removeCardImage } from "@/lib/postImages";

const DEFAULT_COVER = "https://images.unsplash.com/photo-1502786129293-79981df4e689?w=1600&h=600&fit=crop";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ids reais do banco são UUID; os de exemplo (post_1, casa_1…) não. */
export const isRemoteId = (id: string) => UUID.test(id);

const avatarFallback = (name: string) =>
  `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(name)}`;

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const one = (v: unknown): Row | null => (Array.isArray(v) ? ((v[0] as Row) ?? null) : ((v as Row) ?? null));
const countryName = (c: unknown) => (c === "BR" || !c ? "Brasil" : String(c));

function toHouse(row: Row): HouseUser {
  const p = one(row.profiles) ?? {};
  const name = String(row.name);
  return {
    // No app, a casa é identificada pelo id do dono (mesmo id do usuário logado).
    id: String(row.owner_id),
    type: "commercial",
    name,
    email: "",
    password: "",
    avatar: p.avatar_url || avatarFallback(name),
    cover: row.cover_url || DEFAULT_COVER,
    bio: p.bio ?? undefined,
    city: p.city ?? "",
    state: p.state ?? "",
    country: countryName(p.country),
    category: row.category || "Casa Espiritual",
    tags: Array.isArray(row.tags) ? row.tags : [],
    // Nota e seguidores entram em fetchRemoteHouses; 0 esconde o número na tela.
    rating: 0,
    followers: 0,
    verified: Boolean(row.verified),
    offerings: row.offerings ? String(row.offerings) : undefined,
    createdAt: p.created_at ?? row.created_at,
  };
}

/** Casas encerradas ou bloqueadas que esta pessoa consegue ler (administração, equipe, pedido em andamento): não entram na vitrine. */
async function fetchHiddenHouseIds(): Promise<Set<string>> {
  if (!supabase) return new Set();
  try {
    const { data, error } = await supabase.rpc("vitrine_hidden_house_ids");
    if (error || !Array.isArray(data)) return new Set();
    return new Set(data.map(String));
  } catch { return new Set(); }
}

export async function fetchRemoteHouses(): Promise<HouseUser[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("houses")
    .select("id, owner_id, name, category, tags, cover_url, verified, offerings, created_at, profiles!houses_owner_id_fkey(avatar_url, bio, city, state, country, created_at)")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error || !data) {
    console.error("Ilê Conecta: não foi possível carregar as casas.", error?.message);
    return [];
  }
  const [{ counts }, ratings, hidden] = await Promise.all([fetchFollowSummary(), fetchReviewSummary(), fetchHiddenHouseIds()]);
  return (data as Row[]).filter((r) => !hidden.has(String(r.id))).map((r) => ({ ...toHouse(r), followers: counts[String(r.owner_id)] ?? 0, rating: ratings[String(r.owner_id)]?.avg ?? 0 }));
}

export interface RemoteFeed {
  posts: Post[];
  /** Autores de comentários que não são casas (clientes). */
  commenters: User[];
}

export async function fetchRemotePosts(): Promise<RemoteFeed> {
  if (!supabase) return { posts: [], commenters: [] };
  const { data, error } = await supabase
    .from("posts")
    .select(
      "id, house_id, kind, content, image_url, card_style, card_image_path, card_scrim, card_font, card_size, card_color, card_align, card_pos, card_bold, card_italic, edited_at, comments_off, created_at, houses(owner_id), post_likes(user_id), post_comments(id, user_id, text, created_at, hidden_by_house, profiles(display_name, avatar_url, account_type, city, state))"
    )
    .order("created_at", { ascending: false })
    .limit(50);
  if (error || !data) return { posts: [], commenters: [] };

  // Contagem pública de curtidas: a tabela só mostra ao visitante as próprias curtidas.
  const counts = new Map<string, number>();
  const ids = (data as Row[]).map((r) => String(r.id));
  if (ids.length > 0) {
    const { data: cnt } = await supabase.rpc("post_like_counts", { p_posts: ids });
    for (const c of (cnt as Row[] | null) ?? []) counts.set(String(c.post_id), Number(c.n ?? 0));
  }

  const hidden = await fetchHiddenHouseIds();
  const commenters = new Map<string, User>();
  const posts: Post[] = [];
  for (const row of data as Row[]) {
    const owner = one(row.houses)?.owner_id;
    if (!owner || hidden.has(String(row.house_id))) continue;
    const comments = ((row.post_comments as Row[]) ?? [])
      .slice()
      .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
      .map((c) => {
        const pr = one(c.profiles);
        if (pr && pr.account_type !== "casa" && !commenters.has(c.user_id)) {
          const person: PersonalUser = {
            id: String(c.user_id),
            type: "personal",
            name: pr.display_name,
            email: "",
            password: "",
            avatar: pr.avatar_url || avatarFallback(pr.display_name),
            city: pr.city ?? "",
            state: pr.state ?? "",
            country: "Brasil",
            createdAt: c.created_at,
          };
          commenters.set(c.user_id, person);
        }
        return { id: String(c.id), userId: String(c.user_id), text: String(c.text), createdAt: String(c.created_at), ...(c.hidden_by_house === true ? { hidden: true } : {}) };
      });
    posts.push({
      id: String(row.id),
      houseId: String(owner),
      content: String(row.content),
      image: row.image_url ?? undefined,
      card: readCard(row),
      kind: row.kind,
      likes: ((row.post_likes as Row[]) ?? []).map((l) => String(l.user_id)),
      likeCount: counts.get(String(row.id)),
      comments,
      ...(row.edited_at ? { editedAt: String(row.edited_at) } : {}),
      ...(row.comments_off === true ? { commentsOff: true } : {}),
      createdAt: String(row.created_at),
    });
  }
  return { posts, commenters: Array.from(commenters.values()) };
}

/** Card estilizado de uma linha do banco (ou nada, se for o card normal ou os dados não forem confiáveis). */
function readCard(row: Row): Post["card"] {
  const style = fromColumn(row.card_style);
  if (style === "normal" || typeof row.card_image_path !== "string") return undefined;
  const image = cardImageUrl(row.card_image_path);
  if (!image) return undefined;
  const pct = Number(row.card_scrim);
  return { style, image, path: row.card_image_path, scrimPct: Number.isFinite(pct) ? Math.min(85, Math.max(35, Math.round(pct))) : 55, letters: fitToMode(lettersFromRow(row), style) };
}

/** Cria a publicação da casa logada. Devolve o post salvo ou null se o servidor recusar. */
export async function remoteCreatePost(
  ownerId: string,
  input: { content: string; kind: Post["kind"]; image?: string; card?: { style: "total" | "parcial"; path: string; scrimPct: number; letters?: Letters } }
): Promise<Post | null> {
  if (!supabase) return null;
  const { data: house } = await supabase.from("houses").select("id").eq("owner_id", ownerId).maybeSingle();
  if (!house) return null;
  const { data, error } = await supabase
    .from("posts")
    .insert({ house_id: house.id, kind: input.kind, content: input.content, image_url: input.image ?? null, ...(input.card ? { card_style: input.card.style, card_image_path: input.card.path, card_rights_ack: true, card_scrim: input.card.scrimPct, ...lettersToColumns(fitToMode(input.card.letters, input.card.style)) } : {}) })
    .select("id, created_at")
    .single();
  if (error) rememberPlanGuard(error);
  if (error || !data) return null;
  return {
    id: String(data.id),
    houseId: ownerId,
    content: input.content,
    image: input.image,
    card: input.card ? { style: input.card.style, image: cardImageUrl(input.card.path) ?? "", path: input.card.path, scrimPct: input.card.scrimPct, letters: fitToMode(input.card.letters, input.card.style) } : undefined,
    kind: input.kind,
    likes: [],
    comments: [],
    createdAt: String(data.created_at),
  };
}

/** Exclui a publicação da casa (curtidas e comentários saem junto) e, se tinha foto de card, apaga a foto do armazenamento. Devolve null se saiu ou a mensagem do motivo. */
export async function remoteDeletePost(postId: string, cardPath?: string): Promise<string | null> {
  if (!supabase) return "Não foi possível excluir agora. Tente novamente.";
  const { data, error } = await supabase.from("posts").delete().eq("id", postId).select("id");
  if (error) return /^Esta publicação está impulsionada/.test(error.message ?? "") ? error.message : "Não foi possível excluir agora. Tente novamente.";
  // a regra do banco só deixa a dona apagar: se nada foi apagado, a publicação continua (não finge sucesso)
  if (!data || data.length === 0) return "Não foi possível excluir agora. Tente novamente.";
  if (cardPath) await removeCardImage(cardPath);
  return null;
}

export type TextLock = { state: "correcao" | "travado"; until?: string };

/** Posts da própria casa que estão impulsionados e o que ainda se pode fazer com o texto (a regra é do banco; aqui só se mostra). */
export async function fetchMyPostTextLocks(): Promise<Map<string, TextLock>> {
  const out = new Map<string, TextLock>();
  if (!supabase) return out;
  const { data, error } = await supabase.rpc("my_post_text_locks");
  if (error || !Array.isArray(data)) return out;
  for (const r of data as Row[]) {
    if (r.state === "correcao" || r.state === "travado") out.set(String(r.post_id), { state: r.state, ...(r.until ? { until: String(r.until) } : {}) });
  }
  return out;
}

const EDIT_GENERIC = "Não foi possível salvar agora. Tente novamente.";
/** Só mensagens escritas pelas regras do banco (em português, feitas para a pessoa ler) passam para a tela. */
const EDIT_MSG = /^(Escreva o texto|Posts com a cara|Letras com a sua|Esta publicação está impulsionada|No Plano Grátis|Os comentários desta|Você só pode cuidar|Conta suspensa)/;
const editMessage = (m: string | undefined) => (m && EDIT_MSG.test(m) ? m : EDIT_GENERIC);

/** Edita o texto da publicação da casa. Devolve a data da edição ou a mensagem do motivo. */
export async function remoteEditPostText(postId: string, content: string): Promise<{ editedAt: string } | { error: string }> {
  if (!supabase) return { error: EDIT_GENERIC };
  const { data, error } = await supabase.from("posts").update({ content }).eq("id", postId).select("id, edited_at");
  if (error) return { error: editMessage(error.message) };
  // a regra do banco só deixa a dona editar: se nada mudou, não finge sucesso
  if (!data || data.length === 0) return { error: EDIT_GENERIC };
  return { editedAt: String(data[0].edited_at ?? new Date().toISOString()) };
}

/** Liga/desliga os comentários novos da publicação. Devolve null se salvou ou a mensagem do motivo. */
export async function remoteSetCommentsOff(postId: string, off: boolean): Promise<string | null> {
  if (!supabase) return EDIT_GENERIC;
  const { data, error } = await supabase.from("posts").update({ comments_off: off }).eq("id", postId).select("id");
  if (error) return editMessage(error.message);
  return !data || data.length === 0 ? EDIT_GENERIC : null;
}

/** Oculta ou mostra de novo um comentário na publicação da casa. Devolve null se salvou ou a mensagem do motivo. */
export async function remoteSetCommentHidden(commentId: string, hidden: boolean): Promise<string | null> {
  if (!supabase) return EDIT_GENERIC;
  const { error } = await supabase.rpc("house_set_comment_hidden", { p_comment: commentId, p_hidden: hidden });
  return error ? editMessage(error.message) : null;
}

export async function remoteSetLike(postId: string, userId: string, liked: boolean): Promise<boolean> {
  if (!supabase) return false;
  if (liked) {
    const { error } = await supabase.from("post_likes").insert({ post_id: postId, user_id: userId });
    // 23505 = já curtido: o estado desejado já existe.
    return !error || error.code === "23505";
  }
  const { error } = await supabase.from("post_likes").delete().eq("post_id", postId).eq("user_id", userId);
  return !error;
}

export async function remoteAddComment(
  postId: string,
  userId: string,
  text: string
): Promise<{ id: string; createdAt: string } | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("post_comments")
    .insert({ post_id: postId, user_id: userId, text })
    .select("id, created_at")
    .single();
  if (error || !data) return null;
  return { id: String(data.id), createdAt: String(data.created_at) };
}
