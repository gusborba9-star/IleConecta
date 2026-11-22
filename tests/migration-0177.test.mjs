import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const code = readFileSync(new URL("../supabase/migrations/0177_conversoes_orfas.sql", import.meta.url), "utf8").replace(/--.*$/gm, "");

test("0177: reagenda a mesma rotina, mantém 13 meses e apaga conversões órfãs das 3 origens", () => {
  assert.match(code, /cron\.schedule\('purge-promo-conversions', '48 3 \* \* \*'/);
  assert.match(code, /interval '13 months'/);
  for (const [t, tab] of [["conversation", "conversations"], ["service_order", "service_orders"], ["reservation", "reservations"]])
    assert.match(code, new RegExp(`ref_type = '${t}' and not exists \\(select 1 from public\\.${tab} x where x\\.id = c\\.ref_id\\)`));
});
test("0177: só toca promo_conversions", () => {
  assert.ok(!/alter\s+table|drop\s|truncate|update\s+public\./i.test(code));
  assert.equal([...code.matchAll(/delete from public\.(\w+)/g)].map((m) => m[1]).join(), "promo_conversions");
});
