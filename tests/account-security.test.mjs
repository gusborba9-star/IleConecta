import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createSecurity, buildSecurityMail, LOGIN_MIN_MS, LOGIN_FAIL_MESSAGE } from "../supabase/functions/account-recovery/security.js";
import { parseRequest, render } from "../supabase/functions/send-email/core.js";

const DEV = "d".repeat(40);
const UID = "11111111-1111-4111-8111-111111111111";
function mk(over = {}) {
  const calls = []; const mails = []; const sleeps = []; const st = { clock: 0, check: { locked: false }, fail: { locked: false }, signIn: { ok: true, user_id: UID, access_token: "at", refresh_token: "rt" }, tokenOk: true, due: [], thr: new Map(), ...over };
  const rpc = async (fn, a) => { calls.push([fn, a]);
    switch (fn) {
      case "recovery_throttle_hit": { const n = (st.thr.get(a.p_bucket) ?? 0) + 1; st.thr.set(a.p_bucket, n); return n <= (st.limit ?? a.p_limit); }
      case "sec_login_check": return st.check; case "sec_login_fail": return st.fail; case "sec_login_ok": return null;
      case "sec_unlock": case "sec_report": return st.tokenOk; case "sec_due_events": return st.due; case "ann_due_mails": return st.ann ?? []; case "ann_mark_mailed": return null; case "sec_event_set_token": return true; case "sec_event_mark_mailed": return null;
      default: throw new Error("rpc " + fn); } };
  const sec = createSecurity({ rpc, sendMail: async (m) => { if (st.mailFails) throw new Error("x"); mails.push(m); }, signIn: async () => st.signIn, sleep: async (ms) => { sleeps.push(ms); }, now: () => st.clock,
    randomHex: () => "ab".repeat(32), sha256: async (s) => createHash("sha256").update(s).digest("hex"), siteUrl: "https://ileconecta.com.br", log: () => {} });
  return { sec, calls, mails, sleeps, st };
}
const body = (o = {}) => ({ email: "Maria@Exemplo.com", password: "senha-secreta", device_id: DEV, label: "Android · Chrome", ...o });

test("login certo: devolve a sessão, registra o aparelho só como hash e nunca repassa a senha ao banco", async () => {
  const x = mk(); const r = await x.sec.login(body(), "198.51.100.1");
  assert.equal(r.status, 200); assert.equal(r.body.access_token, "at");
  const ok = x.calls.find((c) => c[0] === "sec_login_ok")[1];
  assert.equal(ok.p_device_hash, createHash("sha256").update(DEV).digest("hex")); assert.equal(ok.p_user, UID);
  assert.equal(JSON.stringify(x.calls).includes("senha-secreta"), false);
  assert.equal(JSON.stringify(x.calls).includes(DEV), false, "id do aparelho cru nunca vai ao banco");
});

test("senha errada: mensagem única, conta o erro e leva pelo menos o tempo mínimo", async () => {
  const x = mk({ signIn: { ok: false, error: "credenciais" } }); const r = await x.sec.login(body(), "198.51.100.1");
  assert.equal(r.status, 401); assert.equal(r.body.message, LOGIN_FAIL_MESSAGE); assert.deepEqual(x.sleeps, [LOGIN_MIN_MS]);
  assert.ok(x.calls.some((c) => c[0] === "sec_login_fail" && c[1].p_key === "maria@exemplo.com"));
});

test("o 5º erro devolve bloqueio; bloqueada não chega a testar a senha", async () => {
  const a = mk({ signIn: { ok: false, error: "credenciais" }, fail: { locked: true, until: "2026-11-23T20:00:00Z", needs_email: false } });
  const r1 = await a.sec.login(body(), "198.51.100.1"); assert.equal(r1.status, 423); assert.equal(r1.body.error, "bloqueada");
  const b = mk({ check: { locked: true, until: "2026-11-23T20:00:00Z", needs_email: true } }); let tried = 0;
  const r2 = await b.sec.login(body(), "198.51.100.1");
  assert.equal(r2.status, 423); assert.equal(r2.body.needs_email, true);
  assert.equal(b.calls.some((c) => c[0] === "sec_login_fail" || c[0] === "sec_login_ok"), false); assert.equal(tried, 0);
});

test("e-mail sem conta e e-mail com conta recebem a MESMA resposta de senha errada", async () => {
  const a = mk({ signIn: { ok: false, error: "credenciais" } }); const b = mk({ signIn: { ok: false, error: "credenciais" } });
  assert.deepEqual(await a.sec.login(body({ email: "existe@x.com" }), "1.1.1.1"), await b.sec.login(body({ email: "naoexiste@x.com" }), "1.1.1.1"));
});

test("e-mail não confirmado não conta como erro; indisponível não conta; entrada inválida é recusada", async () => {
  const a = mk({ signIn: { ok: false, error: "nao_confirmado" } }); const r = await a.sec.login(body(), "1.1.1.1");
  assert.equal(r.status, 403); assert.equal(a.calls.some((c) => c[0] === "sec_login_fail"), false);
  const b = mk({ signIn: { ok: false, error: "indisponivel" } }); assert.equal((await b.sec.login(body(), "1.1.1.1")).status, 503); assert.equal(b.calls.some((c) => c[0] === "sec_login_fail"), false);
  const c = mk(); for (const bad of [body({ email: "x" }), body({ password: "" }), { }]) assert.equal((await c.sec.login(bad, "1.1.1.1")).status, 400);
  const d = mk(); await d.sec.login(body({ device_id: "curto" }), "1.1.1.1"); assert.equal(d.calls.find((x) => x[0] === "sec_login_check")[1].p_device_hash, null);
});

