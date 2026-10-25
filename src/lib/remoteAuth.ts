import type { AccountType, HouseUser, PersonalUser, User } from "@/types";
import { supabase } from "@/lib/supabase";

export interface AuthResult {
  ok: boolean;
  user?: User | null;
  needsEmailConfirmation?: boolean;
  /** Mensagem pronta para o usuário quando ok = false. */
  error?: string;
}

export interface RegisterInput {
  type: AccountType;
  name: string;
  email: string;
  password: string;
  city: string;
  state: string;
  country: string;
  category?: string;
}

export const MIN_PASSWORD_LENGTH = 8;

const DEFAULT_COVER = "https://images.unsplash.com/photo-1502786129293-79981df4e689?w=1600&h=600&fit=crop";

const avatarFallback = (name: string) =>
  `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(name)}`;

/** Traduz mensagens do Supabase Auth para português, sem vazar detalhes técnicos. */
export function translateAuthError(message: string | undefined): string {
  const m = (message ?? "").toLowerCase();
  if (m.includes("invalid login credentials")) return "E-mail ou senha inválidos.";
  if (m.includes("email not confirmed")) return "Confirme seu e-mail antes de entrar. Enviamos um link para você.";
  if (m.includes("already registered") || m.includes("already been registered")) return "Já existe uma conta com esse e-mail.";
  if (m.includes("password") && (m.includes("least") || m.includes("weak") || m.includes("short"))) {
    return `A senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`;
  }
  if (m.includes("rate limit") || m.includes("too many") || m.includes("security purposes")) {
    return "Muitas tentativas. Aguarde um minuto e tente novamente.";
  }
  if (m.includes("invalid") && m.includes("email")) return "E-mail inválido.";
  if (m.includes("network") || m.includes("fetch")) return "Sem conexão com o servidor. Verifique sua internet.";
  return "Não foi possível concluir agora. Tente novamente.";
}

/** Carrega perfil (e casa, se houver) do usuário autenticado e monta o User usado pelo app. */
export async function fetchRemoteUser(userId: string, email: string): Promise<User | null> {
  if (!supabase) return null;

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, account_type, display_name, avatar_url, bio, city, state, country, created_at")
    .eq("id", userId)
    .maybeSingle();
  if (error || !profile) return null;

  const base = {
    id: profile.id as string,
    email,
    password: "",
    name: profile.display_name as string,
    avatar: (profile.avatar_url as string | null) || avatarFallback(profile.display_name as string),
    bio: (profile.bio as string | null) ?? undefined,
    city: (profile.city as string | null) ?? "",
    state: (profile.state as string | null) ?? "",
    country: (profile.country as string | null) === "BR" ? "Brasil" : ((profile.country as string | null) ?? "Brasil"),
    createdAt: profile.created_at as string,
  };

  if (profile.account_type === "casa") {
    const { data: house } = await supabase
      .from("houses")
      .select("cover_url, category, tags, verified")
      .eq("owner_id", userId)
      .maybeSingle();
    const houseUser: HouseUser = {
      ...base,
      type: "commercial",
      cover: (house?.cover_url as string | null) || DEFAULT_COVER,
      category: (house?.category as string | null) || "Casa Espiritual",
      tags: (house?.tags as string[] | null) ?? [],
      rating: 5,
      followers: 0,
      verified: Boolean(house?.verified),
    };
    return houseUser;
  }

  const personal: PersonalUser = { ...base, type: "personal" };
  return personal;
}

export async function remoteLogin(email: string, password: string): Promise<AuthResult> {
  if (!supabase) return { ok: false, error: "Servidor indisponível." };
  const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
  if (error || !data.user) return { ok: false, error: translateAuthError(error?.message) };
  const user = await fetchRemoteUser(data.user.id, data.user.email ?? email);
  if (!user) return { ok: false, error: "Sua conta existe, mas o perfil não foi encontrado. Fale com o suporte." };
  return { ok: true, user };
}

export async function remoteRegister(input: RegisterInput): Promise<AuthResult> {
  if (!supabase) return { ok: false, error: "Servidor indisponível." };
  if (input.password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, error: `A senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.` };
  }
  const { data, error } = await supabase.auth.signUp({
    email: input.email.trim().toLowerCase(),
    password: input.password,
    options: {
      // Lido pelo gatilho handle_new_user no banco (cria perfil, casa e assistente).
      data: {
        account_type: input.type === "commercial" ? "casa" : "cliente",
        display_name: input.name.trim(),
        city: input.city.trim(),
        state: input.state.trim(),
        category: input.category?.trim() ?? "",
      },
    },
  });
  if (error) return { ok: false, error: translateAuthError(error.message) };
  // Supabase devolve usuário sem identidades quando o e-mail já existe (proteção contra enumeração).
  if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    return { ok: false, error: "Já existe uma conta com esse e-mail." };
  }
  if (!data.session || !data.user) return { ok: true, user: null, needsEmailConfirmation: true };
  const user = await fetchRemoteUser(data.user.id, data.user.email ?? input.email);
  return { ok: true, user };
}

export async function remoteLogout(): Promise<void> {
  if (supabase) await supabase.auth.signOut();
}

/** Atualiza apenas campos seguros do perfil/casa. Imagens só quando são URLs (upload real vem com o Storage). */
export async function remoteUpdateProfile(userId: string, patch: Partial<User>): Promise<void> {
  if (!supabase) return;
  const isUrl = (v: unknown): v is string => typeof v === "string" && /^https?:\/\//.test(v);

  const profile: Record<string, unknown> = {};
  if (typeof patch.name === "string" && patch.name.trim().length >= 2) profile.display_name = patch.name.trim().slice(0, 80);
  if (typeof patch.bio === "string") profile.bio = patch.bio.slice(0, 500);
  if (typeof patch.city === "string") profile.city = patch.city.slice(0, 80);
  if (typeof patch.state === "string") profile.state = patch.state.slice(0, 40);
  if (isUrl(patch.avatar)) profile.avatar_url = patch.avatar;
  if (Object.keys(profile).length) {
    const { error } = await supabase.from("profiles").update(profile).eq("id", userId);
    if (error) console.warn("Ilê Conecta: não foi possível salvar o perfil.", error.message);
  }

  const house: Record<string, unknown> = {};
  const h = patch as Partial<HouseUser>;
  if (isUrl(h.cover)) house.cover_url = h.cover;
  if (typeof h.category === "string") house.category = h.category.slice(0, 80);
  if (Array.isArray(h.tags)) house.tags = h.tags.filter((t) => typeof t === "string").slice(0, 20);
  if (Object.keys(house).length) {
    const { error } = await supabase.from("houses").update(house).eq("owner_id", userId);
    if (error) console.warn("Ilê Conecta: não foi possível salvar a casa.", error.message);
  }
}
