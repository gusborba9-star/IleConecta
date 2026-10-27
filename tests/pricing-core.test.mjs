import test from "node:test";
import assert from "node:assert/strict";
import { AVG_ATTENDANT_SALARY, PEOPLE_FOR_24H, staffCost, staffMultiple } from "../src/lib/pricingCore.js";

test("custo de pessoas só de salário", () => {
  assert.equal(AVG_ATTENDANT_SALARY, 2000);
  assert.equal(staffCost(1), 2000);
  assert.equal(staffCost(PEOPLE_FOR_24H), 8000);
});

test("quantas vezes o plano custa menos que pessoas (inteiro para baixo, sem exagero)", () => {
  assert.equal(staffMultiple(139.9, 1), 14);
  assert.equal(staffMultiple(199, 1), 10);
  assert.equal(staffMultiple(199, PEOPLE_FOR_24H), 40);
  assert.equal(staffMultiple(1500, 1), null);
  assert.equal(staffMultiple(0, 1), null);
  assert.equal(staffMultiple(null, 1), null);
});
