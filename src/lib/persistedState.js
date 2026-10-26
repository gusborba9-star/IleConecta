const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const isString = (value) => typeof value === "string";
const isNonEmptyString = (value) => isString(value) && value.trim().length > 0;
const isFiniteNumber = (value) => typeof value === "number" && Number.isFinite(value);
const isTimestamp = (value) => isString(value) && Number.isFinite(Date.parse(value));
const isStringArray = (value) => Array.isArray(value) && value.every(isString);
const unique = (values) => new Set(values).size === values.length;

export function isUserRecord(value) {
  if (!isRecord(value) || !isNonEmptyString(value.id) || !["personal", "commercial"].includes(value.type)) return false;
  if (![value.name, value.email, value.password, value.avatar, value.city, value.state, value.country].every(isString)) return false;
  if (!isTimestamp(value.createdAt)) return false;
  if (value.type === "personal") return value.interests === undefined || isStringArray(value.interests);
  if (!isNonEmptyString(value.cover) || !isNonEmptyString(value.category) || !isStringArray(value.tags)) return false;
  if (!isFiniteNumber(value.rating) || !isFiniteNumber(value.followers)) return false;
  if (value.boost !== undefined && (!isRecord(value.boost) || !["cidade", "estado", "pais"].includes(value.boost.level) || !isTimestamp(value.boost.expiresAt))) return false;
  if (value.highlight !== undefined && (!isRecord(value.highlight) || !["local", "cidade", "estado", "pais"].includes(value.highlight.scope) || !isTimestamp(value.highlight.expiresAt))) return false;
  return true;
}

export function isUsersState(value) {
  if (!Array.isArray(value) || !value.every(isUserRecord)) return false;
  const ids = value.map((user) => user.id);
  const emails = value.map((user) => user.email.trim().toLowerCase());
  return unique(ids) && unique(emails);
}

export function isRitualRecord(value, users) {
  return isRecord(value) &&
    isNonEmptyString(value.id) &&
    users.some((user) => user.id === value.houseId && user.type === "commercial") &&
    [value.title, value.description, value.cover, value.category].every(isString) &&
    isFiniteNumber(value.price) && value.price >= 0 &&
    Number.isInteger(value.vagasTotal) && value.vagasTotal > 0 &&
    Number.isInteger(value.vagasVendidas) && value.vagasVendidas >= 0 && value.vagasVendidas <= value.vagasTotal &&
    ["presencial", "distancia", "hibrido"].includes(value.mode) &&
    isTimestamp(value.date);
}

export function isRitualsState(value, users) {
  return Array.isArray(value) && value.every((ritual) => isRitualRecord(ritual, users)) && unique(value.map((ritual) => ritual.id));
}

function isComment(value, users) {
  return isRecord(value) &&
    isNonEmptyString(value.id) &&
    users.some((user) => user.id === value.userId) &&
    isString(value.text) &&
    isTimestamp(value.createdAt);
}

export function isPostRecord(value, users, rituals) {
  return isRecord(value) &&
    isNonEmptyString(value.id) &&
    users.some((user) => user.id === value.houseId && user.type === "commercial") &&
    isString(value.content) &&
    (value.image === undefined || isString(value.image)) &&
    ["trabalho", "ritual", "buzios", "story", "geral"].includes(value.kind) &&
    (value.ritualId === undefined || rituals.some((ritual) => ritual.id === value.ritualId)) &&
    isStringArray(value.likes) &&
    value.likes.every((id) => users.some((user) => user.id === id)) &&
    Array.isArray(value.comments) && value.comments.every((comment) => isComment(comment, users)) &&
    isTimestamp(value.createdAt);
}

export function isPostsState(value, users, rituals) {
  return Array.isArray(value) && value.every((post) => isPostRecord(post, users, rituals)) && unique(value.map((post) => post.id));
}

export function isStoriesState(value, users) {
  return Array.isArray(value) && value.every((story) =>
    isRecord(story) &&
    isNonEmptyString(story.id) &&
    users.some((user) => user.id === story.houseId && user.type === "commercial") &&
    isNonEmptyString(story.image) &&
    (story.caption === undefined || isString(story.caption)) &&
    isTimestamp(story.createdAt)
  ) && unique(value.map((story) => story.id));
}

function isMessage(value, participantIds) {
  return isRecord(value) &&
    isNonEmptyString(value.id) &&
    participantIds.includes(value.from) &&
    participantIds.includes(value.to) &&
    value.from !== value.to &&
    isNonEmptyString(value.text) &&
    isTimestamp(value.createdAt) &&
    (value.read === undefined || typeof value.read === "boolean");
}

export function isConversationsState(value, users) {
  if (!Array.isArray(value)) return false;
  const userIds = users.map((user) => user.id);
  const valid = value.every((conversation) =>
    isRecord(conversation) &&
    isNonEmptyString(conversation.id) &&
    Array.isArray(conversation.participantIds) &&
    conversation.participantIds.length === 2 &&
    unique(conversation.participantIds) &&
    conversation.participantIds.every((id) => userIds.includes(id)) &&
    Array.isArray(conversation.messages) &&
    conversation.messages.every((message) => isMessage(message, conversation.participantIds)) &&
    isTimestamp(conversation.updatedAt)
  );
  return valid && unique(value.map((conversation) => conversation.id));
}

export function isPurchasesState(value, users, rituals) {
  if (!Array.isArray(value)) return false;
  const valid = value.every((purchase) =>
    isRecord(purchase) &&
    isNonEmptyString(purchase.id) &&
    rituals.some((ritual) => ritual.id === purchase.ritualId) &&
    users.some((user) => user.id === purchase.userId && user.type === "personal") &&
    isFiniteNumber(purchase.amount) && purchase.amount >= 0 &&
    isTimestamp(purchase.createdAt) &&
    purchase.mode === "demo"
  );
  return valid && unique(value.map((purchase) => purchase.id));
}

export function isAuthState(value, users) {
  return value === null || (isNonEmptyString(value) && users.some((user) => user.id === value));
}
