import test from "node:test";
import assert from "node:assert/strict";
import { sendEmail, parseRequest, render, safeLink, safeEqual, createResendAdapter, EmailError } from "../supabase/functions/send-email/core.js";

const KEY = "service-key-123";
const ok = { to: "maria@exemplo.com", subject: "Sua cobrança vence em 3 dias", text: "Olá.\n\nSua fatura vence em 3 dias.", idempotency_key: "bill:abc:d3" };
const fakeAdapter = (calls = []) => ({ id: "resend", send: async (x) => { calls.push(x); return { id: "em_1" }; } });
const ctx = (adapter, auth = `Bearer ${KEY}`) => ({ adapter, serviceKey: KEY, authHeader: auth });

test("sem chave de serviço ou com chave errada: recusa antes de validar ou enviar", async () => {
  const calls = [];
  for (const auth of [null, "", "Bearer errada", `Bearer ${KEY}x`, "Bearer "]) {
    await assert.rejects(() => sendEmail(ctx(fakeAdapter(calls), auth), ok), (e) => e instanceof EmailError && e.status === 401);
  }
  await assert.rejects(() => sendEmail({ adapter: fakeAdapter(calls), serviceKey: "", authHeader: "Bearer " }, ok), (e) => e.status === 401);
  assert.equal(calls.length, 0);
});

test("envio válido passa assunto, destinatário e chave de idempotência", async () => {
  const calls = [];
  const r = await sendEmail(ctx(fakeAdapter(calls)), ok);
  assert.deepEqual(r, { sent: true, provider: "resend", id: "em_1" });
  assert.equal(calls[0].to, "maria@exemplo.com");
  assert.equal(calls[0].key, "bill:abc:d3");
  assert.match(calls[0].html, /vence em 3 dias/);
});

test("validações: destinatário, assunto, texto, chave, link e resposta", () => {
  for (const bad of [null, {}, { ...ok, to: "sem-arroba" }, { ...ok, to: "a@b.com, c@d.com" }, { ...ok, to: "x@y.com>\nBcc: z@w.com" }, { ...ok, subject: "ab" }, { ...ok, subject: "a".repeat(151) }, { ...ok, text: "" }, { ...ok, text: "a".repeat(8001) }, { ...ok, idempotency_key: "curto" }, { ...ok, reply_to: "nao-email" }, { ...ok, link: "https://evil.com/x" }, { ...ok, link: "http://ileconecta.com.br/x" }, { ...ok, link: "javascript:alert(1)" }, { ...ok, link: "https://ileconecta.com.br.evil.com/x" }]) {
  assert.throws(() => parseRequest(bad), EmailError);
  }
});

test("assunto com quebra de linha não injeta cabeçalho", () => {
  const r = parseRequest({ ...ok, subject: "Aviso\r\nBcc: espiao@x.com" });
  assert.equal(/[\r\n]/.test(r.subject), false);
});

test("HTML escapa tudo que vem de fora (sem script nem tag injetada)", () => {
  const { html, plain } = render({ subject: "<script>x</script>", text: `Oi <img src=x onerror=alert(1)> "a" & 'b'`, link: null, linkLabel: "" });
  assert.equal(html.includes("<script>"), false);
  assert.equal(html.includes("<img"), false);
  assert.match(html, /&lt;script&gt;/);
  assert.match(plain, /<img/); // texto puro não interpreta HTML
});

test("link só do domínio próprio e vira botão escapado", () => {
  assert.equal(safeLink("https://ileconecta.com.br/painel?a=1&b=2"), "https://ileconecta.com.br/painel?a=1&b=2");
  assert.equal(safeLink("https://www.ileconecta.com.br/x"), "https://www.ileconecta.com.br/x");
  assert.equal(safeLink("https://xileconecta.com.br/x"), null);
  assert.equal(safeLink("lixo"), null);
  const { html } = render({ subject: "Aviso", text: "Texto", link: "https://ileconecta.com.br/p?a=1&b=2", linkLabel: 'Abrir "agora"' });
  assert.match(html, /href="https:\/\/ileconecta\.com\.br\/p\?a=1&amp;b=2"/);
});

test("safeEqual é estrito", () => {
  assert.equal(safeEqual("abc", "abc"), true);
  assert.equal(safeEqual("abc", "abd"), false);
  assert.equal(safeEqual("abc", "abcd"), false);
  assert.equal(safeEqual(undefined, ""), true);
});

test("adaptador Resend: corpo, cabeçalhos e remetente corretos; chave nunca vai no corpo", async () => {
  let seen;
  const fetchImpl = async (url, init) => { seen = { url, init }; return { ok: true, status: 200, json: async () => ({ id: "abc" }) }; };
  const a = createResendAdapter({ apiKey: "re_segredo", fetchImpl });
  const r = await a.send({ to: "m@x.com", subject: "Assunto", html: "<p>x</p>", plain: "x", replyTo: "suporte@ileconecta.com.br", key: "idem-12345" });
  assert.equal(r.id, "abc");
  assert.equal(seen.url, "https://api.resend.com/emails");
  assert.equal(seen.init.headers.Authorization, "Bearer re_segredo");
  assert.equal(seen.init.headers["Idempotency-Key"], "idem-12345");
  const body = JSON.parse(seen.init.body);
  assert.equal(body.from, "Ilê Conecta <no-reply@ileconecta.com.br>");
  assert.deepEqual(body.to, ["m@x.com"]);
  assert.equal(body.reply_to, "suporte@ileconecta.com.br");
  assert.equal(seen.init.body.includes("re_segredo"), false);
});

test("falhas do provedor viram erro seguro, sem vazar a resposta dele", async () => {
  const mk = (res) => createResendAdapter({ apiKey: "k", fetchImpl: async () => res });
  const base = { to: "m@x.com", subject: "Assunto", html: "x", plain: "x" };
  await assert.rejects(() => mk({ ok: false, status: 429 }).send(base), (e) => e.code === "provider_busy");
  await assert.rejects(() => mk({ ok: false, status: 503 }).send(base), (e) => e.code === "provider_busy");
  await assert.rejects(() => mk({ ok: false, status: 422, json: async () => ({ message: "segredo interno" }) }).send(base), (e) => e.code === "provider_rejected" && !/segredo/.test(e.message));
  await assert.rejects(() => createResendAdapter({ apiKey: "k", fetchImpl: async () => { throw new Error("rede"); } }).send(base), (e) => e.code === "provider_unreachable");
  assert.throws(() => createResendAdapter({ apiKey: "" }), (e) => e.code === "not_configured");
});
