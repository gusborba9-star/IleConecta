import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { Conversation, HouseUser, Message, Post, Purchase, Ritual, Story, User } from "@/types";
import { loadKey, saveKey } from "@/lib/storage";
import { seedConversations, seedPosts, seedRituals, seedStories, seedUsers } from "@/lib/mockData";
import { uid } from "@/lib/utils";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import {
  fetchRemoteUser,
  remoteLogin,
  remoteLogout,
  remoteRegister,
  remoteUpdateProfile,
  type AuthResult,
  type RegisterInput,
} from "@/lib/remoteAuth";
import {
  fetchRemoteHouses,
  fetchRemotePosts,
  isRemoteId,
  remoteAddComment,
  remoteCreatePost,
  remoteSetLike,
} from "@/lib/remoteData";
import { canReserveDemoRitual, canSendDemoMessage, mergeDemoMessage, normalizeDemoEmail } from "@/lib/demoState";
import {
  isAuthState,
  isConversationsState,
  isPostsState,
  isPurchasesState,
  isRitualsState,
  isStoriesState,
  isUsersState,
} from "@/lib/persistedState.js";

interface AppState {
  currentUser: User | null;
  users: User[];
  posts: Post[];
  stories: Story[];
  rituals: Ritual[];
  conversations: Conversation[];
  purchases: Purchase[];
  /** true quando o login é real (Supabase); false no modo demonstração local. */
  isRemoteAuth: boolean;
  /** false enquanto a sessão salva ainda está sendo verificada. */
  authReady: boolean;
  login: (email: string, password: string) => Promise<AuthResult>;
  logout: () => Promise<void>;
  register: (data: RegisterInput) => Promise<AuthResult>;
  createPost: (post: Omit<Post, "id" | "createdAt" | "likes" | "comments">) => Promise<Post | null>;
  /** Recarrega casas e publicações reais do servidor (sem efeito no modo demonstração). */
  refreshRemote: () => Promise<void>;
  addStory: (story: Omit<Story, "id" | "createdAt">) => Story;
  toggleLike: (postId: string) => void;
  commentPost: (postId: string, text: string) => void;
  buyRitual: (ritualId: string) => Purchase | null;
  applyBoost: (level: "cidade" | "estado" | "pais", days: number) => void;
  applyHighlight: (scope: "local" | "cidade" | "pais", days: number) => void;
  sendMessage: (toUserId: string, text: string) => boolean;
  getConversationWith: (otherId: string) => Conversation | null;
  getHouse: (id: string) => HouseUser | null;
  getUser: (id: string) => User | null;
  /** Salva alterações do perfil. Devolve false se o servidor recusar (modo real). */
  updateUser: (patch: Partial<User>) => Promise<boolean>;
}