test("limite de tentativas por IP: depois dele nem testa a senha", async () => {
  const x = mk({ limit: 0 }); const r = await x.sec.login(body(), "9.9.9.9");
  assert.equal(r.status, 429); assert.equal(x.calls.some((c) => c[0] === "sec_login_check"), false);
});

test("desbloqueio e Não fui eu: só o hash do código vai ao banco; código inválido ou usado é recusado", async () => {
  const t = "cd".repeat(32); const x = mk();
  assert.equal((await x.sec.unlock({ token: t }, "1.1.1.1")).status, 200);
  assert.equal(x.calls.find((c) => c[0] === "sec_unlock")[1].p_hash, createHash("sha256").update(t).digest("hex"));
  assert.equal((await x.sec.report({ token: t }, "1.1.1.1")).status, 200);
  for (const bad of [{ token: "curto" }, { token: 5 }, {}, { token: "zz".repeat(32) }]) assert.equal((await x.sec.unlock(bad, "1.1.1.1")).status, 400);
  const y = mk({ tokenOk: false }); assert.equal((await y.sec.unlock({ token: t }, "1.1.1.1")).status, 400);
});

const KINDS = ["login_novo_aparelho", "conta_bloqueada", "senha_alterada", "palavra_alterada", "recuperacao_pedida", "recuperacao_aprovada", "email_alterado"];
test("todo aviso diz 'se foi você, não precisa fazer nada', tem o botão Não fui eu e só links do domínio", () => {
  for (const kind of KINDS) {
    const m = buildSecurityMail({ kind, detail: { label: "Android · Chrome", minutes: 15, needs_email: false }, created_at: "2026-11-23T17:00:00Z" }, "ab".repeat(32), "https://ileconecta.com.br");
    assert.match(m.text, /Se foi você, [^.]*/, kind);
    assert.match(m.text, /Se não foi você/, kind);
    const all = [m.link, ...m.extra.map((e) => e.url)];
    assert.ok(all.some((u) => u.includes("a=report")), `${kind}: sem Não fui eu`);
    assert.ok(all.every((u) => u.startsWith("https://ileconecta.com.br/")), kind);
    assert.ok(m.extra.length <= 3);
    assert.doesNotMatch(m.text, /senha: |password/i);
    parseRequest({ to: "a@b.com", subject: m.subject, text: m.text, link: m.link, link_label: m.linkLabel, extra_links: m.extra });
  }
  const b = buildSecurityMail({ kind: "conta_bloqueada", detail: { needs_email: true }, created_at: "2026-11-23T17:00:00Z" }, "ab".repeat(32), "https://ileconecta.com.br");
  assert.match(b.text, /até você desbloquear/); assert.match(b.link, /a=unlock/);
});

test("fila: manda ao e-mail certo (inclusive o antigo), com código próprio; falha não marca como enviado", async () => {
  const ev = { id: "e1", kind: "email_alterado", detail: {}, created_at: "2026-11-23T17:00:00Z", user_id: UID, email: "antigo@x.com" };
  const x = mk({ due: [ev] }); assert.equal(await x.sec.processEvents(), 1);
  assert.equal(x.mails[0].to, "antigo@x.com"); assert.match(x.mails[0].link, /#a=report&t=[0-9a-f]{64}$/);
  assert.equal(x.calls.find((c) => c[0] === "sec_event_set_token")[1].p_hash, createHash("sha256").update("ab".repeat(32)).digest("hex"));
  assert.ok(x.calls.some((c) => c[0] === "sec_event_mark_mailed"));
  const y = mk({ due: [ev], mailFails: true }); assert.equal(await y.sec.processEvents(), 0); assert.equal(y.calls.some((c) => c[0] === "sec_event_mark_mailed"), false);
});

test("send-email: links extras só do domínio da plataforma e no máximo 3; tudo escapado no HTML", () => {
  const base = { to: "a@b.com", subject: "Assunto ok", text: "Texto <b>ok</b>" };
  assert.throws(() => parseRequest({ ...base, extra_links: [{ url: "https://evil.com/x", label: "x" }] }));
  assert.throws(() => parseRequest({ ...base, extra_links: Array(4).fill({ url: "https://ileconecta.com.br/a", label: "x" }) }));
  assert.throws(() => parseRequest({ ...base, extra_links: "x" }));
  const r = parseRequest({ ...base, extra_links: [{ url: "https://ileconecta.com.br/a?x=1&y=2", label: "<i>oi</i>" }] });
  const out = render(r); assert.doesNotMatch(out.html, /<i>oi/); assert.match(out.plain, /oi.*ileconecta\.com\.br/s);
  assert.deepEqual(parseRequest(base).extra, []);
});

test("comunicado por e-mail: texto do admin com link só do próprio site; link malformado é descartado; falha não marca", async () => {
  const x = mk({ ann: [{ id: "a1", email: "p@x.com", text: "Novas regras nos Termos.", href: "/termos" }, { id: "a2", email: "q@x.com", text: "Aviso sem link.", href: "https://evil.com/x" }, { id: "a3", email: null, text: "Sem e-mail.", href: null }] });
  assert.equal(await x.sec.processAnnouncements(), 2);
  assert.equal(x.mails[0].link, "https://ileconecta.com.br/termos"); assert.equal(x.mails[1].link, undefined);
  assert.ok(x.mails.every((m) => m.subject === "Aviso do Ilê Conecta"));
  assert.equal(x.calls.filter((c) => c[0] === "ann_mark_mailed").length, 3, "sem e-mail também sai da fila");
  const y = mk({ ann: [{ id: "a1", email: "p@x.com", text: "Texto do aviso.", href: null }], mailFails: true });
  assert.equal(await y.sec.processAnnouncements(), 0); assert.equal(y.calls.some((c) => c[0] === "ann_mark_mailed"), false);
});
