import type { HouseUser, PersonalUser, Post, User } from "@/types";
import { supabase } from "@/lib/supabase";
import { fetchFollowSummary } from "@/lib/follows";

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
    // Avaliações reais ainda não existem: 0 esconde esse número na tela. Seguidores entram em fetchRemoteHouses.
    rating: 0,
    followers: 0,
    verified: Boolean(row.verified),
    offerings: row.offerings ? String(row.offerings) : undefined,
    createdAt: p.created_at ?? row.created_at,
  };
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
  const { counts } = await fetchFollowSummary();
  return (data as Row[]).map((r) => ({ ...toHouse(r), followers: counts[String(r.owner_id)] ?? 0 }));
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
      "id, kind, content, image_url, created_at, houses(owner_id), post_likes(user_id), post_comments(id, user_id, text, created_at, profiles(display_name, avatar_url, account_type, city, state))"
    )
    .order("created_at", { ascending: false })
    .limit(50);
  if (error || !data) return { posts: [], commenters: [] };

  const commenters = new Map<string, User>();
  const posts: Post[] = [];
  for (const row of data as Row[]) {
    const owner = one(row.houses)?.owner_id;
    if (!owner) continue;
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
        return { id: String(c.id), userId: String(c.user_id), text: String(c.text), createdAt: String(c.created_at) };
      });
    posts.push({
      id: String(row.id),
      houseId: String(owner),
      content: String(row.content),
      image: row.image_url ?? undefined,
      kind: row.kind,
      likes: ((row.post_likes as Row[]) ?? []).map((l) => String(l.user_id)),
      comments,
      createdAt: String(row.created_at),
    });
  }
  return { posts, commenters: Array.from(commenters.values()) };
}

/** Cria a publicação da casa logada. Devolve o post salvo ou null se o servidor recusar. */
export async function remoteCreatePost(
  ownerId: string,
  input: { content: string; kind: Post["kind"]; image?: string }
): Promise<Post | null> {
  if (!supabase) return null;
  const { data: house } = await supabase.from("houses").select("id").eq("owner_id", ownerId).maybeSingle();
  if (!house) return null;
  const { data, error } = await supabase
    .from("posts")
    .insert({ house_id: house.id, kind: input.kind, content: input.content, image_url: input.image ?? null })
    .select("id, created_at")
    .single();
  if (error || !data) return null;
  return {
    id: String(data.id),
    houseId: ownerId,
    content: input.content,
    image: input.image,
    kind: input.kind,
    likes: [],
    comments: [],
    createdAt: String(data.created_at),
  };
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
