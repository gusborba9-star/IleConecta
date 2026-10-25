import type { User } from "@/types";
import { hasStrings, hasUniqueIds, isDate, isFiniteNumber, isRecord, isStringArray, optional } from "@/lib/stateValidation";

function isPromotion(value: unknown, kind: "boost" | "highlight"): boolean {
  if (!isRecord(value) || !isDate(value.expiresAt)) return false;
  const scope = kind === "boost" ? value.level : value.scope;
  return (kind === "boost" ? ["cidade", "estado", "pais"] : ["local", "cidade", "pais"]).includes(String(scope));
}

export function isUsersState(value: unknown): value is User[] {
  return hasUniqueIds(value) && value.every((user) => {
    if (!hasStrings(user, ["name", "email", "password", "avatar", "city", "state", "country"])
      || !isDate(user.createdAt)
      || !optional(user.bio, (bio) => typeof bio === "string")) return false;
    if (user.type === "personal") return optional(user.interests, isStringArray);
    return user.type === "commercial" && hasStrings(user, ["cover", "category"])
      && isStringArray(user.tags) && isFiniteNumber(user.rating)
      && isFiniteNumber(user.followers) && user.followers >= 0
      && optional(user.verified, (verified) => typeof verified === "boolean")
      && optional(user.boost, (boost) => isPromotion(boost, "boost"))
      && optional(user.highlight, (highlight) => isPromotion(highlight, "highlight"));
  });
}
