import type { User } from "@/types";
import {
  isDateString, isNonNegativeNumber, isOptionalString, isRecord, isStateList, isStringArray,
} from "@/lib/stateValidation";

function isPromotion(value: unknown, key: "level" | "scope", options: string[]): boolean {
  return value === undefined || (isRecord(value) && typeof value[key] === "string" &&
    options.includes(value[key] as string) && isDateString(value.expiresAt));
}

export function isUserState(value: unknown): value is User {
  if (!isRecord(value)) return false;
  if (!["id", "name", "email", "password", "avatar", "city", "state", "country"]
    .every((key) => typeof value[key] === "string")) return false;
  if (!value.id || !isDateString(value.createdAt) || !isOptionalString(value.bio)) return false;
  if (value.type === "personal") {
    return value.interests === undefined || isStringArray(value.interests);
  }
  return value.type === "commercial" && typeof value.cover === "string" &&
    typeof value.category === "string" && isStringArray(value.tags) &&
    isNonNegativeNumber(value.rating) && value.rating <= 5 &&
    isNonNegativeNumber(value.followers) && Number.isInteger(value.followers) &&
    (value.verified === undefined || typeof value.verified === "boolean") &&
    isPromotion(value.boost, "level", ["cidade", "estado", "pais"]) &&
    isPromotion(value.highlight, "scope", ["local", "cidade", "pais"]);
}

export function isUsersState(value: unknown): value is User[] {
  return isStateList(value, isUserState);
}
