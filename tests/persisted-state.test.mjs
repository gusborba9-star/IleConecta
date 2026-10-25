import test from "node:test";
import assert from "node:assert/strict";
import {
  isAuthState,
  isConversationsState,
  isPostsState,
  isPurchasesState,
  isRitualsState,
  isStoriesState,
  isUsersState,
} from "../src/lib/persistedState.js";

const timestamp = "2026-10-25T12:00:00.000Z";
const users = [
  { id: "house1", type: "commercial", name: "Casa", email: "casa@example.test", password: "demo", avatar: "", cover: "cover", city: "Recife", state: "PE", country: "Brasil", category: "Umbanda", tags: [], rating: 5, followers: 0, createdAt: timestamp },
  { id: "user1", type: "personal", name: "Pessoa", email: "pessoa@example.test", password: "demo", avatar: "", city: "Recife", state: "PE", country: "Brasil", createdAt: timestamp },
];
const rituals = [{ id: "ritual1", houseId: "house1", title: "Ritual", description: "Descrição", cover: "cover", price: 10, vagasTotal: 5, vagasVendidas: 1, mode: "hibrido", date: "2026-11-25T12:00:00.000Z", category: "geral" }];
const posts = [{ id: "post1", houseId: "house1", content: "Publicação", kind: "geral", likes: ["user1"], comments: [{ id: "comment1", userId: "user1", text: "Comentário", createdAt: timestamp }], createdAt: timestamp }];
const stories = [{ id: "story1", houseId: "house1", image: "image", caption: "Axé", createdAt: timestamp }];
const conversations = [{ id: "conversation1", participantIds: ["house1", "user1"], messages: [{ id: "message1", from: "user1", to: "house1", text: "Olá", createdAt: timestamp }], updatedAt: timestamp }];
const purchases = [{ id: "purchase1", ritualId: "ritual1", userId: "user1", amount: 10, createdAt: timestamp, mode: "demo" }];

test("accepts structurally valid collections and auth references", () => {
  assert.equal(isUsersState(users), true);
  assert.equal(isRitualsState(rituals, users), true);
  assert.equal(isPostsState(posts, users, rituals), true);
  assert.equal(isStoriesState(stories, users), true);
  assert.equal(isConversationsState(conversations, users), true);
  assert.equal(isPurchasesState(purchases, users, rituals), true);
  assert.equal(isAuthState("user1", users), true);
  assert.equal(isAuthState(null, users), true);
});

test("rejects malformed records and duplicate account identifiers", () => {
  assert.equal(isUsersState([{ ...users[0], id: undefined }]), false);
  assert.equal(isUsersState([users[0], { ...users[1], id: users[0].id }]), false);
  assert.equal(isUsersState([users[0], { ...users[1], email: " CASA@example.test " }]), false);
  assert.equal(isRitualsState([{ ...rituals[0], vagasVendidas: 9 }], users), false);
});

test("rejects orphaned house, ritual, author, and recipient references", () => {
  assert.equal(isRitualsState([{ ...rituals[0], houseId: "missing-house" }], users), false);
  assert.equal(isPostsState([{ ...posts[0], houseId: "missing-house" }], users, rituals), false);
  assert.equal(isPostsState([{ ...posts[0], ritualId: "missing-ritual" }], users, rituals), false);
  assert.equal(isPostsState([{ ...posts[0], likes: ["missing-user"] }], users, rituals), false);
  assert.equal(isStoriesState([{ ...stories[0], houseId: "missing-house" }], users), false);
  assert.equal(isConversationsState([{ ...conversations[0], participantIds: ["user1", "missing-user"] }], users), false);
  assert.equal(isPurchasesState([{ ...purchases[0], ritualId: "missing-ritual" }], users, rituals), false);
  assert.equal(isPurchasesState([{ ...purchases[0], userId: "house1" }], users, rituals), false);
  assert.equal(isAuthState("deleted-user", users), false);
});
