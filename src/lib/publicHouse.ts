import { supabase } from "@/lib/supabase";
import { kindLabel } from "@/lib/servicesCore";

export interface PublicService {
  id: string;
  title: string;
  kind: string;
  description: string | null;
  priceCents: number;
}
export interface PublicHouse {
  ownerId: string;
  slug: string;
  name: string;
  category: string;
  tags: string[];
  cover: string | null;
  avatar: string | null;
  bio: string | null;
  offerings: string | null;
  city: string;
  state: string;
  verified: boolean;
  services: PublicService[];
}

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const one = (v: unknown): Row => (Array.isArray(v) ? ((v[0] as Row) ?? {}) : ((v as Row) ?? {}));

/** Endereço público da casa (o mesmo que o QR code e os links compartilhados usam). */
export const publicHouseUrl = (slug: string) => `${window.location.origin}/c/${slug}`;

/** Dados que qualquer visitante pode ver (as regras do banco já liberam casas, perfis e serviços ativos para leitura). */
export async function fetchPublicHouse(slug: string): Promise<PublicHouse | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("houses")
    .select(
      "id, owner_id, slug, name, category, tags, cover_url, verified, offerings, profiles!houses_owner_id_fkey(avatar_url, bio, city, state), services(id, kind, custom_kind, title, description, price_cents, active, created_at)"
    )
    .eq("slug", slug)
    .maybeSingle();
  if (error || !data) return null;
  const r = data as Row;
  const p = one(r.profiles);
  const services = ((r.services as Row[]) ?? [])
    .filter((s) => s.active)
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
    .map((s) => ({
      id: String(s.id),
      title: String(s.title),
      kind: kindLabel(s.kind, s.custom_kind ?? null),
      description: s.description ?? null,
      priceCents: Number(s.price_cents),
    }));
  return {
    ownerId: String(r.owner_id),
    slug: String(r.slug),
    name: String(r.name),
    category: r.category || "Casa Espiritual",
    tags: Array.isArray(r.tags) ? r.tags : [],
    cover: r.cover_url ?? null,
    avatar: p.avatar_url ?? null,
    bio: p.bio ?? null,
    offerings: r.offerings ?? null,
    city: p.city ?? "",
    state: p.state ?? "",
    verified: Boolean(r.verified),
    services,
  };
}
