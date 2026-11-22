export type AccountType = "personal" | "commercial";

export interface BaseUser {
  id: string;
  type: AccountType;
  name: string;
  email: string;
  password: string;
  avatar: string;
  bio?: string;
  city: string;
  state: string;
  country: string;
  createdAt: string;
}

export interface HouseUser extends BaseUser {
  type: "commercial";
  cover: string;
  category: string;
  tags: string[];
  rating: number;
  followers: number;
  verified?: boolean;
  /** Texto livre da casa sobre os trabalhos que realiza, mesmo sem estarem publicados. */
  offerings?: string;
  boost?: {
    level: "cidade" | "estado" | "pais";
    expiresAt: string;
  };
  highlight?: {
    scope: "local" | "cidade" | "estado" | "pais";
    expiresAt: string;
  };
}

export interface PersonalUser extends BaseUser {
  type: "personal";
  interests?: string[];
}

export type User = HouseUser | PersonalUser;

export interface Post {
  id: string;
  houseId: string; // author user id
  content: string;
  image?: string;
  /** Card estilizado (Profissional/Premium): modo, imagem da plataforma e força do fundo atrás do texto (%). */
  card?: { style: "total" | "parcial"; image: string; path?: string; scrimPct: number; letters?: import("@/lib/postLettersCore").Letters };
  kind: "trabalho" | "ritual" | "buzios" | "story" | "geral";
  /** Categoria escolhida pela casa ao publicar (ausente = geral). */
  category?: import("@/lib/postCategoryCore").PostCategory;
  /** Ritual real (events.id) anexado pela casa: o feed mostra o cartão da gira com "Reservar vaga". */
  eventId?: string;
  ritualId?: string;
  likes: string[]; // user ids visíveis (o banco só mostra as próprias curtidas; a dona da casa vê todas)
  likeCount?: number; // total público, vindo de post_like_counts
  comments: {
    id: string;
    userId: string;
    text: string;
    createdAt: string;
    /** A casa ocultou este comentário: só ela e quem escreveu o veem. */
    hidden?: boolean;
  }[];
  /** Total de comentários que a pessoa enxerga, vindo do servidor (o feed não traz a lista: ela é lida ao abrir). */
  commentCount?: number;
  /** false = a lista ainda não foi lida (post real); true = já foi; ausente = demonstração (a lista já está completa). */
  commentsLoaded?: boolean;
  /** Data da última edição do texto (a publicação mostra "editado"). */
  editedAt?: string;
  /** Só para a casa dona de post impulsionado: uma correção de texto na primeira hora ("correcao") ou texto travado ("travado"). */
  textLock?: { state: "correcao" | "travado"; until?: string };
  /** Só para a casa dona de post impulsionado: o que ela pode fazer para excluir (livre não aparece). */
  deleteInfo?: { state: "reembolsavel" | "reembolso_pendente" | "liberado" | "aguardar"; deadline?: string };
  /** A casa desativou novos comentários nesta publicação. */
  commentsOff?: boolean;
  createdAt: string;
}

export interface Story {
  id: string;
  houseId: string;
  image: string;
  caption?: string;
  createdAt: string;
}

export type RitualMode = "presencial" | "distancia" | "hibrido";

export interface Ritual {
  id: string;
  houseId: string;
  title: string;
  description: string;
  cover: string;
  price: number;
  vagasTotal: number;
  vagasVendidas: number;
  mode: RitualMode;
  date: string;
  category: string;
}

export interface Message {
  id: string;
  from: string;
  to: string;
  text: string;
  createdAt: string;
  read?: boolean;
}

export interface Conversation {
  id: string;
  participantIds: string[];
  messages: Message[];
  updatedAt: string;
}

export interface Purchase {
  id: string;
  ritualId: string;
  userId: string;
  amount: number;
  createdAt: string;
  mode: "demo";
}

export interface BoostPlan {
  level: "cidade" | "estado" | "pais";
  days: 3 | 7 | 30;
  price: number;
}

export interface Notification {
  id: string;
  userId: string;
  text: string;
  href?: string;
  read: boolean;
  createdAt: string;
}
