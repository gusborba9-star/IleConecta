import type { Conversation, Post, Purchase, Ritual, Story, User } from "@/types";
import { hasStrings, hasUniqueIds, isDate, isFiniteNumber, isRecord, isStringArray, optional } from "@/lib/stateValidation";
export { isUsersState } from "@/lib/userStateValidation";

export function isAuthState(value: unknown, users: User[]): value is string | null {
  return value === null || (typeof value === "string" && users.some((user) => user.id === value));
}

export function isRitualsState(value: unknown, users: User[]): value is Ritual[] {
  const houses = new Set(users.filter((user) => user.type === "commercial").map((user) => user.id));
  return hasUniqueIds(value) && value.every((ritual) =>
    hasStrings(ritual, ["houseId", "title", "description", "cover", "category"])
    && houses.has(String(ritual.houseId)) && isDate(ritual.date)
    && ["presencial", "distancia", "hibrido"].includes(String(ritual.mode))
    && isFiniteNumber(ritual.price) && ritual.price >= 0
    && isFiniteNumber(ritual.vagasTotal) && Number.isInteger(ritual.vagasTotal) && ritual.vagasTotal > 0
    && isFiniteNumber(ritual.vagasVendidas) && Number.isInteger(ritual.vagasVendidas)
    && ritual.vagasVendidas >= 0 && ritual.vagasVendidas <= ritual.vagasTotal
    && isFiniteNumber(ritual.platformFeePct) && ritual.platformFeePct >= 0 && ritual.platformFeePct <= 100);
}

export function isPostsState(value: unknown, users: User[], rituals: Ritual[]): value is Post[] {
  const userIds = new Set(users.map((user) => user.id));
  const ritualIds = new Set(rituals.map((ritual) => ritual.id));
  return hasUniqueIds(value) && value.every((post) =>
    hasStrings(post, ["houseId", "content"]) && userIds.has(String(post.houseId))
    && isDate(post.createdAt) && ["geral", "trabalho", "ritual", "buzios", "story"].includes(String(post.kind))
    && optional(post.image, (image) => typeof image === "string")
    && optional(post.ritualId, (id) => typeof id === "string" && ritualIds.has(id))
    && isStringArray(post.likes) && post.likes.every((id) => userIds.has(id))
    && new Set(post.likes).size === post.likes.length
    && hasUniqueIds(post.comments) && post.comments.every((comment) =>
      hasStrings(comment, ["userId", "text"]) && userIds.has(String(comment.userId)) && isDate(comment.createdAt)));
}

export function isStoriesState(value: unknown, users: User[]): value is Story[] {
  const houses = new Set(users.filter((user) => user.type === "commercial").map((user) => user.id));
  return hasUniqueIds(value) && value.every((story) =>
    hasStrings(story, ["houseId", "image"]) && houses.has(String(story.houseId))
    && isDate(story.createdAt) && optional(story.caption, (caption) => typeof caption === "string"));
}

export function isConversationsState(value: unknown, users: User[]): value is Conversation[] {
  const userIds = new Set(users.map((user) => user.id));
  const pairs = new Set<string>();
  return hasUniqueIds(value) && value.every((conversation) => {
    if (!isStringArray(conversation.participantIds) || conversation.participantIds.length !== 2
      || new Set(conversation.participantIds).size !== 2
      || !conversation.participantIds.every((id) => userIds.has(id))
      || !isDate(conversation.updatedAt) || !hasUniqueIds(conversation.messages)) return false;
    const pair = JSON.stringify([...conversation.participantIds].sort());
    if (pairs.has(pair)) return false;
    pairs.add(pair);
    const participants = new Set(conversation.participantIds);
    return conversation.messages.every((message) =>
      hasStrings(message, ["from", "to", "text"]) && participants.has(String(message.from))
      && participants.has(String(message.to)) && message.from !== message.to
      && typeof message.text === "string" && message.text.trim().length > 0
      && isDate(message.createdAt) && optional(message.read, (read) => typeof read === "boolean"));
  });
}

export function isPurchasesState(value: unknown, users: User[], rituals: Ritual[]): value is Purchase[] {
  const userIds = new Set(users.map((user) => user.id));
  const ritualIds = new Set(rituals.map((ritual) => ritual.id));
  return hasUniqueIds(value) && value.every((purchase) =>
    isRecord(purchase) && hasStrings(purchase, ["userId", "ritualId"])
    && userIds.has(String(purchase.userId)) && ritualIds.has(String(purchase.ritualId))
    && isDate(purchase.createdAt) && isFiniteNumber(purchase.amount) && purchase.amount >= 0
    && optional(purchase.fee, (fee) => isFiniteNumber(fee) && fee >= 0)
    && optional(purchase.mode, (mode) => mode === "demo"));
}
