import test from "node:test";
import assert from "node:assert/strict";
import { adminActions, canContest, houseMessage, inAdaptation, deadlineText, GENERAL_NOTICE_TEXT, WARNING_HOURS, CONTEST_DAYS } from "../src/lib/moderationCore.js";

const now = new Date("2026-12-10T12:00:00Z");
test("prazos", () => {
  assert.equal(WARNING_HOURS, 72); assert.equal(CONTEST_DAYS, 7);
  assert.equal(deadlineText("promessa"), "72 horas"); assert.equal(deadlineText("contato_antigo"), "15 dias");
});
test("adaptação: sem início vale; 30 dias depois acaba", () => {
  assert.equal(inAdaptation(null, 30, now), true);
  assert.equal(inAdaptation("2026-12-01T00:00:00Z", 30, now), true);
  assert.equal(inAdaptation("2026-11-01T00:00:00Z", 30, now), false);
});
test("ações da administração por estado", () => {
  const ids = (r) => adminActions(r, now).map((a) => a.id);
  assert.deepEqual(ids({ status: "pendente", reason: "promessa", adaptation_start: null }), ["orientar", "encerrar"]);
  assert.deepEqual(ids({ status: "pendente", reason: "promessa", adaptation_start: "2026-10-01T00:00:00Z" }), ["orientar", "advertir", "encerrar"]);
  assert.ok(ids({ status: "pendente", reason: "contato_antigo", adaptation_start: null }).includes("advertir"));
  assert.deepEqual(ids({ status: "advertida", reason: "promessa" }), ["ocultar", "encerrar"]);
  assert.deepEqual(ids({ status: "contestada", reason: "promessa" }), ["encerrar", "manter"]);
  assert.deepEqual(ids({ status: "encerrada", reason: "promessa" }), []);
});
test("contestar: só advertida/ocultada, uma vez, em 7 dias", () => {
  const base = { status: "advertida", reason: "promessa", target_table: "services", warned_at: "2026-12-08T12:00:00Z" };
  assert.equal(canContest(base, now), true);
  assert.equal(canContest({ ...base, warned_at: "2026-12-02T11:00:00Z" }, now), false);
  assert.equal(canContest({ ...base, contested_at: "2026-12-09T00:00:00Z" }, now), false);
  assert.equal(canContest({ ...base, status: "orientada" }, now), false);
});
test("mensagens citam o prazo certo", () => {
  const w = houseMessage({ status: "advertida", reason: "promessa", target_table: "services" }).join(" ");
  assert.match(w, /72 horas/); assert.match(w, /7 dias corridos/);
  assert.match(houseMessage({ status: "advertida", reason: "contato_antigo", target_table: "posts" }).join(" "), /15 dias/);
  assert.match(houseMessage({ status: "orientada", reason: "promessa", target_table: "events" })[0], /Dica de ajuste/);
});
test("aviso geral cabe no limite de 400 caracteres", () => { assert.ok(GENERAL_NOTICE_TEXT.length <= 400); assert.ok(GENERAL_NOTICE_TEXT.length >= 10); });
