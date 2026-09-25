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
  boost?: {
    level: "cidade" | "estado" | "pais";
    expiresAt: string;
  };
  highlight?: {
    scope: "local" | "cidade" | "pais";
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
  kind: "trabalho" | "ritual" | "buzios" | "story" | "geral";
  ritualId?: string;
  likes: string[]; // user ids
  comments: {
    id: string;
    userId: string;
    text: string;
    createdAt: string;
  }[];
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
  platformFeePct: number; // 10-15
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
  fee: number;
  createdAt: string;
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
