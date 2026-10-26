import type { Conversation, Message, Post, Purchase, Ritual, Story, User } from "@/types";
import {
  isDateString, isNonNegativeNumber, isOptionalString, isRecord, isStateList, isStringArray,
} from "@/lib/stateValidation";

export { isUsersState } from "@/lib/userStateValidation";

export function isAuthState(value: unknown, users: User[]): value is string | null {
  return value === null || (typeof value === "string" && users.some((user) => user.id === value));
}

export function isRitualsState(value: unknown, users: User[]): value is Ritual[] {
  return isStateList(value, (item): item is Ritual => {
    if (!isRecord(item)) return false;
    return typeof item.id === "string" && Boolean(item.id) &&
      ["title", "description", "cover", "category"].every((key) => typeof item[key] === "string") &&
      users.some((user) => user.id === item.houseId && user.type === "commercial") &&
      isNonNegativeNumber(item.price) && isNonNegativeNumber(item.vagasTotal) &&
      Number.isInteger(item.vagasTotal) && item.vagasTotal > 0 &&
      isNonNegativeNumber(item.vagasVendidas) && Number.isInteger(item.vagasVendidas) &&
      item.vagasVendidas <= item.vagasTotal && typeof item.mode === "string" &&
      ["presencial", "distancia", "hibrido"].includes(item.mode) && isDateString(item.date);
  });
}

export function isPostsState(value: unknown, users: User[], rituals: Ritual[]): value is Post[] {
  return isStateList(value, (item): item is Post => {
    if (!isRecord(item)) return false;
    return typeof item.id === "string" && Boolean(item.id) && typeof item.content === "string" &&
      users.some((user) => user.id === item.houseId) && isOptionalString(item.image) &&
      typeof item.kind === "string" && ["trabalho", "ritual", "buzios", "story", "geral"].includes(item.kind) &&
      (item.ritualId === undefined || rituals.some((ritual) => ritual.id === item.ritualId)) &&
      isStringArray(item.likes) && item.likes.every((id) => users.some((user) => user.id === id)) &&
      Array.isArray(item.comments) && item.comments.every((comment) => isRecord(comment) &&
        typeof comment.id === "string" && typeof comment.text === "string" &&
        users.some((user) => user.id === comment.userId) && isDateString(comment.createdAt)) &&
      isDateString(item.createdAt);
  });
}

export function isStoriesState(value: unknown, users: User[]): value is Story[] {
  return isStateList(value, (item): item is Story => isRecord(item) &&
    typeof item.id === "string" && Boolean(item.id) && typeof item.image === "string" &&
    users.some((user) => user.id === item.houseId) && isOptionalString(item.caption) &&
    isDateString(item.createdAt));
}

export function isConversationsState(value: unknown, users: User[]): value is Conversation[] {
  return isStateList(value, (item): item is Conversation => {
    if (!isRecord(item) || !isStringArray(item.participantIds)) return false;
    const participants = item.participantIds;
    return typeof item.id === "string" && Boolean(item.id) && participants.length === 2 &&
      new Set(participants).size === 2 && participants.every((id) => users.some((user) => user.id === id)) &&
      isDateString(item.updatedAt) && isStateList(item.messages, (message): message is Message =>
        isRecord(message) && typeof message.id === "string" && Boolean(message.id) &&
        typeof message.from === "string" && typeof message.to === "string" &&
        message.from !== message.to && participants.includes(message.from) && participants.includes(message.to) &&
        typeof message.text === "string" && Boolean(message.text.trim()) && isDateString(message.createdAt) &&
        (message.read === undefined || typeof message.read === "boolean"));
  });
}

export function isPurchasesState(value: unknown, users: User[], rituals: Ritual[]): value is Purchase[] {
  return isStateList(value, (item): item is Purchase => isRecord(item) &&
    typeof item.id === "string" && Boolean(item.id) && item.mode === "demo" &&
    users.some((user) => user.id === item.userId && user.type === "personal") &&
    rituals.some((ritual) => ritual.id === item.ritualId) &&
    isNonNegativeNumber(item.amount) && isDateString(item.createdAt));
}
