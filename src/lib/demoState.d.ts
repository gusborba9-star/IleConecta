import type { Conversation, Message } from "@/types";

export function normalizeDemoEmail(email: string): string;
export function isPromotionActive(expiresAt?: string, now?: number): boolean;
export function canSendDemoMessage(
  senderId: string | null | undefined,
  recipientId: string | null | undefined,
  text: string,
  recipientExists: boolean
): boolean;
export function mergeDemoMessage(
  conversations: Conversation[],
  message: Message,
  newConversation: Conversation
): Conversation[];

export function canReserveDemoRitual(
  userType: "personal" | "commercial" | null | undefined,
  ritualDate: string,
  remaining: number,
  now?: number
): boolean;

export function normalizeDemoSearch(value: string | null | undefined): string;
export function matchesDemoSearch(query: string, values: Array<string | null | undefined>): boolean;
