import test from "node:test";
import assert from "node:assert/strict";
import { feeCents, splitSale, payoutEligibleAt, holdExpiresAt, ritualRevenue } from "../src/lib/paymentsCore.js";

test("taxa de 17% em rituais (83% para a casa) e 5% em serviço via Pix", () => {
  assert.deepEqual(splitSale(10000, "ritual"), { gross: 10000, fee: 1700, net: 8300 });
  assert.equal(feeCents(19900, "ritual"), 3383);
  assert.deepEqual(splitSale(19900, "ritual"), { gross: 19900, fee: 3383, net: 16517 });
  assert.deepEqual(splitSale(10000, "servico_pix"), { gross: 10000, fee: 500, net: 9500 });
});

test("arredondamento: metade sobe e bruto = taxa + líquido", () => {
  assert.equal(feeCents(3, "servico_pix"), 0);
  assert.equal(feeCents(10, "servico_pix"), 1);
  for (const g of [1, 99, 1234, 8990, 13990, 19900, 5711300]) {
    const s = splitSale(g, "ritual");
    assert.equal(s.fee + s.net, g);
  }
});

test("entradas inválidas são recusadas", () => {
  assert.throws(() => feeCents(-1, "ritual"));
  assert.throws(() => feeCents(10.5, "ritual"));
  assert.throws(() => feeCents(100, "outro"));
});

test("repasse libera 72h após o fim do ritual", () => {
  assert.equal(payoutEligibleAt("2026-11-14T23:30:00.000Z", "2026-11-14T22:30:00.000Z"), "2026-11-17T23:30:00.000Z");
  assert.equal(payoutEligibleAt(null, "2026-11-14T22:30:00.000Z"), "2026-11-17T22:30:00.000Z");
  assert.equal(payoutEligibleAt(null, "2026-11-14T22:30:00.000Z", "2026-11-14T23:00:00.000Z"), "2026-11-17T23:00:00.000Z");
});

test("vaga segurada por 15 minutos e receita de ritual", () => {
  assert.equal(holdExpiresAt(new Date("2026-10-26T12:00:00Z")), "2026-10-26T12:15:00.000Z");
  assert.deepEqual(ritualRevenue(19900, 287), { gross: 5711300, fee: 970921, net: 4740379 });
});
