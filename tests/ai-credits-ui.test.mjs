import test from "node:test";
import assert from "node:assert/strict";
import { expiryText, franchiseView, offerLabel, readCredits, statusText } from "../src/lib/aiCreditsCore.js";

const raw = (o = {}) => ({ has_house: true, limit: 300, used_month: 100, balance: 0, packs: [], prices: { p80: 1990, p200: 4990, p500: 8990 }, for_sale: true, ...o });

test("lê a resposta do banco e ignora o que não for do formato", () => {
  const c = readCredits(raw({ balance: 80, packs: [{ size: 80, remaining: 80, expires_at: "2027-02-12T12:00:00Z" }] }));
  assert.equal(c.limit, 300); assert.equal(c.used, 100); assert.equal(c.balance, 80); assert.equal(c.packs.length, 1);
  assert.deepEqual(c.offers.map((o) => [o.key, o.size, o.priceCents]), [["p80", 80, 1990], ["p200", 200, 4990], ["p500", 500, 8990]]);
  for (const bad of [null, undefined, "x", 5, {}, { has_house: false }]) assert.equal(readCredits(bad), null);
  const odd = readCredits(raw({ limit: "abc", used_month: -4, balance: -9, packs: [null, { size: 1 }, 7], prices: { p80: 0, p200: "x", p500: 8990 } }));
  assert.equal(odd.limit, 0); assert.equal(odd.used, 0); assert.equal(odd.balance, 0); assert.equal(odd.packs.length, 0);
  assert.deepEqual(odd.offers.map((o) => o.key), ["p500"], "preço inválido ou zero não vira oferta");
});

test("franquia: restante, percentual e tom", () => {
  const f = (used, limit = 300) => franchiseView(readCredits(raw({ used_month: used, limit })));
  assert.equal(f(0).tone, "forest"); assert.equal(f(239).tone, "forest");
  assert.equal(f(240).tone, "gold"); assert.equal(f(240).pct, 80); assert.equal(f(299).pct, 99, "299 de 300 não aparece como 100%");
  assert.equal(f(300).tone, "danger"); assert.equal(f(300).exhausted, true); assert.equal(f(300).left, 0);
  assert.equal(f(450).used, 300, "nunca mostra mais que 100%"); assert.equal(f(450).pct, 100); assert.equal(f(450).over, 150);
  assert.equal(franchiseView(readCredits(raw({ limit: 0 }))), null, "plano sem assistente: sem franquia");
  assert.equal(franchiseView(null), null);
});

test("o texto diz o que acontece com a assistente agora", () => {
  const t = (o) => statusText(readCredits(raw(o)));
  assert.match(t({ used_month: 100 }), /Restam 200 respostas/);
  assert.match(t({ used_month: 300, balance: 40 }), /segue com os seus créditos \(40 respostas\)/);
  assert.match(t({ used_month: 300, balance: 0 }), /pausa até o próximo mês/);
  assert.match(t({ limit: 0 }), /não inclui a assistente/);
});

test("validade: avisa quando está perto de vencer e quando venceu", () => {
  const now = Date.parse("2026-11-12T12:00:00Z");
  assert.match(expiryText("2027-02-12T12:00:00Z", now), /^vale até 12\/02\/2027$/);
  assert.match(expiryText("2026-11-14T12:00:00Z", now), /vence em 2 dias/);
  assert.match(expiryText("2026-11-13T12:00:00Z", now), /vence em 1 dia /);
  assert.match(expiryText("2026-11-01T12:00:00Z", now), /^venceu em 01\/11\/2026$/);
  assert.equal(expiryText("lixo", now), "");
  assert.equal(offerLabel({ key: "p80", size: 80, priceCents: 1990 }), "80 respostas");
});
