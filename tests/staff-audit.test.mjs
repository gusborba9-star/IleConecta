import test from "node:test";
import assert from "node:assert/strict";
import { PERM_LABEL, actorLabel, describeStaffEvent, toAuditEvent, validateAuditReason } from "../src/lib/staffAuditCore.js";

const ACTIONS = ["convite_criado", "convite_cancelado", "aceito", "pausado", "reativado", "removido", "permissoes_alteradas", "nome_alterado", "admin_consultou"];

test("auditoria da equipe: toda ação do banco tem frase própria", () => {
  for (const a of ACTIONS) {
    const s = describeStaffEvent({ action: a, targetName: "Ana", details: { perms: ["chat_read"], antes: ["post"], depois: ["stats"], motivo: "denúncia 12" } });
    assert.ok(s.length > 10 && s !== "Evento registrado.", a);
  }
  assert.equal(describeStaffEvent({ action: "inventada", targetName: null, details: {} }), "Evento registrado.");
});

test("auditoria da equipe: permissões aparecem por nome legível, antes e depois", () => {
  const s = describeStaffEvent({ action: "permissoes_alteradas", targetName: "Ana", details: { antes: ["chat_reply", "orders"], depois: ["stats"] } });
  assert.match(s, /responder conversas, ver pedidos/);
  assert.match(s, /ver números da divulgação/);
  assert.match(describeStaffEvent({ action: "aceito", targetName: "Ana", details: { perms: [] } }), /nenhuma ferramenta/);
  for (const k of ["chat_read", "chat_reply", "orders", "post", "calendar", "members", "stats"]) assert.ok(PERM_LABEL[k], k);
});

test("auditoria da equipe: dados malformados não quebram a tela", () => {
  assert.doesNotThrow(() => describeStaffEvent({ action: "permissoes_alteradas", targetName: null, details: null }));
  assert.doesNotThrow(() => describeStaffEvent({ action: "aceito", targetName: "x", details: { perms: "texto" } }));
  assert.equal(actorLabel("dono"), "Você");
  assert.equal(actorLabel("qualquer"), "Alguém");
  const e = toAuditEvent({ id: "7", house_id: "h", action: "aceito", actor_role: "equipe", target_name: null, details: null, created_at: "2026-11-10T00:00:00Z" });
  assert.equal(e.id, 7);
  assert.deepEqual(e.details, {});
});

test("auditoria da equipe: motivo da consulta segue a regra do banco (5 a 300)", () => {
  assert.ok(validateAuditReason(""));
  assert.ok(validateAuditReason("   abc  "));
  assert.equal(validateAuditReason("denúncia 123"), null);
  assert.equal(validateAuditReason("x".repeat(300)), null);
  assert.ok(validateAuditReason("x".repeat(301)));
  assert.ok(validateAuditReason(null));
});