const AppContext = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [users, setUsers] = useState<User[]>(() => loadKey("users", seedUsers, isUsersState));
  const [rituals, setRituals] = useState<Ritual[]>(() => loadKey("rituals", seedRituals, (value): value is Ritual[] => isRitualsState(value, users)));
  const [posts, setPosts] = useState<Post[]>(() => loadKey("posts", seedPosts, (value): value is Post[] => isPostsState(value, users, rituals)));
  const [stories, setStories] = useState<Story[]>(() => loadKey("stories", seedStories, (value): value is Story[] => isStoriesState(value, users)));
  const [conversations, setConversations] = useState<Conversation[]>(() => loadKey("conversations", seedConversations, (value): value is Conversation[] => isConversationsState(value, users)));
  const [purchases, setPurchases] = useState<Purchase[]>(() => loadKey("purchases", [], (value): value is Purchase[] => isPurchasesState(value, users, rituals)));
  const [currentUserId, setCurrentUserId] = useState<string | null>(() => loadKey("auth", null, (value): value is string | null => isAuthState(value, users)));

  const [remoteUser, setRemoteUser] = useState<User | null>(null);
  const [remoteHouses, setRemoteHouses] = useState<HouseUser[]>([]);
  const [remotePosts, setRemotePosts] = useState<Post[]>([]);
  const [remoteCommenters, setRemoteCommenters] = useState<User[]>([]);
  const [authReady, setAuthReady] = useState(!isSupabaseConfigured);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    const load = async (userId: string | null, email: string) => {
      const u = userId ? await fetchRemoteUser(userId, email) : null;
      if (active) setRemoteUser(u);
    };
    supabase.auth
      .getSession()
      .then(({ data }) => load(data.session?.user.id ?? null, data.session?.user.email ?? ""))
      .catch(() => active && setRemoteUser(null))
      .finally(() => active && setAuthReady(true));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      // Fora do callback para evitar deadlock do cliente Supabase.
      setTimeout(() => void load(session?.user.id ?? null, session?.user.email ?? ""), 0);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const refreshRemote = async () => {
    if (!isSupabaseConfigured) return;
    const [houses, feed] = await Promise.all([fetchRemoteHouses(), fetchRemotePosts()]);
    setRemoteHouses(houses);
    setRemotePosts(feed.posts);
    setRemoteCommenters(feed.commenters);
  };

  const remoteUserId = remoteUser?.id ?? null;
  useEffect(() => {
    if (remoteUserId) void refreshRemote();
    else {
      setRemoteHouses([]);
      setRemotePosts([]);
      setRemoteCommenters([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remoteUserId]);

  const persist = (key: string, value: unknown) => {
    if (!saveKey(key, value)) {
      console.warn(`Ilê Conecta: não foi possível persistir "${key}" neste navegador.`);
    }
  };

  useEffect(() => persist("users", users), [users]);
  useEffect(() => persist("posts", posts), [posts]);
  useEffect(() => persist("stories", stories), [stories]);
  useEffect(() => persist("rituals", rituals), [rituals]);
  useEffect(() => persist("conversations", conversations), [conversations]);
  useEffect(() => persist("purchases", purchases), [purchases]);
  useEffect(() => persist("auth", currentUserId), [currentUserId]);

  // Com Supabase configurado, só existe usuário logado de verdade; contas demo nunca ficam ativas.
  const currentUser = useMemo(
    () => (isSupabaseConfigured ? remoteUser : users.find((u) => u.id === currentUserId) || null),
    [users, currentUserId, remoteUser]
  );
  const allUsers = useMemo(() => {
    // Dados reais do servidor têm prioridade; o usuário logado vem por último para refletir edições locais.
    const real = new Map<string, User>();
    [...remoteHouses, ...remoteCommenters].forEach((u) => real.set(u.id, u));
    if (remoteUser) real.set(remoteUser.id, remoteUser);
    return [...users.filter((u) => !real.has(u.id)), ...Array.from(real.values())];
  }, [users, remoteUser, remoteHouses, remoteCommenters]);

  const allPosts = useMemo(
    () => [...remotePosts, ...posts].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [remotePosts, posts]
  );

  const value: AppState = {
    currentUser,
    users: allUsers,
    isRemoteAuth: isSupabaseConfigured,
    authReady,
    refreshRemote,
    posts: allPosts,
    stories,
    rituals,
    conversations,
    purchases,
    async login(email, password) {
      if (isSupabaseConfigured) {
        const result = await remoteLogin(email, password);
        if (result.ok && result.user) setRemoteUser(result.user);
        return result;
      }
      const normalizedEmail = normalizeDemoEmail(email);
      const u = users.find((x) => x.email.trim().toLowerCase() === normalizedEmail && x.password === password);
      if (!u) return { ok: false, error: "E-mail ou senha inválidos" };
      setCurrentUserId(u.id);
      return { ok: true, user: u };
    },
    async logout() {
      if (isSupabaseConfigured) {
        await remoteLogout();
        setRemoteUser(null);
        return;
      }
      setCurrentUserId(null);
    },
    async register(data) {
      if (isSupabaseConfigured) {
        const result = await remoteRegister(data);
        if (result.ok && result.user) setRemoteUser(result.user);
        return result;
      }
      const normalizedEmail = normalizeDemoEmail(data.email);
      if (!normalizedEmail || users.some((existing) => existing.email.trim().toLowerCase() === normalizedEmail)) {
        return { ok: false, error: "Já existe uma conta de demonstração com esse e-mail." };
      }
      const base = {
        id: uid(data.type === "commercial" ? "casa" : "user"),
        email: normalizedEmail,
        password: data.password,
        name: data.name.trim(),
        city: data.city,
        state: data.state,
        country: data.country,
        createdAt: new Date().toISOString(),
        avatar: `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(data.name)}`,
      };
      const user: User =
        data.type === "commercial"
          ? {
              ...base,
              type: "commercial",
              cover: "https://images.unsplash.com/photo-1502786129293-79981df4e689?w=1600&h=600&fit=crop",
              category: data.category || "Casa Espiritual",
              tags: [],
              rating: 5,
              followers: 0,
            }
          : { ...base, type: "personal" };
      setUsers((prev) => [...prev, user]);
      setCurrentUserId(user.id);
      return { ok: true, user };
    },
    async createPost(post) {
      if (isSupabaseConfigured) {
        if (!currentUser) return null;
        const saved = await remoteCreatePost(currentUser.id, { content: post.content, kind: post.kind, image: post.image });
        if (saved) setRemotePosts((prev) => [saved, ...prev]);
        return saved;
      }
      const p: Post = { ...post, id: uid("post"), createdAt: new Date().toISOString(), likes: [], comments: [] };
      setPosts((prev) => [p, ...prev]);
      return p;
    },
    addStory(story) {
      const s: Story = { ...story, id: uid("s"), createdAt: new Date().toISOString() };
      setStories((prev) => [s, ...prev]);
      return s;
    },
    toggleLike(postId) {
      if (!currentUser) return;
      const uidNow = currentUser.id;
      const flip = (p: Post): Post => {
        if (p.id !== postId) return p;
        const has = p.likes.includes(uidNow);
        return { ...p, likes: has ? p.likes.filter((id) => id !== uidNow) : [...p.likes, uidNow] };
      };
      if (isRemoteId(postId)) {
        const current = remotePosts.find((p) => p.id === postId);
        if (!current) return;
        const willLike = !current.likes.includes(uidNow);
        setRemotePosts((prev) => prev.map(flip));
        // Reverte a curtida na tela se o servidor recusar.
        void remoteSetLike(postId, uidNow, willLike).then((ok) => {
          if (!ok) setRemotePosts((prev) => prev.map(flip));
        });
        return;
      }
      setPosts((prev) => prev.map(flip));
    },
    commentPost(postId, text) {
      if (!currentUser) return;
      const author = currentUser.id;
      if (isRemoteId(postId)) {
        void remoteAddComment(postId, author, text).then((saved) => {
          if (!saved) return;
          setRemotePosts((prev) =>
            prev.map((p) =>
              p.id === postId
                ? { ...p, comments: [...p.comments, { id: saved.id, userId: author, text, createdAt: saved.createdAt }] }
                : p
            )
          );
        });
        return;
      }
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId
            ? {
                ...p,
                comments: [...p.comments, { id: uid("c"), userId: author, text, createdAt: new Date().toISOString() }],
              }
            : p
        )
      );
    },
    buyRitual(ritualId) {
      if (!currentUser) return null;
      const rit = rituals.find((r) => r.id === ritualId);
      if (!rit || !canReserveDemoRitual(currentUser.type, rit.date, rit.vagasTotal - rit.vagasVendidas)) return null;
      const purchase: Purchase = {
        id: uid("demo_reservation"),
        ritualId,
        userId: currentUser.id,
        amount: rit.price,
        createdAt: new Date().toISOString(),
        mode: "demo",
      };
      setPurchases((prev) => [purchase, ...prev]);
      setRituals((prev) => prev.map((r) => (r.id === ritualId ? { ...r, vagasVendidas: r.vagasVendidas + 1 } : r)));
      return purchase;
    },
    applyBoost(level, days) {
      if (!currentUser || currentUser.type !== "commercial") return;
      const expiresAt = new Date(Date.now() + days * 86400 * 1000).toISOString();
      if (isSupabaseConfigured) {
        setRemoteUser((prev) => (prev && prev.type === "commercial" ? { ...prev, boost: { level, expiresAt } } : prev));
        return;
      }
      setUsers((prev) => prev.map((u) => (u.id === currentUser.id && u.type === "commercial" ? { ...u, boost: { level, expiresAt } } : u)));
    },
    applyHighlight(scope, days) {
      if (!currentUser || currentUser.type !== "commercial") return;
      const expiresAt = new Date(Date.now() + days * 86400 * 1000).toISOString();
      if (isSupabaseConfigured) {
        setRemoteUser((prev) => (prev && prev.type === "commercial" ? { ...prev, highlight: { scope, expiresAt } } : prev));
        return;
      }
      setUsers((prev) => prev.map((u) => (u.id === currentUser.id && u.type === "commercial" ? { ...u, highlight: { scope, expiresAt } } : u)));
    },
    sendMessage(toUserId, text) {
      const normalizedText = text.trim();
      if (!canSendDemoMessage(currentUser?.id, toUserId, normalizedText, allUsers.some((u) => u.id === toUserId))) {
        return false;
      }
      if (!currentUser) return false;

      const now = new Date().toISOString();
      const message: Message = {
        id: uid("m"),
        from: currentUser.id,
        to: toUserId,
        text: normalizedText,
        createdAt: now,
      };
      const newConversation: Conversation = {
        id: uid("conv"),
        participantIds: [currentUser.id, toUserId],
        messages: [message],
        updatedAt: now,
      };

      setConversations((prev) => mergeDemoMessage(prev, message, newConversation));
      return true;
    },
    getConversationWith(otherId) {
      if (!currentUser) return null;
      return conversations.find(
        (c) => c.participantIds.includes(currentUser.id) && c.participantIds.includes(otherId)
      ) ?? null;
    },
    getHouse(id) {
      const u = allUsers.find((x) => x.id === id);
      return u && u.type === "commercial" ? (u as HouseUser) : null;
    },
    getUser(id) {
      return allUsers.find((x) => x.id === id) ?? null;
    },
    async updateUser(patch) {
      if (!currentUser) return false;
      if (isSupabaseConfigured) {
        const saved = await remoteUpdateProfile(currentUser.id, patch);
        if (saved) setRemoteUser((prev) => (prev ? ({ ...prev, ...patch } as User) : prev));
        return saved;
      }
      setUsers((prev) => prev.map((u) => (u.id === currentUser.id ? ({ ...u, ...patch } as User) : u)));
      return true;
    },
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
