import type { AccountType, Conversation, Message } from "@/types";

export function normalizeDemoEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isPromotionActive(expiresAt?: string | null, now = Date.now()): boolean {
  if (!expiresAt) return false;
  const expiration = Date.parse(expiresAt);
  return Number.isFinite(expiration) && expiration > now;
}

export function canReserveDemoRitual(
  accountType: AccountType | null | undefined,
  date: string,
  remaining: number,
  now = Date.now()
): boolean {
  return accountType === "personal" && Number.isInteger(remaining) && remaining > 0 &&
    isPromotionActive(date, now);
}

export function canSendDemoMessage(
  fromId: string | null | undefined,
  toId: string,
  text: string,
  recipientExists: boolean
): boolean {
  return Boolean(fromId && toId && fromId !== toId && recipientExists && text.trim());
}

/** Append without mutating React state, preserving one conversation per pair. */
export function mergeDemoMessage(
  conversations: Conversation[],
  message: Message,
  newConversation: Conversation
): Conversation[] {
  const existing = conversations.find((conversation) =>
    conversation.participantIds.length === 2 &&
    conversation.participantIds.includes(message.from) &&
    conversation.participantIds.includes(message.to)
  );
  if (!existing) return [newConversation, ...conversations];
  if (existing.messages.some((item) => item.id === message.id)) return conversations;
  const updated: Conversation = {
    ...existing,
    messages: [...existing.messages, message],
    updatedAt: message.createdAt,
  };
  return [updated, ...conversations.filter((conversation) => conversation.id !== existing.id)];
}
