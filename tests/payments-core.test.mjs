import test from "node:test";
import assert from "node:assert/strict";
import { feeCents, splitSale, payoutEligibleAt, holdExpiresAt, ritualRevenue, processorFeeEstimate, houseReceives, MAX_PAYMENT_CENTS, MAX_STAGES, stageAmount, stagePlan, stagesNeeded } from "../src/lib/paymentsCore.js";

test("comissão de 15% em rituais e 4% em serviços (Pix ou cartão à vista)", () => {
  assert.deepEqual(splitSale(10000, "ritual"), { gross: 10000, fee: 1500, net: 8500 });
  assert.equal(feeCents(19900, "ritual"), 2985);
  assert.deepEqual(splitSale(19900, "ritual"), { gross: 19900, fee: 2985, net: 16915 });
  assert.deepEqual(splitSale(10000, "servico"), { gross: 10000, fee: 400, net: 9600 });
  assert.deepEqual(splitSale(10000, "servico_pix"), { gross: 10000, fee: 400, net: 9600 });
});

test("arredondamento: metade sobe e bruto = taxa + líquido", () => {
  assert.equal(feeCents(3, "servico"), 0);
  assert.equal(feeCents(13, "servico"), 1);
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

test("tarifa estimada do Stripe: Pix 1,19%; cartão 3,99% + R$ 0,39 (R$ 100 no cartão = R$ 4,38, como no teste)", () => {
  assert.equal(processorFeeEstimate(10000, "pix"), 119);
  assert.equal(processorFeeEstimate(10000, "card"), 438);
  assert.equal(processorFeeEstimate(0, "card"), 0);
  assert.throws(() => processorFeeEstimate(100, "boleto"));
});

test("o que a casa recebe: ritual no Pix, ritual no cartão e serviço no cartão", () => {
  assert.deepEqual(houseReceives(10000, "ritual", "pix"), { gross: 10000, platformFee: 1500, processorFee: 119, net: 8381 });
  assert.deepEqual(houseReceives(10000, "ritual", "card"), { gross: 10000, platformFee: 1500, processorFee: 438, net: 8062 });
  assert.deepEqual(houseReceives(10000, "servico", "card"), { gross: 10000, platformFee: 400, processorFee: 438, net: 9162 });
  assert.deepEqual(houseReceives(10000, "servico", "pix"), { gross: 10000, platformFee: 400, processorFee: 119, net: 9481 });
});

test("teto por pagamento padrão é R$ 10.000", () => {
  assert.equal(MAX_PAYMENT_CENTS, 1000000);
});

test("LEGADO: repasse libera 72h após o fim do ritual (só para quem seguraria o dinheiro)", () => {
  assert.equal(payoutEligibleAt("2026-11-14T23:30:00.000Z", "2026-11-14T22:30:00.000Z"), "2026-11-17T23:30:00.000Z");
  assert.equal(payoutEligibleAt(null, "2026-11-14T22:30:00.000Z"), "2026-11-17T22:30:00.000Z");
  assert.equal(payoutEligibleAt(null, "2026-11-14T22:30:00.000Z", "2026-11-14T23:00:00.000Z"), "2026-11-17T23:00:00.000Z");
});

test("vaga segurada por 15 minutos e receita de ritual", () => {
  assert.equal(holdExpiresAt(new Date("2026-10-26T12:00:00Z")), "2026-10-26T12:15:00.000Z");
  assert.deepEqual(ritualRevenue(19900, 287), { gross: 5711300, fee: 856695, net: 4854605 });
});

test("etapas: soma sempre igual ao total, 1ª etapa leva a sobra", () => {
  assert.deepEqual(stagePlan(1100000, 2), [550000, 550000]);
  assert.deepEqual(stagePlan(1000001, 3), [333335, 333333, 333333]);
  for (const [t, n] of [[1, 4], [999999, 4], [2400000, 3], [5711300, 2]]) {
    assert.equal(stagePlan(t, n).reduce((a, b) => a + b, 0), t);
  }
  assert.throws(() => stageAmount(100, 2, 3));
  assert.throws(() => stageAmount(100, 5, 1));
  assert.equal(MAX_STAGES, 4);
});

test("quantas etapas cabem no teto (R$ 11 mil = 2; R$ 7 mil = 1; R$ 41 mil = não cabe)", () => {
  assert.equal(stagesNeeded(700000), 1);
  assert.equal(stagesNeeded(1100000), 2);
  assert.equal(stagesNeeded(4000000), 4);
  assert.equal(stagesNeeded(4000001), null);
  assert.equal(stagesNeeded(4000001, 2000000), 3);
});
