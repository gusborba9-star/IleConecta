export function normalizeDemoEmail(email) {
  return String(email ?? "").trim().toLowerCase();
}

export function isPromotionActive(expiresAt, now = Date.now()) {
  if (!expiresAt) return false;
  const expiry = Date.parse(expiresAt);
  return Number.isFinite(expiry) && expiry > now;
}

export function canSendDemoMessage(senderId, recipientId, text, recipientExists) {
  return Boolean(
    senderId &&
      recipientId &&
      senderId !== recipientId &&
      recipientExists &&
      String(text ?? "").trim()
  );
}

export function mergeDemoMessage(conversations, message, newConversation) {
  const existing = conversations.find(
    (conversation) =>
      conversation.participantIds.length === 2 &&
      conversation.participantIds.includes(message.from) &&
      conversation.participantIds.includes(message.to)
  );

  if (!existing) return [newConversation, ...conversations];

  const updated = {
    ...existing,
    messages: [...existing.messages, message],
    updatedAt: message.createdAt,
  };
  return conversations.map((conversation) =>
    conversation.id === existing.id ? updated : conversation
  );
}

export function canReserveDemoRitual(userType, ritualDate, remaining, now = Date.now()) {
  const startsAt = Date.parse(ritualDate);
  return Boolean(
    userType === "personal" &&
      Number.isFinite(startsAt) &&
      startsAt > now &&
      Number.isFinite(remaining) &&
      remaining > 0
  );
}

export function normalizeDemoSearch(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("pt-BR");
}

export function matchesDemoSearch(query, values) {
  const normalizedQuery = normalizeDemoSearch(query);
  if (!normalizedQuery) return true;
  return values.some((value) => normalizeDemoSearch(value).includes(normalizedQuery));
}
