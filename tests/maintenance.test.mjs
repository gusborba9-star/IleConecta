import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { maintenanceFor, MAINTENANCE_DEFAULT } from "../supabase/functions/assistant-chat/maintenance.js";
import { readMaintenance, maintenanceBanner } from "../src/lib/maintenanceCore.js";

test("só bloqueia quando a chave do módulo é exatamente true (falha segura)", () => {
  for (const bad of [null, undefined, 0, "x", [], [true], {}, { assistant: "true" }, { assistant: 1 }, { payments: false }, { assistant: false, payments: false }])
    assert.equal(maintenanceFor(bad, "assistant"), null, JSON.stringify(bad));
  assert.equal(maintenanceFor({ assistant: true }, "assistant"), MAINTENANCE_DEFAULT.assistant);
  assert.equal(maintenanceFor({ payments: true }, "payments"), MAINTENANCE_DEFAULT.payments);
  assert.equal(maintenanceFor({ assistant: true }, "payments"), null, "uma chave não liga a outra");
  assert.equal(maintenanceFor({ assistant: true }, "outro"), null);
});

test("mensagem do dono vale; vazia, longa demais ou de outro tipo cai no texto padrão", () => {
  assert.equal(maintenanceFor({ payments: true, message: "  Voltamos às 22h  " }, "payments"), "Voltamos às 22h");
  assert.equal(maintenanceFor({ payments: true, message: "   " }, "payments"), MAINTENANCE_DEFAULT.payments);
  assert.equal(maintenanceFor({ payments: true, message: "x".repeat(201) }, "payments"), MAINTENANCE_DEFAULT.payments);
  assert.equal(maintenanceFor({ payments: true, message: 5 }, "payments"), MAINTENANCE_DEFAULT.payments);
});

test("o mesmo arquivo está nas quatro funções de borda (cópias idênticas)", () => {
  const base = readFileSync("supabase/functions/assistant-chat/maintenance.js", "utf8");
  for (const f of ["payments", "platform-billing", "conecta"]) assert.equal(readFileSync(`supabase/functions/${f}/maintenance.js`, "utf8"), base, f);
});

test("as funções de borda realmente consultam o interruptor, só em operações novas", () => {
  const pay = readFileSync("supabase/functions/payments/index.ts", "utf8");
  assert.match(pay, /action === "onboard" \|\| input\.action === "checkout"[\s\S]{0,120}maintenanceMessage/);
  assert.ok(!/refund[^\n]{0,60}maintenanceMessage/.test(pay), "reembolso não é bloqueado");
  const bil = readFileSync("supabase/functions/platform-billing/index.ts", "utf8");
  const m = bil.match(/\[("pay"[^\]]*)\]\.includes/);
  assert.ok(m, "lista de ações bloqueadas");
  const blocked = m[1].replace(/"/g, "").split(/,\s*/);
  for (const a of ["pay", "buy_credits", "buy_promo", "card_setup", "reactivate", "subscribe", "upgrade", "seat"]) assert.ok(blocked.includes(a), a);
  for (const a of ["credit_refund", "plan_refund", "seat_refund", "promo_refund", "sync", "card_sync"]) assert.ok(!blocked.includes(a), `${a} não deve ser bloqueada`);
  assert.match(readFileSync("supabase/functions/assistant-chat/index.ts", "utf8"), /maintenanceFor\(maintRow\?\.value, "assistant"\)/);
  assert.match(readFileSync("supabase/functions/conecta/index.ts", "utf8"), /maintenanceFor\(mrow\?\.value, "assistant"\)/);
  // o webhook e a rotina do Stripe passam ANTES da consulta ao interruptor
  assert.ok(pay.indexOf('req.headers.get("stripe-signature")') < pay.indexOf("await maintenanceMessage()"));
  assert.ok(bil.indexOf('req.headers.get("stripe-signature")') < bil.indexOf('"maintenance"'));
});

test("app: leitura segura e texto da faixa", () => {
  assert.equal(maintenanceBanner(readMaintenance(null)), null);
  assert.equal(maintenanceBanner(readMaintenance({ assistant: false, payments: false })), null);
  assert.equal(maintenanceBanner(readMaintenance({ assistant: true })), MAINTENANCE_DEFAULT.assistant);
  assert.match(maintenanceBanner(readMaintenance({ assistant: true, payments: true })), /assistente e nos pagamentos/);
  assert.equal(maintenanceBanner(readMaintenance({ payments: true, message: "Voltamos já" })), "Voltamos já");
});

test("pagamentos em manutenção: a conferência da plataforma NÃO cobra cartão salvo, mas segue com o resto", async () => {
  const { sweep } = await import("../supabase/functions/platform-billing/core.js");
  const mk = () => { const calls = []; const store = new Proxy({}, { get: (_, k) => async (...a) => { calls.push(String(k)); return k === "autoDue" || k === "openWithRef" || k === "paidWithoutFee" ? [] : null; } }); return { store, calls }; };
  const registry = { byId: () => null };
  const quiet = { log: () => {}, warn: () => {}, error: () => {} };
  const a = mk(); const ra = await sweep({ registry, store: a.store, log: quiet, skipAuto: true });
  assert.equal(ra.auto.skipped, "manutencao");
  assert.ok(!a.calls.includes("autoDue"), "não procura cobranças automáticas");
  assert.ok(a.calls.includes("tick") && a.calls.includes("openWithRef"), "o resto da conferência continua");
  const b = mk(); await sweep({ registry, store: b.store, log: quiet });
  assert.ok(b.calls.includes("autoDue"), "sem manutenção a cobrança automática roda como sempre");
});
