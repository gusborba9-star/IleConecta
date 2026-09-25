import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { AccountType, Conversation, HouseUser, Message, Post, Purchase, Ritual, Story, User } from "@/types";
import { loadKey, saveKey } from "@/lib/storage";
import { seedConversations, seedPosts, seedRituals, seedStories, seedUsers } from "@/lib/mockData";
import { uid } from "@/lib/utils";

interface AppState {
  currentUser: User | null;
  users: User[];
  posts: Post[];
  stories: Story[];
  rituals: Ritual[];
  conversations: Conversation[];
  purchases: Purchase[];
  login: (email: string, password: string) => User | null;
  logout: () => void;
  register: (data: {
    type: AccountType;
    name: string;
    email: string;
    password: string;
    city: string;
    state: string;
    country: string;
    category?: string;
  }) => User;
  createPost: (post: Omit<Post, "id" | "createdAt" | "likes" | "comments">) => Post;
  addStory: (story: Omit<Story, "id" | "createdAt">) => Story;
  toggleLike: (postId: string) => void;
  commentPost: (postId: string, text: string) => void;
  buyRitual: (ritualId: string) => Purchase | null;
  applyBoost: (level: "cidade" | "estado" | "pais", days: number) => void;
  applyHighlight: (scope: "local" | "cidade" | "pais", days: number) => void;
  sendMessage: (toUserId: string, text: string) => Conversation;
  getConversationWith: (otherId: string) => Conversation | null;
  getHouse: (id: string) => HouseUser | null;
  getUser: (id: string) => User | null;
  updateUser: (patch: Partial<User>) => void;
}

const AppContext = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [users, setUsers] = useState<User[]>(() => loadKey("users", seedUsers));
  const [posts, setPosts] = useState<Post[]>(() => loadKey("posts", seedPosts));
  const [stories, setStories] = useState<Story[]>(() => loadKey("stories", seedStories));
  const [rituals, setRituals] = useState<Ritual[]>(() => loadKey("rituals", seedRituals));
  const [conversations, setConversations] = useState<Conversation[]>(() => loadKey("conversations", seedConversations));
  const [purchases, setPurchases] = useState<Purchase[]>(() => loadKey("purchases", []));
  const [currentUserId, setCurrentUserId] = useState<string | null>(() => loadKey("auth", null));

  useEffect(() => saveKey("users", users), [users]);
  useEffect(() => saveKey("posts", posts), [posts]);
  useEffect(() => saveKey("stories", stories), [stories]);
  useEffect(() => saveKey("rituals", rituals), [rituals]);
  useEffect(() => saveKey("conversations", conversations), [conversations]);
  useEffect(() => saveKey("purchases", purchases), [purchases]);
  useEffect(() => saveKey("auth", currentUserId), [currentUserId]);

  const currentUser = useMemo(() => users.find((u) => u.id === currentUserId) || null, [users, currentUserId]);

  const value: AppState = {
    currentUser,
    users,
    posts,
    stories,
    rituals,
    conversations,
    purchases,
    login(email, password) {
      const u = users.find((x) => x.email.toLowerCase() === email.toLowerCase() && x.password === password);
      if (u) setCurrentUserId(u.id);
      return u ?? null;
    },
    logout() {
      setCurrentUserId(null);
    },
    register(data) {
      const base = {
        id: uid(data.type === "commercial" ? "casa" : "user"),
        email: data.email,
        password: data.password,
        name: data.name,
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
      return user;
    },
    createPost(post) {
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
      setPosts((prev) =>
        prev.map((p) => {
          if (p.id !== postId) return p;
          const has = p.likes.includes(currentUser.id);
          return { ...p, likes: has ? p.likes.filter((id) => id !== currentUser.id) : [...p.likes, currentUser.id] };
        })
      );
    },
    commentPost(postId, text) {
      if (!currentUser) return;
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId
            ? {
                ...p,
                comments: [
                  ...p.comments,
                  { id: uid("c"), userId: currentUser.id, text, createdAt: new Date().toISOString() },
                ],
              }
            : p
        )
      );
    },
    buyRitual(ritualId) {
      if (!currentUser) return null;
      const rit = rituals.find((r) => r.id === ritualId);
      if (!rit) return null;
      if (rit.vagasVendidas >= rit.vagasTotal) return null;
      const fee = +(rit.price * (rit.platformFeePct / 100)).toFixed(2);
      const purchase: Purchase = {
        id: uid("pur"),
        ritualId,
        userId: currentUser.id,
        amount: rit.price,
        fee,
        createdAt: new Date().toISOString(),
      };
      setPurchases((prev) => [purchase, ...prev]);
      setRituals((prev) => prev.map((r) => (r.id === ritualId ? { ...r, vagasVendidas: r.vagasVendidas + 1 } : r)));
      return purchase;
    },
    applyBoost(level, days) {
      if (!currentUser || currentUser.type !== "commercial") return;
      const expiresAt = new Date(Date.now() + days * 86400 * 1000).toISOString();
      setUsers((prev) => prev.map((u) => (u.id === currentUser.id && u.type === "commercial" ? { ...u, boost: { level, expiresAt } } : u)));
    },
    applyHighlight(scope, days) {
      if (!currentUser || currentUser.type !== "commercial") return;
      const expiresAt = new Date(Date.now() + days * 86400 * 1000).toISOString();
      setUsers((prev) => prev.map((u) => (u.id === currentUser.id && u.type === "commercial" ? { ...u, highlight: { scope, expiresAt } } : u)));
    },
    sendMessage(toUserId, text) {
      if (!currentUser) throw new Error("no user");
      const now = new Date().toISOString();
      const existing = conversations.find(
        (c) => c.participantIds.includes(currentUser.id) && c.participantIds.includes(toUserId)
      );
      const msg: Message = { id: uid("m"), from: currentUser.id, to: toUserId, text, createdAt: now };
      if (existing) {
        const updated: Conversation = { ...existing, messages: [...existing.messages, msg], updatedAt: now };
        setConversations((prev) => prev.map((c) => (c.id === existing.id ? updated : c)));
        return updated;
      }
      const created: Conversation = {
        id: uid("conv"),
        participantIds: [currentUser.id, toUserId],
        messages: [msg],
        updatedAt: now,
      };
      setConversations((prev) => [created, ...prev]);
      return created;
    },
    getConversationWith(otherId) {
      if (!currentUser) return null;
      return conversations.find(
        (c) => c.participantIds.includes(currentUser.id) && c.participantIds.includes(otherId)
      ) ?? null;
    },
    getHouse(id) {
      const u = users.find((x) => x.id === id);
      return u && u.type === "commercial" ? (u as HouseUser) : null;
    },
    getUser(id) {
      return users.find((x) => x.id === id) ?? null;
    },
    updateUser(patch) {
      if (!currentUser) return;
      setUsers((prev) => prev.map((u) => (u.id === currentUser.id ? ({ ...u, ...patch } as User) : u)));
    },
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
