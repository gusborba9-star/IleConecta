import type { AccountType, Conversation, Message } from "@/types";

export function normalizeDemoEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function canReserveDemoRitual(
  accountType: AccountType | null | undefined,
  date: string,
  availableSeats: number,
  now = Date.now(),
): boolean {
  const startsAt = Date.parse(date);
  return accountType === "personal" && Number.isFinite(startsAt) && startsAt > now
    && Number.isInteger(availableSeats) && availableSeats > 0;
}

export function canSendDemoMessage(
  senderId: string | null | undefined,
  recipientId: string,
  text: string,
  recipientExists: boolean,
): boolean {
  return Boolean(senderId && recipientId && senderId !== recipientId
    && recipientExists && text.trim());
}

/** Pure update: preserve unrelated conversations and never mutate previous state. */
export function mergeDemoMessage(
  conversations: Conversation[],
  message: Message,
  newConversation: Conversation,
): Conversation[] {
  const existing = conversations.find((conversation) =>
    conversation.participantIds.length === 2
      && conversation.participantIds.includes(message.from)
      && conversation.participantIds.includes(message.to),
  );
  if (!existing) return [...conversations, { ...newConversation, messages: [message] }];
  if (existing.messages.some((item) => item.id === message.id)) return conversations;
  return conversations.map((conversation) => conversation.id === existing.id
    ? { ...conversation, messages: [...conversation.messages, message], updatedAt: message.createdAt }
    : conversation);
}
