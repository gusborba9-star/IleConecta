// API do Stripe SIMULADA (não é o Stripe real): serve os endpoints que stripeAdapter.js usa, valida cabeçalhos
// (chave de teste, Stripe-Account, Stripe-Version, Idempotency-Key) e permite injetar falhas/atrasos. Só para o harness E2E local.
import { createServer } from "node:http";

export const TEST_KEY = "sk_test_FAKE_e2e";

export function startFakeStripe() {
  const st = {
    sessions: new Map(), // id -> { id, status, payment_status, payment_intent, url, account, fee, method, params }
    refunds: [], calls: [], idem: new Map(), fail: [], delay: [], seq: 0,
  };
  const server = createServer(async (req, res) => {
    const chunks = []; for await (const c of req) chunks.push(c);
    const raw = Buffer.concat(chunks).toString();
    const u = new URL(req.url, "http://x");
    const call = { method: req.method, path: u.pathname, query: u.search, account: req.headers["stripe-account"] ?? null, auth: req.headers.authorization ?? null, version: req.headers["stripe-version"] ?? null, idem: req.headers["idempotency-key"] ?? null, body: raw };
    const key = `${req.method} ${u.pathname}`;
    const send = (code, obj) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(obj)); };
    if (u.pathname.startsWith("/__ctl")) { // controle do harness (não é Stripe)
      const j = raw ? JSON.parse(raw) : {};
      if (u.pathname === "/__ctl/session") { const s = st.sessions.get(j.id) ?? { id: j.id, url: `https://checkout.fake/${j.id}`, status: "open", payment_status: "unpaid", payment_intent: null, fee: 250, method: "card", account: null }; st.sessions.set(j.id, Object.assign(s, j)); return send(200, s); }
      if (u.pathname === "/__ctl/fail") { st.fail.push({ re: new RegExp(j.match), mode: j.mode, once: j.once !== false }); return send(200, {}); }
      if (u.pathname === "/__ctl/delay") { st.delay.push({ re: new RegExp(j.match), ms: j.ms, once: j.once !== false }); return send(200, {}); }
      if (u.pathname === "/__ctl/reset") { st.fail = []; st.delay = []; st.calls = []; return send(200, {}); }
      if (u.pathname === "/__ctl/state") return send(200, { calls: st.calls, refunds: st.refunds, sessions: [...st.sessions.values()] });
      return send(404, {});
    }
    st.calls.push(call);
    if (call.auth !== `Bearer ${TEST_KEY}`) return send(401, { error: { message: "Invalid API Key provided (fake)" } });
    const d = st.delay.findIndex((x) => x.re.test(key));
    if (d >= 0) { const x = st.delay[d]; if (x.once) st.delay.splice(d, 1); await new Promise((r) => setTimeout(r, x.ms)); }
    const f = st.fail.findIndex((x) => x.re.test(key));
    if (f >= 0) {
      const x = st.fail[f]; if (x.once) st.fail.splice(f, 1);
      if (x.mode === "network") { req.socket.destroy(); return; }
      return send(Number(x.mode), { error: { message: `injected http ${x.mode}` } });
    }
    let m;
    if (key === "POST /v1/checkout/sessions") {
      if (!call.account) return send(400, { error: { message: "direct charge requires Stripe-Account (fake)" } });
      if (call.idem && st.idem.has(call.idem)) return send(200, st.idem.get(call.idem));
      const params = Object.fromEntries(new URLSearchParams(raw));
      const id = `cs_test_new${++st.seq}`;
      const s = { id, url: `https://checkout.fake/${id}`, status: "open", payment_status: "unpaid", payment_intent: null, account: call.account, fee: 250, method: "card", params };
      st.sessions.set(id, s); if (call.idem) st.idem.set(call.idem, s);
      return send(200, s);
    }
    if ((m = key.match(/^GET \/v1\/checkout\/sessions\/(.+)$/))) {
      const s = st.sessions.get(m[1]); if (!s) return send(404, { error: { message: `No such checkout.session: ${m[1]}` } });
      if (s.account && call.account !== s.account) return send(404, { error: { message: "No such checkout.session for this account (fake)" } });
      return send(200, s);
    }
    if (key === "GET /v1/refunds") { const pi = u.searchParams.get("payment_intent"); return send(200, { data: st.refunds.filter((r) => r.payment_intent === pi) }); }
    if (key === "POST /v1/refunds") {
      if (call.idem && st.idem.has(call.idem)) return send(200, st.idem.get(call.idem));
      const p = Object.fromEntries(new URLSearchParams(raw));
      if (p.refund_application_fee !== "true") return send(400, { error: { message: "refund_application_fee must be true (fake contract check)" } });
      const r = { id: `re_test_${++st.seq}`, status: "succeeded", payment_intent: p.payment_intent, params: p };
      st.refunds.push(r); if (call.idem) st.idem.set(call.idem, r);
      return send(200, r);
    }
    if ((m = key.match(/^GET \/v1\/payment_intents\/(.+)$/))) {
      const s = [...st.sessions.values()].find((x) => x.payment_intent === m[1]);
      if (!s) return send(404, { error: { message: "No such payment_intent (fake)" } });
      // s.fee === null simula balance_transaction ainda indisponível (o Stripe devolve null quando a tarifa ainda não foi lançada)
      return send(200, { id: m[1], latest_charge: { id: `ch_${m[1]}`, payment_method_details: { type: s.method }, balance_transaction: s.fee === null ? null : { fee: s.fee + 1500, fee_details: [{ type: "stripe_fee", amount: s.fee }, { type: "application_fee", amount: 1500 }] } } });
    }
    return send(404, { error: { message: `sem rota ${key} (fake)` } });
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ port: server.address().port, st, close: () => new Promise((r) => { server.closeAllConnections?.(); server.close(r); }) })));
}
