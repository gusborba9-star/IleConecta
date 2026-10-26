import type { AccountType, Conversation, Message } from "@/types";

export function normalizeDemoEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function canReserveDemoRitual(
  accountType: AccountType | null | undefined,
  date: string,
  remaining: number,
  now = Date.now()
): boolean {
  const startsAt = Date.parse(date);
  return accountType === "personal" && Number.isFinite(startsAt) && startsAt > now &&
    Number.isInteger(remaining) && remaining > 0;
}

export function canSendDemoMessage(
  from: string | null | undefined,
  to: string,
  text: string,
  recipientExists: boolean
): boolean {
  return Boolean(from?.trim() && to.trim() && from !== to && text.trim() && recipientExists);
}

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
  const updated = existing
    ? conversations.map((conversation) => conversation.id === existing.id
      ? {
          ...conversation,
          messages: conversation.messages.some((item) => item.id === message.id)
            ? conversation.messages : [...conversation.messages, message],
          updatedAt: message.createdAt > conversation.updatedAt ? message.createdAt : conversation.updatedAt,
        }
      : conversation)
    : [{ ...newConversation, messages: [message], updatedAt: message.createdAt }, ...conversations];
  return updated.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function isPromotionActive(expiresAt?: string | null, now = Date.now()): boolean {
  return Boolean(expiresAt && Number.isFinite(Date.parse(expiresAt)) && Date.parse(expiresAt) > now);
}

export function matchesDemoSearch(query: string, fields: (string | null | undefined)[]): boolean {
  const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const terms = normalize(query).trim().split(/\s+/).filter(Boolean);
  const haystack = normalize(fields.filter((value): value is string => typeof value === "string").join(" "));
  return terms.every((term) => haystack.includes(term));
}
