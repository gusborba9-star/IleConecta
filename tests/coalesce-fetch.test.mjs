import test from "node:test";
import assert from "node:assert/strict";
import { createCoalescingFetch, isCoalescible } from "../src/lib/coalesceFetchCore.js";

const mk = () => {
  const calls = [];
  const gates = [];
  const base = (url, init) => { calls.push([url, init?.method ?? "GET"]); return new Promise((r) => gates.push(() => r(new Response(JSON.stringify({ n: calls.length }), { status: 200 })))); };
  return { calls, gates, f: createCoalescingFetch(base) };
};
const U = "http://sb.test/rest/v1/";

test("leituras idênticas em andamento viram um pedido só e cada uma recebe a sua resposta", async () => {
  const { calls, gates, f } = mk();
  const a = f(U + "houses?select=*", { headers: { authorization: "Bearer x" } });
  const b = f(U + "houses?select=*", { headers: { authorization: "Bearer x" } });
  gates[0]();
  const [ra, rb] = await Promise.all([a, b]);
  assert.equal(calls.length, 1);
  assert.deepEqual(await ra.json(), await rb.json());
});

test("pessoa diferente (cabeçalho diferente) ou consulta diferente nunca se mistura", async () => {
  const { calls, gates, f } = mk();
  const ps = [f(U + "houses?a=1", { headers: { authorization: "Bearer x" } }), f(U + "houses?a=1", { headers: { authorization: "Bearer y" } }), f(U + "houses?a=2", { headers: { authorization: "Bearer x" } })];
  gates.forEach((g) => g());
  await Promise.all(ps);
  assert.equal(calls.length, 3);
});

test("depois de terminada, a mesma leitura vai de novo (nada de cache)", async () => {
  const { calls, gates, f } = mk();
  const a = f(U + "houses", {}); gates[0](); await a;
  const b = f(U + "houses", {}); gates[1](); await b;
  assert.equal(calls.length, 2);
});

test("função de leitura da lista é juntada; função de escrita nunca", async () => {
  const { calls, gates, f } = mk();
  const body = JSON.stringify({ p: 1 });
  const r = [f(U + "rpc/my_memberships", { method: "POST", body }), f(U + "rpc/my_memberships", { method: "POST", body })];
  const w = [f(U + "rpc/record_consent", { method: "POST", body }), f(U + "rpc/record_consent", { method: "POST", body })];
  gates.forEach((g) => g());
  await Promise.all([...r, ...w]);
  assert.equal(calls.length, 3, "1 leitura juntada + 2 escritas separadas");
});

test("uma escrita esvazia a lista: leitura feita depois não recebe resposta velha", async () => {
  const { calls, gates, f } = mk();
  const antes = f(U + "houses", {});
  const escrita = f(U + "houses", { method: "PATCH", body: "{}" });
  const depois = f(U + "houses", {});
  gates.forEach((g) => g());
  await Promise.all([antes, escrita, depois]);
  assert.equal(calls.length, 3);
});

test("só o que é do banco é juntado", () => {
  assert.equal(isCoalescible("GET", "https://x.test/outra"), false);
  assert.equal(isCoalescible("DELETE", U + "houses"), false);
  assert.equal(isCoalescible("POST", U + "rpc/qualquer_escrita"), false);
  assert.equal(isCoalescible("POST", U + "rpc/is_admin"), true);
});

test("pedido com cancelamento próprio não é juntado (cancelar um não pode derrubar o outro)", async () => {
  const { calls, gates, f } = mk();
  const c = new AbortController();
  const ps = [f(U + "houses", { signal: c.signal }), f(U + "houses", { signal: c.signal })];
  gates.forEach((g) => g());
  await Promise.all(ps);
  assert.equal(calls.length, 2);
});

import { readFileSync } from "node:fs";
test("brand.ts e institutional.ts têm o mesmo nome da marca (o rodapé usa o arquivo pequeno)", () => {
  const re = /export const BRAND = "([^"]+)"/;
  assert.equal(re.exec(readFileSync("src/content/brand.ts", "utf8"))[1], re.exec(readFileSync("src/content/institutional.ts", "utf8"))[1]);
});
